import os
import json
import logging
import asyncio
import nest_asyncio
import sys
from datetime import datetime, timedelta, time

# Aplica o patch do nest_asyncio (útil em ambientes com event loop já ativo)
nest_asyncio.apply()

# ------------------------------------------------------------------------------
# Configuração personalizada de Logging para envio para stdout
# ------------------------------------------------------------------------------
logger = logging.getLogger()
logger.setLevel(logging.INFO)
for handler in logger.handlers[:]:
    logger.removeHandler(handler)
console_handler = logging.StreamHandler(sys.stdout)
console_handler.setLevel(logging.INFO)
formatter = logging.Formatter("%(asctime)s - %(name)s - %(levelname)s - %(message)s")
console_handler.setFormatter(formatter)
logger.addHandler(console_handler)
logging.getLogger("httpx").setLevel(logging.WARNING)
logging.getLogger("telegram.ext").setLevel(logging.WARNING)

# ------------------------------------------------------------------------------
# Inicialização do Firebase
# ------------------------------------------------------------------------------
import firebase_admin
from firebase_admin import credentials, firestore

firebase_credentials = os.environ.get("FIREBASE_CREDENTIALS")
if not firebase_credentials:
    logger.error("Variável de ambiente FIREBASE_CREDENTIALS não definida!")
    exit(1)
try:
    cred_dict = json.loads(firebase_credentials)
except json.JSONDecodeError as error:
    logger.error("Erro ao decodificar FIREBASE_CREDENTIALS: %s", error)
    exit(1)
cred = credentials.Certificate(cred_dict)
firebase_admin.initialize_app(cred)
db = firestore.client()
logger.info("Firebase inicializado com sucesso!")

# ------------------------------------------------------------------------------
# Integração com o Telegram Bot (API assíncrona)
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
    ConversationHandler,
    MessageHandler,
    CallbackQueryHandler,
    filters,
    ContextTypes
)

# ***** Estados para as conversas *****
# Follow-up
FOLLOWUP_CLIENT, FOLLOWUP_DATE, FOLLOWUP_DESCRIPTION = range(3)

# Visita – incluímos follow-up opcional
VISIT_COMPANY, VISIT_DATE, VISIT_CATEGORY, VISIT_MOTIVE, VISIT_FOLLOWUP_CHOICE, VISIT_FOLLOWUP_DATE = range(6)

# Interação
INTER_CLIENT, INTER_SUMMARY, INTER_FOLLOWUP_CHOICE, INTER_FOLLOWUP_DATE = range(4)

# Lembrete (já implementado)
REMINDER_TEXT, REMINDER_DELAY = 100, 101

# ------------------------------------------------------------------------------
# Funções Básicas e Conversas Interativas
# ------------------------------------------------------------------------------
# Comando /start
async def start(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    await update.message.reply_text("Olá Rafael! 😃 Seu bot está ativo e integrado com o Firebase.")
    logger.info("Comando /start executado.")

# Comando /testfirebase
async def testfirebase(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    try:
        # Exemplificando com um documento de teste na subcoleção do usuário
        chat_id = str(update.message.chat.id)
        db.collection("users").document(chat_id).collection("test").document("hello").set({
            "message": "Teste de integração Firebase!",
            "timestamp": firestore.SERVER_TIMESTAMP
        })
        await update.message.reply_text("Dados enviados com sucesso para o Firebase! ✅")
        logger.info("Comando /testfirebase executado com sucesso.")
    except Exception as error:
        logger.error("Erro ao enviar dados para o Firebase: %s", error)
        await update.message.reply_text("Erro ao enviar dados para o Firebase. 😟")

# ---- Follow-up (conversa) ----
async def followup_start(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    await update.message.reply_text("🤝 *Follow-up*: Qual o nome do cliente?", parse_mode='Markdown')
    return FOLLOWUP_CLIENT

async def followup_client(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    context.user_data["client"] = update.message.text.strip()
    await update.message.reply_text("📅 Informe a data do follow-up (dd/mm/yyyy):")
    return FOLLOWUP_DATE

async def followup_date(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    data_str = update.message.text.strip()
    try:
        data_followup = datetime.strptime(data_str, "%d/%m/%Y").date()
    except ValueError:
        await update.message.reply_text("⚠️ Formato de data inválido! Utilize dd/mm/yyyy. Informe novamente:")
        logger.warning("Formato de data inválido no follow-up.")
        return FOLLOWUP_DATE
    context.user_data["followup_date"] = data_followup.isoformat()
    await update.message.reply_text("📝 Descreva a ação do follow-up (ex.: Ligar para confirmar proposta):")
    return FOLLOWUP_DESCRIPTION

async def followup_description(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    context.user_data["followup_desc"] = update.message.text.strip()
    try:
        chat_id = str(update.message.chat.id)
        # Salva o follow-up na subcoleção de followups do usuário
        db.collection("users").document(chat_id).collection("followups").document().set({
            "cliente": context.user_data["client"],
            "data_follow": context.user_data["followup_date"],
            "descricao": context.user_data["followup_desc"],
            "status": "pendente",
            "chat_id": chat_id,
            "criado_em": datetime.now().isoformat()
        })
        await update.message.reply_text("Follow-up registrado com sucesso! ✅")
        logger.info(f"Follow-up registrado para {context.user_data['client']} na data {context.user_data['followup_date']}.")
    except Exception as e:
        logger.error("Erro ao registrar follow-up: %s", e)
        await update.message.reply_text("Erro ao registrar follow-up: " + str(e))
    return ConversationHandler.END

async def followup_cancel(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    await update.message.reply_text("Registro de follow-up cancelado. ❌")
    logger.info("Conversa de follow-up cancelada pelo usuário.")
    return ConversationHandler.END

# ---- Visita (conversa) ----
async def visita_start(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    await update.message.reply_text("🏢 *Visita*: Qual a empresa visitada?", parse_mode='Markdown')
    return VISIT_COMPANY

async def visita_company(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    context.user_data["company"] = update.message.text.strip()
    await update.message.reply_text("📅 Qual a data da visita? (dd/mm/yyyy)")
    return VISIT_DATE

async def visita_date(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    data_str = update.message.text.strip()
    try:
        data_visita = datetime.strptime(data_str, "%d/%m/%Y").date()
    except ValueError:
        await update.message.reply_text("⚠️ Formato de data inválido! Informe novamente (dd/mm/yyyy):")
        logger.warning("Formato de data inválido no comando /visita.")
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
    await update.message.reply_text("📋 Qual a categoria do cliente? Selecione uma opção:", reply_markup=reply_markup)
    return VISIT_CATEGORY

async def visita_category_callback(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    query = update.callback_query
    await query.answer()
    category = query.data
    context.user_data["category"] = category
    await query.edit_message_text(text=f"✔️ Categoria selecionada: *{category}*\nQual o motivo da visita?", parse_mode='Markdown')
    return VISIT_MOTIVE

async def visita_motive(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    context.user_data["motive"] = update.message.text.strip()
    reply_keyboard = [["Sim", "Não"]]
    await update.message.reply_text(
        "Deseja agendar um follow-up para essa visita? (Sim/Não)",
        reply_markup=ReplyKeyboardMarkup(reply_keyboard, one_time_keyboard=True, resize_keyboard=True)
    )
    return VISIT_FOLLOWUP_CHOICE

async def visita_followup_choice(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    choice = update.message.text.strip().lower()
    if choice == "sim":
        await update.message.reply_text("📅 Informe a data do follow-up (dd/mm/yyyy):", reply_markup=ReplyKeyboardRemove())
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
            logger.info(f"Visita registrada para {context.user_data['company']} na data {context.user_data['visit_date']}.")
        except Exception as e:
            logger.error("Erro ao registrar visita: %s", e)
            await update.message.reply_text("Erro ao registrar visita: " + str(e), reply_markup=ReplyKeyboardRemove())
        return ConversationHandler.END

async def visita_followup_date(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    data_str = update.message.text.strip()
    try:
        data_followup = datetime.strptime(data_str, "%d/%m/%Y").date()
    except ValueError:
        await update.message.reply_text("⚠️ Formato de data inválido! Utilize dd/mm/yyyy. Informe novamente:")
        return VISIT_FOLLOWUP_DATE
    context.user_data["followup_date"] = data_followup.isoformat()
    chat_id = str(update.message.chat.id)
    try:
        # Registra o documento de visita com followup agendado
        db.collection("users").document(chat_id).collection("visitas").document().set({
            "empresa": context.user_data["company"],
            "data_visita": context.user_data["visit_date"],
            "classificacao": context.user_data["category"],
            "motivo": context.user_data["motive"],
            "followup": context.user_data["followup_date"],
            "criado_em": datetime.now().isoformat()
        })
        # Cria também o documento de followup na subcoleção followups do usuário
        db.collection("users").document(chat_id).collection("followups").document().set({
            "cliente": context.user_data["company"],
            "data_follow": context.user_data["followup_date"],
            "descricao": "Follow-up de visita: " + context.user_data["motive"],
            "status": "pendente",
            "chat_id": chat_id,
            "criado_em": datetime.now().isoformat()
        })
        await update.message.reply_text("Visita registrada com follow-up agendado com sucesso! ✅")
        logger.info(f"Visita para {context.user_data['company']} registrada e follow-up agendado para {context.user_data['followup_date']}.")
    except Exception as e:
        logger.error("Erro ao registrar visita com followup: %s", e)
        await update.message.reply_text("Erro ao registrar visita com followup: " + str(e))
    return ConversationHandler.END

async def visita_cancel(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    await update.message.reply_text("Registro de visita cancelado.", reply_markup=ReplyKeyboardRemove())
    logger.info("Conversa de visita cancelada pelo usuário.")
    return ConversationHandler.END

# ---- Interação (conversa) ----
async def interacao_start(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    await update.message.reply_text("💬 *Interação*: Informe o nome do cliente ou empresa com quem você interagiu:", parse_mode='Markdown')
    return INTER_CLIENT

async def interacao_client(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    context.user_data["client_interacao"] = update.message.text.strip()
    await update.message.reply_text("📝 Agora, digite um resumo da interação:")
    return INTER_SUMMARY

async def interacao_summary(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    context.user_data["resumo_interacao"] = update.message.text.strip()
    reply_keyboard = [["Sim", "Não"]]
    await update.message.reply_text(
        "Você deseja agendar um follow-up para essa interação? (Sim/Não)",
        reply_markup=ReplyKeyboardMarkup(reply_keyboard, one_time_keyboard=True, resize_keyboard=True)
    )
    return INTER_FOLLOWUP_CHOICE

async def interacao_followup_choice(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    choice = update.message.text.strip().lower()
    if choice == "sim":
        await update.message.reply_text("📅 Informe a data para o follow-up (dd/mm/yyyy):", reply_markup=ReplyKeyboardRemove())
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
            logger.info(f"Interação registrada para {context.user_data['client_interacao']}.")
        except Exception as e:
            logger.error("Erro ao registrar interação: %s", e)
            await update.message.reply_text("Erro ao registrar interação: " + str(e), reply_markup=ReplyKeyboardRemove())
        return ConversationHandler.END

async def interacao_followup_date(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    data_str = update.message.text.strip()
    try:
        data_follow = datetime.strptime(data_str, "%d/%m/%Y").date()
    except ValueError:
        await update.message.reply_text("⚠️ Formato de data inválido! Utilize dd/mm/yyyy. Informe novamente:")
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
        logger.info(f"Interação registrada para {context.user_data['client_interacao']} com follow-up em {context.user_data['followup_interacao']}.")
    except Exception as e:
        logger.error("Erro ao registrar interação: %s", e)
        await update.message.reply_text("Erro ao registrar interação: " + str(e))
    return ConversationHandler.END

async def interacao_cancel(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    await update.message.reply_text("Registro de interação cancelado.", reply_markup=ReplyKeyboardRemove())
    logger.info("Conversa de interação cancelada pelo usuário.")
    return ConversationHandler.END

# ---- Lembrete (conversa) ----
async def lembrete_start(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    await update.message.reply_text("🔔 *Lembrete*: Por favor, digite o texto do seu lembrete:", parse_mode='Markdown')
    return REMINDER_TEXT

async def lembrete_text(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    context.user_data["lembrete_text"] = update.message.text.strip()
    await update.message.reply_text("⏳ Agora, informe em quantos minutos você deseja receber este lembrete:")
    return REMINDER_DELAY

async def lembrete_delay(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    try:
        delay_minutes = float(update.message.text.strip())
        delay_seconds = int(delay_minutes * 60)
    except ValueError:
        await update.message.reply_text("⚠️ Por favor, insira um número válido de minutos.")
        return REMINDER_DELAY
    chat_id = str(update.message.chat.id)
    lembrete_text = context.user_data["lembrete_text"]
    # Agenda o lembrete na JobQueue (aqui, você pode também salvar no Firestore se quiser histórico)
    context.job_queue.run_once(lembrete_callback, delay_seconds, data={"chat_id": chat_id, "lembrete_text": lembrete_text})
    await update.message.reply_text(f"✅ Lembrete agendado para daqui {delay_minutes:.1f} minuto(s)!", reply_markup=ReplyKeyboardRemove())
    return ConversationHandler.END

async def lembrete_cancel(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    await update.message.reply_text("Agendamento de lembrete cancelado.", reply_markup=ReplyKeyboardRemove())
    return ConversationHandler.END

async def lembrete_callback(context: ContextTypes.DEFAULT_TYPE) -> None:
    job_data = context.job.data
    chat_id = job_data["chat_id"]
    lembrete_text = job_data["lembrete_text"]
    await context.bot.send_message(chat_id=chat_id, text=f"🔔 *Lembrete*: {lembrete_text}", parse_mode='Markdown')

# ---- Histórico: consulta das interações do usuário ----
async def historico(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    if not context.args:
        await update.message.reply_text("Por favor, informe o mês desejado no formato YYYY-MM (ex.: 2025-04).")
        return
    filtro = context.args[0]  # exemplo: "2025-04"
    chat_id = str(update.message.chat.id)
    try:
        docs = db.collection("users").document(chat_id).collection("interacoes").stream()
        resultado = ""
        count = 0
        for doc in docs:
            data = doc.to_dict()
            criado_em = data.get("criado_em", "")
            if criado_em.startswith(filtro):
                count += 1
                cliente = data.get("cliente", "N/A")
                resumo = data.get("resumo", "N/A")
                followup = data.get("followup", "Não agendado")
                resultado += f"• *Cliente*: {cliente}\n  *Resumo*: {resumo}\n  *Follow-up*: {followup}\n\n"
        if count == 0:
            await update.message.reply_text(f"Nenhuma interação encontrada para o período {filtro}.")
        else:
            await update.message.reply_text(f"*{count} interação(ões)* encontrada(s) para {filtro}:\n\n{resultado}", parse_mode='Markdown')
    except Exception as e:
        logger.error("Erro ao recuperar histórico: %s", e)
        await update.message.reply_text("Erro ao recuperar histórico: " + str(e))

# ----- Jobs de Follow-up Automático -----
# Envia lembretes dos follow-ups agendados para hoje aos 08:30 e 13:00
async def daily_reminder_callback(context: ContextTypes.DEFAULT_TYPE) -> None:
    today = datetime.now().date().isoformat()
    # Usamos collection group para buscar em todos os subcoleções "followups"
    docs = db.collection_group("followups").where("data_follow", "==", today).where("status", "==", "pendente").stream()
    for doc in docs:
        data = doc.to_dict()
        # Se o documento contém chat_id, enviamos a mensagem para o respectivo usuário.
        user_chat_id = data.get("chat_id")
        if user_chat_id:
            followup_id = doc.id
            message_text = (
                f"🔔 *Lembrete de Follow-up:*\n"
                f"Cliente: {data.get('cliente')}\n"
                f"Descrição: {data.get('descricao')}\n\n"
                f"Confirme se o contato foi realizado:"
            )
            # callback_data inclui chat_id e doc id
            keyboard = InlineKeyboardMarkup(
                [[InlineKeyboardButton("Confirmar", callback_data=f"confirm_followup:{user_chat_id}:{followup_id}")]]
            )
            await context.bot.send_message(chat_id=user_chat_id, text=message_text, reply_markup=keyboard, parse_mode='Markdown')

# Envia resumo diário às 18:00 e reagenda follow-ups pendentes para o dia seguinte
async def evening_summary_callback(context: ContextTypes.DEFAULT_TYPE) -> None:
    today = datetime.now().date().isoformat()
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
        else:
            pending_items.setdefault(user_chat_id, []).append((doc.id, data))
    # Para cada usuário, envia um resumo e reagenda os pendentes
    tomorrow = (datetime.now().date() + timedelta(days=1)).isoformat()
    for user_chat_id in pending_items.keys():
        pending_count = len(pending_items[user_chat_id])
        confirmed = confirmed_count.get(user_chat_id, 0)
        summary_text = (
            f"📝 *Resumo do dia {today}:*\n\n"
            f"Follow-ups confirmados: {confirmed}\n"
            f"Follow-ups pendentes: {pending_count}\n"
            f"Os pendentes foram reagendados para {tomorrow}."
        )
        await context.bot.send_message(chat_id=user_chat_id, text=summary_text, parse_mode='Markdown')
        # Reagenda os pendentes para amanhã
        for doc_id, data in pending_items[user_chat_id]:
            # Identificar o caminho: users/{chat_id}/followups/{doc_id}
            db.collection("users").document(user_chat_id).collection("followups").document(doc_id).update({"data_follow": tomorrow})

# ----- Callback para confirmar Follow-up via botão inline -----
async def confirm_followup_callback(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    query = update.callback_query
    await query.answer()
    # Formato: "confirm_followup:{chat_id}:{doc_id}"
    try:
        _, user_chat_id, doc_id = query.data.split(":", 2)
        db.collection("users").document(user_chat_id).collection("followups").document(doc_id).update({"status": "realizado"})
        await query.edit_message_text(text="✅ Follow-up confirmado!")
        logger.info(f"Follow-up {doc_id} confirmado para o usuário {user_chat_id}.")
    except Exception as e:
        await query.edit_message_text(text="Erro ao confirmar follow-up.")
        logger.error("Erro ao confirmar follow-up: %s", e)

# ----- Error Handler -----
async def error_handler(update: object, context: ContextTypes.DEFAULT_TYPE) -> None:
    logger.error("Exception while handling an update: %s", context.error)

# ----- Função Principal -----
async def main():
    token = os.environ.get("TELEGRAM_TOKEN")
    if not token:
        logger.error("TELEGRAM_TOKEN não definido!")
        return

    application = ApplicationBuilder().token(token).build()

    # Handlers simples
    application.add_handler(CommandHandler("start", start))
    application.add_handler(CommandHandler("testfirebase", testfirebase))
    application.add_handler(CommandHandler("historico", historico))

    # ConversationHandler para Follow-up
    followup_conv_handler = ConversationHandler(
        entry_points=[CommandHandler("followup", followup_start)],
        states={
            FOLLOWUP_CLIENT: [MessageHandler(filters.TEXT & ~filters.COMMAND, followup_client)],
            FOLLOWUP_DATE: [MessageHandler(filters.TEXT & ~filters.COMMAND, followup_date)],
            FOLLOWUP_DESCRIPTION: [MessageHandler(filters.TEXT & ~filters.COMMAND, followup_description)],
        },
        fallbacks=[CommandHandler("cancel", followup_cancel)],
    )
    application.add_handler(followup_conv_handler)

    # ConversationHandler para Visita
    visita_conv_handler = ConversationHandler(
        entry_points=[CommandHandler("visita", visita_start)],
        states={
            VISIT_COMPANY: [MessageHandler(filters.TEXT & ~filters.COMMAND, visita_company)],
            VISIT_DATE: [MessageHandler(filters.TEXT & ~filters.COMMAND, visita_date)],
            VISIT_CATEGORY: [CallbackQueryHandler(visita_category_callback)],
            VISIT_MOTIVE: [MessageHandler(filters.TEXT & ~filters.COMMAND, visita_motive)],
            VISIT_FOLLOWUP_CHOICE: [MessageHandler(filters.TEXT & ~filters.COMMAND, visita_followup_choice)],
            VISIT_FOLLOWUP_DATE: [MessageHandler(filters.TEXT & ~filters.COMMAND, visita_followup_date)],
        },
        fallbacks=[CommandHandler("cancel", visita_cancel)],
    )
    application.add_handler(visita_conv_handler)

    # ConversationHandler para Interação
    interacao_conv_handler = ConversationHandler(
        entry_points=[CommandHandler("interacao", interacao_start)],
        states={
            INTER_CLIENT: [MessageHandler(filters.TEXT & ~filters.COMMAND, interacao_client)],
            INTER_SUMMARY: [MessageHandler(filters.TEXT & ~filters.COMMAND, interacao_summary)],
            INTER_FOLLOWUP_CHOICE: [MessageHandler(filters.TEXT & ~filters.COMMAND, interacao_followup_choice)],
            INTER_FOLLOWUP_DATE: [MessageHandler(filters.TEXT & ~filters.COMMAND, interacao_followup_date)],
        },
        fallbacks=[CommandHandler("cancel", interacao_cancel)],
    )
    application.add_handler(interacao_conv_handler)

    # ConversationHandler para Lembrete
    lembrete_conv_handler = ConversationHandler(
        entry_points=[CommandHandler("lembrete", lembrete_start)],
        states={
            REMINDER_TEXT: [MessageHandler(filters.TEXT & ~filters.COMMAND, lembrete_text)],
            REMINDER_DELAY: [MessageHandler(filters.TEXT & ~filters.COMMAND, lembrete_delay)],
        },
        fallbacks=[CommandHandler("cancel", lembrete_cancel)],
    )
    application.add_handler(lembrete_conv_handler)

    # Handler para confirmar Follow-up via botão inline
    application.add_handler(CallbackQueryHandler(confirm_followup_callback, pattern=r"^confirm_followup:"))

    application.add_error_handler(error_handler)

    # Agendar os jobs diários na JobQueue
    job_queue = application.job_queue
    # Diário às 08:30 (manhã) e às 13:00 (tarde) enviar lembretes
    job_queue.run_daily(daily_reminder_callback, time=time(8, 30))
    job_queue.run_daily(daily_reminder_callback, time=time(13, 0))
    # Diário às 18:00 enviar resumo e reagendar follow-ups pendentes
    job_queue.run_daily(evening_summary_callback, time=time(18, 0))

    logger.info("Iniciando o bot...")
    await application.bot.delete_webhook(drop_pending_updates=True)
    await application.run_polling(drop_pending_updates=True)

if __name__ == '__main__':
    asyncio.run(main())