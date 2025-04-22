import logging
from telegram import Update, InlineKeyboardButton, InlineKeyboardMarkup
from telegram.ext import (
    Application,
    CommandHandler,
    ContextTypes,
    ConversationHandler,
    MessageHandler,
    CallbackQueryHandler,
    filters,
)
from config import TIMEZONE
from database import db
from datetime import datetime

# Estados
VISIT_COMPANY, VISIT_DATE, VISIT_MOTIVE, VISIT_FOLLOWUP_CHOICE, VISIT_FOLLOWUP_DATE, VISIT_FOLLOWUP_MOTIVO = range(6)

# Logger
logger = logging.getLogger(__name__)

async def visita_start(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    logger.info("Iniciando /visita para chat_id %s", update.effective_chat.id)
    await update.message.reply_text(
        "🏢 Show, qual empresa você visitou?",
        parse_mode="Markdown"
    )
    return VISIT_COMPANY

async def visita_company(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    context.user_data["visita_empresa"] = update.message.text.strip()
    logger.info("Empresa recebida: %s", context.user_data["visita_empresa"])
    await update.message.reply_text(
        "📅 Qual a data da visita? (Ex.: 12/04/2025)",
        parse_mode="Markdown"
    )
    return VISIT_DATE

async def visita_date(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    data_texto = update.message.text.strip()
    try:
        data = datetime.strptime(data_texto, "%d/%m/%Y")
        context.user_data["visita_data"] = data.strftime("%Y-%m-%d")
        logger.info("Data recebida: %s", context.user_data["visita_data"])
        await update.message.reply_text(
            "📋 Qual foi o motivo da visita?",
            parse_mode="Markdown"
        )
        return VISIT_MOTIVE
    except ValueError:
        logger.warning("Data inválida: %s", data_texto)
        await update.message.reply_text(
            "😅 Formato de data inválido. Tenta no formato DD/MM/YYYY, tipo '12/04/2025'.",
            parse_mode="Markdown"
        )
        return VISIT_DATE

async def visita_motive(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    context.user_data["visita_motivo"] = update.message.text.strip()
    logger.info("Motivo recebido: %s", context.user_data["visita_motivo"])
    
    # Criar botões
    keyboard = [
        [
            InlineKeyboardButton("✅ Sim", callback_data="followup_yes"),
            InlineKeyboardButton("❌ Não", callback_data="followup_no"),
        ]
    ]
    reply_markup = InlineKeyboardMarkup(keyboard)
    
    await update.message.reply_text(
        "🚀 Quer agendar um follow-up? (Sim/Não)",
        parse_mode="Markdown",
        reply_markup=reply_markup
    )
    return VISIT_FOLLOWUP_CHOICE

async def visita_followup_callback(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    query = update.callback_query
    await query.answer()
    
    escolha = query.data
    logger.info("Escolha de follow-up via botão: %s", escolha)
    
    if escolha == "followup_yes":
        await query.message.reply_text(
            "📅 Qual a data do follow-up? (Ex.: 15/04/2025)",
            parse_mode="Markdown"
        )
        return VISIT_FOLLOWUP_DATE
    elif escolha == "followup_no":
        chat_id = str(update.effective_chat.id)
        visita_data = {
            "empresa": context.user_data["visita_empresa"],
            "endereco": "",
            "telefone": "",
            "data_visita": context.user_data["visita_data"],
            "motivo": context.user_data["visita_motivo"],
            "timestamp": datetime.now().timestamp()
        }
        try:
            db.collection("users").document(chat_id).collection("visitas").document().set(visita_data)
            logger.info("Visita salva para chat_id %s: %s", chat_id, visita_data["empresa"])
            await query.message.reply_text(
                "🏢 Visita salva com sucesso!",
                parse_mode="Markdown"
            )
        except Exception as e:
            logger.error("Erro ao salvar visita: %s", e)
            await query.message.reply_text(
                "😅 Deu um erro ao salvar a visita. Tenta de novo?",
                parse_mode="Markdown"
            )
        return ConversationHandler.END
    else:
        logger.warning("Callback inválido: %s", escolha)
        return VISIT_FOLLOWUP_CHOICE

async def visita_followup_date(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    data_texto = update.message.text.strip()
    try:
        data = datetime.strptime(data_texto, "%d/%m/%Y")
        context.user_data["followup_data"] = data.strftime("%Y-%m-%d")
        logger.info("Data de follow-up recebida: %s", context.user_data["followup_data"])
        await update.message.reply_text(
            "📋 Qual o motivo do follow-up?",
            parse_mode="Markdown"
        )
        return VISIT_FOLLOWUP_MOTIVO
    except ValueError:
        logger.warning("Data de follow-up inválida: %s", data_texto)
        await update.message.reply_text(
            "😅 Formato de data inválido. Tenta no formato DD/MM/YYYY, tipo '15/04/2025'.",
            parse_mode="Markdown"
        )
        return VISIT_FOLLOWUP_DATE

async def visita_followup_motivo(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    context.user_data["followup_motivo"] = update.message.text.strip()
    logger.info("Motivo de follow-up recebido: %s", context.user_data["followup_motivo"])
    chat_id = str(update.effective_chat.id)
    
    visita_data = {
        "empresa": context.user_data["visita_empresa"],
        "endereco": "",
        "telefone": "",
        "data_visita": context.user_data["visita_data"],
        "motivo": context.user_data["visita_motivo"],
        "timestamp": datetime.now().timestamp()
    }
    followup_data = {
        "cliente": context.user_data["visita_empresa"],
        "data_follow": context.user_data["followup_data"],
        "motivo": context.user_data["followup_motivo"],
        "timestamp": datetime.now().timestamp()
    }
    
    try:
        logger.debug("TIMEZONE configurado: %s", TIMEZONE)
        db.collection("users").document(chat_id).collection("visitas").document().set(visita_data)
        db.collection("users").document(chat_id).collection("followups").document().set(followup_data)
        logger.info(
            "Visita e follow-up salvos para chat_id %s: %s",
            chat_id,
            visita_data["empresa"]
        )
        await update.message.reply_text(
            "🚀 Visita e follow-up salvos direitinho!",
            parse_mode="Markdown"
        )
    except Exception as e:
        logger.error("Erro ao salvar visita/follow-up: %s", e)
        await update.message.reply_text(
            "😅 Deu um erro ao salvar a visita. Tenta de novo?",
            parse_mode="Markdown"
        )
    return ConversationHandler.END

async def visita_cancel(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    logger.info("Visita cancelada para chat_id %s", update.effective_chat.id)
    await update.message.reply_text(
        "🏢 Beleza, visita cancelada! Qualquer coisa, é só chamar.",
        parse_mode="Markdown"
    )
    return ConversationHandler.END

def setup_handlers(app: Application) -> None:
    """Configura os handlers do módulo."""
    visita_conv = ConversationHandler(
        entry_points=[CommandHandler("visita", visita_start)],
        states={
            VISIT_COMPANY: [MessageHandler(filters.TEXT & ~filters.COMMAND, visita_company)],
            VISIT_DATE: [MessageHandler(filters.TEXT & ~filters.COMMAND, visita_date)],
            VISIT_MOTIVE: [MessageHandler(filters.TEXT & ~filters.COMMAND, visita_motive)],
            VISIT_FOLLOWUP_CHOICE: [
                CallbackQueryHandler(visita_followup_callback, pattern="^followup_(yes|no)$")
            ],
            VISIT_FOLLOWUP_DATE: [
                MessageHandler(filters.TEXT & ~filters.COMMAND, visita_followup_date)
            ],
            VISIT_FOLLOWUP_MOTIVO: [
                MessageHandler(filters.TEXT & ~filters.COMMAND, visita_followup_motivo)
            ],
        },
        fallbacks=[CommandHandler("cancelar", visita_cancel)],
        conversation_timeout=300
    )
    app.add_handler(visita_conv)
    logger.info("Handler de /visita configurado")