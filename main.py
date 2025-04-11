import os
import json
import logging
import asyncio
import nest_asyncio
from datetime import datetime, timedelta, time
from zoneinfo import ZoneInfo
import tempfile
import matplotlib.pyplot as plt
import csv
import googlemaps
import random
from google.cloud.firestore_v1 import FieldFilter
from telegram import (
    InlineKeyboardButton, InlineKeyboardMarkup, ReplyKeyboardMarkup,
    ReplyKeyboardRemove, Update
)
from telegram.ext import (
    ApplicationBuilder, CommandHandler, ContextTypes, CallbackQueryHandler,
    ConversationHandler, MessageHandler, filters
)
from telegram.error import BadRequest, NetworkError, TimedOut
import firebase_admin
from firebase_admin import credentials, firestore

# Patch para nest_asyncio
nest_asyncio.apply()

# Fuso horário
TIMEZONE = ZoneInfo("America/Sao_Paulo")

# Configuração do Logger
logging.basicConfig(
    format='%(asctime)s - %(levelname)s - %(name)s - %(message)s',
    level=logging.INFO
)
logger = logging.getLogger("__main__")
logging.getLogger("httpx").setLevel(logging.WARNING)

# Inicialização do Firebase
if not os.environ.get("TELEGRAM_TOKEN"):
    logger.error("TELEGRAM_TOKEN não definido!")
    exit(1)
if not os.environ.get("FIREBASE_CREDENTIALS"):
    logger.error("FIREBASE_CREDENTIALS não definida!")
    exit(1)

firebase_credentials = os.environ.get("FIREBASE_CREDENTIALS")
try:
    cred_dict = json.loads(firebase_credentials)
    cred = credentials.Certificate(cred_dict)
    firebase_admin.initialize_app(cred)
    db = firestore.client()
    logger.info("Firebase inicializado com sucesso!")
except Exception as e:
    logger.error("Erro ao inicializar Firebase: %s", e)
    exit(1)

# Estados para fluxos
FOLLOWUP_CLIENT, FOLLOWUP_DATE, FOLLOWUP_DESCRIPTION = range(3)
VISIT_COMPANY, VISIT_DATE, VISIT_CATEGORY, VISIT_MOTIVE, VISIT_FOLLOWUP_CHOICE, VISIT_FOLLOWUP_DATE = range(3, 9)
INTER_CLIENT, INTER_SUMMARY, INTER_FOLLOWUP_CHOICE, INTER_FOLLOWUP_DATE = range(4)
REMINDER_TEXT, REMINDER_DATETIME = range(100, 102)
REPORT_START, REPORT_END = range(300, 302)
HIST_START, HIST_END = range(400, 402)
EDIT_CATEGORY, EDIT_RECORD, EDIT_FIELD, EDIT_NEW_VALUE = range(500, 504)
DELETE_CATEGORY, DELETE_RECORD, DELETE_CONFIRMATION = range(600, 603)
FILTER_CATEGORY, FILTER_TYPE, FILTER_VALUE = range(700, 703)
BUSCA_TIPO, BUSCA_LOCALIZACAO, BUSCA_RAIO, BUSCA_QUANTIDADE = range(900, 904)
ROTA_TIPO, ROTA_LOCALIZACAO, ROTA_RAIO, ROTA_QUANTIDADE = range(910, 914)

# Função para gerar gráfico
def gerar_grafico(total_followups, confirmados, pendentes, total_visitas, total_interacoes, periodo_info):
    try:
        plt.figure(figsize=(8, 4))
        categorias = ['Follow-ups', 'Confirmados', 'Pendentes', 'Visitas', 'Interações']
        valores = [total_followups, confirmados, pendentes, total_visitas, total_interacoes]
        barras = plt.bar(categorias, valores, color=['#007BFF', '#66B2FF', '#D9D9D9', '#FF6F61', '#FFD700'])
        plt.title(f"Resumo {periodo_info}", fontfamily='Montserrat', fontsize=14, fontweight='bold')
        for barra in barras:
            yval = barra.get_height()
            plt.text(barra.get_x() + barra.get_width() / 2, yval + 0.1, yval, ha='center', va='bottom', fontfamily='Roboto')
        tmp_file = tempfile.NamedTemporaryFile(suffix=".png", delete=False)
        plt.savefig(tmp_file.name, dpi=150, bbox_inches='tight')
        plt.close()
        logger.info("Gráfico gerado com sucesso: %s", tmp_file.name)
        return tmp_file.name
    except Exception as e:
        logger.error("Erro ao gerar gráfico: %s", e)
        raise

# Função para exportar CSV
def exportar_csv(docs):
    try:
        temp_file = tempfile.NamedTemporaryFile(mode="w", encoding="utf-8", newline="", delete=False, suffix=".csv")
        writer = csv.writer(temp_file)
        if docs:
            keys = list(docs[0].to_dict().keys())
            writer.writerow(keys)
            for doc in docs:
                data = doc.to_dict()
                writer.writerow([data.get(k, "") for k in keys])
        temp_file.close()
        logger.info("CSV exportado com sucesso: %s", temp_file.name)
        return temp_file.name
    except Exception as e:
        logger.error("Erro ao exportar CSV: %s", e)
        raise

# Configuração do Google Maps
GOOGLE_API_KEY = os.environ.get("GOOGLE_API_KEY")
if not GOOGLE_API_KEY:
    logger.error("GOOGLE_API_KEY não definida!")
    exit(1)
gmaps = googlemaps.Client(key=GOOGLE_API_KEY)

# Função para buscar clientes no Google Maps com cache
def buscar_potenciais_clientes_google(localizacao, tipo_cliente, raio_km=10, chat_id=None):
    cache_key = f"cache_{chat_id}_{localizacao}_{tipo_cliente}_{raio_km}"
    try:
        cache = db.collection("cache").document(cache_key).get()
        if cache.exists and (datetime.now().timestamp() - cache.to_dict().get("timestamp", 0)) < 24 * 3600:
            logger.info("Usando cache para busca de clientes: %s", cache_key)
            return cache.to_dict().get("resultados", [])
        
        geocode_result = gmaps.geocode(localizacao)
        if not geocode_result:
            return "📍 Ops, não encontrei essa localização. Tenta outra?"
        
        lat = geocode_result[0]['geometry']['location']['lat']
        lng = geocode_result[0]['geometry']['location']['lng']
        
        resultados = []
        lugares = gmaps.places_nearby(
            location=(lat, lng),
            radius=raio_km * 1000,
            keyword=tipo_cliente,
            type="establishment"
        )
        
        for lugar in lugares['results'][:5]:
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
            return "😕 Nenhum cliente encontrado nessa região. Tenta outro segmento?"
        
        db.collection("cache").document(cache_key).set({
            "resultados": resultados,
            "timestamp": datetime.now().timestamp()
        })
        logger.info("Clientes buscados no Google Maps: %d encontrados", len(resultados))
        return resultados
    except Exception as e:
        logger.error("Erro na busca de clientes no Google Maps: %s", e)
        return f"😅 Deu um erro ao buscar clientes: {str(e)}. Tenta de novo?"

# Função para buscar clientes no Firebase
def buscar_clientes_firebase(chat_id, localizacao, tipo_cliente):
    clientes = []
    try:
        followups = db.collection("users").document(chat_id).collection("followups").limit(50).stream()
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

        visitas = db.collection("users").document(chat_id).collection("visitas").limit(50).stream()
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
        
        logger.info("Clientes buscados no Firebase: %d encontrados", len(clientes))
        return clientes
    except Exception as e:
        logger.error("Erro ao buscar clientes no Firebase: %s", e)
        return []

# Função para criar rota no Google Maps
def criar_rota_google(localizacao_inicial, num_clientes, clientes):
    try:
        geocode_result = gmaps.geocode(localizacao_inicial)
        if not geocode_result:
            return "📍 Ops, não encontrei essa localização inicial."
        
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
            return "😕 Não consegui montar a rota. Tenta outra região?"
        
        ordem = rota[0]['waypoint_order']
        pernas = rota[0]['legs']
        
        roteiro = f"🗺️ *Rota otimizada saindo de {localizacao_inicial}:*\n"
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
        logger.info("Rota criada com sucesso: %d clientes", num_clientes)
        return roteiro
    except Exception as e:
        logger.error("Erro na criação da rota: %s", e)
        return f"😅 Deu um erro ao montar a rota: {str(e)}. Tenta de novo?"

# Fluxo de Busca de Potenciais Clientes
async def buscapotenciais_start(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    await update.message.reply_text(
        "🔍 E aí, parceiro! Que tipo de cliente você quer encontrar? (Ex.: 'indústria', 'logística')",
        parse_mode="Markdown"
    )
    return BUSCA_TIPO

async def buscapotenciais_tipo(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    context.user_data["busca_tipo"] = update.message.text.strip()
    await update.message.reply_text("📍 Qual a região? (Ex.: 'Vila Velha, ES')")
    return BUSCA_LOCALIZACAO

async def buscapotenciais_localizacao(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    context.user_data["busca_localizacao"] = update.message.text.strip()
    await update.message.reply_text("📏 Até quantos km você quer buscar? (Ex.: '10')")
    return BUSCA_RAIO

async def buscapotenciais_raio(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    try:
        raio = float(update.message.text.strip())
        if raio <= 0:
            raise ValueError
    except ValueError:
        await update.message.reply_text("😅 Tenta um número maior que 0, tipo '10'!")
        return BUSCA_RAIO
    context.user_data["busca_raio"] = raio
    await update.message.reply_text("📋 Quantos clientes quer ver? (Ex.: '5')")
    return BUSCA_QUANTIDADE

async def buscapotenciais_quantidade(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    try:
        quantidade = int(update.message.text.strip())
        if quantidade <= 0:
            raise ValueError
    except ValueError:
        await update.message.reply_text("😅 Digita um número maior que 0, tipo '5'!")
        return BUSCA_QUANTIDADE
    
    tipo_cliente = context.user_data["busca_tipo"]
    localizacao = context.user_data["busca_localizacao"]
    raio = context.user_data["busca_raio"]
    chat_id = str(update.message.chat.id)
    
    termos = [termo.strip() for termo in tipo_cliente.split(",")]
    clientes = []
    
    for termo in termos:
        resultado = buscar_potenciais_clientes_google(localizacao, termo, raio, chat_id)
        if isinstance(resultado, list):
            clientes.extend(resultado)
    
    if not clientes:
        await update.message.reply_text("😕 Não achei nenhum cliente com esses termos. Tenta outra região ou segmento?")
        return ConversationHandler.END
    
    clientes_unicos = {cliente['nome']: cliente for cliente in clientes}.values()
    clientes_unicos = list(clientes_unicos)
    
    if quantidade > len(clientes_unicos):
        quantidade = len(clientes_unicos)
    msg = f"🔍 *Achei esses clientes pra '{tipo_cliente}' ({quantidade} de {len(clientes_unicos)}):*\n"
    for cliente in clientes_unicos[:quantidade]:
        msg += f"• *{cliente['nome']}* ({cliente['fonte']})\n  📍 {cliente['endereco']}\n  📞 {cliente['telefone']}\n"
    context.user_data["clientes_potenciais"] = clientes_unicos
    try:
        await update.message.reply_text(msg, parse_mode="Markdown")
    except (BadRequest, NetworkError, TimedOut) as e:
        logger.error("Erro ao enviar mensagem de busca: %s", e)
        await update.message.reply_text("😅 Deu um erro ao mostrar os clientes. Tenta de novo!")
    return ConversationHandler.END

async def buscapotenciais_cancel(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    await update.message.reply_text("🔍 Beleza, busca cancelada! Qualquer coisa, é só chamar.")
    return ConversationHandler.END

# Fluxo de Criação de Rota
async def criarrota_start(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    await update.message.reply_text(
        "🗺️ Bora montar uma rota esperta? Qual segmento você quer visitar? (Ex.: 'indústria', 'logística')",
        parse_mode="Markdown"
    )
    return ROTA_TIPO

async def criarrota_tipo(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    context.user_data["rota_tipo"] = update.message.text.strip()
    await update.message.reply_text("📍 De onde você vai partir? (Ex.: 'Vila Velha, ES')")
    return ROTA_LOCALIZACAO

async def criarrota_localizacao(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    context.user_data["rota_localizacao"] = update.message.text.strip()
    await update.message.reply_text("📏 Qual o raio de busca em km? (Ex.: '10')")
    return ROTA_RAIO

async def criarrota_raio(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    try:
        raio = float(update.message.text.strip())
        if raio <= 0:
            raise ValueError
    except ValueError:
        await update.message.reply_text("😅 Tenta um número maior que 0, tipo '10'!")
        return ROTA_RAIO
    context.user_data["rota_raio"] = raio
    await update.message.reply_text("📋 Quantos clientes quer na rota? (Ex.: '5')")
    return ROTA_QUANTIDADE

async def criarrota_quantidade(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    try:
        quantidade = int(update.message.text.strip())
        if quantidade <= 0:
            raise ValueError
    except ValueError:
        await update.message.reply_text("😅 Digita um número maior que 0, tipo '5'!")
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
        resultado = buscar_potenciais_clientes_google(localizacao, termo, raio, chat_id)
        if isinstance(resultado, list):
            clientes_google.extend(resultado)
    
    todos_clientes = clientes_firebase + clientes_google
    
    if not todos_clientes:
        await update.message.reply_text("😕 Não achei clientes pra essa rota. Tenta outro segmento ou região?")
        return ConversationHandler.END
    
    clientes_unicos = {cliente['nome']: cliente for cliente in todos_clientes}.values()
    clientes_unicos = list(clientes_unicos)
    
    if quantidade > len(clientes_unicos):
        quantidade = len(clientes_unicos)
    clientes_selecionados = clientes_unicos[:quantidade]
    
    msg = f"🗺️ *Rota com {quantidade} clientes pra '{tipo_cliente}':*\n"
    for i, cliente in enumerate(clientes_selecionados, 1):
        msg += f"{i}. *{cliente['nome']}* ({cliente['fonte']})\n   📍 {cliente['endereco']}\n   📞 {cliente['telefone']}\n"
    
    rota_otimizada = criar_rota_google(localizacao, quantidade, clientes_selecionados)
    if not isinstance(rota_otimizada, str) or "Erro" not in rota_otimizada:
        msg += "\n" + rota_otimizada
    
    context.user_data["clientes_rota"] = clientes_selecionados
    try:
        await update.message.reply_text(msg, parse_mode="Markdown")
    except (BadRequest, NetworkError, TimedOut) as e:
        logger.error("Erro ao enviar mensagem de rota: %s", e)
        await update.message.reply_text("😅 Deu um erro ao mostrar a rota. Tenta de novo!")
    return ConversationHandler.END

async def criarrota_cancel(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    await update.message.reply_text("🗺️ Beleza, rota cancelada! Qualquer coisa, é só chamar.")
    return ConversationHandler.END

# Comando /inicio
async def inicio(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    msg = (
        "E aí, parceiro! 🚀 Bem-vindo ao *ZettiBot*, seu ajudante pra turbinar as vendas!\n"
        "Tô aqui pra organizar seus follow-ups, visitas e muito mais. Quer dar um gás?\n"
        "• /ajuda – Veja tudo que posso fazer\n"
        "• /followup – Planeje um contato\n"
        "• /visita – Registre uma visita\n"
        "• /interacao – Anote uma conversa\n"
        "• /lembrete – Não esqueça de nada\n"
        "• /relatorio – Resumo das suas ações\n"
        "• /historico – Veja tudo que rolou\n"
        "• /editar – Ajuste algo\n"
        "• /excluir – Apague um registro\n"
        "• /filtrar – Ache o que precisa\n"
        "• /buscapotenciais – Encontre novos clientes\n"
        "• /criarrota – Monte uma rota esperta\n"
        "• /quemvisitar – Sugestões de quem ver hoje"
    )
    try:
        await update.message.reply_text(msg, parse_mode="Markdown")
        logger.info("Comando /inicio executado por %s", update.message.chat.id)
    except (BadRequest, NetworkError, TimedOut) as e:
        logger.error("Erro ao executar /inicio: %s", e)

# Comando /ajuda
async def ajuda(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    msg = (
        "🔵 *ZettiBot - Seu parceiro de vendas*\n\n"
        "Tô aqui pra te ajudar a vender mais e se organizar sem dor de cabeça! 😎\n"
        "*O que eu faço?*\n"
        "• /inicio – Boas-vindas e comandos\n"
        "• /followup – Agenda um follow-up com cliente\n"
        "• /visita – Registra uma visita que você fez\n"
        "• /interacao – Anota uma conversa ou reunião\n"
        "• /lembrete – Te avisa na hora certa\n"
        "• /relatorio – Mostra seu desempenho com gráfico\n"
        "• /historico – Lista tudo que você registrou\n"
        "• /editar – Corrige um registro\n"
        "• /excluir – Apaga algo que não quer mais\n"
        "• /filtrar – Busca registros específicos\n"
        "• /buscapotenciais – Encontra novos clientes\n"
        "• /criarrota – Cria uma rota otimizada\n"
        "• /quemvisitar – Sugere clientes pra hoje\n\n"
        "Se precisar sair de um comando, é só usar /cancelar. Bora vender? 🚀"
    )
    try:
        await update.message.reply_text(msg, parse_mode="Markdown")
    except (BadRequest, NetworkError, TimedOut) as e:
        logger.error("Erro ao executar /ajuda: %s", e)

# Fluxo de Follow-up
async def followup_start(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    await update.message.reply_text("📋 Beleza, vamos agendar um follow-up! Qual o nome do cliente?")
    return FOLLOWUP_CLIENT

async def followup_client(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    context.user_data["client"] = update.message.text.strip()
    await update.message.reply_text("📅 Quando vai ser o follow-up? (Ex.: 10/04/2025)")
    return FOLLOWUP_DATE

async def followup_date(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    data_str = update.message.text.strip()
    try:
        data_followup = datetime.strptime(data_str, "%d/%m/%Y").date()
    except ValueError:
        await update.message.reply_text("😅 Ops, a data tá errada! Tenta assim: 10/04/2025")
        return FOLLOWUP_DATE
    context.user_data["followup_date"] = data_followup.isoformat()
    await update.message.reply_text("📝 Conta aí, o que você vai fazer nesse follow-up?")
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
              "criado_em": datetime.now(TIMEZONE).isoformat()
          })
        await update.message.reply_text("🚀 Beleza, follow-up salvo direitinho!")
    except Exception as e:
        logger.error("Erro ao salvar follow-up: %s", e)
        await update.message.reply_text("😅 Deu um erro ao salvar. Tenta de novo?")
    return ConversationHandler.END

async def followup_cancel(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    await update.message.reply_text("📋 Tudo bem, follow-up cancelado. Qualquer coisa, é só chamar!")
    return ConversationHandler.END

# Fluxo de Visita
async def visita_start(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    await update.message.reply_text("🏢 Show, qual empresa você visitou?")
    return VISIT_COMPANY

async def visita_company(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    context.user_data["company"] = update.message.text.strip()
    await update.message.reply_text("📅 Qual foi o dia da visita? (Ex.: 10/04/2025)")
    return VISIT_DATE

async def visita_date(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    data_str = update.message.text.strip()
    try:
        data_visita = datetime.strptime(data_str, "%d/%m/%Y").date()
    except ValueError:
        await update.message.reply_text("😅 Data errada, parceiro! Tenta assim: 10/04/2025")
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
    await update.message.reply_text("📋 Como você classificaria esse cliente?", reply_markup=reply_markup)
    return VISIT_MOTIVE

async def visita_category_callback(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    query = update.callback_query
    await query.answer()
    category = query.data.split(":", 1)[1]
    context.user_data["category"] = category
    await query.edit_message_text(text=f"✅ Escolhido: *{category}*\nPor que você visitou essa empresa?", parse_mode="Markdown")

async def visita_motive(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    context.user_data["motive"] = update.message.text.strip()
    reply_keyboard = [["Sim", "Não"]]
    await update.message.reply_text(
        "Quer agendar um follow-up pra essa visita? (Sim/Não)",
        reply_markup=ReplyKeyboardMarkup(reply_keyboard, one_time_keyboard=True, resize_keyboard=True)
    )
    return VISIT_FOLLOWUP_CHOICE

async def visita_followup_choice(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    choice = update.message.text.strip().lower()
    if choice == "sim":
        await update.message.reply_text("📅 Beleza, quando vai ser o follow-up? (Ex.: 10/04/2025)", reply_markup=ReplyKeyboardRemove())
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
                "criado_em": datetime.now(TIMEZONE).isoformat()
            })
            await update.message.reply_text("🏢 Visita registrada com sucesso! Mandou bem!", reply_markup=ReplyKeyboardRemove())
        except Exception as e:
            logger.error("Erro ao salvar visita: %s", e)
            await update.message.reply_text("😅 Deu um erro ao salvar. Tenta de novo?", reply_markup=ReplyKeyboardRemove())
        return ConversationHandler.END

async def visita_followup_date(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    data_str = update.message.text.strip()
    try:
        data_followup = datetime.strptime(data_str, "%d/%m/%Y").date()
    except ValueError:
        await update.message.reply_text("😅 Data errada! Tenta assim: 10/04/2025")
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
            "criado_em": datetime.now(TIMEZONE).isoformat()
        })
        db.collection("users").document(chat_id).collection("followups").document().set({
            "cliente": context.user_data["company"],
            "data_follow": context.user_data["followup_date"],
            "descricao": "Follow-up de visita: " + context.user_data["motive"],
            "status": "pendente",
            "chat_id": chat_id,
            "criado_em": datetime.now(TIMEZONE).isoformat()
        })
        await update.message.reply_text("🚀 Visita e follow-up salvos! Tô orgulhoso, parceiro!")
    except Exception as e:
        logger.error("Erro ao salvar visita e follow-up: %s", e)
        await update.message.reply_text("😅 Deu um erro ao salvar. Tenta de novo?")
    return ConversationHandler.END

async def visita_cancel(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    await update.message.reply_text("🏢 Tudo bem, visita cancelada!", reply_markup=ReplyKeyboardRemove())
    return ConversationHandler.END

# Fluxo de Interação
async def interacao_start(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    await update.message.reply_text("💬 Beleza, com quem você conversou? (Nome do cliente ou empresa)")
    return INTER_CLIENT

async def interacao_client(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    context.user_data["client_interacao"] = update.message.text.strip()
    await update.message.reply_text("📝 Conta rapidinho como foi essa interação!")
    return INTER_SUMMARY

async def interacao_summary(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    context.user_data["resumo_interacao"] = update.message.text.strip()
    reply_keyboard = [["Sim", "Não"]]
    await update.message.reply_text(
        "Quer marcar um follow-up pra essa interação? (Sim/Não)",
        reply_markup=ReplyKeyboardMarkup(reply_keyboard, one_time_keyboard=True, resize_keyboard=True)
    )
    return INTER_FOLLOWUP_CHOICE

async def interacao_followup_choice(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    choice = update.message.text.strip().lower()
    if choice == "sim":
        await update.message.reply_text("📅 Quando vai ser o follow-up? (Ex.: 10/04/2025)", reply_markup=ReplyKeyboardRemove())
        return INTER_FOLLOWUP_DATE
    else:
        try:
            chat_id = str(update.message.chat.id)
            db.collection("users").document(chat_id).collection("interacoes").document().set({
                "cliente": context.user_data["client_interacao"],
                "resumo": context.user_data["resumo_interacao"],
                "followup": None,
                "criado_em": datetime.now(TIMEZONE).isoformat()
            })
            await update.message.reply_text("💬 Interação salva com sucesso! Boa!", reply_markup=ReplyKeyboardRemove())
        except Exception as e:
            logger.error("Erro ao salvar interação: %s", e)
            await update.message.reply_text("😅 Deu um erro ao salvar. Tenta de novo?", reply_markup=ReplyKeyboardRemove())
        return ConversationHandler.END

async def interacao_followup_date(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    data_str = update.message.text.strip()
    try:
        data_follow = datetime.strptime(data_str, "%d/%m/%Y").date()
    except ValueError:
        await update.message.reply_text("😅 Data errada! Tenta assim: 10/04/2025")
        return INTER_FOLLOWUP_DATE
    context.user_data["followup_interacao"] = data_follow.isoformat()
    try:
        chat_id = str(update.message.chat.id)
        db.collection("users").document(chat_id).collection("interacoes").document().set({
            "cliente": context.user_data["client_interacao"],
            "resumo": context.user_data["resumo_interacao"],
            "followup": context.user_data["followup_interacao"],
            "criado_em": datetime.now(TIMEZONE).isoformat()
        })
        db.collection("users").document(chat_id).collection("followups").document().set({
            "cliente": context.user_data["client_interacao"],
            "data_follow": context.user_data["followup_interacao"],
            "descricao": "Follow-up de interação: " + context.user_data["resumo_interacao"],
            "status": "pendente",
            "chat_id": chat_id,
            "criado_em": datetime.now(TIMEZONE).isoformat()
        })
        await update.message.reply_text("🚀 Interação e follow-up salvos! Mandou bem!")
    except Exception as e:
        logger.error("Erro ao salvar interação e follow-up: %s", e)
        await update.message.reply_text("😅 Deu um erro ao salvar. Tenta de novo?")
    return ConversationHandler.END

async def interacao_cancel(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    await update.message.reply_text("💬 Beleza, interação cancelada!", reply_markup=ReplyKeyboardRemove())
    return ConversationHandler.END

# Fluxo de Lembrete
async def lembrete_start(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    await update.message.reply_text("🔔 Opa, que lembrete você quer marcar?")
    return REMINDER_TEXT

async def lembrete_text(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    context.user_data["lembrete_text"] = update.message.text.strip()
    await update.message.reply_text("⏰ Quando você quer ser avisado? (Ex.: 10/04/2025 14:30)")
    return REMINDER_DATETIME

async def lembrete_datetime(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    input_str = update.message.text.strip()
    try:
        target_datetime = datetime.strptime(input_str, "%d/%m/%Y %H:%M").replace(tzinfo=TIMEZONE)
    except ValueError:
        await update.message.reply_text("😅 Formato errado! Tenta assim: 10/04/2025 14:30")
        return REMINDER_DATETIME
    now = datetime.now(TIMEZONE)
    delay_seconds = (target_datetime - now).total_seconds()
    if delay_seconds <= 0:
        await update.message.reply_text("😅 Esse horário já passou! Escolhe um futuro, tipo 10/04/2025 14:30")
        return REMINDER_DATETIME
    chat_id = str(update.message.chat.id)
    lembrete_text_value = context.user_data["lembrete_text"]
    try:
        context.job_queue.run_once(lembrete_callback, delay_seconds, data={"chat_id": chat_id, "lembrete_text": lembrete_text_value})
        await update.message.reply_text(f"✅ Lembrete marcado pra {target_datetime.strftime('%d/%m/%Y %H:%M')}! Tô de olho!", reply_markup=ReplyKeyboardRemove())
    except Exception as e:
        logger.error("Erro ao agendar lembrete: %s", e)
        await update.message.reply_text("😅 Deu um erro ao marcar o lembrete. Tenta de novo?")
    return ConversationHandler.END

async def lembrete_cancel(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    await update.message.reply_text("🔔 Beleza, lembrete cancelado!")
    return ConversationHandler.END

async def lembrete_callback(context: ContextTypes.DEFAULT_TYPE) -> None:
    try:
        job_data = context.job.data
        chat_id = job_data["chat_id"]
        lembrete_text_value = job_data["lembrete_text"]
        await context.bot.send_message(chat_id=chat_id, text=f"🔔 *Ei, parceiro! Lembrete:* {lembrete_text_value}", parse_mode="Markdown")
        logger.info("Lembrete enviado para %s", chat_id)
    except (BadRequest, NetworkError, TimedOut) as e:
        logger.error("Erro ao enviar lembrete para %s: %s", chat_id, e)

# Fluxo de Relatório
async def relatorio_start(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    await update.message.reply_text("📊 Bora ver seu desempenho? Qual a data inicial? (Ex.: 01/04/2025)")
    return REPORT_START

async def relatorio_start_received(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    date_str = update.message.text.strip()
    try:
        start_date_dt = datetime.strptime(date_str, "%d/%m/%Y")
        context.user_data["report_start"] = date_str
        context.user_data["report_start_dt"] = start_date_dt
    except ValueError:
        await update.message.reply_text("😅 Data errada! Tenta assim: 01/04/2025")
        return REPORT_START
    await update.message.reply_text("📅 E a data final? (Ex.: 10/04/2025)")
    return REPORT_END

async def relatorio_end_received(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    date_str = update.message.text.strip()
    try:
        end_date_dt = datetime.strptime(date_str, "%d/%m/%Y")
        context.user_data["report_end"] = date_str
        context.user_data["report_end_dt"] = end_date_dt
    except ValueError:
        await update.message.reply_text("😅 Data errada! Tenta assim: 10/04/2025")
        return REPORT_END
    chat_id = str(update.message.chat.id)
    try:
        followups_docs = list(db.collection("users").document(chat_id).collection("followups").limit(100).stream())
        visitas_docs = list(db.collection("users").document(chat_id).collection("visitas").limit(100).stream())
        interacoes_docs = list(db.collection("users").document(chat_id).collection("interacoes").limit(100).stream())
        
        def in_interval(criado_em_str: str) -> bool:
            try:
                doc_date = datetime.fromisoformat(criado_em_str)
                return context.user_data["report_start_dt"] <= doc_date <= context.user_data["report_end_dt"]
            except Exception:
                return False
        
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
            f"📊 *Resumo do período ({periodo_info})*\n\n"
            f"📋 Follow-ups:\n • Total: {total_followups}\n • Confirmados: {confirmados}\n • Pendentes: {pendentes}\n"
            f"🏢 Visitas: {total_visitas}\n"
            f"💬 Interações: {total_interacoes}\n\n"
            f"🚀 Tá mandando bem, parceiro!"
        )
        await update.message.reply_text(texto_relatorio, parse_mode="Markdown")
        
        grafico_path = None
        try:
            grafico_path = gerar_grafico(total_followups, confirmados, pendentes, total_visitas, total_interacoes, periodo_info)
            with open(grafico_path, "rb") as photo:
                await update.message.reply_photo(photo=photo, caption="📈 Olha seu desempenho em gráfico!")
        finally:
            if grafico_path and os.path.exists(grafico_path):
                try:
                    os.remove(grafico_path)
                    logger.info("Arquivo de gráfico removido: %s", grafico_path)
                except Exception as e:
                    logger.error("Erro ao remover gráfico: %s", e)
        
    except Exception as e:
        logger.error("Erro ao gerar relatório: %s", e)
        await update.message.reply_text("😅 Deu um erro ao gerar o relatório. Tenta de novo?")
    return ConversationHandler.END

async def relatorio_cancel(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    await update.message.reply_text("📊 Beleza, relatório cancelado!")
    return ConversationHandler.END

# Fluxo de Histórico
async def historico_conv_start(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    await update.message.reply_text("📜 Quer rever tudo? Qual a data inicial? (Ex.: 01/04/2025)")
    return HIST_START

async def historico_conv_start_received(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    date_str = update.message.text.strip()
    try:
        start_date_dt = datetime.strptime(date_str, "%d/%m/%Y")
        context.user_data["historico_start"] = date_str
        context.user_data["historico_start_dt"] = start_date_dt
    except ValueError:
        await update.message.reply_text("😅 Data errada! Tenta assim: 01/04/2025")
        return HIST_START
    await update.message.reply_text("📅 E a data final? (Ex.: 10/04/2025)")
    return HIST_END

async def historico_conv_end_received(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    date_str = update.message.text.strip()
    try:
        end_date_dt = datetime.strptime(date_str, "%d/%m/%Y")
        context.user_data["historico_end"] = date_str
        context.user_data["historico_end_dt"] = end_date_dt
    except ValueError:
        await update.message.reply_text("😅 Data errada! Tenta assim: 10/04/2025")
        return HIST_END
    chat_id = str(update.message.chat.id)
    try:
        followups_docs = list(db.collection("users").document(chat_id).collection("followups").limit(50).stream())
        visitas_docs = list(db.collection("users").document(chat_id).collection("visitas").limit(50).stream())
        interacoes_docs = list(db.collection("users").document(chat_id).collection("interacoes").limit(50).stream())
        
        def in_interval(criado_em_str: str) -> bool:
            try:
                doc_date = datetime.fromisoformat(criado_em_str)
                return context.user_data["historico_start_dt"] <= doc_date <= context.user_data["historico_end_dt"]
            except Exception:
                return False
        
        mensagem = "📜 *Tudo que rolou no período*\n\n"
        if followups_docs:
            mensagem += "📋 *Follow-ups*\n"
            for doc in followups_docs:
                data = doc.to_dict() or {}
                if data.get("criado_em", "") and in_interval(data.get("criado_em", "")):
                    data_follow = data.get("data_follow", "Sem data")
                    try:
                        data_fmt = datetime.fromisoformat(data_follow).strftime("%d/%m/%Y")
                    except:
                        data_fmt = data_follow
                    mensagem += f"• {data.get('cliente', 'Sem cliente')}, {data_fmt}, {data.get('status', 'Sem status')}\n"
        else:
            mensagem += "📋 *Follow-ups*: Nada registrado.\n\n"
        
        if visitas_docs:
            mensagem += "🏢 *Visitas*\n"
            for doc in visitas_docs:
                data = doc.to_dict() or {}
                if data.get("criado_em", "") and in_interval(data.get("criado_em", "")):
                    data_visita = data.get("data_visita", "Sem data")
                    try:
                        data_fmt = datetime.fromisoformat(data_visita).strftime("%d/%m/%Y")
                    except:
                        data_fmt = data_visita
                    mensagem += f"• {data.get('empresa', 'Sem empresa')}, {data_fmt}, {data.get('classificacao', 'Sem classificação')}\n"
        else:
            mensagem += "🏢 *Visitas*: Nada registrado.\n\n"
        
        if interacoes_docs:
            mensagem += "💬 *Interações*\n"
            for doc in interacoes_docs:
                data = doc.to_dict() or {}
                if data.get("criado_em", "") and in_interval(data.get("criado_em", "")):
                    mensagem += f"• {data.get('cliente', 'Sem cliente')}, {data.get('resumo', 'Sem resumo')[:20]}...\n"
        else:
            mensagem += "💬 *Interações*: Nada registrado.\n\n"
        
        if mensagem.strip() == "📜 *Tudo que rolou no período*\n\n":
            mensagem = "😕 Não achei nada nesse período. Tenta outras datas?"
        
        await update.message.reply_text(mensagem, parse_mode="Markdown")
    except Exception as e:
        logger.error("Erro ao gerar histórico: %s", e)
        await update.message.reply_text("😅 Deu um erro ao buscar o histórico. Tenta de novo?")
    return ConversationHandler.END

async def historico_conv_cancel(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    await update.message.reply_text("📜 Beleza, histórico cancelado!")
    return ConversationHandler.END

# Fluxo de Edição
async def editar_start(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    options = [
        [InlineKeyboardButton("📋 Follow-up", callback_data="edit_category:followup")],
        [InlineKeyboardButton("🏢 Visita", callback_data="edit_category:visita")],
        [InlineKeyboardButton("💬 Interação", callback_data="edit_category:interacao")]
    ]
    reply_markup = InlineKeyboardMarkup(options)
    await update.message.reply_text("📝 Opa, o que você quer ajustar?", reply_markup=reply_markup)
    return EDIT_CATEGORY

async def editar_category_callback(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    query = update.callback_query
    await query.answer()
    category = query.data.split(":", 1)[1]
    context.user_data["edit_category"] = category
    chat_id = str(query.message.chat.id)
    try:
        if category == "followup":
            col = db.collection("users").document(chat_id).collection("followups")
            prefix = "📋 Follow-ups"
        elif category == "visita":
            col = db.collection("users").document(chat_id).collection("visitas")
            prefix = "🏢 Visitas"
        else:
            col = db.collection("users").document(chat_id).collection("interacoes")
            prefix = "💬 Interações"
        
        docs = list(col.limit(50).stream())
        if not docs:
            await query.edit_message_text(f"😕 Não achei nada em {prefix.lower()}. Registre algo antes!")
            return ConversationHandler.END
        
        context.user_data["edit_docs"] = [(doc.id, doc.to_dict()) for doc in docs]
        msg = f"{prefix}:\n"
        for i, (_, data) in enumerate(context.user_data["edit_docs"][:10], 1):
            if category == "followup":
                data_follow = data.get("data_follow", "Sem data")
                try:
                    data_fmt = datetime.fromisoformat(data_follow).strftime("%d/%m/%Y")
                except:
                    data_fmt = data_follow
                msg += f"{i}. {data.get('cliente', 'Sem cliente')}, {data_fmt}, {data.get('status', 'Sem status')}\n"
            elif category == "visita":
                data_visita = data.get("data_visita", "Sem data")
                try:
                    data_fmt = datetime.fromisoformat(data_visita).strftime("%d/%m/%Y")
                except:
                    data_fmt = data_visita
                msg += f"{i}. {data.get('empresa', 'Sem empresa')}, {data_fmt}, {data.get('classificacao', 'Sem classificação')}\n"
            else:
                msg += f"{i}. {data.get('cliente', 'Sem cliente')}, {data.get('resumo', 'Sem resumo')[:20]}...\n"
        msg += "\nQual número você quer editar? (Ex.: 1)"
        await query.edit_message_text(msg)
        await query.message.reply_text("Digite o número do registro:")
        return EDIT_RECORD
    except Exception as e:
        logger.error("Erro ao listar registros para edição: %s", e)
        await query.edit_message_text("😅 Deu um erro ao listar os registros. Tenta de novo?")
        return ConversationHandler.END

async def editar_record_received(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    logger.info("Entrou em editar_record_received para chat_id %s", update.message.chat.id)
    try:
        index = int(update.message.text.strip()) - 1
        logger.info("Número recebido: %s, convertido para index: %s", update.message.text, index)
        if index < 0 or index >= len(context.user_data["edit_docs"]):
            raise ValueError("Número fora do intervalo")
    except ValueError as e:
        logger.error("Erro ao processar número em /editar: %s", e)
        await update.message.reply_text("😅 Número inválido! Escolhe um da lista, tipo '1'.")
        return EDIT_RECORD
    
    context.user_data["edit_index"] = index
    category = context.user_data["edit_category"]
    logger.info("Selecionado index %s na categoria %s", index, category)
    
    if category == "followup":
        options = [
            [InlineKeyboardButton("Cliente", callback_data="edit_field:cliente")],
            [InlineKeyboardButton("Data", callback_data="edit_field:data_follow")],
            [InlineKeyboardButton("Descrição", callback_data="edit_field:descricao")],
            [InlineKeyboardButton("Status", callback_data="edit_field:status")]
        ]
    elif category == "visita":
        options = [
            [InlineKeyboardButton("Empresa", callback_data="edit_field:empresa")],
            [InlineKeyboardButton("Data", callback_data="edit_field:data_visita")],
            [InlineKeyboardButton("Classificação", callback_data="edit_field:classificacao")],
            [InlineKeyboardButton("Motivo", callback_data="edit_field:motivo")],
            [InlineKeyboardButton("Follow-up", callback_data="edit_field:followup")]
        ]
    else:
        options = [
            [InlineKeyboardButton("Cliente", callback_data="edit_field:cliente")],
            [InlineKeyboardButton("Resumo", callback_data="edit_field:resumo")],
            [InlineKeyboardButton("Follow-up", callback_data="edit_field:followup")]
        ]
    reply_markup = InlineKeyboardMarkup(options)
    await update.message.reply_text("📝 O que você quer mudar nesse registro?", reply_markup=reply_markup)
    logger.info("Enviada solicitação de campo para editar")
    return EDIT_FIELD

async def editar_field_callback(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    query = update.callback_query
    await query.answer()
    field = query.data.split(":", 1)[1]
    context.user_data["edit_field"] = field
    if field == "status":
        options = [
            [InlineKeyboardButton("Pendente", callback_data="edit_value:Pendente")],
            [InlineKeyboardButton("Realizado", callback_data="edit_value:Realizado")]
        ]
        reply_markup = InlineKeyboardMarkup(options)
        await query.edit_message_text("📝 Novo status:", reply_markup=reply_markup)
    elif field == "classificacao":
        options = [
            [InlineKeyboardButton("Potencial Cliente", callback_data="edit_value:Potencial Cliente"),
             InlineKeyboardButton("Cliente Ativo", callback_data="edit_value:Cliente Ativo")],
            [InlineKeyboardButton("Cliente Inativo", callback_data="edit_value:Cliente Inativo"),
             InlineKeyboardButton("Cliente Novo", callback_data="edit_value:Cliente Novo")],
            [InlineKeyboardButton("Cliente de Aluguel", callback_data="edit_value:Cliente de Aluguel"),
             InlineKeyboardButton("Cliente de Venda", callback_data="edit_value:Cliente de Venda")],
            [InlineKeyboardButton("Cliente de Manutenção", callback_data="edit_value:Cliente de Manutenção")],
            [InlineKeyboardButton("Cliente em Negociação", callback_data="edit_value:Cliente em Negociação")],
            [InlineKeyboardButton("Cliente Perdido", callback_data="edit_value:Cliente Perdido")],
            [InlineKeyboardButton("Sem Interesse", callback_data="edit_value:Sem Interesse")]
        ]
        reply_markup = InlineKeyboardMarkup(options)
        await query.edit_message_text("📝 Nova classificação:", reply_markup=reply_markup)
    elif field in ["data_follow", "data_visita", "followup"]:
        await query.edit_message_text("📅 Digite a nova data (Ex.: 10/04/2025):")
    else:
        await query.edit_message_text(f"📝 Digite o novo valor para '{field}':")
    return EDIT_NEW_VALUE

async def editar_value_callback(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    query = update.callback_query
    await query.answer()
    new_value = query.data.split(":", 1)[1]
    await editar_save(update, context, new_value)
    return ConversationHandler.END

async def editar_new_value_received(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    new_value = update.message.text.strip()
    await editar_save(update, context, new_value)
    return ConversationHandler.END

async def editar_save(update: Update, context: ContextTypes.DEFAULT_TYPE, new_value: str) -> int:
    category = context.user_data["edit_category"]
    index = context.user_data["edit_index"]
    field = context.user_data["edit_field"]
    doc_id, _ = context.user_data["edit_docs"][index]
    chat_id = str(update.effective_chat.id)
    try:
        if category == "followup":
            col = db.collection("users").document(chat_id).collection("followups")
        elif category == "visita":
            col = db.collection("users").document(chat_id).collection("visitas")
        else:
            col = db.collection("users").document(chat_id).collection("interacoes")
        
        if field in ["data_follow", "data_visita", "followup"]:
            new_value = datetime.strptime(new_value, "%d/%m/%Y").date().isoformat()
        
        col.document(doc_id).update({field: new_value})
        await update.effective_message.reply_text("✅ Registro atualizado! Tô orgulhoso, parceiro!")
    except ValueError:
        await update.effective_message.reply_text("😅 Data errada! Tenta assim: 10/04/2025")
        return EDIT_NEW_VALUE
    except Exception as e:
        logger.error("Erro ao salvar edição: %s", e)
        await update.effective_message.reply_text("😅 Deu um erro ao salvar. Tenta de novo?")
    return ConversationHandler.END

async def editar_cancel(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    await update.message.reply_text("📝 Beleza, edição cancelada!")
    return ConversationHandler.END

# Fluxo de Exclusão
async def excluir_start(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    options = [
        [InlineKeyboardButton("📋 Follow-up", callback_data="delete_category:followup")],
        [InlineKeyboardButton("🏢 Visita", callback_data="delete_category:visita")],
        [InlineKeyboardButton("💬 Interação", callback_data="delete_category:interacao")]
    ]
    reply_markup = InlineKeyboardMarkup(options)
    await update.message.reply_text("🗑️ Opa, o que você quer apagar?", reply_markup=reply_markup)
    return DELETE_CATEGORY

async def excluir_category_callback(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    query = update.callback_query
    await query.answer()
    category = query.data.split(":", 1)[1]
    context.user_data["delete_category"] = category
    chat_id = str(query.message.chat.id)
    try:
        if category == "followup":
            col = db.collection("users").document(chat_id).collection("followups")
            prefix = "📋 Follow-ups"
        elif category == "visita":
            col = db.collection("users").document(chat_id).collection("visitas")
            prefix = "🏢 Visitas"
        else:
            col = db.collection("users").document(chat_id).collection("interacoes")
            prefix = "💬 Interações"
        
        docs = list(col.limit(50).stream())
        if not docs:
            await query.edit_message_text(f"😕 Não achei nada em {prefix.lower()}. Registre algo antes!")
            return
        
        context.user_data["delete_docs"] = [(doc.id, doc.to_dict()) for doc in docs]
        msg = f"{prefix}:\n"
        for i, (_, data) in enumerate(context.user_data["delete_docs"][:10], 1):
            if category == "followup":
                data_follow = data.get("data_follow", "Sem data")
                try:
                    data_fmt = datetime.fromisoformat(data_follow).strftime("%d/%m/%Y")
                except:
                    data_fmt = data_follow
                msg += f"{i}. {data.get('cliente', 'Sem cliente')}, {data_fmt}, {data.get('status', 'Sem status')}\n"
            elif category == "visita":
                data_visita = data.get("data_visita", "Sem data")
                try:
                    data_fmt = datetime.fromisoformat(data_visita).strftime("%d/%m/%Y")
                except:
                    data_fmt = data_visita
                msg += f"{i}. {data.get('empresa', 'Sem empresa')}, {data_fmt}, {data.get('classificacao', 'Sem classificação')}\n"
            else:
                msg += f"{i}. {data.get('cliente', 'Sem cliente')}, {data.get('resumo', 'Sem resumo')[:20]}...\n"
        msg += "\nQual número você quer apagar? (Ex.: 1)"
        await query.edit_message_text(msg, parse_mode="Markdown")
        await query.message.reply_text("Digite o número do registro:")
    except Exception as e:
        logger.error("Erro ao listar registros para exclusão: %s", e)
        await query.edit_message_text("😅 Deu um erro ao listar os registros. Tenta de novo?")

async def excluir_record_received(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    try:
        index = int(update.message.text.strip()) - 1
        if index < 0 or index >= len(context.user_data["delete_docs"]):
            raise ValueError
    except ValueError:
        await update.message.reply_text("😅 Número inválido! Escolhe um da lista, tipo '1'.")
        return DELETE_RECORD
    context.user_data["delete_index"] = index
    reply_keyboard = [["Sim", "Não"]]
    await update.message.reply_text(
        "🗑️ Tem certeza que quer apagar esse registro? (Sim/Não)",
        reply_markup=ReplyKeyboardMarkup(reply_keyboard, one_time_keyboard=True, resize_keyboard=True)
    )
    return DELETE_CONFIRMATION

async def excluir_confirmation_received(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    response = update.message.text.strip().lower()
    if response != "sim":
        await update.message.reply_text("🗑️ Beleza, exclusão cancelada!", reply_markup=ReplyKeyboardRemove())
        return ConversationHandler.END
    category = context.user_data["delete_category"]
    index = context.user_data["delete_index"]
    doc_id, _ = context.user_data["delete_docs"][index]
    chat_id = str(update.message.chat.id)
    try:
        if category == "followup":
            col = db.collection("users").document(chat_id).collection("followups")
        elif category == "visita":
            col = db.collection("users").document(chat_id).collection("visitas")
        else:
            col = db.collection("users").document(chat_id).collection("interacoes")
        
        col.document(doc_id).delete()
        await update.message.reply_text("✅ Registro apagado com sucesso!", reply_markup=ReplyKeyboardRemove())
    except Exception as e:
        logger.error("Erro ao excluir registro: %s", e)
        await update.message.reply_text("😅 Deu um erro ao apagar. Tenta de novo?", reply_markup=ReplyKeyboardRemove())
    return ConversationHandler.END

async def excluir_cancel(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    await update.message.reply_text("🗑️ Beleza, exclusão cancelada!")
    return ConversationHandler.END

# Fluxo de Filtragem
async def filtrar_start(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    options = [
        [InlineKeyboardButton("📋 Follow-up", callback_data="filter_category:followup")],
        [InlineKeyboardButton("🏢 Visita", callback_data="filter_category:visita")],
        [InlineKeyboardButton("💬 Interação", callback_data="filter_category:interacao")]
    ]
    reply_markup = InlineKeyboardMarkup(options)
    await update.message.reply_text("🔍 Opa, o que você quer buscar?", reply_markup=reply_markup)
    return FILTER_CATEGORY

async def filtrar_category_callback(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    query = update.callback_query
    await query.answer()
    category = query.data.split(":", 1)[1]
    context.user_data["filter_category"] = category
    if category == "followup":
        options = [
            [InlineKeyboardButton("Por cliente", callback_data="filter_type:cliente")],
            [InlineKeyboardButton("Por data", callback_data="filter_type:data_follow")],
            [InlineKeyboardButton("Por status", callback_data="filter_type:status")]
        ]
    elif category == "visita":
        options = [
            [InlineKeyboardButton("Por empresa", callback_data="filter_type:empresa")],
            [InlineKeyboardButton("Por data", callback_data="filter_type:data_visita")],
            [InlineKeyboardButton("Por classificação", callback_data="filter_type:classificacao")]
        ]
    else:
        options = [
            [InlineKeyboardButton("Por cliente", callback_data="filter_type:cliente")],
            [InlineKeyboardButton("Por resumo", callback_data="filter_type:resumo")]
        ]
    reply_markup = InlineKeyboardMarkup(options)
    await query.edit_message_text("🔍 Como você quer filtrar?", reply_markup=reply_markup)

async def filtrar_type_callback(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    query = update.callback_query
    await query.answer()
    filter_type = query.data.split(":", 1)[1]
    context.user_data["filter_type"] = filter_type
    if filter_type == "status":
        options = [
            [InlineKeyboardButton("Pendente", callback_data="filter_value:Pendente")],
            [InlineKeyboardButton("Realizado", callback_data="filter_value:Realizado")]
        ]
        reply_markup = InlineKeyboardMarkup(options)
        await query.edit_message_text("🔍 Qual status?", reply_markup=reply_markup)
        return
    elif filter_type == "classificacao":
        options = [
            [InlineKeyboardButton("Potencial Cliente", callback_data="filter_value:Potencial Cliente"),
             InlineKeyboardButton("Cliente Ativo", callback_data="filter_value:Cliente Ativo")],
            [InlineKeyboardButton("Cliente Inativo", callback_data="filter_value:Cliente Inativo"),
             InlineKeyboardButton("Cliente Novo", callback_data="filter_value:Cliente Novo")],
            [InlineKeyboardButton("Cliente de Aluguel", callback_data="filter_value:Cliente de Aluguel"),
             InlineKeyboardButton("Cliente de Venda", callback_data="filter_value:Cliente de Venda")],
            [InlineKeyboardButton("Cliente de Manutenção", callback_data="filter_value:Cliente de Manutenção")],
            [InlineKeyboardButton("Cliente em Negociação", callback_data="filter_value:Cliente em Negociação")],
            [InlineKeyboardButton("Cliente Perdido", callback_data="filter_value:Cliente Perdido")],
            [InlineKeyboardButton("Sem Interesse", callback_data="filter_value:Sem Interesse")]
        ]
        reply_markup = InlineKeyboardMarkup(options)
        await query.edit_message_text("🔍 Qual classificação?", reply_markup=reply_markup)
        return
    elif filter_type in ["data_follow", "data_visita"]:
        await query.edit_message_text("📅 Digite a data ou intervalo (Ex.: 10/04/2025 ou 01/04/2025 a 10/04/2025):")
    else:
        await query.edit_message_text(f"🔍 Digite o que quer buscar em '{filter_type}':")
    await query.message.reply_text("Qual o valor pra buscar?")

async def filtrar_value_callback(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    query = update.callback_query
    await query.answer()
    value = query.data.split(":", 1)[1]
    await filtrar_execute(update, context, value)

async def filtrar_value_received(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    value = update.message.text.strip()
    logger.info("Valor recebido para filtrar: %s, chat_id: %s", value, update.message.chat.id)
    await filtrar_execute(update, context, value)
    return ConversationHandler.END

# Fluxo de Filtragem (continuação)
async def filtrar_type_callback(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    query = update.callback_query
    await query.answer()
    filter_type = query.data.split(":", 1)[1]
    context.user_data["filter_type"] = filter_type
    if filter_type == "status":
        options = [
            [InlineKeyboardButton("Pendente", callback_data="filter_value:Pendente")],
            [InlineKeyboardButton("Realizado", callback_data="filter_value:Realizado")]
        ]
        reply_markup = InlineKeyboardMarkup(options)
        await query.edit_message_text("🔍 Qual status?", reply_markup=reply_markup)
        return
    elif filter_type == "classificacao":
        options = [
            [InlineKeyboardButton("Potencial Cliente", callback_data="filter_value:Potencial Cliente"),
             InlineKeyboardButton("Cliente Ativo", callback_data="filter_value:Cliente Ativo")],
            [InlineKeyboardButton("Cliente Inativo", callback_data="filter_value:Cliente Inativo"),
             InlineKeyboardButton("Cliente Novo", callback_data="filter_value:Cliente Novo")],
            [InlineKeyboardButton("Cliente de Aluguel", callback_data="filter_value:Cliente de Aluguel"),
             InlineKeyboardButton("Cliente de Venda", callback_data="filter_value:Cliente de Venda")],
            [InlineKeyboardButton("Cliente de Manutenção", callback_data="filter_value:Cliente de Manutenção")],
            [InlineKeyboardButton("Cliente em Negociação", callback_data="filter_value:Cliente em Negociação")],
            [InlineKeyboardButton("Cliente Perdido", callback_data="filter_value:Cliente Perdido")],
            [InlineKeyboardButton("Sem Interesse", callback_data="filter_value:Sem Interesse")]
        ]
        reply_markup = InlineKeyboardMarkup(options)
        await query.edit_message_text("🔍 Qual classificação?", reply_markup=reply_markup)
        return
    elif filter_type in ["data_follow", "data_visita"]:
        await query.edit_message_text("📅 Digite a data ou intervalo (Ex.: 10/04/2025 ou 01/04/2025 a 10/04/2025):")
    else:
        await query.edit_message_text(f"🔍 Digite o que quer buscar em '{filter_type}':")
    await query.message.reply_text("Qual o valor pra buscar?")

async def filtrar_value_callback(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    query = update.callback_query
    await query.answer()
    value = query.data.split(":", 1)[1]
    await filtrar_execute(update, context, value)

async def filtrar_value_received(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    value = update.message.text.strip()
    await filtrar_execute(update, context, value)
    return ConversationHandler.END

async def filtrar_execute(update: Update, context: ContextTypes.DEFAULT_TYPE, value: str) -> None:
    category = context.user_data["filter_category"]
    filter_type = context.user_data["filter_type"]
    chat_id = str(update.effective_chat.id)
    logger.info("Executando filtro: category=%s, filter_type=%s, value=%s", category, filter_type, value)
    try:
        if category == "followup":
            col = db.collection("users").document(chat_id).collection("followups")
            prefix = "📋 Follow-ups encontrados"
        elif category == "visita":
            col = db.collection("users").document(chat_id).collection("visitas")
            prefix = "🏢 Visitas encontradas"
        else:
            col = db.collection("users").document(chat_id).collection("interacoes")
            prefix = "💬 Interações encontradas"
        
        if filter_type in ["data_follow", "data_visita"]:
            if " a " in value:
                start_str, end_str = value.split(" a ", 1)
                try:
                    start_date = datetime.strptime(start_str.strip(), "%d/%m/%Y").date()
                    end_date = datetime.strptime(end_str.strip(), "%d/%m/%Y").date()
                    docs = col.where(filter=FieldFilter(filter_type, ">=", start_date.isoformat()))\
                              .where(filter=FieldFilter(filter_type, "<=", end_date.isoformat())).limit(50).stream()
                except ValueError:
                    logger.error("Erro no formato de intervalo de data: %s", value)
                    await update.effective_message.reply_text("😅 Data errada! Usa assim: 01/04/2025 a 10/04/2025")
                    return
            else:
                try:
                    date = datetime.strptime(value, "%d/%m/%Y").date()
                    docs = col.where(filter=FieldFilter(filter_type, "==", date.isoformat())).limit(50).stream()
                except ValueError:
                    logger.error("Erro no formato de data: %s", value)
                    await update.effective_message.reply_text("😅 Data errada! Tenta assim: 10/04/2025")
                    return
        else:
            docs = col.where(filter=FieldFilter(filter_type, "==", value)).limit(50).stream()
        
        docs_list = list(docs)
        if not docs_list:
            logger.info("Nenhum resultado encontrado para o filtro")
            await update.effective_message.reply_text(f"😕 Não achei nada em {prefix.lower()} com esse filtro.")
            return
        
        msg = f"{prefix}:\n"
        for i, doc in enumerate(docs_list[:10], 1):
            data = doc.to_dict()
            if category == "followup":
                data_follow = data.get("data_follow", "Sem data")
                try:
                    data_fmt = datetime.fromisoformat(data_follow).strftime("%d/%m/%Y")
                except:
                    data_fmt = data_follow
                msg += f"{i}. {data.get('cliente', 'Sem cliente')}, {data_fmt}, {data.get('status', 'Sem status')}\n"
            elif category == "visita":
                data_visita = data.get("data_visita", "Sem data")
                try:
                    data_fmt = datetime.fromisoformat(data_visita).strftime("%d/%m/%Y")
                except:
                    data_fmt = data_visita
                msg += f"{i}. {data.get('empresa', 'Sem empresa')}, {data_fmt}, {data.get('classificacao', 'Sem classificação')}\n"
            else:
                msg += f"{i}. {data.get('cliente', 'Sem cliente')}, {data.get('resumo', 'Sem resumo')[:20]}...\n"
        logger.info("Resultados encontrados: %d", len(docs_list))
        await update.effective_message.reply_text(msg, parse_mode="Markdown")
    except Exception as e:
        logger.error("Erro ao executar filtro: %s", e)
        await update.effective_message.reply_text("😅 Deu um erro ao buscar. Tenta de novo?")

async def filtrar_cancel(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    await update.message.reply_text("🔍 Beleza, busca cancelada!")
    return ConversationHandler.END

# Comando /quemvisitar
async def quem_visitar(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    chat_id = str(update.message.chat.id)
    hoje = datetime.now(TIMEZONE).date().isoformat()
    try:
        followups = list(db.collection("users").document(chat_id).collection("followups")
                        .where(filter=FieldFilter("data_follow", "==", hoje))
                        .where(filter=FieldFilter("status", "==", "pendente")).limit(10).stream())
        if not followups:
            await update.message.reply_text("🌟 Hoje tá tranquilo, parceiro! Nenhum follow-up pendente. Que tal prospectar com /buscapotenciais?")
            return
        
        # Construir a mensagem
        msg = "📅 *Quem visitar hoje:*\n"
        options = []
        for i, doc in enumerate(followups, 1):
            data = doc.to_dict()
            # Formatar a data do follow-up
            data_follow = data.get('data_follow', hoje)
            try:
                data_fmt = datetime.fromisoformat(data_follow).strftime("%d/%m/%Y")
            except (ValueError, TypeError):
                data_fmt = data_follow  # Usa o valor bruto se não puder formatar
            # Descrição com limite de 100 caracteres
            descricao = data.get('descricao', 'Sem descrição')
            if len(descricao) > 100:
                descricao = descricao[:100] + "..."
            msg += f"{i}. *{data.get('cliente', 'Sem cliente')}* - {data_fmt} - {descricao}\n"
            options.append([InlineKeyboardButton(f"Marcar {i} como feito", callback_data=f"quemvisitar_done:{doc.id}")])
        
        # Verificar o limite de caracteres do Telegram (4096)
        if len(msg) > 4096:
            mensagens = []
            parte_atual = "📅 *Quem visitar hoje:*\n"
            for i, doc in enumerate(followups, 1):
                data = doc.to_dict()
                data_follow = data.get('data_follow', hoje)
                try:
                    data_fmt = datetime.fromisoformat(data_follow).strftime("%d/%m/%Y")
                except (ValueError, TypeError):
                    data_fmt = data_follow
                descricao = data.get('descricao', 'Sem descrição')
                if len(descricao) > 100:
                    descricao = descricao[:100] + "..."
                linha = f"{i}. *{data.get('cliente', 'Sem cliente')}* - {data_fmt} - {descricao}\n"
                if len(parte_atual) + len(linha) > 4096:
                    mensagens.append(parte_atual)
                    parte_atual = "📅 *Continuação:*\n" + linha
                else:
                    parte_atual += linha
            if parte_atual:
                mensagens.append(parte_atual)
            
            # Enviar mensagens separadas
            for parte in mensagens:
                reply_markup = InlineKeyboardMarkup(options[:len(followups)]) if parte == mensagens[-1] else None
                await update.message.reply_text(parte, parse_mode="Markdown", reply_markup=reply_markup)
        else:
            reply_markup = InlineKeyboardMarkup(options)
            await update.message.reply_text(msg, parse_mode="Markdown", reply_markup=reply_markup)
            
    except Exception as e:
        logger.error("Erro ao executar /quemvisitar: %s", e)
        await update.message.reply_text("😅 Deu um erro ao listar os follow-ups. Tenta de novo?")

async def quem_visitar_callback(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    query = update.callback_query
    await query.answer()
    doc_id = query.data.split(":", 1)[1]
    chat_id = str(query.message.chat.id)
    try:
        db.collection("users").document(chat_id).collection("followups").document(doc_id).update({"status": "realizado"})
        await query.edit_message_text(f"✅ *Follow-up marcado como feito!* Boa, parceiro!", parse_mode="Markdown")
    except Exception as e:
        logger.error("Erro ao marcar follow-up como feito: %s", e)
        await query.edit_message_text("😅 Deu um erro ao atualizar. Tenta de novo?")

# Lembretes Diários e Semanais Otimizados
async def lembrete_diario(context: ContextTypes.DEFAULT_TYPE) -> None:
    now = datetime.now(TIMEZONE)
    hoje = now.date().isoformat()
    try:
        users = db.collection("users").limit(50).stream()  # Limite de 50 usuários por vez
        for user in users:
            chat_id = user.id
            try:
                followups = list(db.collection("users").document(chat_id).collection("followups")
                                .where(filter=FieldFilter("data_follow", "==", hoje)).limit(10).stream())
                pendentes = [f for f in followups if f.to_dict().get("status") == "pendente"]
                realizados = [f for f in followups if f.to_dict().get("status") == "realizado"]

                if now.hour == 8:
                    if pendentes:
                        msg = "☀️ *Bom dia, parceiro!* Hoje tem follow-up na área:\n"
                        for i, f in enumerate(pendentes[:5], 1):
                            data = f.to_dict()
                            msg += f"{i}. *{data.get('cliente', 'Sem cliente')}* - {data.get('descricao', 'Sem descrição')[:30]}...\n"
                        options = [[InlineKeyboardButton(f"Marcar {i} como feito", callback_data=f"daily_done:{f.id}")] for i, f in enumerate(pendentes[:5], 1)]
                        reply_markup = InlineKeyboardMarkup(options)
                        await context.bot.send_message(chat_id, msg, parse_mode="Markdown", reply_markup=reply_markup)
                    else:
                        await context.bot.send_message(chat_id, "☀️ *Bom dia!* Hoje tá livre de follow-ups. Bora prospectar com /buscapotenciais?", parse_mode="Markdown")

                elif now.hour == 12:
                    if pendentes:
                        msg = "🍲 *Hora do almoço!* Ainda tem follow-ups pendentes:\n"
                        for i, f in enumerate(pendentes[:5], 1):
                            data = f.to_dict()
                            msg += f"{i}. *{data.get('cliente', 'Sem cliente')}* - {data.get('descricao', 'Sem descrição')[:30]}...\n"
                        options = [[InlineKeyboardButton(f"Marcar {i} como feito", callback_data=f"daily_done:{f.id}")] for i, f in enumerate(pendentes[:5], 1)]
                        reply_markup = InlineKeyboardMarkup(options)
                        await context.bot.send_message(chat_id, msg, parse_mode="Markdown", reply_markup=reply_markup)

                elif now.hour == 17:
                    visitas = list(db.collection("users").document(chat_id).collection("visitas")
                                  .where(filter=FieldFilter("data_visita", "==", hoje)).limit(10).stream())
                    interacoes = list(db.collection("users").document(chat_id).collection("interacoes")
                                    .where(filter=FieldFilter("criado_em", ">=", hoje)).limit(10).stream())
                    msg = "🌅 *Fim de expediente!* Resumo do dia:\n"
                    msg += f"📋 Follow-ups: {len(realizados)} feitos, {len(pendentes)} pendentes\n"
                    msg += f"🏢 Visitas: {len(visitas)}\n"
                    msg += f"💬 Interações: {len(interacoes)}\n"
                    if pendentes:
                        msg += "\nPendentes pra hoje:\n"
                        for i, f in enumerate(pendentes[:5], 1):
                            data = f.to_dict()
                            msg += f"{i}. *{data.get('cliente', 'Sem cliente')}* - {data.get('descricao', 'Sem descrição')[:30]}...\n"
                        options = [[InlineKeyboardButton(f"Marcar {i} como feito", callback_data=f"daily_done:{f.id}")] for i, f in enumerate(pendentes[:5], 1)]
                        reply_markup = InlineKeyboardMarkup(options)
                    else:
                        reply_markup = None
                    await context.bot.send_message(chat_id, msg, parse_mode="Markdown", reply_markup=reply_markup)
                    grafico_path = gerar_grafico(len(followups), len(realizados), len(pendentes), len(visitas), len(interacoes), "do dia")
                    try:
                        with open(grafico_path, "rb") as photo:
                            await context.bot.send_photo(chat_id, photo=photo, caption="📈 Seu desempenho de hoje!")
                    finally:
                        if os.path.exists(grafico_path):
                            os.remove(grafico_path)

                elif now.hour == 23:
                    if pendentes:
                        msg = "🌙 *Fim do dia!* Ainda tem pendentes:\n"
                        for i, f in enumerate(pendentes[:5], 1):
                            data = f.to_dict()
                            msg += f"{i}. *{data.get('cliente', 'Sem cliente')}* - {data.get('descricao', 'Sem descrição')[:30]}...\n"
                        options = [[InlineKeyboardButton(f"Marcar {i} como feito", callback_data=f"daily_done:{f.id}")] for i, f in enumerate(pendentes[:5], 1)]
                        reply_markup = InlineKeyboardMarkup(options)
                        await context.bot.send_message(chat_id, msg, parse_mode="Markdown", reply_markup=reply_markup)
                    else:
                        await context.bot.send_message(chat_id, "🌙 *Fim do dia!* Tudo em dia, parabéns, parceiro!", parse_mode="Markdown")
                
                await asyncio.sleep(0.5)  # Atraso para evitar limites da API
            except (BadRequest, NetworkError, TimedOut) as e:
                logger.error("Erro ao enviar lembrete diário para %s: %s", chat_id, e)
            except Exception as e:
                logger.error("Erro ao processar lembrete diário para %s: %s", chat_id, e)
    except Exception as e:
        logger.error("Erro geral no lembrete diário: %s", e)

async def lembrete_semanal(context: ContextTypes.DEFAULT_TYPE) -> None:
    now = datetime.now(TIMEZONE)
    hoje = now.date()
    inicio_semana_atual = hoje - timedelta(days=hoje.weekday())
    fim_semana_atual = inicio_semana_atual + timedelta(days=6)
    inicio_proxima_semana = fim_semana_atual + timedelta(days=1)
    fim_proxima_semana = inicio_proxima_semana + timedelta(days=6)
    
    dia_da_semana = hoje.weekday()
    if not ((dia_da_semana == 4 and now.hour == 19) or (dia_da_semana == 0 and now.hour == 7)):  # Sexta 19h ou Segunda 7h
        return
    
    try:
        users = db.collection("users").limit(50).stream()
        for user in users:
            chat_id = user.id
            try:
                if dia_da_semana == 4:  # Sexta-feira
                    followups = list(db.collection("users").document(chat_id).collection("followups")
                                    .where(filter=FieldFilter("data_follow", ">=", inicio_semana_atual.isoformat()))
                                    .where(filter=FieldFilter("data_follow", "<=", fim_semana_atual.isoformat())).limit(10).stream())
                    msg = "📅 *Resumo da semana atual* (segunda a domingo):\n"
                    realizados = [f for f in followups if f.to_dict().get("status") == "realizado"]
                    pendentes = [f for f in followups if f.to_dict().get("status") == "pendente"]
                    msg += f"📋 Follow-ups: {len(realizados)} feitos, {len(pendentes)} pendentes\n"
                    if pendentes:
                        msg += "\nPendentes da semana:\n"
                        for i, f in enumerate(pendentes[:5], 1):
                            data = f.to_dict()
                            data_follow = datetime.fromisoformat(data.get('data_follow', hoje.isoformat())).strftime("%d/%m/%Y")
                            msg += f"{i}. *{data.get('cliente', 'Sem cliente')}* - {data_follow}\n"
                    await context.bot.send_message(chat_id, msg, parse_mode="Markdown")

                elif dia_da_semana == 0:  # Segunda-feira
                    followups = list(db.collection("users").document(chat_id).collection("followups")
                                    .where(filter=FieldFilter("data_follow", ">=", inicio_proxima_semana.isoformat()))
                                    .where(filter=FieldFilter("data_follow", "<=", fim_proxima_semana.isoformat())).limit(10).stream())
                    msg = "📅 *Semana chegando!* Aqui vai o que tá planejado:\n"
                    if followups:
                        for i, f in enumerate(followups[:5], 1):
                            data = f.to_dict()
                            data_follow = datetime.fromisoformat(data.get('data_follow', hoje.isoformat())).strftime("%d/%m/%Y")
                            msg += f"{i}. *{data.get('cliente', 'Sem cliente')}* - {data_follow} ({data.get('status', 'Sem status')})\n"
                    else:
                        msg += "🌟 Tá livre essa semana! Que tal planejar com /followup ou /buscapotenciais?"
                    await context.bot.send_message(chat_id, msg, parse_mode="Markdown")
                
                await asyncio.sleep(0.5)  # Atraso para evitar limites da API
            except (BadRequest, NetworkError, TimedOut) as e:
                logger.error("Erro ao enviar lembrete semanal para %s: %s", chat_id, e)
            except Exception as e:
                logger.error("Erro ao processar lembrete semanal para %s: %s", chat_id, e)
    except Exception as e:
        logger.error("Erro geral no lembrete semanal: %s", e)

async def daily_done_callback(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    query = update.callback_query
    await query.answer()
    doc_id = query.data.split(":", 1)[1]
    chat_id = str(query.message.chat.id)
    try:
        db.collection("users").document(chat_id).collection("followups").document(doc_id).update({"status": "realizado"})
        await query.edit_message_text(f"✅ *Follow-up marcado como feito!* Mandou bem!", parse_mode="Markdown")
    except Exception as e:
        logger.error("Erro ao marcar follow-up como feito: %s", e)
        await query.edit_message_text("😅 Deu um erro ao atualizar. Tenta de novo?")

# Função Principal
def main() -> None:
    TELEGRAM_TOKEN = os.environ.get("TELEGRAM_TOKEN")
    if not TELEGRAM_TOKEN:
        logger.error("TELEGRAM_TOKEN não definido!")
        return
    
    app = ApplicationBuilder().token(TELEGRAM_TOKEN).build()

    # Handlers de comandos simples
    app.add_handler(CommandHandler("inicio", inicio))
    app.add_handler(CommandHandler("ajuda", ajuda))
    app.add_handler(CommandHandler("quemvisitar", quem_visitar))

    # Handler para callback de /quemvisitar
    app.add_handler(CallbackQueryHandler(quem_visitar_callback, pattern="^quemvisitar_done:"))

    # Handler para callback de lembretes diários
    app.add_handler(CallbackQueryHandler(daily_done_callback, pattern="^daily_done:"))

    # Conversação para Follow-up
    followup_conv = ConversationHandler(
        entry_points=[CommandHandler("followup", followup_start)],
        states={
            FOLLOWUP_CLIENT: [MessageHandler(filters.TEXT & ~filters.COMMAND, followup_client)],
            FOLLOWUP_DATE: [MessageHandler(filters.TEXT & ~filters.COMMAND, followup_date)],
            FOLLOWUP_DESCRIPTION: [MessageHandler(filters.TEXT & ~filters.COMMAND, followup_description)]
        },
        fallbacks=[CommandHandler("cancelar", followup_cancel)]
    )
    app.add_handler(followup_conv)

    # Conversação para Visita
    visita_conv = ConversationHandler(
        entry_points=[CommandHandler("visita", visita_start)],
        states={
            VISIT_COMPANY: [MessageHandler(filters.TEXT & ~filters.COMMAND, visita_company)],
            VISIT_DATE: [MessageHandler(filters.TEXT & ~filters.COMMAND, visita_date)],
            VISIT_MOTIVE: [MessageHandler(filters.TEXT & ~filters.COMMAND, visita_motive)],
            VISIT_FOLLOWUP_CHOICE: [MessageHandler(filters.TEXT & ~filters.COMMAND, visita_followup_choice)],
            VISIT_FOLLOWUP_DATE: [MessageHandler(filters.TEXT & ~filters.COMMAND, visita_followup_date)]
        },
        fallbacks=[CommandHandler("cancelar", visita_cancel)],
        conversation_timeout=300
    )
    app.add_handler(visita_conv)
    app.add_handler(CallbackQueryHandler(visita_category_callback, pattern="^visit_category:"))

    # Conversação para Interação
    interacao_conv = ConversationHandler(
        entry_points=[CommandHandler("interacao", interacao_start)],
        states={
            INTER_CLIENT: [MessageHandler(filters.TEXT & ~filters.COMMAND, interacao_client)],
            INTER_SUMMARY: [MessageHandler(filters.TEXT & ~filters.COMMAND, interacao_summary)],
            INTER_FOLLOWUP_CHOICE: [MessageHandler(filters.TEXT & ~filters.COMMAND, interacao_followup_choice)],
            INTER_FOLLOWUP_DATE: [MessageHandler(filters.TEXT & ~filters.COMMAND, interacao_followup_date)]
        },
        fallbacks=[CommandHandler("cancelar", interacao_cancel)]
    )
    app.add_handler(interacao_conv)

    # Conversação para Lembrete
    lembrete_conv = ConversationHandler(
        entry_points=[CommandHandler("lembrete", lembrete_start)],
        states={
            REMINDER_TEXT: [MessageHandler(filters.TEXT & ~filters.COMMAND, lembrete_text)],
            REMINDER_DATETIME: [MessageHandler(filters.TEXT & ~filters.COMMAND, lembrete_datetime)]
        },
        fallbacks=[CommandHandler("cancelar", lembrete_cancel)]
    )
    app.add_handler(lembrete_conv)

    # Conversação para Relatório
    relatorio_conv = ConversationHandler(
        entry_points=[CommandHandler("relatorio", relatorio_start)],
        states={
            REPORT_START: [MessageHandler(filters.TEXT & ~filters.COMMAND, relatorio_start_received)],
            REPORT_END: [MessageHandler(filters.TEXT & ~filters.COMMAND, relatorio_end_received)]
        },
        fallbacks=[CommandHandler("cancelar", relatorio_cancel)]
    )
    app.add_handler(relatorio_conv)

    # Conversação para Histórico
    historico_conv = ConversationHandler(
        entry_points=[CommandHandler("historico", historico_conv_start)],
        states={
            HIST_START: [MessageHandler(filters.TEXT & ~filters.COMMAND, historico_conv_start_received)],
            HIST_END: [MessageHandler(filters.TEXT & ~filters.COMMAND, historico_conv_end_received)]
        },
        fallbacks=[CommandHandler("cancelar", historico_conv_cancel)]
    )
    app.add_handler(historico_conv)

    # Conversação para Edição
    editar_conv = ConversationHandler(
        entry_points=[CommandHandler("editar", editar_start)],
        states={
            EDIT_RECORD: [MessageHandler(filters.TEXT & ~filters.COMMAND, editar_record_received)],
            EDIT_FIELD: [CallbackQueryHandler(editar_field_callback, pattern="^edit_field:")],
            EDIT_NEW_VALUE: [
                MessageHandler(filters.TEXT & ~filters.COMMAND, editar_new_value_received),
                CallbackQueryHandler(editar_value_callback, pattern="^edit_value:")
            ]
        },
        fallbacks=[CommandHandler("cancelar", editar_cancel)],
        conversation_timeout=300  # Timeout de 5 minutos
    )

    app.add_handler(editar_conv)
    app.add_handler(CallbackQueryHandler(editar_category_callback, pattern="^edit_category:"))
    app.add_handler(CallbackQueryHandler(editar_field_callback, pattern="^edit_field:"))
    app.add_handler(CallbackQueryHandler(editar_value_callback, pattern="^edit_value:"))

    # Conversação para Exclusão
    excluir_conv = ConversationHandler(
        entry_points=[CommandHandler("excluir", excluir_start)],
        states={
            DELETE_RECORD: [MessageHandler(filters.TEXT & ~filters.COMMAND, excluir_record_received)],
            DELETE_CONFIRMATION: [MessageHandler(filters.TEXT & ~filters.COMMAND, excluir_confirmation_received)]
        },
        fallbacks=[CommandHandler("cancelar", excluir_cancel)]
    )
    app.add_handler(excluir_conv)
    app.add_handler(CallbackQueryHandler(excluir_category_callback, pattern="^delete_category:"))

    # Conversação para Filtragem
    filtrar_conv = ConversationHandler(
        entry_points=[CommandHandler("filtrar", filtrar_start)],
        states={
            FILTER_VALUE: [MessageHandler(filters.TEXT & ~filters.COMMAND, filtrar_value_received)]
        },
        fallbacks=[CommandHandler("cancelar", filtrar_cancel)],
        conversation_timeout=300
    )
    app.add_handler(filtrar_conv)
    app.add_handler(CallbackQueryHandler(filtrar_category_callback, pattern="^filter_category:"))
    app.add_handler(CallbackQueryHandler(filtrar_type_callback, pattern="^filter_type:"))
    app.add_handler(CallbackQueryHandler(filtrar_value_callback, pattern="^filter_value:"))

    # Conversação para Busca de Potenciais Clientes
    buscapotenciais_conv = ConversationHandler(
        entry_points=[CommandHandler("buscapotenciais", buscapotenciais_start)],
        states={
            BUSCA_TIPO: [MessageHandler(filters.TEXT & ~filters.COMMAND, buscapotenciais_tipo)],
            BUSCA_LOCALIZACAO: [MessageHandler(filters.TEXT & ~filters.COMMAND, buscapotenciais_localizacao)],
            BUSCA_RAIO: [MessageHandler(filters.TEXT & ~filters.COMMAND, buscapotenciais_raio)],
            BUSCA_QUANTIDADE: [MessageHandler(filters.TEXT & ~filters.COMMAND, buscapotenciais_quantidade)]
        },
        fallbacks=[CommandHandler("cancelar", buscapotenciais_cancel)]
    )
    app.add_handler(buscapotenciais_conv)

    # Conversação para Criar Rota
    criarrota_conv = ConversationHandler(
        entry_points=[CommandHandler("criarrota", criarrota_start)],
        states={
            ROTA_TIPO: [MessageHandler(filters.TEXT & ~filters.COMMAND, criarrota_tipo)],
            ROTA_LOCALIZACAO: [MessageHandler(filters.TEXT & ~filters.COMMAND, criarrota_localizacao)],
            ROTA_RAIO: [MessageHandler(filters.TEXT & ~filters.COMMAND, criarrota_raio)],
            ROTA_QUANTIDADE: [MessageHandler(filters.TEXT & ~filters.COMMAND, criarrota_quantidade)]
        },
        fallbacks=[CommandHandler("cancelar", criarrota_cancel)]
    )
    app.add_handler(criarrota_conv)

    # Agendamento de Jobs Otimizados
    app.job_queue.run_daily(lembrete_diario, time(hour=8, minute=0, tzinfo=TIMEZONE))
    app.job_queue.run_daily(lembrete_diario, time(hour=13, minute=10, tzinfo=TIMEZONE))
    app.job_queue.run_daily(lembrete_diario, time(hour=17, minute=30, tzinfo=TIMEZONE))
    app.job_queue.run_daily(lembrete_diario, time(hour=23, minute=0, tzinfo=TIMEZONE))
    app.job_queue.run_daily(lembrete_semanal, time(hour=19, minute=30, tzinfo=TIMEZONE), days=(4,))  # Sexta
    app.job_queue.run_daily(lembrete_semanal, time(hour=7, minute=30, tzinfo=TIMEZONE), days=(1,))  # Segunda

    logger.info("Bot iniciado com sucesso!")
    app.run_polling()

if __name__ == "__main__":
    main()