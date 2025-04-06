import os
import json
import logging
import asyncio
import nest_asyncio
import sys
from datetime import datetime, timedelta, time
from zoneinfo import ZoneInfo  # Disponível a partir do Python 3.9
import tempfile
import matplotlib.pyplot as plt  # Dependência via requirements.txt

# Define o fuso horário desejado
TIMEZONE = ZoneInfo("America/Sao_Paulo")

# Aplica o patch no nest_asyncio
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

# ----- Estados para os fluxos já existentes -----
# Follow-up (0 a 2)
FOLLOWUP_CLIENT, FOLLOWUP_DATE, FOLLOWUP_DESCRIPTION = range(3)
# Visita (0 a 5)
VISIT_COMPANY, VISIT_DATE, VISIT_CATEGORY, VISIT_MOTIVE, VISIT_FOLLOWUP_CHOICE, VISIT_FOLLOWUP_DATE = range(6)
# Interação (0 a 3)
INTER_CLIENT, INTER_SUMMARY, INTER_FOLLOWUP_CHOICE, INTER_FOLLOWUP_DATE = range(4)
# Lembrete (100 a 101)
REMINDER_TEXT, REMINDER_DATETIME = range(100, 102)
# Relatório (Resumido) (300 a 301)
REPORT_START, REPORT_END = range(300, 302)
# Histórico (Detalhado) (400 a 401)
HIST_START, HIST_END = range(400, 402)

# ----- Estados para Edição (500 a 503) -----
EDIT_CATEGORY, EDIT_RECORD, EDIT_FIELD, EDIT_NEW_VALUE = range(500, 504)
# ----- Estados para Exclusão (600 a 602) -----
DELETE_CATEGORY, DELETE_RECORD, DELETE_CONFIRMATION = range(600, 603)
# ----- Estados para Filtragem (700 a 702) -----
FILTER_CATEGORY, FILTER_FIELD, FILTER_VALUE = range(700, 703)

# ------------------------------------------------------------------------------
# Função para Gerar Gráfico com Matplotlib
# ------------------------------------------------------------------------------
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

# ------------------------------------------------------------------------------
# Comando /inicio – Mensagem de Boas‑Vindas
# ------------------------------------------------------------------------------
async def inicio(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    msg = ("Olá! Seja bem‑vindo ao bot de gerenciamento.\n"
           "Para saber mais sobre as funções disponíveis, envie /ajuda.\n"
           "Comandos úteis:\n"
           "• /followup – Registrar um follow‑up\n"
           "• /visita – Registrar uma visita\n"
           "• /interacao – Registrar uma interação\n"
           "• /lembrete – Agendar um lembrete\n"
           "• /relatorio – Gerar um relatório resumido\n"
           "• /historico – Consultar o histórico detalhado\n"
           "• /editar – Editar um registro\n"
           "• /excluir – Excluir um registro\n"
           "• /filtrar – Filtrar registros\n")
    await update.message.reply_text(msg)
    logger.info("Comando /inicio executado.")

# ------------------------------------------------------------------------------
# Comando /ajuda – Informações sobre o Bot e suas funções
# ------------------------------------------------------------------------------
async def ajuda(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    msg = ("*Ajuda - Informações do Bot*\n\n"
           "Este bot permite gerenciar registros de follow‑ups, visitas e interações, agendar lembretes e gerar relatórios.\n\n"
           "*Comandos disponíveis:*\n"
           "• /inicio – Mensagem de boas‑vindas\n"
           "• /ajuda – Exibe esta mensagem de ajuda\n"
           "• /followup – Registrar um follow‑up\n"
           "• /visita – Registrar uma visita\n"
           "• /interacao – Registrar uma interação\n"
           "• /lembrete – Agendar um lembrete\n"
           "• /relatorio – Gerar um relatório resumido com gráfico\n"
           "• /historico – Consultar o histórico detalhado\n"
           "• /editar – Editar um registro\n"
           "• /excluir – Excluir um registro\n"
           "• /filtrar – Filtrar registros\n\n"
           "Para cancelar um fluxo, use /cancelar.\n"
           "Se enviar uma mensagem fora de um fluxo, você receberá esta orientação.")
    await update.message.reply_text(msg, parse_mode="Markdown")

# ------------------------------------------------------------------------------
# Handler para Mensagens Fora de Fluxo
# ------------------------------------------------------------------------------
async def mensagem_default(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    await update.message.reply_text("Olá! Para começar, envie /inicio ou /ajuda.")

# ------------------------------------------------------------------------------
# (Fluxos de Follow-up, Visita, Interação, Lembrete, Relatório e Histórico)
# – Utilizamos os mesmos fluxos já definidos anteriormente
# Para este exemplo, os fluxos de followup, visita, interacao, lembrete, relatorio e historico
# permanecem os mesmos conforme fornecidos anteriormente. Seguem os exemplares com o comando de fallback /cancelar.
# ------------------------------------------------------------------------------
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
        db.collection("users").document(chat_id).collection("followups").document().set({
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
        [InlineKeyboardButton("Followup", callback_data="Potencial Cliente"),
         InlineKeyboardButton("Visita Ativa", callback_data="Cliente Ativo")],
        [InlineKeyboardButton("Visita Inativa", callback_data="Cliente Inativo"),
         InlineKeyboardButton("Novo Cliente", callback_data="Cliente Novo")],
        [InlineKeyboardButton("Aluguel", callback_data="Cliente de Aluguel"),
         InlineKeyboardButton("Venda", callback_data="Cliente de Venda")],
        [InlineKeyboardButton("Manutenção", callback_data="Cliente de Manutenção")],
        [InlineKeyboardButton("Negociação", callback_data="Cliente em Negociação")],
        [InlineKeyboardButton("Perdido", callback_data="Cliente Perdido")],
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
    await update.message.reply_text("Deseja agendar follow-up para a visita? (Sim/Não)",
                                    reply_markup=ReplyKeyboardMarkup(reply_keyboard, one_time_keyboard=True, resize_keyboard=True))
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

# Fluxo de Relatório (Resumido) com Gráfico
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

# Fluxo de Histórico (Detalhado)
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

# Fluxo de Edição de Registros
async def editar_start(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    options = [[
        InlineKeyboardButton("Followup", callback_data="edit_followup"),
        InlineKeyboardButton("Visita", callback_data="edit_visita"),
        InlineKeyboardButton("Interacao", callback_data="edit_interacao")
    ]]
    reply_markup = InlineKeyboardMarkup(options)
    await update.message.reply_text("❓ *Edição*: Escolha a categoria para editar:", reply_markup=reply_markup, parse_mode="Markdown")
    return EDIT_CATEGORY
async def editar_category_callback(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    query = update.callback_query
    await query.answer()
    data = query.data
    if data == "edit_followup":
        context.user_data["edit_category"] = "followup"
    elif data == "edit_visita":
        context.user_data["edit_category"] = "visita"
    elif data == "edit_interacao":
        context.user_data["edit_category"] = "interacao"
    else:
        await query.edit_message_text("Categoria inválida!")
        return ConversationHandler.END
    chat_id = str(query.message.chat.id)
    if context.user_data["edit_category"] == "followup":
        col = db.collection("users").document(chat_id).collection("followups")
    elif context.user_data["edit_category"] == "visita":
        col = db.collection("users").document(chat_id).collection("visitas")
    else:
        col = db.collection("users").document(chat_id).collection("interacoes")
    docs = list(col.stream())
    if not docs:
        await query.edit_message_text(f"Não foram encontrados registros para a categoria {context.user_data['edit_category']}.")
        return ConversationHandler.END
    msg = f"*Registros de {context.user_data['edit_category']}:*\n"
    for doc in docs:
        msg += f"ID: {doc.id} - {doc.to_dict()}\n"
    await query.edit_message_text(msg, parse_mode="Markdown")
    await query.message.reply_text("Digite o ID do registro que deseja editar:")
    return EDIT_RECORD
async def editar_record_received(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    record_id = update.message.text.strip()
    context.user_data["edit_record_id"] = record_id
    await update.message.reply_text("Qual campo deseja editar? (Exemplos: followup: cliente, data_follow, descricao, status; visita: empresa, data_visita, classificacao, motivo, followup; interacao: cliente, resumo, followup)", parse_mode="Markdown")
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

# Fluxo de Exclusão de Registros
async def excluir_start(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    options = [[
        InlineKeyboardButton("Followup", callback_data="delete_followup"),
        InlineKeyboardButton("Visita", callback_data="delete_visita"),
        InlineKeyboardButton("Interacao", callback_data="delete_interacao")
    ]]
    reply_markup = InlineKeyboardMarkup(options)
    await update.message.reply_text("❓ *Exclusão*: Escolha a categoria para excluir:", reply_markup=reply_markup, parse_mode="Markdown")
    return DELETE_CATEGORY
async def excluir_category_callback(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    query = update.callback_query
    await query.answer()
    data = query.data
    if data == "delete_followup":
        context.user_data["delete_category"] = "followup"
    elif data == "delete_visita":
        context.user_data["delete_category"] = "visita"
    elif data == "delete_interacao":
        context.user_data["delete_category"] = "interacao"
    else:
        await query.edit_message_text("Categoria inválida!")
        return ConversationHandler.END
    chat_id = str(query.message.chat.id)
    if context.user_data["delete_category"] == "followup":
        col = db.collection("users").document(chat_id).collection("followups")
    elif context.user_data["delete_category"] == "visita":
        col = db.collection("users").document(chat_id).collection("visitas")
    else:
        col = db.collection("users").document(chat_id).collection("interacoes")
    docs = list(col.stream())
    if not docs:
        await query.edit_message_text(f"Não foram encontrados registros para a categoria {context.user_data['delete_category']}.")
        return ConversationHandler.END
    msg = f"*Registros de {context.user_data['delete_category']}:*\n"
    for doc in docs:
        msg += f"ID: {doc.id} - {doc.to_dict()}\n"
    await query.edit_message_text(msg, parse_mode="Markdown")
    await query.message.reply_text("Digite o ID do registro que deseja excluir:")
    return DELETE_RECORD
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

# Fluxo de Filtragem/Pesquisa de Registros
async def filtrar_start(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    options = [[
        InlineKeyboardButton("Followup", callback_data="filter_followup"),
        InlineKeyboardButton("Visita", callback_data="filter_visita"),
        InlineKeyboardButton("Interacao", callback_data="filter_interacao")
    ]]
    reply_markup = InlineKeyboardMarkup(options)
    await update.message.reply_text("🔍 *Filtragem*: Escolha a categoria para filtrar:", reply_markup=reply_markup, parse_mode="Markdown")
    return FILTER_CATEGORY
async def filtrar_category_callback(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    query = update.callback_query
    await query.answer()
    data = query.data
    if data == "filter_followup":
        context.user_data["filter_category"] = "followup"
    elif data == "filter_visita":
        context.user_data["filter_category"] = "visita"
    elif data == "filter_interacao":
        context.user_data["filter_category"] = "interacao"
    else:
        await query.edit_message_text("Categoria inválida!")
        return ConversationHandler.END
    await query.edit_message_text("Qual campo deseja utilizar para filtrar? (Ex.: followup: cliente, data_follow, status; visita: empresa, data_visita, classificacao, motivo; interacao: cliente, resumo, followup)")
    return FILTER_FIELD
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

# Jobs Diários e Callback Inline para Confirmação de Follow-up
async def daily_reminder_callback(context: ContextTypes.DEFAULT_TYPE) -> None:
    try:
        today = datetime.now(TIMEZONE).date().isoformat()
        docs = db.collection_group("followups").where("data_follow", "==", today).where("status", "==", "pendente").stream()
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

    # Comandos Básicos
    application.add_handler(CommandHandler("inicio", inicio))
    application.add_handler(CommandHandler("ajuda", ajuda))
    application.add_handler(CommandHandler("testfirebase", testfirebase))
    
    # Handler default para mensagens fora do fluxo
    application.add_handler(MessageHandler(filters.TEXT & ~filters.COMMAND, mensagem_default))

    # Handler para Relatório (Resumido) com Gráfico
    relatorio_conv_handler = ConversationHandler(
        entry_points=[CommandHandler("relatorio", relatorio_start)],
        states={
            REPORT_START: [MessageHandler(filters.TEXT & ~filters.COMMAND, relatorio_start_received)],
            REPORT_END: [MessageHandler(filters.TEXT & ~filters.COMMAND, relatorio_end_received)]
        },
        fallbacks=[CommandHandler("cancelar", relatorio_cancel)]
    )
    application.add_handler(relatorio_conv_handler)

    # Handler para Histórico (Detalhado)
    historico_conv_handler = ConversationHandler(
        entry_points=[CommandHandler("historico", historico_conv_start)],
        states={
            HIST_START: [MessageHandler(filters.TEXT & ~filters.COMMAND, historico_conv_start_received)],
            HIST_END: [MessageHandler(filters.TEXT & ~filters.COMMAND, historico_conv_end_received)]
        },
        fallbacks=[CommandHandler("cancelar", historico_conv_cancel)]
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
        fallbacks=[CommandHandler("cancelar", followup_cancel)]
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
        fallbacks=[CommandHandler("cancelar", visita_cancel)]
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
        fallbacks=[CommandHandler("cancelar", interacao_cancel)]
    )
    application.add_handler(interacao_conv_handler)

    # Handler para Lembrete
    lembrete_conv_handler = ConversationHandler(
        entry_points=[CommandHandler("lembrete", lembrete_start)],
        states={
            REMINDER_TEXT: [MessageHandler(filters.TEXT & ~filters.COMMAND, lembrete_text)],
            REMINDER_DATETIME: [MessageHandler(filters.TEXT & ~filters.COMMAND, lembrete_datetime)]
        },
        fallbacks=[CommandHandler("cancelar", lembrete_cancel)]
    )
    application.add_handler(lembrete_conv_handler)

    # Handler para Edição de Registros
    editar_conv_handler = ConversationHandler(
        entry_points=[CommandHandler("editar", editar_start)],
        states={
            EDIT_CATEGORY: [CallbackQueryHandler(editar_category_callback, pattern="^edit_")],
            EDIT_RECORD: [MessageHandler(filters.TEXT & ~filters.COMMAND, editar_record_received)],
            EDIT_FIELD: [MessageHandler(filters.TEXT & ~filters.COMMAND, editar_field_received)],
            EDIT_NEW_VALUE: [MessageHandler(filters.TEXT & ~filters.COMMAND, editar_new_value_received)]
        },
        fallbacks=[CommandHandler("cancelar", editar_cancel)]
    )
    application.add_handler(editar_conv_handler)

    # Handler para Exclusão de Registros
    excluir_conv_handler = ConversationHandler(
        entry_points=[CommandHandler("excluir", excluir_start)],
        states={
            DELETE_CATEGORY: [CallbackQueryHandler(excluir_category_callback, pattern="^delete_")],
            DELETE_RECORD: [MessageHandler(filters.TEXT & ~filters.COMMAND, excluir_record_received)],
            DELETE_CONFIRMATION: [MessageHandler(filters.TEXT & ~filters.COMMAND, excluir_confirmation_received)]
        },
        fallbacks=[CommandHandler("cancelar", excluir_cancel)]
    )
    application.add_handler(excluir_conv_handler)

    # Handler para Filtragem de Registros
    filtrar_conv_handler = ConversationHandler(
        entry_points=[CommandHandler("filtrar", filtrar_start)],
        states={
            FILTER_CATEGORY: [CallbackQueryHandler(filtrar_category_callback, pattern="^filter_")],
            FILTER_FIELD: [MessageHandler(filters.TEXT & ~filters.COMMAND, filtrar_field_received)],
            FILTER_VALUE: [MessageHandler(filters.TEXT & ~filters.COMMAND, filtrar_value_received)]
        },
        fallbacks=[CommandHandler("cancelar", filtrar_cancel)]
    )
    application.add_handler(filtrar_conv_handler)

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
    await asyncio.sleep(1)
    try:
        await application.run_polling(drop_pending_updates=True)
    except Exception as e:
        logger.error("Erro durante polling: %s", e)

if __name__ == '__main__':
    asyncio.run(main())