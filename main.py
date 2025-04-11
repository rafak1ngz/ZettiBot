import os
import json
import logging
import asyncio
import nest_asyncio
import sys
from datetime import datetime, timedelta, time
from zoneinfo import ZoneInfo
import tempfile
import matplotlib.pyplot as plt
import csv
import googlemaps
import random
from google.cloud.firestore_v1 import FieldFilter
from telegram.error import BadRequest

# Define o fuso horário desejado
TIMEZONE = ZoneInfo("America/Sao_Paulo")

# Aplica o patch do nest_asyncio
nest_asyncio.apply()

# Configuração do Logger
logger = logging.getLogger(__name__)
logger.setLevel(logging.DEBUG)
handler = logging.StreamHandler(sys.stdout)
handler.setLevel(logging.DEBUG)
formatter = logging.Formatter("%(asctime)s - %(name)s - %(levelname)s - %(message)s")
handler.setFormatter(formatter)
if not logger.handlers:
    logger.addHandler(handler)
else:
    for h in logger.handlers:
        logger.removeHandler(h)
    logger.addHandler(handler)
logging.getLogger("httpx").setLevel(logging.WARNING)
logging.getLogger("telegram.ext").setLevel(logging.WARNING)

# Inicialização do Firebase
import firebase_admin
from firebase_admin import credentials, firestore

if not os.environ.get("TELEGRAM_TOKEN"):
    logger.error("TELEGRAM_TOKEN não definido!")
    exit(1)
if not os.environ.get("FIREBASE_CREDENTIALS"):
    logger.error("FIREBASE_CREDENTIALS não definida!")
    exit(1)

firebase_credentials = os.environ.get("FIREBASE_CREDENTIALS")
try:
    cred_dict = json.loads(firebase_credentials)
except json.JSONDecodeError as e:
    logger.error("Erro ao decodificar FIREBASE_CREDENTIALS: %s", e)
    exit(1)
cred = credentials.Certificate(cred_dict)
firebase_admin.initialize_app(cred)
db = firestore.client()
logger.info("Firebase inicializado com sucesso!")

# Integração com o Telegram Bot (API Assíncrona)
from telegram import (
    Update,
    InlineKeyboardMarkup,
    InlineKeyboardButton,
    ReplyKeyboardMarkup,
    ReplyKeyboardRemove
)
from telegram.ext import (
    ApplicationBuilder,
    CommandHandler,
    MessageHandler,
    CallbackQueryHandler,
    ConversationHandler,
    filters,
    ContextTypes
)

# Estados para os fluxos
FOLLOWUP_CLIENT, FOLLOWUP_DATE, FOLLOWUP_DESCRIPTION = range(3)
VISIT_COMPANY, VISIT_DATE, VISIT_CATEGORY, VISIT_MOTIVE, VISIT_FOLLOWUP_CHOICE, VISIT_FOLLOWUP_DATE = range(3, 9)
INTER_CLIENT, INTER_SUMMARY, INTER_FOLLOWUP_CHOICE, INTER_FOLLOWUP_DATE = range(4)
REMINDER_TEXT, REMINDER_DATETIME = range(100, 102)
REPORT_START, REPORT_END = range(300, 302)
HIST_START, HIST_END = range(400, 402)
EDIT_CATEGORY, EDIT_RECORD, EDIT_FIELD, EDIT_NEW_VALUE = range(500, 504)
DELETE_CATEGORY, DELETE_RECORD, DELETE_CONFIRMATION = range(600, 603)
FILTER_CATEGORY, FILTER_FIELD, FILTER_VALUE = range(700, 703)
EXPORT_CATEGORY, EXPORT_PROCESS = range(800, 802)
BUSCA_TIPO, BUSCA_LOCALIZACAO, BUSCA_RAIO, BUSCA_QUANTIDADE = range(900, 904)
ROTA_TIPO, ROTA_LOCALIZACAO, ROTA_RAIO, ROTA_QUANTIDADE = range(910, 914)

# Função para Gerar Gráfico com Matplotlib
def gerar_grafico(total_followups, confirmados, pendentes, total_visitas, total_interacoes, periodo_info):
    categorias = ['Follow-ups', 'Confirmados', 'Pendentes', 'Visitas', 'Interações']
    valores = [total_followups, confirmados, pendentes, total_visitas, total_interacoes]
    plt.figure(figsize=(8, 4))
    barras = plt.bar(categorias, valores, color=['blue', 'green', 'orange', 'purple', 'red'])
    plt.title(f"Relatório {periodo_info}")
    for barra in barras:
        yval = barra.get_height()
        plt.text(barra.get_x() + barra.get_width() / 2, yval + 0.1, yval, ha='center', va='bottom')
    tmp_file = tempfile.NamedTemporaryFile(suffix=".png", delete=False)
    plt.savefig(tmp_file.name, dpi=150)
    plt.close()
    return tmp_file.name

# Função para Gerar Arquivo CSV
def exportar_csv(docs):
    temp_file = tempfile.NamedTemporaryFile(mode="w", encoding="utf-8", newline="", delete=False, suffix=".csv")
    writer = csv.writer(temp_file)
    if docs:
        keys = list(docs[0].to_dict().keys())
        writer.writerow(keys)
        for doc in docs:
            data = doc.to_dict()
            writer.writerow([data.get(k, "") for k in keys])
    temp_file.close()
    return temp_file.name

# Configuração da API do Google Maps
GOOGLE_API_KEY = os.environ.get("GOOGLE_API_KEY")
if not GOOGLE_API_KEY:
    logger.error("GOOGLE_API_KEY não definida!")
    exit(1)
gmaps = googlemaps.Client(key=GOOGLE_API_KEY)

# Função para buscar potenciais clientes no Google Maps
def buscar_potenciais_clientes_google(localizacao, tipo_cliente, raio_km=10):
    try:
        geocode_result = gmaps.geocode(localizacao)
        if not geocode_result:
            return "Localização não encontrada."
        
        lat = geocode_result[0]['geometry']['location']['lat']
        lng = geocode_result[0]['geometry']['location']['lng']
        
        resultados = []
        lugares = gmaps.places_nearby(
            location=(lat, lng),
            radius=raio_km * 1000,
            keyword=tipo_cliente,
            type="establishment"
        )
        
        for lugar in lugares['results']:
            nome = lugar.get('name', 'Sem nome')
            endereco = lugar.get('vicinity', 'Sem endereço')
            place_id = lugar['place_id']
            
            detalhes = gmaps.place(place_id=place_id, fields=['formatted_phone_number'])
            telefone = detalhes['result'].get('formatted_phone_number', 'Não disponível')
            
            resultados.append({
                'nome': nome,
                'endereco': endereco,
                'telefone': telefone,
                'coordenadas': lugar['geometry']['location'],
                'fonte': 'Google Maps'
            })
        
        if not resultados:
            return "Nenhum potencial cliente encontrado na região."
        
        return resultados
    except Exception as e:
        logger.error("Erro na busca de clientes: %s", e)
        return f"Erro ao buscar clientes: {str(e)}. Tente novamente."

# Função para buscar clientes existentes no Firebase
def buscar_clientes_firebase(chat_id, localizacao, tipo_cliente):
    clientes = []
    try:
        # Busca em followups
        followups = db.collection("users").document(chat_id).collection("followups").stream()
        for doc in followups:
            data = doc.to_dict()
            nome = data.get("cliente", "Sem nome")
            endereco = data.get("endereco", f"{nome}, {localizacao}")
            if tipo_cliente.lower() in nome.lower() or tipo_cliente.lower() in endereco.lower():
                geocode_result = gmaps.geocode(endereco)
                if geocode_result:
                    coordenadas = geocode_result[0]['geometry']['location']
                    clientes.append({
                        'nome': nome,
                        'endereco': endereco,
                        'telefone': data.get('telefone', 'Não disponível'),
                        'coordenadas': coordenadas,
                        'fonte': 'Firebase (Follow-up)'
                    })

        # Busca em visitas
        visitas = db.collection("users").document(chat_id).collection("visitas").stream()
        for doc in visitas:
            data = doc.to_dict()
            nome = data.get("empresa", "Sem nome")
            endereco = data.get("endereco", f"{nome}, {localizacao}")
            if tipo_cliente.lower() in nome.lower() or tipo_cliente.lower() in endereco.lower():
                geocode_result = gmaps.geocode(endereco)
                if geocode_result:
                    coordenadas = geocode_result[0]['geometry']['location']
                    clientes.append({
                        'nome': nome,
                        'endereco': endereco,
                        'telefone': data.get('telefone', 'Não disponível'),
                        'coordenadas': coordenadas,
                        'fonte': 'Firebase (Visita)'
                    })
        
        return clientes
    except Exception as e:
        logger.error("Erro ao buscar clientes no Firebase: %s", e)
        return []

# Fluxo de Busca de Potenciais Clientes
async def buscapotenciais_start(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    await update.message.reply_text(
        "🔍 *Busca de Potenciais Clientes*: Quais segmentos ou termos você quer buscar? (ex.: 'indústria', 'logística, depósitos', 'fábrica'):",
        parse_mode="Markdown"
    )
    return BUSCA_TIPO

async def buscapotenciais_tipo(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    context.user_data["busca_tipo"] = update.message.text.strip()
    await update.message.reply_text("📍 Informe a região (ex.: 'Vale Encantado, Vila Velha - ES'):")
    return BUSCA_LOCALIZACAO

async def buscapotenciais_localizacao(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    context.user_data["busca_localizacao"] = update.message.text.strip()
    await update.message.reply_text("📏 Informe o raio de busca em quilômetros (ex.: '10' para 10 km):")
    return BUSCA_RAIO

async def buscapotenciais_raio(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    try:
        raio = float(update.message.text.strip())
        if raio <= 0:
            raise ValueError
    except ValueError:
        await update.message.reply_text("⚠️ Informe um número válido maior que 0 (ex.: '10'):")
        return BUSCA_RAIO
    
    context.user_data["busca_raio"] = raio
    await update.message.reply_text("📋 Quantos clientes deseja ver? (ex.: '5', '10'):")
    return BUSCA_QUANTIDADE

async def buscapotenciais_quantidade(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    try:
        quantidade = int(update.message.text.strip())
        if quantidade <= 0:
            raise ValueError
    except ValueError:
        await update.message.reply_text("⚠️ Informe um número válido maior que 0 (ex.: '5'):")
        return BUSCA_QUANTIDADE
    
    tipo_cliente = context.user_data["busca_tipo"]
    localizacao = context.user_data["busca_localizacao"]
    raio = context.user_data["busca_raio"]
    
    termos = [termo.strip() for termo in tipo_cliente.split(",")]
    clientes = []
    
    for termo in termos:
        resultado = buscar_potenciais_clientes_google(localizacao, termo, raio)
        if isinstance(resultado, list):
            clientes.extend(resultado)
    
    if not clientes:
        await update.message.reply_text("Nenhum potencial cliente encontrado para os termos informados.")
        return ConversationHandler.END
    
    clientes_unicos = {cliente['nome']: cliente for cliente in clientes}.values()
    clientes_unicos = list(clientes_unicos)
    
    if quantidade > len(clientes_unicos):
        quantidade = len(clientes_unicos)
    msg = f"*Potenciais clientes encontrados para '{tipo_cliente}' (mostrando {quantidade} de {len(clientes_unicos)}):*\n"
    for cliente in clientes_unicos[:quantidade]:
        msg += f"- *{cliente['nome']}* ({cliente['fonte']})\n  Endereço: {cliente['endereco']}\n  Telefone: {cliente['telefone']}\n"
    context.user_data["clientes_potenciais"] = clientes_unicos
    await update.message.reply_text(msg, parse_mode="Markdown")
    return ConversationHandler.END

async def buscapotenciais_cancel(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    await update.message.reply_text("Busca de potenciais clientes cancelada.")
    return ConversationHandler.END

# Função para Criar Rota com Google Directions API
def criar_rota_google(localizacao_inicial, num_clientes, clientes):
    try:
        geocode_result = gmaps.geocode(localizacao_inicial)
        if not geocode_result:
            return "Localização inicial não encontrada."
        
        origem = geocode_result[0]['geometry']['location']
        
        if len(clientes) < num_clientes:
            num_clientes = len(clientes)
        
        clientes_selecionados = random.sample(clientes, num_clientes)
        waypoints = [cliente['coordenadas'] for cliente in clientes_selecionados]
        
        rota = gmaps.directions(
            origin=origem,
            destination=origem,
            waypoints=waypoints,
            mode="driving",
            optimize_waypoints=True
        )
        
        if not rota:
            return "Não foi possível calcular a rota."
        
        ordem = rota[0]['waypoint_order']
        pernas = rota[0]['legs']
        
        roteiro = f"*Rota otimizada a partir de {localizacao_inicial}:*\n"
        total_distancia = 0
        total_tempo = 0
        
        # Adiciona a origem como ponto inicial
        roteiro += f"1. *Origem* ({localizacao_inicial}): 0.0 km, 0 min\n"
        
        # Processa os waypoints na ordem otimizada
        for i, idx in enumerate(ordem, start=2):
            perna = pernas[i-1]
            cliente = clientes_selecionados[idx]
            distancia = perna['distance']['text']
            tempo = perna['duration']['text']
            total_distancia += perna['distance']['value']
            total_tempo += perna['duration']['value']
            roteiro += f"{i}. *{cliente['nome']}* ({cliente['fonte']}): {distancia}, {tempo}\n"
        
        # Adiciona o retorno à origem
        if len(pernas) > len(ordem):
            perna_retorno = pernas[-1]
            distancia = perna_retorno['distance']['text']
            tempo = perna_retorno['duration']['text']
            total_distancia += perna_retorno['distance']['value']
            total_tempo += perna_retorno['duration']['value']
            roteiro += f"{len(ordem) + 2}. *Retorno à Origem* ({localizacao_inicial}): {distancia}, {tempo}\n"
        
        roteiro += f"\n*Total*: {total_distancia/1000:.1f} km, {total_tempo//60} minutos"
        return roteiro
    except Exception as e:
        logger.error("Erro na criação da rota: %s", e)
        return f"Erro ao criar a rota: {str(e)}. Tente novamente."

# Fluxo de Criação de Rota
async def criarrota_start(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    await update.message.reply_text(
        "🗺️ *Criar Rota*: Quais segmentos ou termos você quer buscar para a rota? (ex.: 'indústria', 'logística, depósitos', 'fábrica'):",
        parse_mode="Markdown"
    )
    return ROTA_TIPO

async def criarrota_tipo(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    context.user_data["rota_tipo"] = update.message.text.strip()
    await update.message.reply_text("📍 Informe a região base para a rota (ex.: 'Vale Encantado, Vila Velha - ES'):")
    return ROTA_LOCALIZACAO

async def criarrota_localizacao(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    context.user_data["rota_localizacao"] = update.message.text.strip()
    await update.message.reply_text("📏 Informe o raio de busca em quilômetros (ex.: '10' para 10 km):")
    return ROTA_RAIO

async def criarrota_raio(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    try:
        raio = float(update.message.text.strip())
        if raio <= 0:
            raise ValueError
    except ValueError:
        await update.message.reply_text("⚠️ Informe um número válido maior que 0 (ex.: '10'):")
        return ROTA_RAIO
    
    context.user_data["rota_raio"] = raio
    await update.message.reply_text("📋 Quantos clientes deseja incluir na rota? (ex.: '5', '10'):")
    return ROTA_QUANTIDADE

async def criarrota_quantidade(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    try:
        quantidade = int(update.message.text.strip())
        if quantidade <= 0:
            raise ValueError
    except ValueError:
        await update.message.reply_text("⚠️ Informe um número válido maior que 0 (ex.: '5'):")
        return ROTA_QUANTIDADE
    
    tipo_cliente = context.user_data["rota_tipo"]
    localizacao = context.user_data["rota_localizacao"]
    raio = context.user_data["rota_raio"]
    chat_id = str(update.message.chat.id)
    
    termos = [termo.strip() for termo in tipo_cliente.split(",")]
    clientes_firebase = []
    for termo in termos:
        resultado = buscar_clientes_firebase(chat_id, localizacao, termo)
        if resultado:
            clientes_firebase.extend(resultado)
    
    clientes_google = []
    for termo in termos:
        resultado = buscar_potenciais_clientes_google(localizacao, termo, raio)
        if isinstance(resultado, list):
            clientes_google.extend(resultado)
    
    todos_clientes = clientes_firebase + clientes_google
    
    if not todos_clientes:
        await update.message.reply_text("Nenhum cliente encontrado (nem no Firebase, nem no Google Maps) para criar a rota.")
        return ConversationHandler.END
    
    clientes_unicos = {cliente['nome']: cliente for cliente in todos_clientes}.values()
    clientes_unicos = list(clientes_unicos)
    
    if quantidade > len(clientes_unicos):
        quantidade = len(clientes_unicos)
    clientes_selecionados = clientes_unicos[:quantidade]
    
    msg = f"*Rota criada para '{tipo_cliente}' (incluindo {quantidade} clientes):*\n"
    for i, cliente in enumerate(clientes_selecionados, 1):
        msg += f"{i}. *{cliente['nome']}* ({cliente['fonte']})\n   Endereço: {cliente['endereco']}\n   Telefone: {cliente['telefone']}\n"
    
    rota_otimizada = criar_rota_google(localizacao, quantidade, clientes_selecionados)
    if not isinstance(rota_otimizada, str) or "Erro" not in rota_otimizada:
        msg += "\n" + rota_otimizada
    
    context.user_data["clientes_rota"] = clientes_selecionados
    await update.message.reply_text(msg, parse_mode="Markdown")
    return ConversationHandler.END

async def criarrota_cancel(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    await update.message.reply_text("Criação de rota cancelada.")
    return ConversationHandler.END

# Comando /inicio
async def inicio(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    msg = (
        "Olá! Seja bem-vindo ao ZettiBot.\n"
        "Para saber mais sobre as funções disponíveis, envie /ajuda.\n"
        "Comandos úteis:\n"
        "• /followup – Registrar um follow-up\n"
        "• /visita – Registrar uma visita\n"
        "• /interacao – Registrar uma interação\n"
        "• /lembrete – Agendar um lembrete\n"
        "• /relatorio – Gerar um relatório resumido\n"
        "• /historico – Consultar o histórico detalhado\n"
        "• /editar – Editar um registro\n"
        "• /excluir – Excluir um registro\n"
        "• /filtrar – Filtrar registros\n"
        "• /exportar – Exportar registros em CSV\n"
        "• /buscapotenciais – Buscar potenciais clientes\n"
        "• /criarrota – Criar uma rota de visita"
    )
    await update.message.reply_text(msg)
    logger.info("Comando /inicio executado.")

# Comando /ajuda
async def ajuda(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    msg = (
        "*Ajuda - ZettiBot*\n\n"
        "Este bot ajuda a gerenciar vendas externas.\n\n"
        "*Comandos disponíveis:*\n"
        "• /inicio – Mensagem de boas-vindas\n"
        "• /ajuda – Esta mensagem\n"
        "• /followup – Registrar follow-up\n"
        "• /visita – Registrar visita\n"
        "• /interacao – Registrar interação\n"
        "• /lembrete – Agendar lembrete\n"
        "• /relatorio – Relatório resumido com gráfico\n"
        "• /historico – Histórico detalhado\n"
        "• /editar – Editar registro\n"
        "• /excluir – Excluir registro\n"
        "• /filtrar – Filtrar registros\n"
        "• /exportar – Exportar em CSV\n"
        "• /buscapotenciais – Buscar potenciais clientes\n"
        "• /criarrota – Criar rota de visita\n\n"
        "Use /cancelar para sair de um fluxo."
    )
    await update.message.reply_text(msg, parse_mode="Markdown")

# Fluxo de Follow-up
async def followup_start(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    await update.message.reply_text("🤝 *Follow-up*: Qual o nome do cliente?", parse_mode="Markdown")
    return FOLLOWUP_CLIENT

async def followup_client(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    context.user_data["client"] = update.message.text.strip()
    await update.message.reply_text("📅 Informe a data do follow-up (formato DD/MM/AAAA):")
    return FOLLOWUP_DATE

async def followup_date(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    data_str = update.message.text.strip()
    try:
        data_followup = datetime.strptime(data_str, "%d/%m/%Y").date()
    except ValueError:
        await update.message.reply_text("⚠️ Formato inválido! Use DD/MM/AAAA.")
        return FOLLOWUP_DATE
    context.user_data["followup_date"] = data_followup.isoformat()
    await update.message.reply_text("📝 Descreva a ação do follow-up:")
    return FOLLOWUP_DESCRIPTION

async def followup_description(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    context.user_data["followup_desc"] = update.message.text.strip()
    try:
        chat_id = str(update.message.chat.id)
        db.collection("users").document(chat_id)\
          .collection("followups").document().set({
              "cliente": context.user_data["client"],
              "data_follow": context.user_data["followup_date"],
              "descricao": context.user_data["followup_desc"],
              "status": "pendente",
              "chat_id": chat_id,
              "criado_em": datetime.now().isoformat()
          })
        await update.message.reply_text("Follow-up registrado com sucesso! ✅")
    except Exception as e:
        await update.message.reply_text("Erro ao registrar follow-up: " + str(e))
    return ConversationHandler.END

async def followup_cancel(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    await update.message.reply_text("Follow-up cancelado. ❌")
    return ConversationHandler.END

# Fluxo de Visita
async def visita_start(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    await update.message.reply_text("🏢 *Visita*: Qual a empresa visitada?", parse_mode="Markdown")
    return VISIT_COMPANY

async def visita_company(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    context.user_data["company"] = update.message.text.strip()
    await update.message.reply_text("📅 Informe a data da visita (formato DD/MM/AAAA):")
    return VISIT_DATE

async def visita_date(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    data_str = update.message.text.strip()
    try:
        data_visita = datetime.strptime(data_str, "%d/%m/%Y").date()
    except ValueError:
        await update.message.reply_text("⚠️ Formato inválido! Use DD/MM/AAAA.")
        return VISIT_DATE
    context.user_data["visit_date"] = data_visita.isoformat()
    options = [
        [InlineKeyboardButton("Potencial Cliente", callback_data="visit_category:Potencial Cliente"),
         InlineKeyboardButton("Cliente Ativo", callback_data="visit_category:Cliente Ativo")],
        [InlineKeyboardButton("Cliente Inativo", callback_data="visit_category:Cliente Inativo"),
         InlineKeyboardButton("Cliente Novo", callback_data="visit_category:Cliente Novo")],
        [InlineKeyboardButton("Cliente de Aluguel", callback_data="visit_category:Cliente de Aluguel"),
         InlineKeyboardButton("Cliente de Venda", callback_data="visit_category:Cliente de Venda")],
        [InlineKeyboardButton("Cliente de Manutenção", callback_data="visit_category:Cliente de Manutenção")],
        [InlineKeyboardButton("Cliente em Negociação", callback_data="visit_category:Cliente em Negociação")],
        [InlineKeyboardButton("Cliente Perdido", callback_data="visit_category:Cliente Perdido")],
        [InlineKeyboardButton("Sem Interesse", callback_data="visit_category:Sem Interesse")]
    ]
    reply_markup = InlineKeyboardMarkup(options)
    await update.message.reply_text("📋 Selecione a categoria do cliente:", reply_markup=reply_markup)
    return VISIT_MOTIVE  # Pula VISIT_CATEGORY, pois o callback será tratado fora

async def visita_category_callback(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    query = update.callback_query
    await query.answer()
    category = query.data.split(":", 1)[1]
    context.user_data["category"] = category
    await query.edit_message_text(text=f"✔️ Categoria: *{category}*\nInforme o motivo da visita:", parse_mode="Markdown")

async def visita_motive(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    context.user_data["motive"] = update.message.text.strip()
    reply_keyboard = [["Sim", "Não"]]
    await update.message.reply_text(
        "Deseja agendar follow-up para a visita? (Sim/Não)",
        reply_markup=ReplyKeyboardMarkup(reply_keyboard, one_time_keyboard=True, resize_keyboard=True)
    )
    return VISIT_FOLLOWUP_CHOICE

async def visita_followup_choice(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    choice = update.message.text.strip().lower()
    if choice == "sim":
        await update.message.reply_text("📅 Informe a data do follow-up (formato DD/MM/AAAA):", reply_markup=ReplyKeyboardRemove())
        return VISIT_FOLLOWUP_DATE
    else:
        try:
            chat_id = str(update.message.chat.id)
            db.collection("users").document(chat_id).collection("visitas").document().set({
                "empresa": context.user_data["company"],
                "data_visita": context.user_data["visit_date"],
                "classificacao": context.user_data["category"],
                "motivo": context.user_data["motive"],
                "followup": "Não agendado",
                "criado_em": datetime.now().isoformat()
            })
            await update.message.reply_text("Visita registrada com sucesso!", reply_markup=ReplyKeyboardRemove())
        except Exception as e:
            await update.message.reply_text("Erro ao registrar visita: " + str(e), reply_markup=ReplyKeyboardRemove())
        return ConversationHandler.END

async def visita_followup_date(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    data_str = update.message.text.strip()
    try:
        data_followup = datetime.strptime(data_str, "%d/%m/%Y").date()
    except ValueError:
        await update.message.reply_text("⚠️ Formato inválido! Use DD/MM/AAAA.")
        return VISIT_FOLLOWUP_DATE
    context.user_data["followup_date"] = data_followup.isoformat()
    chat_id = str(update.message.chat.id)
    try:
        db.collection("users").document(chat_id).collection("visitas").document().set({
            "empresa": context.user_data["company"],
            "data_visita": context.user_data["visit_date"],
            "classificacao": context.user_data["category"],
            "motivo": context.user_data["motive"],
            "followup": context.user_data["followup_date"],
            "criado_em": datetime.now().isoformat()
        })
        db.collection("users").document(chat_id).collection("followups").document().set({
            "cliente": context.user_data["company"],
            "data_follow": context.user_data["followup_date"],
            "descricao": "Follow-up de visita: " + context.user_data["motive"],
            "status": "pendente",
            "chat_id": chat_id,
            "criado_em": datetime.now().isoformat()
        })
        await update.message.reply_text("Visita e follow-up registrados com sucesso! ✅")
    except Exception as e:
        await update.message.reply_text("Erro ao registrar visita com follow-up: " + str(e))
    return ConversationHandler.END

async def visita_cancel(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    await update.message.reply_text("Visita cancelada.", reply_markup=ReplyKeyboardRemove())
    return ConversationHandler.END

# Fluxo de Interação
async def interacao_start(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    await update.message.reply_text("💬 *Interação*: Informe o nome do cliente ou empresa com quem interagiu:", parse_mode="Markdown")
    return INTER_CLIENT

async def interacao_client(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    context.user_data["client_interacao"] = update.message.text.strip()
    await update.message.reply_text("📝 Digite um resumo da interação:")
    return INTER_SUMMARY

async def interacao_summary(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    context.user_data["resumo_interacao"] = update.message.text.strip()
    reply_keyboard = [["Sim", "Não"]]
    await update.message.reply_text("Deseja agendar follow-up para essa interação? (Sim/Não)",
                                    reply_markup=ReplyKeyboardMarkup(reply_keyboard, one_time_keyboard=True, resize_keyboard=True))
    return INTER_FOLLOWUP_CHOICE

async def interacao_followup_choice(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    choice = update.message.text.strip().lower()
    if choice == "sim":
        await update.message.reply_text("📅 Informe a data do follow-up (formato DD/MM/AAAA):", reply_markup=ReplyKeyboardRemove())
        return INTER_FOLLOWUP_DATE
    else:
        context.user_data["followup_interacao"] = None
        try:
            chat_id = str(update.message.chat.id)
            db.collection("users").document(chat_id).collection("interacoes").document().set({
                "cliente": context.user_data["client_interacao"],
                "resumo": context.user_data["resumo_interacao"],
                "followup": None,
                "criado_em": datetime.now().isoformat()
            })
            await update.message.reply_text("Interação registrada com sucesso!", reply_markup=ReplyKeyboardRemove())
        except Exception as e:
            await update.message.reply_text("Erro ao registrar interação: " + str(e), reply_markup=ReplyKeyboardRemove())
        return ConversationHandler.END

async def interacao_followup_date(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    data_str = update.message.text.strip()
    try:
        data_follow = datetime.strptime(data_str, "%d/%m/%Y").date()
    except ValueError:
        await update.message.reply_text("⚠️ Formato inválido! Use DD/MM/AAAA.")
        return INTER_FOLLOWUP_DATE
    context.user_data["followup_interacao"] = data_follow.isoformat()
    try:
        chat_id = str(update.message.chat.id)
        db.collection("users").document(chat_id).collection("interacoes").document().set({
            "cliente": context.user_data["client_interacao"],
            "resumo": context.user_data["resumo_interacao"],
            "followup": context.user_data["followup_interacao"],
            "criado_em": datetime.now().isoformat()
        })
        await update.message.reply_text("Interação registrada com sucesso!")
    except Exception as e:
        await update.message.reply_text("Erro ao registrar interação: " + str(e))
    return ConversationHandler.END

async def interacao_cancel(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    await update.message.reply_text("Interação cancelada.", reply_markup=ReplyKeyboardRemove())
    return ConversationHandler.END

# Fluxo de Lembrete
async def lembrete_start(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    await update.message.reply_text("🔔 *Lembrete*: Informe o texto do lembrete:", parse_mode="Markdown")
    return REMINDER_TEXT

async def lembrete_text(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    context.user_data["lembrete_text"] = update.message.text.strip()
    await update.message.reply_text("⏳ Agora, informe a data e horário para o lembrete (formato DD/MM/AAAA HH:MM):")
    return REMINDER_DATETIME

async def lembrete_datetime(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    input_str = update.message.text.strip()
    try:
        target_datetime = datetime.strptime(input_str, "%d/%m/%Y %H:%M").replace(tzinfo=TIMEZONE)
    except ValueError:
        await update.message.reply_text("⚠️ Formato inválido! Utilize DD/MM/AAAA HH:MM")
        return REMINDER_DATETIME
    now = datetime.now(TIMEZONE)
    delay_seconds = (target_datetime - now).total_seconds()
    if delay_seconds <= 0:
        await update.message.reply_text("⚠️ A data/hora informada já passou. Informe um horário futuro:")
        return REMINDER_DATETIME
    chat_id = str(update.message.chat.id)
    lembrete_text_value = context.user_data["lembrete_text"]
    context.job_queue.run_once(lembrete_callback, delay_seconds, data={"chat_id": chat_id, "lembrete_text": lembrete_text_value})
    await update.message.reply_text(f"✅ Lembrete agendado para {target_datetime.strftime('%d/%m/%Y %H:%M')}!", reply_markup=ReplyKeyboardRemove())
    return ConversationHandler.END

async def lembrete_cancel(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    await update.message.reply_text("Agendamento de lembrete cancelado.", reply_markup=ReplyKeyboardRemove())
    return ConversationHandler.END

async def lembrete_callback(context: ContextTypes.DEFAULT_TYPE) -> None:
    try:
        job_data = context.job.data
        chat_id = job_data["chat_id"]
        lembrete_text_value = job_data["lembrete_text"]
        await context.bot.send_message(chat_id=chat_id, text=f"🔔 *Lembrete*: {lembrete_text_value}", parse_mode="Markdown")
    except Exception as e:
        logger.error("Erro no lembrete_callback: %s", e)

# Fluxo de Relatório
async def relatorio_start(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    await update.message.reply_text("📊 *Relatório*: Informe a data de início (formato DD/MM/AAAA):", parse_mode="Markdown")
    return REPORT_START

async def relatorio_start_received(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    date_str = update.message.text.strip()
    try:
        start_date_dt = datetime.strptime(date_str, "%d/%m/%Y")
        context.user_data["report_start"] = date_str
        context.user_data["report_start_dt"] = start_date_dt
    except Exception as e:
        await update.message.reply_text("⚠️ Formato inválido! Use DD/MM/AAAA. Informe novamente a data de início:")
        return REPORT_START
    await update.message.reply_text("Agora, informe a data de fim (formato DD/MM/AAAA):", parse_mode="Markdown")
    return REPORT_END

async def relatorio_end_received(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    date_str = update.message.text.strip()
    try:
        end_date_dt = datetime.strptime(date_str, "%d/%m/%Y")
        context.user_data["report_end"] = date_str
        context.user_data["report_end_dt"] = end_date_dt
    except Exception as e:
        await update.message.reply_text("⚠️ Formato inválido! Use DD/MM/AAAA. Informe novamente a data de fim:")
        return REPORT_END
    chat_id = str(update.message.chat.id)
    followups_docs = list(db.collection("users").document(chat_id).collection("followups").stream())
    visitas_docs = list(db.collection("users").document(chat_id).collection("visitas").stream())
    interacoes_docs = list(db.collection("users").document(chat_id).collection("interacoes").stream())
    def in_interval(criado_em_str: str) -> bool:
        try:
            doc_date = datetime.fromisoformat(criado_em_str)
        except Exception:
            return False
        return context.user_data["report_start_dt"] <= doc_date <= context.user_data["report_end_dt"]
    total_followups = 0
    confirmados = 0
    total_visitas = 0
    total_interacoes = 0
    for doc in followups_docs:
        data = doc.to_dict() or {}
        if data.get("criado_em", "") and in_interval(data.get("criado_em", "")):
            total_followups += 1
            if data.get("status") == "realizado":
                confirmados += 1
    for doc in visitas_docs:
        data = doc.to_dict() or {}
        if data.get("criado_em", "") and in_interval(data.get("criado_em", "")):
            total_visitas += 1
    for doc in interacoes_docs:
        data = doc.to_dict() or {}
        if data.get("criado_em", "") and in_interval(data.get("criado_em", "")):
            total_interacoes += 1
    pendentes = total_followups - confirmados
    periodo_info = f"de {context.user_data['report_start']} até {context.user_data['report_end']}"
    texto_relatorio = (
        f"📊 *Relatório ({periodo_info})*\n\n"
        f"Follow-ups:\n - Total: {total_followups}\n - Confirmados: {confirmados}\n - Pendentes: {pendentes}\n\n"
        f"Visitas: {total_visitas}\n"
        f"Interações: {total_interacoes}"
    )
    await update.message.reply_text(texto_relatorio, parse_mode="Markdown")
    grafico_path = gerar_grafico(total_followups, confirmados, pendentes, total_visitas, total_interacoes, periodo_info)
    with open(grafico_path, "rb") as photo:
        await update.message.reply_photo(photo=photo, caption="Gráfico do relatório")
    os.remove(grafico_path)
    return ConversationHandler.END

async def relatorio_cancel(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    await update.message.reply_text("Relatório cancelado.")
    return ConversationHandler.END

# Fluxo de Histórico
async def historico_conv_start(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    await update.message.reply_text("📜 *Histórico Detalhado*: Informe a data de início (formato DD/MM/AAAA):", parse_mode="Markdown")
    return HIST_START

async def historico_conv_start_received(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    date_str = update.message.text.strip()
    try:
        start_date_dt = datetime.strptime(date_str, "%d/%m/%Y")
        context.user_data["historico_start"] = date_str
        context.user_data["historico_start_dt"] = start_date_dt
    except Exception as e:
        await update.message.reply_text("⚠️ Formato inválido! Use DD/MM/AAAA. Informe novamente a data de início:")
        return HIST_START
    await update.message.reply_text("Agora, informe a data de fim (formato DD/MM/AAAA):", parse_mode="Markdown")
    return HIST_END

async def historico_conv_end_received(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    date_str = update.message.text.strip()
    try:
        end_date_dt = datetime.strptime(date_str, "%d/%m/%Y")
        context.user_data["historico_end"] = date_str
        context.user_data["historico_end_dt"] = end_date_dt
    except Exception as e:
        await update.message.reply_text("⚠️ Formato inválido! Use DD/MM/AAAA. Informe novamente a data de fim:")
        return HIST_END
    chat_id = str(update.message.chat.id)
    followups_docs = list(db.collection("users").document(chat_id).collection("followups").stream())
    visitas_docs = list(db.collection("users").document(chat_id).collection("visitas").stream())
    interacoes_docs = list(db.collection("users").document(chat_id).collection("interacoes").stream())
    def in_interval(criado_em_str: str) -> bool:
        try:
            doc_date = datetime.fromisoformat(criado_em_str)
        except Exception:
            return False
        return context.user_data["historico_start_dt"] <= doc_date <= context.user_data["historico_end_dt"]
    mensagem = "*📜 Histórico Detalhado*\n\n"
    if followups_docs:
        mensagem += "📋 *Follow-ups*\n"
        for doc in followups_docs:
            data = doc.to_dict() or {}
            if data.get("criado_em", "") and in_interval(data.get("criado_em", "")):
                mensagem += f" - ID: {doc.id} - {data}\n"
    else:
        mensagem += "📋 *Follow-ups*: Nenhum registro encontrado.\n\n"
    if visitas_docs:
        mensagem += "🏢 *Visitas*\n"
        for doc in visitas_docs:
            data = doc.to_dict() or {}
            if data.get("criado_em", "") and in_interval(data.get("criado_em", "")):
                mensagem += f" - ID: {doc.id} - {data}\n"
    else:
        mensagem += "🏢 *Visitas*: Nenhum registro encontrado.\n\n"
    if interacoes_docs:
        mensagem += "💬 *Interações*\n"
        for doc in interacoes_docs:
            data = doc.to_dict() or {}
            if data.get("criado_em", "") and in_interval(data.get("criado_em", "")):
                mensagem += f" - ID: {doc.id} - {data}\n"
    else:
        mensagem += "💬 *Interações*: Nenhum registro encontrado.\n\n"
    if mensagem.strip() == "*📜 Histórico Detalhado*\n\n":
        mensagem = "⚠️ Nenhum registro encontrado no intervalo fornecido."
    await update.message.reply_text(mensagem, parse_mode="Markdown")
    return ConversationHandler.END

async def historico_conv_cancel(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    await update.message.reply_text("Histórico cancelado.")
    return ConversationHandler.END

# Fluxo de Edição
async def editar_start(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    options = [[
        InlineKeyboardButton("Followup", callback_data="edit_category:followup"),
        InlineKeyboardButton("Visita", callback_data="edit_category:visita"),
        InlineKeyboardButton("Interacao", callback_data="edit_category:interacao")
    ]]
    reply_markup = InlineKeyboardMarkup(options)
    await update.message.reply_text("❓ *Edição*: Escolha a categoria para editar:", reply_markup=reply_markup, parse_mode="Markdown")
    return EDIT_RECORD  # Pula EDIT_CATEGORY, pois o callback será tratado fora

async def editar_category_callback(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    query = update.callback_query
    await query.answer()
    category = query.data.split(":", 1)[1]
    context.user_data["edit_category"] = category
    chat_id = str(query.message.chat.id)
    if category == "followup":
        col = db.collection("users").document(chat_id).collection("followups")
    elif category == "visita":
        col = db.collection("users").document(chat_id).collection("visitas")
    else:
        col = db.collection("users").document(chat_id).collection("interacoes")
    docs = list(col.stream())
    if not docs:
        await query.edit_message_text(f"Não foram encontrados registros para {category}.")
        return
    msg = f"*Registros de {category}:*\n"
    for doc in docs:
        msg += f"ID: {doc.id} - {doc.to_dict()}\n"
    await query.edit_message_text(msg, parse_mode="Markdown")
    await query.message.reply_text("Digite o ID do registro que deseja editar:")

async def editar_record_received(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    record_id = update.message.text.strip()
    context.user_data["edit_record_id"] = record_id
    await update.message.reply_text("Qual campo deseja editar? (Ex.: followup: cliente, data_follow, descricao, status; visita: empresa, data_visita, classificacao, motivo, followup; interacao: cliente, resumo, followup)")
    return EDIT_FIELD

async def editar_field_received(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    field = update.message.text.strip()
    context.user_data["edit_field"] = field
    await update.message.reply_text(f"Digite o novo valor para o campo '{field}':")
    return EDIT_NEW_VALUE

async def editar_new_value_received(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    new_value = update.message.text.strip()
    cat = context.user_data["edit_category"]
    record_id = context.user_data["edit_record_id"]
    field = context.user_data["edit_field"]
    chat_id = str(update.message.chat.id)
    if cat == "followup":
        col = db.collection("users").document(chat_id).collection("followups")
    elif cat == "visita":
        col = db.collection("users").document(chat_id).collection("visitas")
    else:
        col = db.collection("users").document(chat_id).collection("interacoes")
    try:
        col.document(record_id).update({field: new_value})
        await update.message.reply_text("Registro atualizado com sucesso!")
    except Exception as e:
        await update.message.reply_text("Erro ao atualizar registro: " + str(e))
    return ConversationHandler.END

async def editar_cancel(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    await update.message.reply_text("Edição cancelada.")
    return ConversationHandler.END

# Fluxo de Exclusão
async def excluir_start(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    options = [[
        InlineKeyboardButton("Followup", callback_data="delete_category:followup"),
        InlineKeyboardButton("Visita", callback_data="delete_category:visita"),
        InlineKeyboardButton("Interacao", callback_data="delete_category:interacao")
    ]]
    reply_markup = InlineKeyboardMarkup(options)
    await update.message.reply_text("❓ *Exclusão*: Escolha a categoria para excluir:", reply_markup=reply_markup, parse_mode="Markdown")
    return DELETE_RECORD  # Pula DELETE_CATEGORY, pois o callback será tratado fora

async def excluir_category_callback(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    query = update.callback_query
    await query.answer()
    category = query.data.split(":", 1)[1]
    context.user_data["delete_category"] = category
    chat_id = str(query.message.chat.id)
    if category == "followup":
        col = db.collection("users").document(chat_id).collection("followups")
    elif category == "visita":
        col = db.collection("users").document(chat_id).collection("visitas")
    else:
        col = db.collection("users").document(chat_id).collection("interacoes")
    docs = list(col.stream())
    if not docs:
        await query.edit_message_text(f"Não foram encontrados registros para {category}.")
        return
    msg = f"*Registros de {category}:*\n"
    for doc in docs:
        msg += f"ID: {doc.id} - {doc.to_dict()}\n"
    await query.edit_message_text(msg, parse_mode="Markdown")
    await query.message.reply_text("Digite o ID do registro que deseja excluir:")

async def excluir_record_received(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    record_id = update.message.text.strip()
    context.user_data["delete_record_id"] = record_id
    await update.message.reply_text("Tem certeza que deseja excluir esse registro? (sim/nao)")
    return DELETE_CONFIRMATION

async def excluir_confirmation_received(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    response = update.message.text.strip().lower()
    if response != "sim":
        await update.message.reply_text("Exclusão cancelada.")
        return ConversationHandler.END
    cat = context.user_data["delete_category"]
    record_id = context.user_data["delete_record_id"]
    chat_id = str(update.message.chat.id)
    if cat == "followup":
        col = db.collection("users").document(chat_id).collection("followups")
    elif cat == "visita":
        col = db.collection("users").document(chat_id).collection("visitas")
    else:
        col = db.collection("users").document(chat_id).collection("interacoes")
    try:
        col.document(record_id).delete()
        await update.message.reply_text("Registro excluído com sucesso!")
    except Exception as e:
        await update.message.reply_text("Erro ao excluir registro: " + str(e))
    return ConversationHandler.END

async def excluir_cancel(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    await update.message.reply_text("Exclusão cancelada.")
    return ConversationHandler.END

# Fluxo de Filtragem
async def filtrar_start(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    options = [[
        InlineKeyboardButton("Followup", callback_data="filter_category:followup"),
        InlineKeyboardButton("Visita", callback_data="filter_category:visita"),
        InlineKeyboardButton("Interacao", callback_data="filter_category:interacao")
    ]]
    reply_markup = InlineKeyboardMarkup(options)
    await update.message.reply_text("🔍 *Filtragem*: Escolha a categoria para filtrar:", reply_markup=reply_markup, parse_mode="Markdown")
    return FILTER_FIELD  # Pula FILTER_CATEGORY, pois o callback será tratado fora

async def filtrar_category_callback(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    query = update.callback_query
    await query.answer()
    category = query.data.split(":", 1)[1]
    context.user_data["filter_category"] = category
    await query.edit_message_text("Qual campo deseja utilizar para filtrar? (Ex.: followup: cliente, data_follow, status; visita: empresa, data_visita, classificacao, motivo; interacao: cliente, resumo, followup)")

async def filtrar_field_received(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    field = update.message.text.strip()
    context.user_data["filter_field"] = field
    await update.message.reply_text(f"Digite o valor para filtrar o campo '{field}':")
    return FILTER_VALUE

async def filtrar_value_received(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    value = update.message.text.strip()
    context.user_data["filter_value"] = value
    cat = context.user_data["filter_category"]
    chat_id = str(update.message.chat.id)
    if cat == "followup":
        col = db.collection("users").document(chat_id).collection("followups")
    elif cat == "visita":
        col = db.collection("users").document(chat_id).collection("visitas")
    else:
        col = db.collection("users").document(chat_id).collection("interacoes")
    docs = list(col.stream())
    matched = []
    for doc in docs:
        data = doc.to_dict() or {}
        if str(data.get(context.user_data["filter_field"], "")).lower() == value.lower():
            matched.append((doc.id, data))
    if not matched:
        await update.message.reply_text("Nenhum registro encontrado com esse critério.")
    else:
        msg = f"*Registros filtrados em {cat}:*\n"
        for rec in matched:
            msg += f"ID: {rec[0]} - {rec[1]}\n"
        await update.message.reply_text(msg, parse_mode="Markdown")
    return ConversationHandler.END

async def filtrar_cancel(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    await update.message.reply_text("Filtragem cancelada.")
    return ConversationHandler.END

# Fluxo de Exportação
async def exportar_start(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    options = [[
        InlineKeyboardButton("Followup", callback_data="export_category:followup"),
        InlineKeyboardButton("Visita", callback_data="export_category:visita"),
        InlineKeyboardButton("Interacao", callback_data="export_category:interacao")
    ]]
    reply_markup = InlineKeyboardMarkup(options)
    await update.message.reply_text("🔄 *Exportar*: Escolha a categoria que deseja exportar:", reply_markup=reply_markup, parse_mode="Markdown")
    return EXPORT_PROCESS  # Pula EXPORT_CATEGORY, pois o callback será tratado fora

async def exportar_category_callback(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    query = update.callback_query
    await query.answer()
    category = query.data.split(":", 1)[1]
    chat_id = str(query.message.chat.id)
    if category == "followup":
        col = db.collection("users").document(chat_id).collection("followups")
        categoria_nome = "followups"
    elif category == "visita":
        col = db.collection("users").document(chat_id).collection("visitas")
        categoria_nome = "visitas"
    else:
        col = db.collection("users").document(chat_id).collection("interacoes")
        categoria_nome = "interacoes"
    docs = list(col.stream())
    if not docs:
        await query.edit_message_text(f"Não existem registros na categoria {categoria_nome}.")
        return
    csv_file = exportar_csv(docs)
    await query.edit_message_text("Gerando arquivo CSV...")
    with open(csv_file, "rb") as f:
        await query.message.reply_document(document=f, filename=f"{categoria_nome}.csv", caption="Arquivo exportado")
    os.remove(csv_file)

async def exportar_cancel(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    await update.message.reply_text("Exportação cancelada.")
    return ConversationHandler.END

# Jobs Diários
async def daily_reminder_callback(context: ContextTypes.DEFAULT_TYPE) -> None:
    try:
        today = datetime.now(TIMEZONE).date().isoformat()
        docs = db.collection_group("followups")\
                 .where(filter=FieldFilter("data_follow", "==", today))\
                 .where(filter=FieldFilter("status", "==", "pendente")).stream()
        for doc in docs:
            data = doc.to_dict()
            user_chat_id = data.get("chat_id")
            if user_chat_id:
                followup_id = doc.id
                message_text = (
                    f"🔔 *Lembrete de Follow-up:*\n"
                    f"Cliente: {data.get('cliente')}\n"
                    f"Descrição: {data.get('descricao')}\n\n"
                    "Confirme se o contato foi realizado:"
                )
                keyboard = InlineKeyboardMarkup(
                    [[InlineKeyboardButton("Confirmar", callback_data=f"confirm_followup:{user_chat_id}:{followup_id}")]]
                )
                logger.info(f"Enviando lembrete para {user_chat_id}: {message_text}")
                try:
                    await context.bot.send_message(chat_id=user_chat_id, text=message_text, reply_markup=keyboard, parse_mode="Markdown")
                except BadRequest as e:
                    logger.error(f"Erro de parsing na mensagem: {message_text} - {e}")
                    await context.bot.send_message(chat_id=user_chat_id, text="⚠️ Erro ao enviar lembrete.")
    except Exception as e:
        logger.error("Erro no daily_reminder_callback: %s", e)

async def evening_summary_callback(context: ContextTypes.DEFAULT_TYPE) -> None:
    try:
        today = datetime.now(TIMEZONE).date().isoformat()
        confirmed_count = {}
        pending_items = {}
        docs = db.collection_group("followups").where(filter=FieldFilter("data_follow", "==", today)).stream()
        for doc in docs:
            data = doc.to_dict()
            user_chat_id = data.get("chat_id")
            if not user_chat_id:
                continue
            if data.get("status") == "realizado":
                confirmed_count[user_chat_id] = confirmed_count.get(user_chat_id, 0) + 1
            elif data.get("status") == "pendente":
                pending_items.setdefault(user_chat_id, []).append((doc.id, data))
        tomorrow = (datetime.now(TIMEZONE).date() + timedelta(days=1)).isoformat()
        for user_chat_id in pending_items.keys():
            pending_count = len(pending_items[user_chat_id])
            confirmed = confirmed_count.get(user_chat_id, 0)
            summary_text = (
                f"📝 *Resumo do dia {today}:*\n\n"
                f"Follow-ups confirmados: {confirmed}\n"
                f"Follow-ups pendentes: {pending_count}\n"
                f"Os pendentes foram reagendados para {tomorrow}."
            )
            logger.info(f"Enviando resumo para {user_chat_id}: {summary_text}")
            try:
                await context.bot.send_message(chat_id=user_chat_id, text=summary_text, parse_mode="Markdown")
            except BadRequest as e:
                logger.error(f"Erro de parsing na mensagem: {summary_text} - {e}")
                await context.bot.send_message(chat_id=user_chat_id, text="⚠️ Erro ao enviar resumo.")
            for doc_id, _ in pending_items[user_chat_id]:
                db.collection("users").document(user_chat_id)\
                  .collection("followups").document(doc_id).update({"data_follow": tomorrow})
    except Exception as e:
        logger.error("Erro no evening_summary_callback: %s", e)

async def confirm_followup_callback(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    try:
        query = update.callback_query
        await query.answer()
        _, user_chat_id, doc_id = query.data.split(":", 2)
        db.collection("users").document(user_chat_id)\
          .collection("followups").document(doc_id).update({"status": "realizado"})
        await query.edit_message_text(text="✅ Follow-up confirmado!")
    except Exception as e:
        logger.error("Erro ao confirmar follow-up: %s", e)
        await query.edit_message_text(text="Erro ao confirmar follow-up.")

# Error Handler
async def error_handler(update: object, context: ContextTypes.DEFAULT_TYPE) -> None:
    logger.error("Exception while handling an update: %s", context.error)

# Função Principal
async def main():
    token = os.environ.get("TELEGRAM_TOKEN")
    if not token:
        logger.error("TELEGRAM_TOKEN não definido!")
        return

    application = ApplicationBuilder().token(token).read_timeout(10).write_timeout(10).build()

    # Comandos Básicos
    application.add_handler(CommandHandler("inicio", inicio))
    application.add_handler(CommandHandler("ajuda", ajuda))

    # Handler para Follow-up
    followup_conv_handler = ConversationHandler(
        entry_points=[CommandHandler("followup", followup_start)],
        states={
            FOLLOWUP_CLIENT: [MessageHandler(filters.TEXT & ~filters.COMMAND, followup_client)],
            FOLLOWUP_DATE: [MessageHandler(filters.TEXT & ~filters.COMMAND, followup_date)],
            FOLLOWUP_DESCRIPTION: [MessageHandler(filters.TEXT & ~filters.COMMAND, followup_description)]
        },
        fallbacks=[CommandHandler("cancelar", followup_cancel)],
        per_chat=True,
        per_message=False
    )
    application.add_handler(followup_conv_handler)

    # Handler para Visita
    visita_conv_handler = ConversationHandler(
        entry_points=[CommandHandler("visita", visita_start)],
        states={
            VISIT_COMPANY: [MessageHandler(filters.TEXT & ~filters.COMMAND, visita_company)],
            VISIT_DATE: [MessageHandler(filters.TEXT & ~filters.COMMAND, visita_date)],
            VISIT_MOTIVE: [MessageHandler(filters.TEXT & ~filters.COMMAND, visita_motive)],
            VISIT_FOLLOWUP_CHOICE: [MessageHandler(filters.TEXT & ~filters.COMMAND, visita_followup_choice)],
            VISIT_FOLLOWUP_DATE: [MessageHandler(filters.TEXT & ~filters.COMMAND, visita_followup_date)]
        },
        fallbacks=[CommandHandler("cancelar", visita_cancel)],
        per_chat=True,
        per_message=False
    )
    application.add_handler(visita_conv_handler)
    application.add_handler(CallbackQueryHandler(visita_category_callback, pattern="^visit_category:"))

    # Handler para Interação
    interacao_conv_handler = ConversationHandler(
        entry_points=[CommandHandler("interacao", interacao_start)],
        states={
            INTER_CLIENT: [MessageHandler(filters.TEXT & ~filters.COMMAND, interacao_client)],
            INTER_SUMMARY: [MessageHandler(filters.TEXT & ~filters.COMMAND, interacao_summary)],
            INTER_FOLLOWUP_CHOICE: [MessageHandler(filters.TEXT & ~filters.COMMAND, interacao_followup_choice)],
            INTER_FOLLOWUP_DATE: [MessageHandler(filters.TEXT & ~filters.COMMAND, interacao_followup_date)]
        },
        fallbacks=[CommandHandler("cancelar", interacao_cancel)],
        per_chat=True,
        per_message=False
    )
    application.add_handler(interacao_conv_handler)

    # Handler para Lembrete
    lembrete_conv_handler = ConversationHandler(
        entry_points=[CommandHandler("lembrete", lembrete_start)],
        states={
            REMINDER_TEXT: [MessageHandler(filters.TEXT & ~filters.COMMAND, lembrete_text)],
            REMINDER_DATETIME: [MessageHandler(filters.TEXT & ~filters.COMMAND, lembrete_datetime)]
        },
        fallbacks=[CommandHandler("cancelar", lembrete_cancel)],
        per_chat=True,
        per_message=False
    )
    application.add_handler(lembrete_conv_handler)

    # Handler para Relatório
    relatorio_conv_handler = ConversationHandler(
        entry_points=[CommandHandler("relatorio", relatorio_start)],
        states={
            REPORT_START: [MessageHandler(filters.TEXT & ~filters.COMMAND, relatorio_start_received)],
            REPORT_END: [MessageHandler(filters.TEXT & ~filters.COMMAND, relatorio_end_received)]
        },
        fallbacks=[CommandHandler("cancelar", relatorio_cancel)],
        per_chat=True,
        per_message=False
    )
    application.add_handler(relatorio_conv_handler)

    # Handler para Histórico
    historico_conv_handler = ConversationHandler(
        entry_points=[CommandHandler("historico", historico_conv_start)],
        states={
            HIST_START: [MessageHandler(filters.TEXT & ~filters.COMMAND, historico_conv_start_received)],
            HIST_END: [MessageHandler(filters.TEXT & ~filters.COMMAND, historico_conv_end_received)]
        },
        fallbacks=[CommandHandler("cancelar", historico_conv_cancel)],
        per_chat=True,
        per_message=False
    )
    application.add_handler(historico_conv_handler)

    # Handler para Edição
    editar_conv_handler = ConversationHandler(
        entry_points=[CommandHandler("editar", editar_start)],
        states={
            EDIT_RECORD: [MessageHandler(filters.TEXT & ~filters.COMMAND, editar_record_received)],
            EDIT_FIELD: [MessageHandler(filters.TEXT & ~filters.COMMAND, editar_field_received)],
            EDIT_NEW_VALUE: [MessageHandler(filters.TEXT & ~filters.COMMAND, editar_new_value_received)]
        },
        fallbacks=[CommandHandler("cancelar", editar_cancel)],
        per_chat=True,
        per_message=False
    )
    application.add_handler(editar_conv_handler)
    application.add_handler(CallbackQueryHandler(editar_category_callback, pattern="^edit_category:"))

    # Handler para Exclusão
    excluir_conv_handler = ConversationHandler(
        entry_points=[CommandHandler("excluir", excluir_start)],
        states={
            DELETE_RECORD: [MessageHandler(filters.TEXT & ~filters.COMMAND, excluir_record_received)],
            DELETE_CONFIRMATION: [MessageHandler(filters.TEXT & ~filters.COMMAND, excluir_confirmation_received)]
        },
        fallbacks=[CommandHandler("cancelar", excluir_cancel)],
        per_chat=True,
        per_message=False
    )
    application.add_handler(excluir_conv_handler)
    application.add_handler(CallbackQueryHandler(excluir_category_callback, pattern="^delete_category:"))

    # Handler para Filtragem
    filtrar_conv_handler = ConversationHandler(
        entry_points=[CommandHandler("filtrar", filtrar_start)],
        states={
            FILTER_FIELD: [MessageHandler(filters.TEXT & ~filters.COMMAND, filtrar_field_received)],
            FILTER_VALUE: [MessageHandler(filters.TEXT & ~filters.COMMAND, filtrar_value_received)]
        },
        fallbacks=[CommandHandler("cancelar", filtrar_cancel)],
        per_chat=True,
        per_message=False
    )
    application.add_handler(filtrar_conv_handler)
    application.add_handler(CallbackQueryHandler(filtrar_category_callback, pattern="^filter_category:"))

    # Handler para Exportação
    exportar_conv_handler = ConversationHandler(
        entry_points=[CommandHandler("exportar", exportar_start)],
        states={
            EXPORT_PROCESS: [MessageHandler(filters.TEXT & ~filters.COMMAND, exportar_cancel)]  # Estado vazio, pois o callback faz tudo
        },
        fallbacks=[CommandHandler("cancelar", exportar_cancel)],
        per_chat=True,
        per_message=False
    )
    application.add_handler(exportar_conv_handler)
    application.add_handler(CallbackQueryHandler(exportar_category_callback, pattern="^export_category:"))

    # Handler para Busca de Potenciais Clientes
    buscapotenciais_conv_handler = ConversationHandler(
        entry_points=[CommandHandler("buscapotenciais", buscapotenciais_start)],
        states={
            BUSCA_TIPO: [MessageHandler(filters.TEXT & ~filters.COMMAND, buscapotenciais_tipo)],
            BUSCA_LOCALIZACAO: [MessageHandler(filters.TEXT & ~filters.COMMAND, buscapotenciais_localizacao)],
            BUSCA_RAIO: [MessageHandler(filters.TEXT & ~filters.COMMAND, buscapotenciais_raio)],
            BUSCA_QUANTIDADE: [MessageHandler(filters.TEXT & ~filters.COMMAND, buscapotenciais_quantidade)]
        },
        fallbacks=[CommandHandler("cancelar", buscapotenciais_cancel)],
        per_chat=True,
        per_message=False
    )
    application.add_handler(buscapotenciais_conv_handler)

    # Handler para Criação de Rota
    criarrota_conv_handler = ConversationHandler(
        entry_points=[CommandHandler("criarrota", criarrota_start)],
        states={
            ROTA_TIPO: [MessageHandler(filters.TEXT & ~filters.COMMAND, criarrota_tipo)],
            ROTA_LOCALIZACAO: [MessageHandler(filters.TEXT & ~filters.COMMAND, criarrota_localizacao)],
            ROTA_RAIO: [MessageHandler(filters.TEXT & ~filters.COMMAND, criarrota_raio)],
            ROTA_QUANTIDADE: [MessageHandler(filters.TEXT & ~filters.COMMAND, criarrota_quantidade)]
        },
        fallbacks=[CommandHandler("cancelar", criarrota_cancel)],
        per_chat=True,
        per_message=False
    )
    application.add_handler(criarrota_conv_handler)

    # Handler para Confirmar Follow-up
    application.add_handler(CallbackQueryHandler(confirm_followup_callback, pattern=r"^confirm_followup:"))

    # Error Handler
    application.add_error_handler(error_handler)

    # Agendamento dos Jobs Diários
    job_queue = application.job_queue
    job_queue.run_daily(daily_reminder_callback, time=time(8, 30, tzinfo=TIMEZONE))
    job_queue.run_daily(daily_reminder_callback, time=time(13, 0, tzinfo=TIMEZONE))
    job_queue.run_daily(evening_summary_callback, time=time(18, 0, tzinfo=TIMEZONE))

    logger.info("Iniciando o bot...")
    await application.bot.delete_webhook(drop_pending_updates=True)
    await asyncio.sleep(1)
    try:
        await application.run_polling(drop_pending_updates=True)
    except Exception as e:
        logger.error("Erro durante polling: %s", e)

if __name__ == '__main__':
    asyncio.run(main())