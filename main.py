import os
import json
import logging
import asyncio
import nest_asyncio
import sys
from datetime import datetime, timedelta, time
from zoneinfo import ZoneInfo  # Disponível a partir do Python 3.9

# Define o fuso horário desejado (ajuste conforme necessário)
TIMEZONE = ZoneInfo("America/Sao_Paulo")

# Aplica o patch no nest_asyncio (para evitar conflitos com o event loop já ativo)
nest_asyncio.apply()

# ------------------------------------------------------------------------------
# Configuração do Logger
# ------------------------------------------------------------------------------
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

# ------------------------------------------------------------------------------
# Inicialização do Firebase
# ------------------------------------------------------------------------------
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

# ------------------------------------------------------------------------------
# Integração com o Telegram Bot (API Assíncrona)
# ------------------------------------------------------------------------------
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

# ----- Estados para os fluxos de conversa -----
# Follow-up (0 a 2)
FOLLOWUP_CLIENT, FOLLOWUP_DATE, FOLLOWUP_DESCRIPTION = range(3)
# Visita (0 a 5)
VISIT_COMPANY, VISIT_DATE, VISIT_CATEGORY, VISIT_MOTIVE, VISIT_FOLLOWUP_CHOICE, VISIT_FOLLOWUP_DATE = range(6)
# Interação (0 a 3)
INTER_CLIENT, INTER_SUMMARY, INTER_FOLLOWUP_CHOICE, INTER_FOLLOWUP_DATE = range(4)
# Lembrete (100 a 101)
REMINDER_TEXT, REMINDER_DATETIME = range(100, 102)
# Relatório (resumido) (300 a 301)
REPORT_START, REPORT_END = range(300, 302)
# Histórico (detalhado) (400 a 401)
HIST_START, HIST_END = range(400, 402)

# ------------------------------------------------------------------------------
# Comandos Básicos
# ------------------------------------------------------------------------------
async def start(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    await update.message.reply_text("Olá Rafael! 😃 Seu bot está ativo e integrado com o Firebase.")
    logger.info("Comando /start executado.")

async def testfirebase(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    try:
        chat_id = str(update.message.chat.id)
        db.collection("users").document(chat_id).collection("test").document("hello").set({
            "message": "Teste de integração Firebase!",
            "timestamp": firestore.SERVER_TIMESTAMP
        })
        await update.message.reply_text("Dados enviados para o Firebase com sucesso! ✅")
        logger.info("Comando /testfirebase executado com sucesso.")
    except Exception as e:
        logger.error("Erro no testfirebase: %s", e)
        await update.message.reply_text("Erro ao enviar dados para o Firebase.")

# ------------------------------------------------------------------------------
# Fluxo de Follow-up
# ------------------------------------------------------------------------------
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
        db.collection("users").document(chat_id).collection("followups").document().set({
            "cliente": context.user_data["client"],
            "data_follow": context.user_data["followup_date"],
            "descricao": context.user_data["followup_desc"],
            "status": "pendente",
            "chat_id": chat_id,
            "criado_em": datetime.now().isoformat()
        })
        await update.message.reply_text("Follow-up registrado com sucesso! ✅")
        logger.info(f"Follow-up para {context.user_data['client']} registrado.")
    except Exception as e:
        logger.error("Erro ao registrar follow-up: %s", e)
        await update.message.reply_text("Erro ao registrar follow-up: " + str(e))
    return ConversationHandler.END

async def followup_cancel(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    await update.message.reply_text("Follow-up cancelado. ❌")
    return ConversationHandler.END

# ------------------------------------------------------------------------------
# Fluxo de Visita
# ------------------------------------------------------------------------------
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
        [InlineKeyboardButton("Potencial Cliente", callback_data="Potencial Cliente"),
         InlineKeyboardButton("Cliente Ativo", callback_data="Cliente Ativo")],
        [InlineKeyboardButton("Cliente Inativo", callback_data="Cliente Inativo"),
         InlineKeyboardButton("Cliente Novo", callback_data="Cliente Novo")],
        [InlineKeyboardButton("Cliente de Aluguel", callback_data="Cliente de Aluguel"),
         InlineKeyboardButton("Cliente de Venda", callback_data="Cliente de Venda")],
        [InlineKeyboardButton("Cliente de Manutenção", callback_data="Cliente de Manutenção")],
        [InlineKeyboardButton("Cliente em Negociação", callback_data="Cliente em Negociação")],
        [InlineKeyboardButton("Cliente Perdido", callback_data="Cliente Perdido")],
        [InlineKeyboardButton("Sem Interesse", callback_data="Sem Interesse")]
    ]
    reply_markup = InlineKeyboardMarkup(options)
    await update.message.reply_text("📋 Selecione a categoria do cliente:", reply_markup=reply_markup)
    return VISIT_CATEGORY

async def visita_category_callback(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    query = update.callback_query
    await query.answer()
    category = query.data
    context.user_data["category"] = category
    await query.edit_message_text(text=f"✔️ Categoria: *{category}*\nInforme o motivo da visita:", parse_mode="Markdown")
    return VISIT_MOTIVE

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
            logger.error("Erro ao registrar visita: %s", e)
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
        logger.error("Erro ao registrar visita com follow-up: %s", e)
        await update.message.reply_text("Erro ao registrar visita com follow-up: " + str(e))
    return ConversationHandler.END

async def visita_cancel(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    await update.message.reply_text("Visita cancelada.", reply_markup=ReplyKeyboardRemove())
    return ConversationHandler.END

# ------------------------------------------------------------------------------
# Fluxo de Interação
# ------------------------------------------------------------------------------
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
    await update.message.reply_text(
        "Deseja agendar follow-up para essa interação? (Sim/Não)",
        reply_markup=ReplyKeyboardMarkup(reply_keyboard, one_time_keyboard=True, resize_keyboard=True)
    )
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
            logger.error("Erro ao registrar interação: %s", e)
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
        logger.error("Erro no interacao_followup_date: %s", e)
        await update.message.reply_text("Erro ao registrar interação: " + str(e))
    return ConversationHandler.END

async def interacao_cancel(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    await update.message.reply_text("Interação cancelada.", reply_markup=ReplyKeyboardRemove())
    return ConversationHandler.END

# ------------------------------------------------------------------------------
# Fluxo de Lembrete
# ------------------------------------------------------------------------------
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

# ------------------------------------------------------------------------------
# Fluxo de Relatório (Resumido)
# ------------------------------------------------------------------------------
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
        logger.error("Erro ao converter data de início do relatório: %s", e)
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
        logger.error("Erro ao converter data de fim do relatório: %s", e)
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
    mensagem = (
        f"📊 *Relatório ({periodo_info})*\n\n"
        f"Follow-ups:\n"
        f" - Total: {total_followups}\n"
        f" - Confirmados: {confirmados}\n"
        f" - Pendentes: {pendentes}\n\n"
        f"Visitas: {total_visitas}\n"
        f"Interações: {total_interacoes}"
    )
    await update.message.reply_text(mensagem, parse_mode="Markdown")
    return ConversationHandler.END

async def relatorio_cancel(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    await update.message.reply_text("Relatório cancelado.")
    return ConversationHandler.END

# ------------------------------------------------------------------------------
# Fluxo de Histórico (Detalhado)
# ------------------------------------------------------------------------------
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
        logger.error("Erro ao converter data de início do histórico: %s", e)
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
        logger.error("Erro ao converter data de fim do histórico: %s", e)
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
                cliente = data.get("cliente", "N/A")
                data_follow = data.get("data_follow", "N/A")
                descricao = data.get("descricao", "N/A")
                status = data.get("status", "N/A")
                mensagem += f" - Cliente: {cliente}\n   Data: {data_follow}\n   Descrição: {descricao}\n   Status: {status}\n\n"
    else:
        mensagem += "📋 *Follow-ups*\n - Nenhum registro encontrado.\n\n"

    if visitas_docs:
        mensagem += "🏢 *Visitas*\n"
        for doc in visitas_docs:
            data = doc.to_dict() or {}
            if data.get("criado_em", "") and in_interval(data.get("criado_em", "")):
                empresa = data.get("empresa", "N/A")
                data_visita = data.get("data_visita", "N/A")
                classificacao = data.get("classificacao", "N/A")
                motivo = data.get("motivo", "N/A")
                mensagem += f" - Empresa: {empresa}\n   Data: {data_visita}\n   Classificação: {classificacao}\n   Motivo: {motivo}\n\n"
    else:
        mensagem += "🏢 *Visitas*\n - Nenhum registro encontrado.\n\n"

    if interacoes_docs:
        mensagem += "💬 *Interações*\n"
        for doc in interacoes_docs:
            data = doc.to_dict() or {}
            if data.get("criado_em", "") and in_interval(data.get("criado_em", "")):
                cliente = data.get("cliente", "N/A")
                resumo = data.get("resumo", "N/A")
                followup = data.get("followup", "Não agendado")
                mensagem += f" - Cliente: {cliente}\n   Resumo: {resumo}\n   Follow-up: {followup}\n\n"
    else:
        mensagem += "💬 *Interações*\n - Nenhum registro encontrado.\n\n"

    if mensagem.strip() == "*📜 Histórico Detalhado*\n\n":
        mensagem = "⚠️ Nenhum registro encontrado no intervalo fornecido."

    await update.message.reply_text(mensagem, parse_mode="Markdown")
    return ConversationHandler.END

async def historico_conv_cancel(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    await update.message.reply_text("Histórico cancelado.")
    return ConversationHandler.END

# ------------------------------------------------------------------------------
# Jobs Diários e Callback Inline para Confirmação de Follow-up
# ------------------------------------------------------------------------------
async def daily_reminder_callback(context: ContextTypes.DEFAULT_TYPE) -> None:
    try:
        today = datetime.now(TIMEZONE).date().isoformat()
        docs = db.collection_group("followups").where("data_follow", "==", today)\
               .where("status", "==", "pendente").stream()
        for doc in docs:
            data = doc.to_dict()
            user_chat_id = data.get("chat_id")
            if user_chat_id:
                followup_id = doc.id
                message_text = (
                    f"🔔 *Lembrete de Follow-up:*\n"
                    f"Cliente: {data.get('cliente')}\n"
                    f"Descrição: {data.get('descricao')}\n\n"
                    f"Confirme se o contato foi realizado:"
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
                f"📝 *Resumo do dia {today}:*\n\n"
                f"Follow-ups confirmados: {confirmed}\n"
                f"Follow-ups pendentes: {pending_count}\n"
                f"Os pendentes foram reagendados para {tomorrow}."
            )
            await context.bot.send_message(chat_id=user_chat_id, text=summary_text, parse_mode="Markdown")
            for doc_id, data in pending_items[user_chat_id]:
                db.collection("users").document(user_chat_id).collection("followups").document(doc_id).update({"data_follow": tomorrow})
    except Exception as e:
        logger.error("Erro no evening_summary_callback: %s", e)

async def confirm_followup_callback(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    try:
        query = update.callback_query
        await query.answer()
        _, user_chat_id, doc_id = query.data.split(":", 2)
        db.collection("users").document(user_chat_id).collection("followups").document(doc_id).update({"status": "realizado"})
        await query.edit_message_text(text="✅ Follow-up confirmado!")
        logger.info(f"Follow-up {doc_id} confirmado para {user_chat_id}.")
    except Exception as e:
        logger.error("Erro ao confirmar follow-up: %s", e)
        await query.edit_message_text(text="Erro ao confirmar follow-up.")

# ------------------------------------------------------------------------------
# Error Handler
# ------------------------------------------------------------------------------
async def error_handler(update: object, context: ContextTypes.DEFAULT_TYPE) -> None:
    logger.error("Exception while handling an update: %s", context.error)

# ------------------------------------------------------------------------------
# Função Principal
# ------------------------------------------------------------------------------
async def main():
    token = os.environ.get("TELEGRAM_TOKEN")
    if not token:
        logger.error("TELEGRAM_TOKEN não definido!")
        return

    application = ApplicationBuilder().token(token).build()

    # Handlers Simples
    application.add_handler(CommandHandler("start", start))
    application.add_handler(CommandHandler("testfirebase", testfirebase))
    
    # Handler para Relatório (Resumido)
    relatorio_conv_handler = ConversationHandler(
        entry_points=[CommandHandler("relatorio", relatorio_start)],
        states={
            REPORT_START: [MessageHandler(filters.TEXT & ~filters.COMMAND, relatorio_start_received)],
            REPORT_END: [MessageHandler(filters.TEXT & ~filters.COMMAND, relatorio_end_received)]
        },
        fallbacks=[CommandHandler("cancel", relatorio_cancel)]
    )
    application.add_handler(relatorio_conv_handler)
    
    # Handler para Histórico (Detalhado)
    historico_conv_handler = ConversationHandler(
        entry_points=[CommandHandler("historico", historico_conv_start)],
        states={
            HIST_START: [MessageHandler(filters.TEXT & ~filters.COMMAND, historico_conv_start_received)],
            HIST_END: [MessageHandler(filters.TEXT & ~filters.COMMAND, historico_conv_end_received)]
        },
        fallbacks=[CommandHandler("cancel", historico_conv_cancel)]
    )
    application.add_handler(historico_conv_handler)
    
    # Handler para Follow-up
    followup_conv_handler = ConversationHandler(
        entry_points=[CommandHandler("followup", followup_start)],
        states={
            FOLLOWUP_CLIENT: [MessageHandler(filters.TEXT & ~filters.COMMAND, followup_client)],
            FOLLOWUP_DATE: [MessageHandler(filters.TEXT & ~filters.COMMAND, followup_date)],
            FOLLOWUP_DESCRIPTION: [MessageHandler(filters.TEXT & ~filters.COMMAND, followup_description)]
        },
        fallbacks=[CommandHandler("cancel", followup_cancel)]
    )
    application.add_handler(followup_conv_handler)
    
    # Handler para Visita
    visita_conv_handler = ConversationHandler(
        entry_points=[CommandHandler("visita", visita_start)],
        states={
            VISIT_COMPANY: [MessageHandler(filters.TEXT & ~filters.COMMAND, visita_company)],
            VISIT_DATE: [MessageHandler(filters.TEXT & ~filters.COMMAND, visita_date)],
            VISIT_CATEGORY: [CallbackQueryHandler(visita_category_callback)],
            VISIT_MOTIVE: [MessageHandler(filters.TEXT & ~filters.COMMAND, visita_motive)],
            VISIT_FOLLOWUP_CHOICE: [MessageHandler(filters.TEXT & ~filters.COMMAND, visita_followup_choice)],
            VISIT_FOLLOWUP_DATE: [MessageHandler(filters.TEXT & ~filters.COMMAND, visita_followup_date)]
        },
        fallbacks=[CommandHandler("cancel", visita_cancel)]
    )
    application.add_handler(visita_conv_handler)
    
    # Handler para Interação
    interacao_conv_handler = ConversationHandler(
        entry_points=[CommandHandler("interacao", interacao_start)],
        states={
            INTER_CLIENT: [MessageHandler(filters.TEXT & ~filters.COMMAND, interacao_client)],
            INTER_SUMMARY: [MessageHandler(filters.TEXT & ~filters.COMMAND, interacao_summary)],
            INTER_FOLLOWUP_CHOICE: [MessageHandler(filters.TEXT & ~filters.COMMAND, interacao_followup_choice)],
            INTER_FOLLOWUP_DATE: [MessageHandler(filters.TEXT & ~filters.COMMAND, interacao_followup_date)]
        },
        fallbacks=[CommandHandler("cancel", interacao_cancel)]
    )
    application.add_handler(interacao_conv_handler)
    
    # Handler para Lembrete
    lembrete_conv_handler = ConversationHandler(
        entry_points=[CommandHandler("lembrete", lembrete_start)],
        states={
            REMINDER_TEXT: [MessageHandler(filters.TEXT & ~filters.COMMAND, lembrete_text)],
            REMINDER_DATETIME: [MessageHandler(filters.TEXT & ~filters.COMMAND, lembrete_datetime)]
        },
        fallbacks=[CommandHandler("cancel", lembrete_cancel)]
    )
    application.add_handler(lembrete_conv_handler)
    
    # Handler para confirmar Follow-up via Botão Inline
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
    await asyncio.sleep(1)  # Aguarda a remoção do webhook
    try:
        await application.run_polling(drop_pending_updates=True)
    except Exception as e:
        logger.error("Erro durante polling: %s", e)

if __name__ == '__main__':
    asyncio.run(main())