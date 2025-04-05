import os
import json
import logging
import asyncio
import nest_asyncio
import sys
from datetime import datetime

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
# Reduz barulho das bibliotecas auxiliares
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
from telegram import Update, InlineKeyboardMarkup, InlineKeyboardButton, ReplyKeyboardMarkup, ReplyKeyboardRemove
from telegram.ext import (
    ApplicationBuilder,
    CommandHandler,
    ConversationHandler,
    MessageHandler,
    CallbackQueryHandler,
    filters,
    ContextTypes
)

# ----- Estados para Follow-up Conversation -----
FOLLOWUP_CLIENT, FOLLOWUP_DATE, FOLLOWUP_DESCRIPTION = range(3)

# ----- Estados para Visita Conversation -----
VISIT_COMPANY, VISIT_DATE, VISIT_CATEGORY, VISIT_MOTIVE = range(4)

# ----- Estados para Interação Conversation -----
INTER_CLIENT, INTER_SUMMARY, INTER_FOLLOWUP_CHOICE, INTER_FOLLOWUP_DATE = range(4)

# -------------------------- Comandos Simples ------------------------------
async def start(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    await update.message.reply_text("Olá Rafael! Seu bot está ativo e integrado com o Firebase.")
    logger.info("Comando /start executado.")

async def testfirebase(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    try:
        doc_ref = db.collection("test").document("hello")
        doc_ref.set({
            "message": "Teste de integração Firebase!",
            "timestamp": firestore.SERVER_TIMESTAMP
        })
        await update.message.reply_text("Dados enviados com sucesso para o Firebase!")
        logger.info("Comando /testfirebase executado com sucesso.")
    except Exception as error:
        logger.error("Erro ao enviar dados para o Firebase: %s", error)
        await update.message.reply_text("Erro ao enviar dados para o Firebase.")

# ------------------ Conversa Interativa: Follow-up -------------------------
async def followup_start(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    await update.message.reply_text("Qual o nome do cliente para o follow-up?")
    return FOLLOWUP_CLIENT

async def followup_client(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    context.user_data["client"] = update.message.text.strip()
    await update.message.reply_text("Informe a data do follow-up (dd/mm/yyyy):")
    return FOLLOWUP_DATE

async def followup_date(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    data_str = update.message.text.strip()
    try:
        data_followup = datetime.strptime(data_str, "%d/%m/%Y").date()
    except ValueError:
        await update.message.reply_text("Formato de data inválido! Utilize dd/mm/yyyy. Por favor, informe novamente a data:")
        logger.warning("Formato de data inválido no follow-up.")
        return FOLLOWUP_DATE
    context.user_data["followup_date"] = data_followup.isoformat()
    await update.message.reply_text("Descreva o follow-up (ex.: Ligar para confirmar proposta):")
    return FOLLOWUP_DESCRIPTION

async def followup_description(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    context.user_data["followup_desc"] = update.message.text.strip()
    try:
        doc_ref = db.collection("followups").document()
        doc_ref.set({
            "cliente": context.user_data["client"],
            "data_follow": context.user_data["followup_date"],
            "descricao": context.user_data["followup_desc"],
            "criado_em": datetime.now().isoformat()
        })
        await update.message.reply_text("Follow-up registrado com sucesso!")
        logger.info(f"Follow-up registrado para {context.user_data['client']} na data {context.user_data['followup_date']}.")
    except Exception as e:
        logger.error("Erro ao registrar follow-up: %s", e)
        await update.message.reply_text("Erro ao registrar follow-up: " + str(e))
    return ConversationHandler.END

async def followup_cancel(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    await update.message.reply_text("Registro de follow-up cancelado.")
    logger.info("Conversa de follow-up cancelada pelo usuário.")
    return ConversationHandler.END

# ------------------ Conversa Interativa: Visita -----------------------------
async def visita_start(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    await update.message.reply_text("Qual a empresa visitada?")
    return VISIT_COMPANY

async def visita_company(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    context.user_data["company"] = update.message.text.strip()
    await update.message.reply_text("Qual a data da visita? (Formato dd/mm/yyyy)")
    return VISIT_DATE

async def visita_date(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    data_str = update.message.text.strip()
    try:
        data_visita = datetime.strptime(data_str, "%d/%m/%Y").date()
    except ValueError:
        await update.message.reply_text("Formato de data inválido! Utilize dd/mm/yyyy. Informe novamente a data:")
        logger.warning("Formato de data inválido no comando /visita.")
        return VISIT_DATE
    context.user_data["visit_date"] = data_visita.isoformat()

    # Cria o teclado inline com opções de categoria
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
    await update.message.reply_text("Qual a categoria do cliente? Selecione uma opção abaixo:", reply_markup=reply_markup)
    return VISIT_CATEGORY

async def visita_category_callback(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    query = update.callback_query
    await query.answer()  # confirma o callback
    category = query.data
    context.user_data["category"] = category
    await query.edit_message_text(text=f"Categoria selecionada: {category}\nQual o motivo da visita?")
    return VISIT_MOTIVE

async def visita_motive(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    context.user_data["motive"] = update.message.text.strip()
    try:
        doc_ref = db.collection("visitas").document()
        doc_ref.set({
            "empresa": context.user_data["company"],
            "data_visita": context.user_data["visit_date"],
            "classificacao": context.user_data["category"],
            "motivo": context.user_data["motive"],
            "criado_em": datetime.now().isoformat()
        })
        await update.message.reply_text("Visita registrada com sucesso!")
        logger.info(f"Visita registrada para {context.user_data['company']} na data {context.user_data['visit_date']}.")
    except Exception as e:
        logger.error("Erro ao registrar visita: %s", e)
        await update.message.reply_text("Erro ao registrar visita: " + str(e))
    return ConversationHandler.END

async def visita_cancel(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    await update.message.reply_text("Registro de visita cancelado.", reply_markup=ReplyKeyboardRemove())
    logger.info("Conversa de visita cancelada pelo usuário.")
    return ConversationHandler.END

# ------------------ Conversa Interativa: Interação --------------------------
async def interacao_start(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    await update.message.reply_text("Digite o nome do cliente ou empresa com quem teve a interação:")
    return INTER_CLIENT

async def interacao_client(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    context.user_data["client_interacao"] = update.message.text.strip()
    await update.message.reply_text("Digite um resumo da interação:")
    return INTER_SUMMARY

async def interacao_summary(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    context.user_data["resumo_interacao"] = update.message.text.strip()
    reply_keyboard = [["Sim", "Não"]]
    await update.message.reply_text(
        "Deseja agendar um follow-up para essa interação? (Sim/Não)",
        reply_markup=ReplyKeyboardMarkup(reply_keyboard, one_time_keyboard=True, resize_keyboard=True)
    )
    return INTER_FOLLOWUP_CHOICE

async def interacao_followup_choice(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    choice = update.message.text.strip().lower()
    if choice == "sim":
        await update.message.reply_text("Informe a data para o follow-up (dd/mm/yyyy):", reply_markup=ReplyKeyboardRemove())
        return INTER_FOLLOWUP_DATE
    else:
        context.user_data["followup_interacao"] = None
        try:
            doc_ref = db.collection("interacoes").document()
            doc_ref.set({
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
        await update.message.reply_text("Formato de data inválido! Utilize dd/mm/yyyy. Informe novamente a data:")
        return INTER_FOLLOWUP_DATE
    context.user_data["followup_interacao"] = data_follow.isoformat()
    try:
        doc_ref = db.collection("interacoes").document()
        doc_ref.set({
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

# ------------------ Comando para Consultar Histórico ----------------------
async def historico(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    if not context.args:
        await update.message.reply_text("Por favor, informe o mês desejado no formato YYYY-MM (ex.: 2025-04).")
        return
    filtro = context.args[0]  # esperado, por exemplo, "2025-04"
    try:
        docs = db.collection("interacoes").stream()
        resultado = ""
        count = 0
        for doc in docs:
            data = doc.to_dict()
            criado_em = data.get("criado_em", "")
            # Como o ISO padrão é "YYYY-MM-DD...", filtramos pelos 7 primeiros caracteres.
            if criado_em.startswith(filtro):
                count += 1
                cliente = data.get("cliente", "N/A")
                resumo = data.get("resumo", "N/A")
                followup = data.get("followup", "Não agendado")
                resultado += f"Cliente: {cliente}\nResumo: {resumo}\nFollow-up: {followup}\n\n"
        if count == 0:
            await update.message.reply_text(f"Nenhuma interação encontrada para o período {filtro}.")
        else:
            await update.message.reply_text(f"{count} interação(ões) encontrada(s) para {filtro}:\n\n{resultado}")
    except Exception as e:
        logger.error("Erro ao recuperar histórico: %s", e)
        await update.message.reply_text("Erro ao recuperar histórico: " + str(e))

# ------------------ Error Handler -----------------------------
async def error_handler(update: object, context: ContextTypes.DEFAULT_TYPE) -> None:
    logger.error("Exception while handling an update: %s", context.error)

# ------------------ Função Principal --------------------------
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

    application.add_error_handler(error_handler)

    logger.info("Iniciando o bot...")
    await application.bot.delete_webhook(drop_pending_updates=True)
    await application.run_polling(drop_pending_updates=True)

if __name__ == '__main__':
    asyncio.run(main())