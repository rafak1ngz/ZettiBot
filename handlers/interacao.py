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
from database import db
from datetime import datetime

# Estados
INTERACAO_TIPO, INTERACAO_CLIENTE, INTERACAO_DATA, INTERACAO_DETALHES = range(4)

# Logger
logger = logging.getLogger(__name__)

async def interacao_start(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    logger.info("Iniciando /interacao para chat_id %s", update.effective_chat.id)
    keyboard = [
        [
            InlineKeyboardButton("📞 Ligação", callback_data="tipo_ligacao"),
            InlineKeyboardButton("📧 E-mail", callback_data="tipo_email"),
            InlineKeyboardButton("🤝 Reunião", callback_data="tipo_reuniao"),
        ]
    ]
    reply_markup = InlineKeyboardMarkup(keyboard)
    await update.message.reply_text(
        "💬 Qual o tipo de interação?",
        parse_mode="Markdown",
        reply_markup=reply_markup
    )
    return INTERACAO_TIPO

async def interacao_tipo(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    query = update.callback_query
    await query.answer()
    tipo_map = {
        "tipo_ligacao": "Ligação",
        "tipo_email": "E-mail",
        "tipo_reuniao": "Reunião"
    }
    context.user_data["interacao_tipo"] = tipo_map.get(query.data, "Desconhecido")
    logger.info("Tipo de interação recebido: %s", context.user_data["interacao_tipo"])
    await query.message.reply_text(
        "🏢 Qual o cliente?",
        parse_mode="Markdown"
    )
    return INTERACAO_CLIENTE

async def interacao_cliente(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    context.user_data["interacao_cliente"] = update.message.text.strip()
    logger.info("Cliente recebido: %s", context.user_data["interacao_cliente"])
    await update.message.reply_text(
        "📅 Qual a data da interação? (Ex.: 12/04/2025)",
        parse_mode="Markdown"
    )
    return INTERACAO_DATA

async def interacao_data(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    data_texto = update.message.text.strip()
    try:
        data = datetime.strptime(data_texto, "%d/%m/%Y")
        context.user_data["interacao_data"] = data.strftime("%Y-%m-%d")
        logger.info("Data recebida: %s", context.user_data["interacao_data"])
        await update.message.reply_text(
            "📝 Quais os detalhes da interação?",
            parse_mode="Markdown"
        )
        return INTERACAO_DETALHES
    except ValueError:
        logger.warning("Data inválida: %s", data_texto)
        await update.message.reply_text(
            "😅 Formato de data inválido. Tenta no formato DD/MM/YYYY, tipo '12/04/2025'.",
            parse_mode="Markdown"
        )
        return INTERACAO_DATA

async def interacao_detalhes(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    context.user_data["interacao_detalhes"] = update.message.text.strip()
    logger.info("Detalhes recebidos: %s", context.user_data["interacao_detalhes"])
    chat_id = str(update.effective_chat.id)
    interacao_data = {
        "tipo": context.user_data["interacao_tipo"],
        "cliente": context.user_data["interacao_cliente"],
        "data_interacao": context.user_data["interacao_data"],
        "detalhes": context.user_data["interacao_detalhes"],
        "timestamp": datetime.now().timestamp()
    }
    try:
        db.collection("users").document(chat_id).collection("interacoes").document().set(interacao_data)
        logger.info("Interação salva para chat_id %s: %s", chat_id, interacao_data["cliente"])
        await update.message.reply_text(
            "💬 Interação salva com sucesso!",
            parse_mode="Markdown"
        )
    except Exception as e:
        logger.error("Erro ao salvar interação: %s", e)
        await update.message.reply_text(
            "😅 Deu um erro ao salvar a interação. Tenta de novo?",
            parse_mode="Markdown"
        )
    return ConversationHandler.END

async def interacao_cancel(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    logger.info("Interação cancelada para chat_id %s", update.effective_chat.id)
    await update.message.reply_text(
        "💬 Beleza, interação cancelada! Qualquer coisa, é só chamar.",
        parse_mode="Markdown"
    )
    return ConversationHandler.END

def setup_handlers(app: Application) -> None:
    """Configura os handlers do módulo."""
    interacao_conv = ConversationHandler(
        entry_points=[CommandHandler("interacao", interacao_start)],
        states={
            INTERACAO_TIPO: [
                CallbackQueryHandler(interacao_tipo, pattern="^tipo_(ligacao|email|reuniao)$")
            ],
            INTERACAO_CLIENTE: [MessageHandler(filters.TEXT & ~filters.COMMAND, interacao_cliente)],
            INTERACAO_DATA: [MessageHandler(filters.TEXT & ~filters.COMMAND, interacao_data)],
            INTERACAO_DETALHES: [MessageHandler(filters.TEXT & ~filters.COMMAND, interacao_detalhes)],
        },
        fallbacks=[CommandHandler("cancelar", interacao_cancel)],
        conversation_timeout=300
    )
    app.add_handler(interacao_conv)
    logger.info("Handler de /interacao configurado")