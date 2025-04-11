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

# Define o fuso horário
TIMEZONE = ZoneInfo("America/Sao_Paulo")

# Aplica nest_asyncio
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

# Configuração da API do Google Maps
GOOGLE_API_KEY = os.environ.get("GOOGLE_API_KEY")
if not GOOGLE_API_KEY:
    logger.error("GOOGLE_API_KEY não definida!")
    exit(1)
gmaps = googlemaps.Client(key=GOOGLE_API_KEY)

# Integração com Telegram
from telegram import Update, InlineKeyboardMarkup, InlineKeyboardButton, ReplyKeyboardMarkup, ReplyKeyboardRemove
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
FILTER_SEARCH = range(700, 701)
EXPORT_CATEGORY, EXPORT_PROCESS = range(800, 802)
BUSCA_TIPO, BUSCA_LOCALIZACAO, BUSCA_RAIO, BUSCA_QUANTIDADE = range(900, 904)
ROTA_TIPO, ROTA_LOCALIZACAO, ROTA_RAIO, ROTA_QUANTIDADE = range(910, 914)

# Função para formatar data
def formatar_data(data_str):
    try:
        data = datetime.fromisoformat(data_str)
        return data.strftime("%d/%m/%Y")
    except:
        return data_str

# Função para gerar gráfico
def gerar_grafico(total_followups, confirmados, pendentes, total_visitas, total_interacoes, periodo_info):
    categorias = ['Follow-ups', 'Confirmados', 'Pendentes', 'Visitas', 'Interações']
    valores = [total_followups, confirmados, pendentes, total_visitas, total_interacoes]
    plt.figure(figsize=(8, 4))
    barras = plt.bar(categorias, valores, color=['#007BFF', '#66B2FF', '#D9D9D9', '#007BFF', '#66B2FF'])
    plt.title(f"Resumo {periodo_info}")
    for barra in barras:
        yval = barra.get_height()
        plt.text(barra.get_x() + barra.get_width() / 2, yval + 0.1, yval, ha='center', va='bottom')
    tmp_file = tempfile.NamedTemporaryFile(suffix=".png", delete=False)
    plt.savefig(tmp_file.name, dpi=150)
    plt.close()
    return tmp_file.name

# Função para exportar CSV
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

# Função para cache de buscas no Google Maps
def salvar_cache_busca(chat_id, tipo_cliente, localizacao, raio, resultados):
    cache_id = f"{tipo_cliente}_{localizacao}_{raio}"
    db.collection("users").document(chat_id).collection("cache_buscas").document(cache_id).set({
        "resultados": resultados,
        "criado_em": datetime.now().isoformat(),
        "expira_em": (datetime.now() + timedelta(hours=24)).isoformat()
    })

def obter_cache_busca(chat_id, tipo_cliente, localizacao, raio):
    cache_id = f"{tipo_cliente}_{localizacao}_{raio}"
    doc = db.collection("users").document(chat_id).collection("cache_buscas").document(cache_id).get()
    if doc.exists:
        data = doc.to_dict()
        expira_em = datetime.fromisoformat(data["expira_em"])
        if datetime.now() < expira_em:
            return data["resultados"]
        else:
            db.collection("users").document(chat_id).collection("cache_buscas").document(cache_id).delete()
    return None

# Função para buscar clientes no Google Maps
def buscar_potenciais_clientes_google(chat_id, localizacao, tipo_cliente, raio_km=10):
    cache = obter_cache_busca(chat_id, tipo_cliente, localizacao, raio_km)
    if cache:
        return cache
    try:
        geocode_result = gmaps.geocode(localizacao)
        if not geocode_result:
            return "Não achei essa localização, parceiro. 😅 Tenta de novo?"
        
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
            return "Nenhum cliente encontrado nessa área. Que tal tentar outro segmento? 🤔"
        
        salvar_cache_busca(chat_id, tipo_cliente, localizacao, raio_km, resultados)
        return resultados
    except Exception as e:
        logger.error("Erro na busca de clientes: %s", e)
        return f"Ops, algo deu errado na busca: {str(e)}. Tenta de novo? 😅"

# Função para buscar clientes no Firebase
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

# Função para criar rota
def criar_rota_google(localizacao_inicial, num_clientes, clientes):
    try:
        geocode_result = gmaps.geocode(localizacao_inicial)
        if not geocode_result:
            return "Não achei o ponto de partida, parceiro. 😅 Confere a localização?"
        
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
            return "Não consegui traçar a rota. Que tal tentar outra região? 🤔"
        
        ordem = rota[0]['waypoint_order']
        pernas = rota[0]['legs']
        
        roteiro = f"🗺️ *Rota otimizada partindo de {localizacao_inicial}:*\n"
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
        return f"Ops, não consegui criar a rota: {str(e)}. Tenta de novo? 😅"

# Comando /inicio
async def inicio(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    msg = (
        "👋 E aí, parceiro! Bem-vindo ao *ZettiBot*, seu ajudante pra turbinar as vendas externas! 🚀\n"
        "Estou aqui pra organizar seus follow-ups, visitas e muito mais. Quer saber o que posso fazer? Dá um /ajuda!\n"
        "Comandos pra começar:\n"
        "📋 /followup – Anotar um follow-up\n"
        "🏢 /visita – Registrar uma visita\n"
        "💬 /interacao – Guardar uma conversa\n"
        "🔔 /lembrete – Criar um alerta\n"
        "📊 /relatorio – Ver seu desempenho\n"
        "📜 /historico – Checar tudo que rolou\n"
        "✏️ /editar – Ajustar algo\n"
        "🗑️ /excluir – Apagar um registro\n"
        "🔍 /filtrar – Buscar algo específico\n"
        "📥 /exportar – Baixar seus dados\n"
        "🤝 /buscapotenciais – Encontrar novos clientes\n"
        "🗺️ /criarrota – Planejar sua rota\n"
        "👀 /quemvisitar – Sugestões de quem contatar"
    )
    await update.message.reply_text(msg, parse_mode="Markdown")
    logger.info("Comando /inicio executado.")

# Comando /ajuda
async def ajuda(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    msg = (
        "📚 *ZettiBot – Seu parceiro inteligente!*\n\n"
        "Sou seu assistente pra organizar as vendas externas e te ajudar a fechar mais negócios! 😄 Aqui vai o que posso fazer:\n\n"
        "🔹 *Comandos disponíveis:*\n"
        "👋 /inicio – Boas-vindas e primeiros passos\n"
        "📚 /ajuda – Tudo que você precisa saber\n"
        "📋 /followup – Anota um follow-up com cliente\n"
        "🏢 /visita – Registra uma visita que você fez\n"
        "💬 /interacao – Guarda detalhes de uma conversa\n"
        "🔔 /lembrete – Te avisa na hora certa\n"
        "📊 /relatorio – Mostra seu desempenho com gráfico\n"
        "📜 /historico – Lista tudo que você registrou\n"
        "✏️ /editar – Corrige algo que tá errado\n"
        "🗑️ /excluir – Apaga um registro\n"
        "🔍 /filtrar – Encontra algo rapidinho\n"
        "📥 /exportar – Baixa seus dados em CSV\n"
        "🤝 /buscapotenciais – Descobre novos clientes\n"
        "🗺️ /criarrota – Monta a melhor rota pra visitar\n"
        "👀 /quemvisitar – Sugere quem você pode contatar\n\n"
        "Se precisar sair de um comando, é só dizer /cancelar. Bora vender mais? 🚀"
    )
    await update.message.reply_text(msg, parse_mode="Markdown")

# Fluxo de Follow-up
async def followup_start(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    await update.message.reply_text("🤝 E aí, qual cliente vamos acompanhar? Digita o nome dele:", parse_mode="Markdown")
    return FOLLOWUP_CLIENT

async def followup_client(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    context.user_data["client"] = update.message.text.strip()
    await update.message.reply_text("📅 Beleza! Quando é o follow-up? (Use DD/MM/AAAA, ex.: 15/04/2025)")
    return FOLLOWUP_DATE

async def followup_date(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    data_str = update.message.text.strip()
    try:
        data_followup = datetime.strptime(data_str, "%d/%m/%Y").date()
    except ValueError:
        await update.message.reply_text("⚠️ Formato errado, parceiro! Tenta DD/MM/AAAA (ex.: 15/04/2025).")
        return FOLLOWUP_DATE
    context.user_data["followup_date"] = data_followup.isoformat()
    await update.message.reply_text("📝 O que você vai fazer nesse follow-up? Conta aí:")
    return FOLLOWUP_DESCRIPTION

async def followup_description(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    context.user_data["followup_desc"] = update.message.text.strip()
    try:
        chat_id = str(update.message.chat.id)
        db.collection("users").document(chat_id).collection("followups").document().set({
            "cliente": context.user_data["client"],
            "data_follow": context.user_data["followup_date"],
            "descricao": context.user_data["followup_desc"],
            "status": "pendente",
            "chat_id": chat_id,
            "criado_em": datetime.now().isoformat()
        })
        await update.message.reply_text("🚀 Show! Follow-up salvo direitinho pra você não perder essa oportunidade!")
    except Exception as e:
        await update.message.reply_text(f"Ops, algo deu errado: {str(e)}. Tenta de novo? 😅")
    return ConversationHandler.END

async def followup_cancel(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    await update.message.reply_text("Tranquilo, follow-up cancelado. Quer tentar outro? 😄")
    return ConversationHandler.END

# Fluxo de Visita
async def visita_start(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    await update.message.reply_text("🏢 Qual empresa você visitou, parceiro? Digita o nome:", parse_mode="Markdown")
    return VISIT_COMPANY

async def visita_company(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    context.user_data["company"] = update.message.text.strip()
    await update.message.reply_text("📅 Quando foi essa visita? (Use DD/MM/AAAA, ex.: 15/04/2025)")
    return VISIT_DATE

async def visita_date(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    data_str = update.message.text.strip()
    try:
        data_visita = datetime.strptime(data_str, "%d/%m/%Y").date()
    except ValueError:
        await update.message.reply_text("⚠️ Formato errado! Tenta DD/MM/AAAA (ex.: 15/04/2025).")
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
    await update.message.reply_text("📋 Como você classifica esse cliente? Escolhe aí:", reply_markup=reply_markup)
    return VISIT_MOTIVE

async def visita_category_callback(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    query = update.callback_query
    await query.answer()
    category = query.data.split(":", 1)[1]
    context.user_data["category"] = category
    await query.edit_message_text(text=f"✔️ Beleza, cliente marcado como *{category}*! Agora, qual foi o motivo da visita?", parse_mode="Markdown")

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
        await update.message.reply_text("📅 Beleza! Quando é o follow-up? (DD/MM/AAAA, ex.: 15/04/2025)", reply_markup=ReplyKeyboardRemove())
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
            await update.message.reply_text("🏢 Visita registrada com sucesso! Bora pra próxima? 🚀", reply_markup=ReplyKeyboardRemove())
        except Exception as e:
            await update.message.reply_text(f"Ops, algo deu errado: {str(e)}. Tenta de novo? 😅", reply_markup=ReplyKeyboardRemove())
        return ConversationHandler.END

async def visita_followup_date(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    data_str = update.message.text.strip()
    try:
        data_followup = datetime.strptime(data_str, "%d/%m/%Y").date()
    except ValueError:
        await update.message.reply_text("⚠️ Formato errado! Tenta DD/MM/AAAA (ex.: 15/04/2025).")
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
        await update.message.reply_text("🚀 Visita e follow-up salvos! Você tá voando, parceiro!")
    except Exception as e:
        await update.message.reply_text(f"Ops, algo deu errado: {str(e)}. Tenta de novo? 😅")
    return ConversationHandler.END

async def visita_cancel(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    await update.message.reply_text("Tranquilo, visita cancelada. Qual é a próxima? 😄", reply_markup=ReplyKeyboardRemove())
    return ConversationHandler.END

# Fluxo de Interação
async def interacao_start(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    await update.message.reply_text("💬 Com quem você conversou, parceiro? Digita o nome do cliente ou empresa:", parse_mode="Markdown")
    return INTER_CLIENT

async def interacao_client(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    context.user_data["client_interacao"] = update.message.text.strip()
    await update.message.reply_text("📝 Beleza! Conta rapidinho como foi essa interação:")
    return INTER_SUMMARY

async def interacao_summary(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    context.user_data["resumo_interacao"] = update.message.text.strip()
    reply_keyboard = [["Sim", "Não"]]
    await update.message.reply_text("Quer marcar um follow-up pra essa interação? (Sim/Não)",
                                    reply_markup=ReplyKeyboardMarkup(reply_keyboard, one_time_keyboard=True, resize_keyboard=True))
    return INTER_FOLLOWUP_CHOICE

async def interacao_followup_choice(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    choice = update.message.text.strip().lower()
    if choice == "sim":
        await update.message.reply_text("📅 Show! Quando é o follow-up? (DD/MM/AAAA, ex.: 15/04/2025)", reply_markup=ReplyKeyboardRemove())
        return INTER_FOLLOWUP_DATE
    else:
        try:
            chat_id = str(update.message.chat.id)
            db.collection("users").document(chat_id).collection("interacoes").document().set({
                "cliente": context.user_data["client_interacao"],
                "resumo": context.user_data["resumo_interacao"],
                "followup": None,
                "criado_em": datetime.now().isoformat()
            })
            await update.message.reply_text("💬 Interação salva com sucesso! Bora manter o ritmo? 🚀", reply_markup=ReplyKeyboardRemove())
        except Exception as e:
            await update.message.reply_text(f"Ops, algo deu errado: {str(e)}. Tenta de novo? 😅", reply_markup=ReplyKeyboardRemove())
        return ConversationHandler.END

async def interacao_followup_date(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    data_str = update.message.text.strip()
    try:
        data_follow = datetime.strptime(data_str, "%d/%m/%Y").date()
    except ValueError:
        await update.message.reply_text("⚠️ Formato errado! Tenta DD/MM/AAAA (ex.: 15/04/2025).")
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
        await update.message.reply_text("🚀 Interação e follow-up salvos! Você tá no controle, parceiro!")
    except Exception as e:
        await update.message.reply_text(f"Ops, algo deu errado: {str(e)}. Tenta de novo? 😅")
    return ConversationHandler.END

async def interacao_cancel(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    await update.message.reply_text("Tranquilo, interação cancelada. Qual é o próximo passo? 😄", reply_markup=ReplyKeyboardRemove())
    return ConversationHandler.END

# Fluxo de Lembrete
async def lembrete_start(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    await update.message.reply_text("🔔 Beleza, parceiro! Qual é o lembrete que você quer configurar?", parse_mode="Markdown")
    return REMINDER_TEXT

async def lembrete_text(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    context.user_data["lembrete_text"] = update.message.text.strip()
    await update.message.reply_text("⏰ Quando você quer ser avisado? (Use DD/MM/AAAA HH:MM, ex.: 15/04/2025 14:30)")
    return REMINDER_DATETIME

async def lembrete_datetime(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    input_str = update.message.text.strip()
    try:
        target_datetime = datetime.strptime(input_str, "%d/%m/%Y %H:%M").replace(tzinfo=TIMEZONE)
    except ValueError:
        await update.message.reply_text("⚠️ Formato errado! Tenta DD/MM/AAAA HH:MM (ex.: 15/04/2025 14:30).")
        return REMINDER_DATETIME
    now = datetime.now(TIMEZONE)
    delay_seconds = (target_datetime - now).total_seconds()
    if delay_seconds <= 0:
        await update.message.reply_text("⚠️ Esse horário já passou! Escolhe um no futuro, vai! 😄")
        return REMINDER_DATETIME
    chat_id = str(update.message.chat.id)
    lembrete_text_value = context.user_data["lembrete_text"]
    context.job_queue.run_once(lembrete_callback, delay_seconds, data={"chat_id": chat_id, "lembrete_text": lembrete_text_value})
    await update.message.reply_text(f"✅ Lembrete configurado pra {target_datetime.strftime('%d/%m/%Y %H:%M')}! Pode contar comigo! 🚀", reply_markup=ReplyKeyboardRemove())
    return ConversationHandler.END

async def lembrete_callback(context: ContextTypes.DEFAULT_TYPE) -> None:
    try:
        job_data = context.job.data
        chat_id = job_data["chat_id"]
        lembrete_text_value = job_data["lembrete_text"]
        await context.bot.send_message(chat_id=chat_id, text=f"🔔 *Ei, parceiro! Lembrete pra você:* {lembrete_text_value}", parse_mode="Markdown")
    except Exception as e:
        logger.error("Erro no lembrete_callback: %s", e)

async def lembrete_cancel(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    await update.message.reply_text("Tranquilo, lembrete cancelado. Qual é o próximo plano? 😄", reply_markup=ReplyKeyboardRemove())
    return ConversationHandler.END

# Fluxo de Relatório
async def relatorio_start(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    await update.message.reply_text("📊 Vamos ver seu desempenho, parceiro? Qual é a data de início? (DD/MM/AAAA, ex.: 01/04/2025)", parse_mode="Markdown")
    return REPORT_START

async def relatorio_start_received(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    date_str = update.message.text.strip()
    try:
        start_date_dt = datetime.strptime(date_str, "%d/%m/%Y")
        context.user_data["report_start"] = date_str
        context.user_data["report_start_dt"] = start_date_dt
    except:
        await update.message.reply_text("⚠️ Formato errado! Tenta DD/MM/AAAA (ex.: 01/04/2025).")
        return REPORT_START
    await update.message.reply_text("📅 Beleza! E a data de fim? (DD/MM/AAAA)")
    return REPORT_END

async def relatorio_end_received(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    date_str = update.message.text.strip()
    try:
        end_date_dt = datetime.strptime(date_str, "%d/%m/%Y")
        context.user_data["report_end"] = date_str
        context.user_data["report_end_dt"] = end_date_dt
    except:
        await update.message.reply_text("⚠️ Formato errado! Tenta DD/MM/AAAA (ex.: 30/04/2025).")
        return REPORT_END
    chat_id = str(update.message.chat.id)
    followups_docs = list(db.collection("users").document(chat_id).collection("followups").stream())
    visitas_docs = list(db.collection("users").document(chat_id).collection("visitas").stream())
    interacoes_docs = list(db.collection("users").document(chat_id).collection("interacoes").stream())
    def in_interval(criado_em_str: str) -> bool:
        try:
            doc_date = datetime.fromisoformat(criado_em_str)
        except:
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
    periodo_info = f"de {context.user_data['report_start']} a {context.user_data['report_end']}"
    texto_relatorio = (
        f"📊 *Seu desempenho {periodo_info}, parceiro!*\n\n"
        f"Follow-ups:\n - Total: {total_followups}\n - Confirmados: {confirmados}\n - Pendentes: {pendentes}\n\n"
        f"Visitas: {total_visitas}\n"
        f"Interações: {total_interacoes}\n\n"
        "Tá mandando bem! 🚀"
    )
    await update.message.reply_text(texto_relatorio, parse_mode="Markdown")
    grafico_path = gerar_grafico(total_followups, confirmados, pendentes, total_visitas, total_interacoes, periodo_info)
    with open(grafico_path, "rb") as photo:
        await update.message.reply_photo(photo=photo, caption="📈 Olha só seu gráfico!")
    os.remove(grafico_path)
    return ConversationHandler.END

async def relatorio_cancel(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    await update.message.reply_text("Tranquilo, relatório cancelado. Quer tentar outro? 😄")
    return ConversationHandler.END

# Fluxo de Histórico
async def historico_conv_start(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    await update.message.reply_text("📜 Vamos dar uma olhada no seu histórico, parceiro? Qual é a data de início? (DD/MM/AAAA)", parse_mode="Markdown")
    return HIST_START

async def historico_conv_start_received(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    date_str = update.message.text.strip()
    try:
        start_date_dt = datetime.strptime(date_str, "%d/%m/%Y")
        context.user_data["historico_start"] = date_str
        context.user_data["historico_start_dt"] = start_date_dt
    except:
        await update.message.reply_text("⚠️ Formato errado! Tenta DD/MM/AAAA (ex.: 01/04/2025).")
        return HIST_START
    await update.message.reply_text("📅 Beleza! E a data de fim? (DD/MM/AAAA)")
    return HIST_END

async def historico_conv_end_received(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    date_str = update.message.text.strip()
    try:
        end_date_dt = datetime.strptime(date_str, "%d/%m/%Y")
        context.user_data["historico_end"] = date_str
        context.user_data["historico_end_dt"] = end_date_dt
    except:
        await update.message.reply_text("⚠️ Formato errado! Tenta DD/MM/AAAA (ex.: 30/04/2025).")
        return HIST_END
    chat_id = str(update.message.chat.id)
    followups_docs = list(db.collection("users").document(chat_id).collection("followups").stream())
    visitas_docs = list(db.collection("users").document(chat_id).collection("visitas").stream())
    interacoes_docs = list(db.collection("users").document(chat_id).collection("interacoes").stream())
    def in_interval(criado_em_str: str) -> bool:
        try:
            doc_date = datetime.fromisoformat(criado_em_str)
        except:
            return False
        return context.user_data["historico_start_dt"] <= doc_date <= context.user_data["historico_end_dt"]
    mensagem = "📜 *Seu histórico detalhado, parceiro!*\n\n"
    if followups_docs:
        mensagem += "🤝 *Follow-ups*\n"
        for doc in followups_docs:
            data = doc.to_dict() or {}
            if data.get("criado_em", "") and in_interval(data.get("criado_em", "")):
                mensagem += f"- {data.get('cliente', 'Sem nome')} ({formatar_data(data.get('data_follow', ''))}): {data.get('descricao', '')}\n"
    else:
        mensagem += "🤝 *Follow-ups*: Nada por aqui ainda.\n\n"
    if visitas_docs:
        mensagem += "🏢 *Visitas*\n"
        for doc in visitas_docs:
            data = doc.to_dict() or {}
            if data.get("criado_em", "") and in_interval(data.get("criado_em", "")):
                mensagem += f"- {data.get('empresa', 'Sem nome')} ({formatar_data(data.get('data_visita', ''))}): {data.get('motivo', '')}\n"
    else:
        mensagem += "🏢 *Visitas*: Nada registrado.\n\n"
    if interacoes_docs:
        mensagem += "💬 *Interações*\n"
        for doc in interacoes_docs:
            data = doc.to_dict() or {}
            if data.get("criado_em", "") and in_interval(data.get("criado_em", "")):
                mensagem += f"- {data.get('cliente', 'Sem nome')} ({formatar_data(data.get('criado_em', ''))}): {data.get('resumo', '')}\n"
    else:
        mensagem += "💬 *Interações*: Tudo quieto por aqui.\n\n"
    if mensagem.strip() == "📜 *Seu histórico detalhado, parceiro!*\n\n":
        mensagem = "⚠️ Nada encontrado nesse período. Tenta outras datas? 😄"
    await update.message.reply_text(mensagem, parse_mode="Markdown")
    return ConversationHandler.END

async def historico_conv_cancel(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    await update.message.reply_text("Tranquilo, histórico cancelado. Qual é o próximo passo? 😄")
    return ConversationHandler.END

# Fluxo de Edição
async def editar_start(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    options = [
        [InlineKeyboardButton("Follow-ups 🤝", callback_data="edit_category:followup")],
        [InlineKeyboardButton("Visitas 🏢", callback_data="edit_category:visita")],
        [InlineKeyboardButton("Interações 💬", callback_data="edit_category:interacao")]
    ]
    reply_markup = InlineKeyboardMarkup(options)
    await update.message.reply_text("✏️ Beleza, parceiro! O que você quer ajustar?", reply_markup=reply_markup, parse_mode="Markdown")
    return EDIT_RECORD

async def editar_category_callback(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    query = update.callback_query
    await query.answer()
    category = query.data.split(":", 1)[1]
    context.user_data["edit_category"] = category
    chat_id = str(query.message.chat.id)
    if category == "followup":
        col = db.collection("users").document(chat_id).collection("followups")
        nome_campo = "cliente"
        data_campo = "data_follow"
    elif category == "visita":
        col = db.collection("users").document(chat_id).collection("visitas")
        nome_campo = "empresa"
        data_campo = "data_visita"
    else:
        col = db.collection("users").document(chat_id).collection("interacoes")
        nome_campo = "cliente"
        data_campo = "criado_em"
    docs = list(col.order_by(data_campo, direction=firestore.Query.DESCENDING).limit(5).stream())
    if not docs:
        await query.edit_message_text(f"⚠️ Não achei nada em {category}, parceiro. Tenta outra categoria? 😄")
        return
    context.user_data["edit_docs"] = [(doc.id, doc.to_dict()) for doc in docs]
    msg = f"📋 *Escolha o que editar em {category}:*\n"
    for i, (_, data) in enumerate(context.user_data["edit_docs"], 1):
        msg += f"{i}. {data.get(nome_campo, 'Sem nome')} - {formatar_data(data.get(data_campo, ''))}\n"
    await query.edit_message_text(msg, parse_mode="Markdown")
    await query.message.reply_text("Digite o número do item que quer mudar (ex.: 1):")

async def editar_record_received(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    try:
        index = int(update.message.text.strip()) - 1
        if index < 0 or index >= len(context.user_data["edit_docs"]):
            raise ValueError
        context.user_data["edit_index"] = index
    except:
        await update.message.reply_text("⚠️ Número inválido, parceiro! Escolhe um da lista (ex.: 1).")
        return EDIT_RECORD
    category = context.user_data["edit_category"]
    if category == "followup":
        campos = ["1. Cliente", "2. Data (DD/MM/AAAA)", "3. Descrição", "4. Status (pendente/realizado)"]
    elif category == "visita":
        campos = ["1. Empresa", "2. Data (DD/MM/AAAA)", "3. Classificação", "4. Motivo", "5. Follow-up (DD/MM/AAAA ou 'Não agendado')"]
    else:
        campos = ["1. Cliente", "2. Resumo", "3. Follow-up (DD/MM/AAAA ou 'Nenhum')"]
    msg = "📋 O que você quer mudar nesse item?\n" + "\n".join(campos)
    await update.message.reply_text(msg, parse_mode="Markdown")
    return EDIT_FIELD

async def editar_field_received(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    try:
        campo_num = int(update.message.text.strip())
    except:
        await update.message.reply_text("⚠️ Escolhe um número da lista, parceiro! (ex.: 1)")
        return EDIT_FIELD
    category = context.user_data["edit_category"]
    if category == "followup":
        if campo_num not in [1, 2, 3, 4]:
            await update.message.reply_text("⚠️ Número inválido! Escolhe entre 1 e 4.")
            return EDIT_FIELD
        campos = {1: "cliente", 2: "data_follow", 3: "descricao", 4: "status"}
        context.user_data["edit_field"] = campos[campo_num]
    elif category == "visita":
        if campo_num not in [1, 2, 3, 4, 5]:
            await update.message.reply_text("⚠️ Número inválido! Escolhe entre 1 e 5.")
            return EDIT_FIELD
        campos = {1: "empresa", 2: "data_visita", 3: "classificacao", 4: "motivo", 5: "followup"}
        context.user_data["edit_field"] = campos[campo_num]
    else:
        if campo_num not in [1, 2, 3]:
            await update.message.reply_text("⚠️ Número inválido! Escolhe entre 1 e 3.")
            return EDIT_FIELD
        campos = {1: "cliente", 2: "resumo", 3: "followup"}
        context.user_data["edit_field"] = campos[campo_num]
    await update.message.reply_text(f"Beleza! Qual é o novo valor pra esse campo?")
    return EDIT_NEW_VALUE

async def editar_new_value_received(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    new_value = update.message.text.strip()
    category = context.user_data["edit_category"]
    index = context.user_data["edit_index"]
    field = context.user_data["edit_field"]
    doc_id = context.user_data["edit_docs"][index][0]
    chat_id = str(update.message.chat.id)
    if category == "followup":
        col = db.collection("users").document(chat_id).collection("followups")
        if field == "data_follow":
            try:
                datetime.strptime(new_value, "%d/%m/%Y")
                new_value = datetime.strptime(new_value, "%d/%m/%Y").date().isoformat()
            except:
                await update.message.reply_text("⚠️ Formato errado! Tenta DD/MM/AAAA (ex.: 15/04/2025).")
                return EDIT_NEW_VALUE
        elif field == "status" and new_value.lower() not in ["pendente", "realizado"]:
            await update.message.reply_text("⚠️ Status deve ser 'pendente' ou 'realizado'!")
            return EDIT_NEW_VALUE
    elif category == "visita":
        col = db.collection("users").document(chat_id).collection("visitas")
        if field == "data_visita":
            try:
                datetime.strptime(new_value, "%d/%m/%Y")
                new_value = datetime.strptime(new_value, "%d/%m/%Y").date().isoformat()
            except:
                await update.message.reply_text("⚠️ Formato errado! Tenta DD/MM/AAAA (ex.: 15/04/2025).")
                return EDIT_NEW_VALUE
        elif field == "followup" and new_value.lower() != "não agendado":
            try:
                datetime.strptime(new_value, "%d/%m/%Y")
                new_value = datetime.strptime(new_value, "%d/%m/%Y").date().isoformat()
            except:
                await update.message.reply_text("⚠️ Formato errado! Tenta DD/MM/AAAA ou 'Não agendado'.")
                return EDIT_NEW_VALUE
    else:
        col = db.collection("users").document(chat_id).collection("interacoes")
        if field == "followup" and new_value.lower() != "nenhum":
            try:
                datetime.strptime(new_value, "%d/%m/%Y")
                new_value = datetime.strptime(new_value, "%d/%m/%Y").date().isoformat()
            except:
                await update.message.reply_text("⚠️ Formato errado! Tenta DD/MM/AAAA ou 'Nenhum'.")
                return EDIT_NEW_VALUE
    try:
        col.document(doc_id).update({field: new_value})
        await update.message.reply_text("✅ Item atualizado com sucesso! Bora continuar? 🚀")
    except Exception as e:
        await update.message.reply_text(f"Ops, algo deu errado: {str(e)}. Tenta de novo? 😅")
    return ConversationHandler.END

async def editar_cancel(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    await update.message.reply_text("Tranquilo, edição cancelada. Qual é o próximo plano? 😄")
    return ConversationHandler.END

# Fluxo de Exclusão
async def excluir_start(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    options = [
        [InlineKeyboardButton("Follow-ups 🤝", callback_data="delete_category:followup")],
        [InlineKeyboardButton("Visitas 🏢", callback_data="delete_category:visita")],
        [InlineKeyboardButton("Interações 💬", callback_data="delete_category:interacao")]
    ]
    reply_markup = InlineKeyboardMarkup(options)
    await update.message.reply_text("🗑️ E aí, parceiro? O que você quer apagar?", reply_markup=reply_markup, parse_mode="Markdown")
    return DELETE_RECORD

async def excluir_category_callback(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    query = update.callback_query
    await query.answer()
    category = query.data.split(":", 1)[1]
    context.user_data["delete_category"] = category
    chat_id = str(query.message.chat.id)
    if category == "followup":
        col = db.collection("users").document(chat_id).collection("followups")
        nome_campo = "cliente"
        data_campo = "data_follow"
    elif category == "visita":
        col = db.collection("users").document(chat_id).collection("visitas")
        nome_campo = "empresa"
        data_campo = "data_visita"
    else:
        col = db.collection("users").document(chat_id).collection("interacoes")
        nome_campo = "cliente"
        data_campo = "criado_em"
    docs = list(col.order_by(data_campo, direction=firestore.Query.DESCENDING).limit(5).stream())
    if not docs:
        await query.edit_message_text(f"⚠️ Não achei nada em {category}, parceiro. Tenta outra categoria? 😄")
        return
    context.user_data["delete_docs"] = [(doc.id, doc.to_dict()) for doc in docs]
    msg = f"📋 *Escolha o que apagar em {category}:*\n"
    for i, (_, data) in enumerate(context.user_data["delete_docs"], 1):
        msg += f"{i}. {data.get(nome_campo, 'Sem nome')} - {formatar_data(data.get(data_campo, ''))}\n"
    await query.edit_message_text(msg, parse_mode="Markdown")
    await query.message.reply_text("Digite o número do item que quer apagar (ex.: 1):")

async def excluir_record_received(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    try:
        index = int(update.message.text.strip()) - 1
        if index < 0 or index >= len(context.user_data["delete_docs"]):
            raise ValueError
        context.user_data["delete_index"] = index
    except:
        await update.message.reply_text("⚠️ Número inválido, parceiro! Escolhe um da lista (ex.: 1).")
        return DELETE_RECORD
    await update.message.reply_text("Tem certeza que quer apagar esse item? (Sim/Não)")
    return DELETE_CONFIRMATION

async def excluir_confirmation_received(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    response = update.message.text.strip().lower()
    if response != "sim":
        await update.message.reply_text("Beleza, exclusão cancelada. Qual é o próximo passo? 😄")
        return ConversationHandler.END
    category = context.user_data["delete_category"]
    index = context.user_data["delete_index"]
    doc_id = context.user_data["delete_docs"][index][0]
    chat_id = str(update.message.chat.id)
    if category == "followup":
        col = db.collection("users").document(chat_id).collection("followups")
    elif category == "visita":
        col = db.collection("users").document(chat_id).collection("visitas")
    else:
        col = db.collection("users").document(chat_id).collection("interacoes")
    try:
        col.document(doc_id).delete()
        await update.message.reply_text("🗑️ Item apagado com sucesso! Tudo limpo, parceiro! 🚀")
    except Exception as e:
        await update.message.reply_text(f"Ops, algo deu errado: {str(e)}. Tenta de novo? 😅")
    return ConversationHandler.END

async def excluir_cancel(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    await update.message.reply_text("Tranquilo, exclusão cancelada. Qual é o próximo plano? 😄")
    return ConversationHandler.END

# Fluxo de Filtragem
async def filtrar_start(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    await update.message.reply_text("🔍 E aí, parceiro? Digite o nome do cliente ou uma palavra-chave pra buscar:", parse_mode="Markdown")
    return FILTER_SEARCH

async def filtrar_search_received(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    termo = update.message.text.strip().lower()
    chat_id = str(update.message.chat.id)
    resultados = []
    
    for category, col_name, nome_campo, data_campo in [
        ("followup", "followups", "cliente", "data_follow"),
        ("visita", "visitas", "empresa", "data_visita"),
        ("interacao", "interacoes", "cliente", "criado_em")
    ]:
        col = db.collection("users").document(chat_id).collection(col_name)
        docs = list(col.stream())
        for doc in docs:
            data = doc.to_dict()
            if (termo in data.get(nome_campo, "").lower() or
                termo in data.get("descricao", data.get("motivo", data.get("resumo", ""))).lower() or
                termo in data.get("classificacao", "").lower()):
                resultados.append((category, doc.id, data))
    
    if not resultados:
        await update.message.reply_text("⚠️ Não achei nada com esse termo, parceiro. Tenta outra palavra? 😄")
        return ConversationHandler.END
    
    msg = "🔍 *Achei isso pra você:*\n"
    context.user_data["filter_results"] = resultados
    for i, (cat, _, data) in enumerate(resultados[:5], 1):
        nome = data.get("cliente", data.get("empresa", "Sem nome"))
        data_str = formatar_data(data.get("data_follow", data.get("data_visita", data.get("criado_em", ""))))
        msg += f"{i}. {nome} ({cat}) - {data_str}\n"
    await update.message.reply_text(msg, parse_mode="Markdown")
    return ConversationHandler.END

async def filtrar_cancel(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    await update.message.reply_text("Tranquilo, busca cancelada. Qual é o próximo passo? 😄")
    return ConversationHandler.END

# Fluxo de Exportação
async def exportar_start(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    options = [
        [InlineKeyboardButton("Follow-ups 🤝", callback_data="export_category:followup")],
        [InlineKeyboardButton("Visitas 🏢", callback_data="export_category:visita")],
        [InlineKeyboardButton("Interações 💬", callback_data="export_category:interacao")]
    ]
    reply_markup = InlineKeyboardMarkup(options)
    await update.message.reply_text("📥 E aí, parceiro? Qual categoria você quer baixar em CSV?", reply_markup=reply_markup, parse_mode="Markdown")
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
        await query.edit_message_text(f"⚠️ Não achei nada em {categoria_nome}, parceiro. Tenta outra categoria? 😄")
        return
    csv_file = exportar_csv(docs)
    await query.edit_message_text("📥 Preparando seu arquivo, peraí...")
    with open(csv_file, "rb") as f:
        await query.message.reply_document(document=f, filename=f"{categoria_nome}.csv", caption="✅ Aqui tá seu arquivo, parceiro! 🚀")
    os.remove(csv_file)

async def exportar_cancel(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    await update.message.reply_text("Tranquilo, exportação cancelada. Qual é o próximo plano? 😄")
    return ConversationHandler.END

# Fluxo de Busca de Potenciais Clientes
async def buscapotenciais_start(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    await update.message.reply_text(
        "🤝 Bora encontrar novos clientes, parceiro? Que tipo de negócio você tá procurando? (ex.: indústria, logística, fábrica)",
        parse_mode="Markdown"
    )
    return BUSCA_TIPO

async def buscapotenciais_tipo(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    context.user_data["busca_tipo"] = update.message.text.strip()
    await update.message.reply_text("📍 Show! Onde é a região? (ex.: Vale Encantado, Vila Velha - ES)")
    return BUSCA_LOCALIZACAO

async def buscapotenciais_localizacao(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    context.user_data["busca_localizacao"] = update.message.text.strip()
    await update.message.reply_text("📏 Quantos quilômetros de raio? (ex.: 10)")
    return BUSCA_RAIO

async def buscapotenciais_raio(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    try:
        raio = float(update.message.text.strip())
        if raio <= 0:
            raise ValueError
    except:
        await update.message.reply_text("⚠️ Digita um número maior que 0, parceiro! (ex.: 10)")
        return BUSCA_RAIO
    context.user_data["busca_raio"] = raio
    await update.message.reply_text("📋 Quantos clientes você quer ver? (ex.: 5)")
    return BUSCA_QUANTIDADE

async def buscapotenciais_quantidade(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    try:
        quantidade = int(update.message.text.strip())
        if quantidade <= 0:
            raise ValueError
    except:
        await update.message.reply_text("⚠️ Digita um número maior que 0, parceiro! (ex.: 5)")
        return BUSCA_QUANTIDADE
    
    tipo_cliente = context.user_data["busca_tipo"]
    localizacao = context.user_data["busca_localizacao"]
    raio = context.user_data["busca_raio"]
    chat_id = str(update.message.chat.id)
    
    termos = [termo.strip() for termo in tipo_cliente.split(",")]
    clientes = []
    
    for termo in termos:
        resultado = buscar_potenciais_clientes_google(chat_id, localizacao, termo, raio)
        if isinstance(resultado, list):
            clientes.extend(resultado)
    
    if not clientes:
        await update.message.reply_text("⚠️ Não achei clientes pra esses termos. Tenta outro segmento? 😄")
        return ConversationHandler.END
    
    clientes_unicos = {cliente['nome']: cliente for cliente in clientes}.values()
    clientes_unicos = list(clientes_unicos)
    
    if quantidade >=len(clientes_unicos):
        quantidade = len(clientes_unicos)
    msg = f"🤝 *Achei esses clientes pra '{tipo_cliente}' ({quantidade} de {len(clientes_unicos)}):*\n"
    for cliente in clientes_unicos[:quantidade]:
        msg += f"📍 *{cliente['nome']}* ({cliente['fonte']})\n"
        msg += f"   Endereço: {cliente['endereco']}\n"
        msg += f"   Telefone: {cliente['telefone']}\n"
    context.user_data["clientes_potenciais"] = clientes_unicos
    await update.message.reply_text(msg, parse_mode="Markdown")
    return ConversationHandler.END

async def buscapotenciais_cancel(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    await update.message.reply_text("Tranquilo, busca cancelada. Qual é o próximo plano? 😄")
    return ConversationHandler.END

# Fluxo de Criação de Rota
async def criarrota_start(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    await update.message.reply_text(
        "🗺️ Bora planejar sua rota, parceiro? Que tipo de cliente você quer visitar? (ex.: indústria, logística, fábrica)",
        parse_mode="Markdown"
    )
    return ROTA_TIPO

async def criarrota_tipo(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    context.user_data["rota_tipo"] = update.message.text.strip()
    await update.message.reply_text("📍 Beleza! Qual é a região base? (ex.: Vale Encantado, Vila Velha - ES)")
    return ROTA_LOCALIZACAO

async def criarrota_localizacao(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    context.user_data["rota_localizacao"] = update.message.text.strip()
    await update.message.reply_text("📏 Quantos quilômetros de raio? (ex.: 10)")
    return ROTA_RAIO

async def criarrota_raio(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    try:
        raio = float(update.message.text.strip())
        if raio <= 0:
            raise ValueError
    except:
        await update.message.reply_text("⚠️ Digita um número maior que 0, parceiro! (ex.: 10)")
        return ROTA_RAIO
    context.user_data["rota_raio"] = raio
    await update.message.reply_text("📋 Quantos clientes na rota? (ex.: 5)")
    return ROTA_QUANTIDADE

async def criarrota_quantidade(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    try:
        quantidade = int(update.message.text.strip())
        if quantidade <= 0:
            raise ValueError
    except:
        await update.message.reply_text("⚠️ Digita um número maior que 0, parceiro! (ex.: 5)")
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
        resultado = buscar_potenciais_clientes_google(chat_id, localizacao, termo, raio)
        if isinstance(resultado, list):
            clientes_google.extend(resultado)
    
    todos_clientes = clientes_firebase + clientes_google
    
    if not todos_clientes:
        await update.message.reply_text("⚠️ Não achei clientes pra montar a rota. Tenta outro segmento ou região? 😄")
        return ConversationHandler.END
    
    clientes_unicos = {cliente['nome']: cliente for cliente in todos_clientes}.values()
    clientes_unicos = list(clientes_unicos)
    
    if quantidade > len(clientes_unicos):
        quantidade = len(clientes_unicos)
    clientes_selecionados = clientes_unicos[:quantidade]
    
    msg = f"🗺️ *Rota planejada pra '{tipo_cliente}' ({quantidade} clientes):*\n"
    for i, cliente in enumerate(clientes_selecionados, 1):
        msg += f"{i}. *{cliente['nome']}* ({cliente['fonte']})\n"
        msg += f"   📍 Endereço: {cliente['endereco']}\n"
        msg += f"   📞 Telefone: {cliente['telefone']}\n"
    
    rota_otimizada = criar_rota_google(localizacao, quantidade, clientes_selecionados)
    if not isinstance(rota_otimizada, str) or "Erro" not in rota_otimizada:
        msg += "\n" + rota_otimizada
    
    context.user_data["clientes_rota"] = clientes_selecionados