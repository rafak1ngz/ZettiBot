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
VISIT_COMPANY, VISIT_DATE, VISIT_MOTIVE, VISIT_FOLLOWUP_CHOICE, VISIT_FOLLOWUP_DATE = range(3, 8)
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
    barras = plt.bar(categorias, valores, color=['#2F80ED', '#6FCF97', '#F4F6F8', '#2F80ED', '#6FCF97'])  # Paleta da marca
    plt.title(f"Relatório {periodo_info}", fontfamily="Montserrat")
    for barra in barras:
        yval = barra.get_height()
        plt.text(barra.get_x() + barra.get_width() / 2, yval + 0.1, yval, ha='center', va='bottom', fontfamily="Roboto Mono")
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
        "🚀 *ZettiBot na área!* Vamos achar novos clientes pra você. Qual segmento ou termo quer buscar? (ex.: 'indústria', 'logística')",
        parse_mode="Markdown"
    )
    return BUSCA_TIPO

async def buscapotenciais_tipo(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    context.user_data["busca_tipo"] = update.message.text.strip()
    await update.message.reply_text("📍 Beleza, agora me diz a região (ex.: 'Vila Velha - ES'):")
    return BUSCA_LOCALIZACAO

async def buscapotenciais_localizacao(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    context.user_data["busca_localizacao"] = update.message.text.strip()
    await update.message.reply_text("📏 Qual o raio de busca em km? (ex.: '10')")
    return BUSCA_RAIO

async def buscapotenciais_raio(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    try:
        raio = float(update.message.text.strip())
        if raio <= 0:
            raise ValueError
    except ValueError:
        await update.message.reply_text("⚠️ Ops, precisa ser um número maior que 0 (ex.: '10'). Tenta de novo:")
        return BUSCA_RAIO
    
    context.user_data["busca_raio"] = raio
    await update.message.reply_text("📋 Quantos clientes quer ver? (ex.: '5', '10')")
    return BUSCA_QUANTIDADE

async def buscapotenciais_quantidade(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    try:
        quantidade = int(update.message.text.strip())
        if quantidade <= 0:
            raise ValueError
    except ValueError:
        await update.message.reply_text("⚠️ Tem que ser um número maior que 0 (ex.: '5'). Tenta novamente:")
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
        await update.message.reply_text("🤔 Nenhum cliente encontrado pra esse termo. Quer tentar outro?")
        return ConversationHandler.END
    
    clientes_unicos = {cliente['nome']: cliente for cliente in clientes}.values()
    clientes_unicos = list(clientes_unicos)
    
    if quantidade > len(clientes_unicos):
        quantidade = len(clientes_unicos)
    msg = f"✅ *Aqui estão {quantidade} potenciais clientes pra '{tipo_cliente}':*\n"
    for cliente in clientes_unicos[:quantidade]:
        msg += f"- *{cliente['nome']}* ({cliente['fonte']})\n  Endereço: {cliente['endereco']}\n  Telefone: {cliente['telefone']}\n"
    context.user_data["clientes_potenciais"] = clientes_unicos
    await update.message.reply_text(msg, parse_mode="Markdown")
    return ConversationHandler.END

async def buscapotenciais_cancel(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    await update.message.reply_text("🔍 Busca cancelada. Qualquer coisa, é só chamar!")
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
        
        roteiro += f"1. *Origem* ({localizacao_inicial}): 0.0 km, 0 min\n"
        
        for i, idx in enumerate(ordem, start=2):
            perna = pernas[i-1]
            cliente = clientes_selecionados[idx]
            distancia = perna['distance']['text']
            tempo = perna['duration']['text']
            total_distancia += perna['distance']['value']
            total_tempo += perna['duration']['value']
            roteiro += f"{i}. *{cliente['nome']}* ({cliente['fonte']}): {distancia}, {tempo}\n"
        
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
        "🗺️ *ZettiBot ao seu lado!* Vamos criar uma rota pra suas visitas. Qual segmento quer incluir? (ex.: 'indústria')",
        parse_mode="Markdown"
    )
    return ROTA_TIPO

async def criarrota_tipo(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    context.user_data["rota_tipo"] = update.message.text.strip()
    await update.message.reply_text("📍 Perfeito, qual a região base? (ex.: 'Vila Velha - ES')")
    return ROTA_LOCALIZACAO

async def criarrota_localizacao(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    context.user_data["rota_localizacao"] = update.message.text.strip()
    await update.message.reply_text("📏 Qual o raio de busca em km? (ex.: '10')")
    return ROTA_RAIO

async def criarrota_raio(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    try:
        raio = float(update.message.text.strip())
        if raio <= 0:
            raise ValueError
    except ValueError:
        await update.message.reply_text("⚠️ Precisa ser um número maior que 0 (ex.: '10'). Tenta de novo:")
        return ROTA_RAIO
    
    context.user_data["rota_raio"] = raio
    await update.message.reply_text("📋 Quantos clientes na rota? (ex.: '5')")
    return ROTA_QUANTIDADE

async def criarrota_quantidade(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    try:
        quantidade = int(update.message.text.strip())
        if quantidade <= 0:
            raise ValueError
    except ValueError:
        await update.message.reply_text("⚠️ Número maior que 0, por favor (ex.: '5'). Tenta novamente:")
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
        await update.message.reply_text("🤔 Nenhum cliente encontrado pra essa rota. Quer ajustar os dados?")
        return ConversationHandler.END
    
    clientes_unicos = {cliente['nome']: cliente for cliente in todos_clientes}.values()
    clientes_unicos = list(clientes_unicos)
    
    if quantidade > len(clientes_unicos):
        quantidade = len(clientes_unicos)
    clientes_selecionados = clientes_unicos[:quantidade]
    
    msg = f"✅ *Rota pronta pra '{tipo_cliente}' ({quantidade} clientes):*\n"
    for i, cliente in enumerate(clientes_selecionados, 1):
        msg += f"{i}. *{cliente['nome']}* ({cliente['fonte']})\n   Endereço: {cliente['endereco']}\n   Telefone: {cliente['telefone']}\n"
    
    rota_otimizada = criar_rota_google(localizacao, quantidade, clientes_selecionados)
    if not isinstance(rota_otimizada, str) or "Erro" not in rota_otimizada:
        msg += "\n" + rota_otimizada
    
    context.user_data["clientes_rota"] = clientes_selecionados
    await update.message.reply_text(msg, parse_mode="Markdown")
    return ConversationHandler.END

async def criarrota_cancel(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    await update.message.reply_text("🗺️ Rota cancelada. Quando precisar, é só me chamar!")
    return ConversationHandler.END

# Comando /inicio
async def inicio(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    msg = (
        "🧠 *Olá, eu sou o ZettiBot!* Seu parceiro inteligente de campo: visitas, vendas, follow-ups e resultados no seu ritmo.\n\n"
        "Pronto pra organizar sua rotina e turbinar suas vendas? Veja o que posso fazer por você com /ajuda.\n"
        "Ou já comece com:\n"
        "• /visita – Registrar uma visita\n"
        "• /followup – Anotar um follow-up\n"
        "• /buscapotenciais – Encontrar novos clientes\n"
        "Vamos juntos?"
    )
    await update.message.reply_text(msg, parse_mode="Markdown")
    logger.info("Comando /inicio executado.")

# Comando /ajuda
async def ajuda(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    msg = (
        "🧠 *ZettiBot - Seu parceiro de campo*\n\n"
        "Estou aqui pra simplificar sua vida de vendedor externo. Veja como posso ajudar:\n\n"
        "• /inicio – Boas-vindas e primeiros passos\n"
        "• /ajuda – Essa lista aqui\n"
        "• /followup – Registrar um follow-up\n"
        "• /visita – Anotar uma visita\n"
        "• /interacao – Guardar uma interação\n"
        "• /lembrete – Agendar um aviso\n"
        "• /relatorio – Ver seu desempenho\n"
        "• /historico – Consultar tudo detalhado\n"
        "• /editar – Ajustar um registro\n"
        "• /excluir – Remover algo\n"
        "• /filtrar – Buscar registros específicos\n"
        "• /exportar – Baixar dados em CSV\n"
        "• /buscapotenciais – Encontrar novos clientes\n"
        "• /criarrota – Planejar suas visitas\n\n"
        "Se precisar sair de um comando, é só dizer /cancelar. Vamos vender mais juntos?"
    )
    await update.message.reply_text(msg, parse_mode="Markdown")

# Fluxo de Follow-up
async def followup_start(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    await update.message.reply_text("🤝 *ZettiBot na ativa!* Qual o cliente do follow-up?")
    return FOLLOWUP_CLIENT

async def followup_client(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    context.user_data["client"] = update.message.text.strip()
    await update.message.reply_text("📅 Quando é o follow-up? (DD/MM/AAAA)")
    return FOLLOWUP_DATE

async def followup_date(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    data_str = update.message.text.strip()
    try:
        data_followup = datetime.strptime(data_str, "%d/%m/%Y").date()
    except ValueError:
        await update.message.reply_text("⚠️ Formato errado! Use DD/MM/AAAA. Tenta de novo:")
        return FOLLOWUP_DATE
    context.user_data["followup_date"] = data_followup.isoformat()
    await update.message.reply_text("📝 O que você precisa fazer nesse follow-up?")
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
        await update.message.reply_text("✅ *Follow-up guardado!* Pode mandar mais quando quiser.")
    except Exception as e:
        await update.message.reply_text(f"⚠️ Ops, algo deu errado: {str(e)}. Vamos tentar de novo?")
    return ConversationHandler.END

async def followup_cancel(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    await update.message.reply_text("🤝 Follow-up cancelado. Qualquer coisa, é só chamar!")
    return ConversationHandler.END

# Fluxo de Visita
async def visita_start(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    await update.message.reply_text("🏢 *ZettiBot pronto pra registrar!* Qual empresa você visitou?")
    return VISIT_COMPANY

async def visita_company(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    context.user_data["company"] = update.message.text.strip()
    await update.message.reply_text("📅 Qual foi o dia da visita? (DD/MM/AAAA)")
    return VISIT_DATE

async def visita_date(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    data_str = update.message.text.strip()
    try:
        data_visita = datetime.strptime(data_str, "%d/%m/%Y").date()
    except ValueError:
        await update.message.reply_text("⚠️ Formato inválido! Use DD/MM/AAAA. Tenta novamente:")
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
    await update.message.reply_text("📋 Como esse cliente se encaixa?", reply_markup=reply_markup)
    return VISIT_MOTIVE

async def visita_category_callback(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    query = update.callback_query
    await query.answer()
    category = query.data.split(":", 1)[1]
    context.user_data["category"] = category
    await query.edit_message_text(text=f"✔️ *{category} selecionado!* Agora, qual foi o motivo da visita?", parse_mode="Markdown")

async def visita_motive(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    context.user_data["motive"] = update.message.text.strip()
    reply_keyboard = [["Sim", "Não"]]
    await update.message.reply_text(
        "📅 Quer agendar um follow-up pra essa visita? (Sim/Não)",
        reply_markup=ReplyKeyboardMarkup(reply_keyboard, one_time_keyboard=True, resize_keyboard=True)
    )
    return VISIT_FOLLOWUP_CHOICE

async def visita_followup_choice(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    choice = update.message.text.strip().lower()
    if choice == "sim":
        await update.message.reply_text("📅 Beleza, quando é o follow-up? (DD/MM/AAAA)", reply_markup=ReplyKeyboardRemove())
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
            await update.message.reply_text("✅ *Visita registrada!* Mais alguma coisa pra organizar?", reply_markup=ReplyKeyboardRemove())
        except Exception as e:
            await update.message.reply_text(f"⚠️ Algo deu errado: {str(e)}. Vamos tentar novamente?", reply_markup=ReplyKeyboardRemove())
        return ConversationHandler.END

async def visita_followup_date(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    data_str = update.message.text.strip()
    try:
        data_followup = datetime.strptime(data_str, "%d/%m/%Y").date()
    except ValueError:
        await update.message.reply_text("⚠️ Formato inválido! Use DD/MM/AAAA. Tenta de novo:")
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
        await update.message.reply_text("✅ *Visita e follow-up no bolso!* Vamos continuar vendendo?")
    except Exception as e:
        await update.message.reply_text(f"⚠️ Erro ao salvar: {str(e)}. Tenta novamente?")
    return ConversationHandler.END

async def visita_cancel(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    await update.message.reply_text("🏢 Visita cancelada. Estou aqui pra próxima!")
    return ConversationHandler.END

# Fluxo de Interação
async def interacao_start(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    await update.message.reply_text("💬 *ZettiBot em ação!* Com quem você interagiu?")
    return INTER_CLIENT

async def interacao_client(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    context.user_data["client_interacao"] = update.message.text.strip()
    await update.message.reply_text("📝 Resuma rapidinho essa interação:")
    return INTER_SUMMARY

async def interacao_summary(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    context.user_data["resumo_interacao"] = update.message.text.strip()
    reply_keyboard = [["Sim", "Não"]]
    await update.message.reply_text("📅 Quer um follow-up pra essa interação? (Sim/Não)",
                                    reply_markup=ReplyKeyboardMarkup(reply_keyboard, one_time_keyboard=True, resize_keyboard=True))
    return INTER_FOLLOWUP_CHOICE

async def interacao_followup_choice(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    choice = update.message.text.strip().lower()
    if choice == "sim":
        await update.message.reply_text("📅 Quando é o follow-up? (DD/MM/AAAA)", reply_markup=ReplyKeyboardRemove())
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
            await update.message.reply_text("✅ *Interação registrada!* O que mais posso fazer por você?", reply_markup=ReplyKeyboardRemove())
        except Exception as e:
            await update.message.reply_text(f"⚠️ Deu erro: {str(e)}. Vamos tentar de novo?", reply_markup=ReplyKeyboardRemove())
        return ConversationHandler.END

async def interacao_followup_date(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    data_str = update.message.text.strip()
    try:
        data_follow = datetime.strptime(data_str, "%d/%m/%Y").date()
    except ValueError:
        await update.message.reply_text("⚠️ Formato errado! Use DD/MM/AAAA. Tenta novamente:")
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
        await update.message.reply_text("✅ *Interação e follow-up salvos!* Vamos manter o ritmo?")
    except Exception as e:
        await update.message.reply_text(f"⚠️ Algo deu errado: {str(e)}. Tenta de novo?")
    return ConversationHandler.END

async def interacao_cancel(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    await update.message.reply_text("💬 Interação cancelada. Estou pronto pra próxima!")
    return ConversationHandler.END

# Fluxo de Lembrete
async def lembrete_start(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    await update.message.reply_text("🔔 *ZettiBot te lembra!* O que você quer anotar?")
    return REMINDER_TEXT

async def lembrete_text(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    context.user_data["lembrete_text"] = update.message.text.strip()
    await update.message.reply_text("⏳ Quando te aviso? (DD/MM/AAAA HH:MM)")
    return REMINDER_DATETIME

async def lembrete_datetime(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    input_str = update.message.text.strip()
    try:
        target_datetime = datetime.strptime(input_str, "%d/%m/%Y %H:%M").replace(tzinfo=TIMEZONE)
    except ValueError:
        await update.message.reply_text("⚠️ Formato inválido! Use DD/MM/AAAA HH:MM. Tenta de novo:")
        return REMINDER_DATETIME
    now = datetime.now(TIMEZONE)
    delay_seconds = (target_datetime - now).total_seconds()
    if delay_seconds <= 0:
        await update.message.reply_text("⚠️ Esse horário já passou! Me dá uma data futura:")
        return REMINDER_DATETIME
    chat_id = str(update.message.chat.id)
    lembrete_text_value = context.user_data["lembrete_text"]
    context.job_queue.run_once(lembrete_callback, delay_seconds, data={"chat_id": chat_id, "lembrete_text": lembrete_text_value})
    await update.message.reply_text(f"✅ *Lembrete agendado pra {target_datetime.strftime('%d/%m/%Y %H:%M')}!* Pode contar comigo.", reply_markup=ReplyKeyboardRemove())
    return ConversationHandler.END

async def lembrete_cancel(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    await update.message.reply_text("🔔 Lembrete cancelado. Qualquer coisa, é só me chamar!")
    return ConversationHandler.END

async def lembrete_callback(context: ContextTypes.DEFAULT_TYPE) -> None:
    try:
        job_data = context.job.data
        chat_id = job_data["chat_id"]
        lembrete_text_value = job_data["lembrete_text"]
        await context.bot.send_message(chat_id=chat_id, text=f"🔔 *ZettiBot te avisa:* {lembrete_text_value}", parse_mode="Markdown")
    except Exception as e:
        logger.error("Erro no lembrete_callback: %s", e)

# Fluxo de Relatório
async def relatorio_start(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    await update.message.reply_text("📊 *ZettiBot analisa pra você!* Qual o início do período? (DD/MM/AAAA)")
    return REPORT_START

async def relatorio_start_received(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    date_str = update.message.text.strip()
    try:
        start_date_dt = datetime.strptime(date_str, "%d/%m/%Y")
        context.user_data["report_start"] = date_str
        context.user_data["report_start_dt"] = start_date_dt
    except Exception:
        await update.message.reply_text("⚠️ Formato errado! Use DD/MM/AAAA. Tenta novamente:")
        return REPORT_START
    await update.message.reply_text("📅 E o fim do período? (DD/MM/AAAA)")
    return REPORT_END

async def relatorio_end_received(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    date_str = update.message.text.strip()
    try:
        end_date_dt = datetime.strptime(date_str, "%d/%m/%Y")
        context.user_data["report_end"] = date_str
        context.user_data["report_end_dt"] = end_date_dt
    except Exception:
        await update.message.reply_text("⚠️ Formato inválido! Use DD/MM/AAAA. Tenta de novo:")
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
        f"📊 *Seu desempenho no campo ({periodo_info}):*\n\n"
        f"Follow-ups:\n - Total: {total_followups}\n - Confirmados: {confirmados}\n - Pendentes: {pendentes}\n\n"
        f"Visitas: {total_visitas}\n"
        f"Interações: {total_interacoes}\n\n"
        "Quer melhorar esses números? Vamos planejar juntos!"
    )
    await update.message.reply_text(texto_relatorio, parse_mode="Markdown")
    grafico_path = gerar_grafico(total_followups, confirmados, pendentes, total_visitas, total_interacoes, periodo_info)
    with open(grafico_path, "rb") as photo:
        await update.message.reply_photo(photo=photo, caption="📈 Veja seu progresso em gráfico!")
    os.remove(grafico_path)
    return ConversationHandler.END

async def relatorio_cancel(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    await update.message.reply_text("📊 Relatório cancelado. Quando precisar, é só chamar!")
    return ConversationHandler.END

# Fluxo de Histórico
async def historico_conv_start(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    await update.message.reply_text("📜 *ZettiBot organiza tudo!* Qual o início do período? (DD/MM/AAAA)")
    return HIST_START

async def historico_conv_start_received(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    date_str = update.message.text.strip()
    try:
        start_date_dt = datetime.strptime(date_str, "%d/%m/%Y")
        context.user_data["historico_start"] = date_str
        context.user_data["historico_start_dt"] = start_date_dt
    except Exception:
        await update.message.reply_text("⚠️ Formato inválido! Use DD/MM/AAAA. Tenta de novo:")
        return HIST_START
    await update.message.reply_text("📅 E o fim do período? (DD/MM/AAAA)")
    return HIST_END

async def historico_conv_end_received(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    date_str = update.message.text.strip()
    try:
        end_date_dt = datetime.strptime(date_str, "%d/%m/%Y")
        context.user_data["historico_end"] = date_str
        context.user_data["historico_end_dt"] = end_date_dt
    except Exception:
        await update.message.reply_text("⚠️ Formato errado! Use DD/MM/AAAA. Tenta novamente:")
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
    mensagem = "*📜 Seu histórico no campo*\n\n"
    if followups_docs:
        mensagem += "📋 *Follow-ups*\n"
        for doc in followups_docs:
            data = doc.to_dict() or {}
            if data.get("criado_em", "") and in_interval(data.get("criado_em", "")):
                mensagem += f" - ID: {doc.id} - {data}\n"
    else:
        mensagem += "📋 *Follow-ups*: Nada por aqui ainda.\n\n"
    if visitas_docs:
        mensagem += "🏢 *Visitas*\n"
        for doc in visitas_docs:
            data = doc.to_dict() or {}
            if data.get("criado_em", "") and in_interval(data.get("criado_em", "")):
                mensagem += f" - ID: {doc.id} - {data}\n"
    else:
        mensagem += "🏢 *Visitas*: Nenhuma registrada.\n\n"
    if interacoes_docs:
        mensagem += "💬 *Interações*\n"
        for doc in interacoes_docs:
            data = doc.to_dict() or {}
            if data.get("criado_em", "") and in_interval(data.get("criado_em", "")):
                mensagem += f" - ID: {doc.id} - {data}\n"
    else:
        mensagem += "💬 *Interações*: Ainda sem registros.\n\n"
    if mensagem.strip() == "*📜 Seu histórico no campo*\n\n":
        mensagem = "🤔 Nenhum registro nesse período. Vamos criar alguns?"
    await update.message.reply_text(mensagem, parse_mode="Markdown")
    return ConversationHandler.END

async def historico_conv_cancel(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    await update.message.reply_text("📜 Histórico cancelado. Estou aqui pra próxima!")
    return ConversationHandler.END

# Fluxo de Edição
async def editar_start(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    options = [[
        InlineKeyboardButton("Followup", callback_data="edit_category:followup"),
        InlineKeyboardButton("Visita", callback_data="edit_category:visita"),
        InlineKeyboardButton("Interação", callback_data="edit_category:interacao")
    ]]
    reply_markup = InlineKeyboardMarkup(options)
    await update.message.reply_text("✏️ *ZettiBot ajusta pra você!* O que quer editar?", reply_markup=reply_markup)
    return EDIT_RECORD

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
        await query.edit_message_text(f"🤔 Nenhum {category} encontrado. Quer registrar um?")
        return
    msg = f"*Seus {category}s:*\n"
    for doc in docs:
        msg += f"ID: {doc.id} - {doc.to_dict()}\n"
    await query.edit_message_text(msg, parse_mode="Markdown")
    await query.message.reply_text("🔍 Qual o ID do registro pra editar?")

async def editar_record_received(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    record_id = update.message.text.strip()
    context.user_data["edit_record_id"] = record_id
    await update.message.reply_text("✏️ Qual campo quer mudar? (ex.: followup: cliente, data_follow; visita: empresa, motivo)")
    return EDIT_FIELD

async def editar_field_received(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    field = update.message.text.strip()
    context.user_data["edit_field"] = field
    await update.message.reply_text(f"✅ Campo '{field}' escolhido. Qual o novo valor?")
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
        await update.message.reply_text("✅ *Registro atualizado!* Tudo em ordem agora?")
    except Exception as e:
        await update.message.reply_text(f"⚠️ Deu erro: {str(e)}. Vamos tentar de novo?")
    return ConversationHandler.END

async def editar_cancel(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    await update.message.reply_text("✏️ Edição cancelada. Estou aqui pra próxima!")
    return ConversationHandler.END

# Fluxo de Exclusão
async def excluir_start(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    options = [[
        InlineKeyboardButton("Followup", callback_data="delete_category:followup"),
        InlineKeyboardButton("Visita", callback_data="delete_category:visita"),
        InlineKeyboardButton("Interação", callback_data="delete_category:interacao")
    ]]
    reply_markup = InlineKeyboardMarkup(options)
    await update.message.reply_text("🗑️ *ZettiBot limpa pra você!* O que quer excluir?", reply_markup=reply_markup)
    return DELETE_RECORD

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
        await query.edit_message_text(f"🤔 Nenhum {category} pra excluir. Quer registrar algo?")
        return
    msg = f"*Seus {category}s:*\n"
    for doc in docs:
        msg += f"ID: {doc.id} - {doc.to_dict()}\n"
    await query.edit_message_text(msg, parse_mode="Markdown")
    await query.message.reply_text("🔍 Qual o ID do registro pra apagar?")

async def excluir_record_received(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    record_id = update.message.text.strip()
    context.user_data["delete_record_id"] = record_id
    await update.message.reply_text("🗑️ Tem certeza? (sim/nao)")
    return DELETE_CONFIRMATION

async def excluir_confirmation_received(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    response = update.message.text.strip().lower()
    if response != "sim":
        await update.message.reply_text("✅ Cancelado. Nada foi excluído!")
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
        await update.message.reply_text("✅ *Registro apagado!* O que mais precisa?")
    except Exception as e:
        await update.message.reply_text(f"⚠️ Erro ao excluir: {str(e)}. Tenta de novo?")
    return ConversationHandler.END

async def excluir_cancel(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    await update.message.reply_text("🗑️ Exclusão cancelada. Estou aqui pra ajudar!")
    return ConversationHandler.END

# Fluxo de Filtragem
async def filtrar_start(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    options = [[
        InlineKeyboardButton("Followup", callback_data="filter_category:followup"),
        InlineKeyboardButton("Visita", callback_data="filter_category:visita"),
        InlineKeyboardButton("Interação", callback_data="filter_category:interacao")
    ]]
    reply_markup = InlineKeyboardMarkup(options)
    await update.message.reply_text("🔍 *ZettiBot acha pra você!* O que quer filtrar?", reply_markup=reply_markup)
    return FILTER_FIELD

async def filtrar_category_callback(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    query = update.callback_query
    await query.answer()
    category = query.data.split(":", 1)[1]
    context.user_data["filter_category"] = category
    await query.edit_message_text("🔍 Qual campo quer usar pra filtrar? (ex.: followup: cliente, status; visita: empresa, motivo)")

async def filtrar_field_received(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    field = update.message.text.strip()
    context.user_data["filter_field"] = field
    await update.message.reply_text(f"✅ Campo '{field}' ok. Qual valor tá procurando?")
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
        await update.message.reply_text("🤔 Nada encontrado com esse filtro. Quer tentar outro?")
    else:
        msg = f"✅ *Resultados em {cat}:*\n"
        for rec in matched:
            msg += f"ID: {rec[0]} - {rec[1]}\n"
        await update.message.reply_text(msg, parse_mode="Markdown")
    return ConversationHandler.END

async def filtrar_cancel(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    await update.message.reply_text("🔍 Filtragem cancelada. Estou pronto pra próxima!")
    return ConversationHandler.END

# Fluxo de Exportação
async def exportar_start(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    options = [[
        InlineKeyboardButton("Followup", callback_data="export_category:followup"),
        InlineKeyboardButton("Visita", callback_data="export_category:visita"),
        InlineKeyboardButton("Interação", callback_data="export_category:interacao")
    ]]
    reply_markup = InlineKeyboardMarkup(options)
    await update.message.reply_text("📦 *ZettiBot exporta pra você!* O que quer baixar?", reply_markup=reply_markup)
    return EXPORT_PROCESS

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
        await query.edit_message_text(f"🤔 Nenhum {categoria_nome} pra exportar. Quer registrar algo?")
        return
    csv_file = exportar_csv(docs)
    await query.edit_message_text("📦 Gerando seu arquivo...")
    with open(csv_file, "rb") as f:
        await query.message.reply_document(document=f, filename=f"{categoria_nome}.csv", caption="✅ Aqui está seu CSV!")
    os.remove(csv_file)

async def exportar_cancel(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    await update.message.reply_text("📦 Exportação cancelada. Estou aqui pra ajudar!")
    return ConversationHandler.END

# Jobs Diários
async def daily_reminder_callback(context: ContextTypes.DEFAULT_TYPE) -> None:
    try:
        today = datetime.now(TIMEZONE).date().isoformat()
        docs = db.collection_group("followups")\
                 .where("data_follow", "==", today)\
                 .where("status", "==", "pendente").stream()
        for doc in docs:
            data = doc.to_dict()
            user_chat_id = data.get("chat_id")
            if user_chat_id:
                followup_id = doc.id
                message_text = (
                    f"🔔 *ZettiBot te lembra:*\n"
                    f"Cliente: {data.get('cliente')}\n"
                    f"Ação: {data.get('descricao')}\n\n"
                    "Já fez esse follow-up? Confirma aí:"
                )
                keyboard = InlineKeyboardMarkup(
                    [[InlineKeyboardButton("Confirmar", callback_data=f"confirm_followup:{user_chat_id}:{followup_id}")]]
                )
                await context.bot.send_message(chat_id=user_chat_id, text=message_text, reply_markup=keyboard, parse_mode="Markdown")
    except Exception as e:
        logger.error("Erro no daily_reminder_callback: %s", e)

async def evening_summary_callback(context: ContextTypes.DEFAULT_TYPE) -> None:
    try:
        today = datetime.now(TIMEZONE).date().isoformat()
        confirmed_count = {}
        pending_items = {}
        docs = db.collection_group("followups").where("data_follow", "==", today).stream()
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
                f"📝 *Resumo do seu dia {today}:*\n\n"
                f"Follow-ups confirmados: {confirmed}\n"
                f"Pendentes: {pending_count}\n"
                f"Os pendentes foram jogados pra {tomorrow}. Vamos fechar amanhã?"
            )
            await context.bot.send_message(chat_id=user_chat_id, text=summary_text, parse_mode="Markdown")
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
        await query.edit_message_text(text="✅ *Follow-up confirmado!* Parabéns pelo progresso!")
    except Exception as e:
        logger.error("Erro ao confirmar follow-up: %s", e)
        await query.edit_message_text(text="⚠️ Erro ao confirmar. Tenta de novo?")

# Error Handler
async def error_handler(update: object, context: ContextTypes.DEFAULT_TYPE) -> None:
    logger.error("Exception while handling an update: %s", context.error)
    if update and hasattr(update, "message"):
        await update.message.reply_text("⚠️ Ops, algo deu errado. Vamos tentar de novo?")

# Função Principal
async def main():
    token = os.environ.get("TELEGRAM_TOKEN")
    if not token:
        logger.error("TELEGRAM_TOKEN não definido!")
        return

    application = ApplicationBuilder().token(token).build()

    application.add_handler(CommandHandler("inicio", inicio))
    application.add_handler(CommandHandler("ajuda", ajuda))

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

    exportar_conv_handler = ConversationHandler(
        entry_points=[CommandHandler("exportar", exportar_start)],
        states={
            EXPORT_PROCESS: [MessageHandler(filters.TEXT & ~filters.COMMAND, exportar_cancel)]
        },
        fallbacks=[CommandHandler("cancelar", exportar_cancel)],
        per_chat=True,
        per_message=False
    )
    application.add_handler(exportar_conv_handler)
    application.add_handler(CallbackQueryHandler(export Dining_category_callback, pattern="^export_category:"))

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

    application.add_handler(CallbackQueryHandler(confirm_followup_callback, pattern=r"^confirm_followup:"))
    application.add_error_handler(error_handler)

    job_queue = application.job_queue
    job_queue.run_daily(daily_reminder_callback, time=time(8, 30, tzinfo=TIMEZONE))
    job_queue.run_daily(daily_reminder_callback, time=time(13, 0, tzinfo=TIMEZONE))
    job_queue.run_daily(evening_summary_callback, time=time(18, 0, tzinfo=TIMEZONE))

    logger.info("Iniciando o bot...")
    await application.bot.delete_webhook(drop_pending_updates=True)
    await asyncio.sleep(5)
    logger.info("Webhook limpo, preparando polling...")
    try:
        logger.info("Iniciando polling...")
        await application.run_polling(drop_pending_updates=True, timeout=20)
    except Exception as e:
        logger.error("Erro durante polling: %s", e)
        raise

if __name__ == '__main__':
    asyncio.run(main())