from telegram import Update
from telegram.ext import ContextTypes
from config import *
from database import save_followup
from datetime import datetime

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
        save_followup(chat_id, {
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