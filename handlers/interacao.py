import logging
from telegram import Update, InlineKeyboardButton, InlineKeyboardMarkup
from telegram.ext import ContextTypes, ConversationHandler, MessageHandler, CallbackQueryHandler, filters
from config import TIMEZONE, INTERACAO_TIPO, INTERACAO_CLIENTE, INTERACAO_DATA, INTERACAO_DETALHES, INTERACAO_FOLLOWUP_CHOICE, INTERACAO_FOLLOWUP_DATE, INTERACAO_FOLLOWUP_MOTIVO
from database import db
from datetime import datetime

# Logger
logger = logging.getLogger(__name__)

async def interacao_start(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    """Inicia o comando /interacao."""
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
    """Recebe o tipo de interação e pergunta o cliente."""
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
    """Recebe o cliente e pergunta a data da interação."""
    cliente = update.message.text.strip()
    if not cliente:
        logger.warning("Nome do cliente vazio recebido")
        await update.message.reply_text(
            "😅 Por favor, informe o nome do cliente!",
            parse_mode="Markdown"
        )
        return INTERACAO_CLIENTE
    context.user_data["interacao_cliente"] = cliente
    logger.info("Cliente recebido: %s", cliente)
    await update.message.reply_text(
        "📅 Qual a data da interação? (Ex.: 12/04/2025)",
        parse_mode="Markdown"
    )
    return INTERACAO_DATA

async def interacao_data(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    """Recebe a data da interação e pergunta os detalhes."""
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
    """Recebe os detalhes, salva a interação e pergunta sobre follow-up."""
    detalhes = update.message.text.strip()
    if not detalhes:
        logger.warning("Detalhes vazios recebidos")
        await update.message.reply_text(
            "😅 Por favor, informe os detalhes da interação!",
            parse_mode="Markdown"
        )
        return INTERACAO_DETALHES
    context.user_data["interacao_detalhes"] = detalhes
    logger.info("Detalhes recebidos: %s", detalhes)
    
    # Salvar interação no Firebase
    chat_id = str(update.effective_chat.id)
    interacao_data = {
        "tipo": context.user_data["interacao_tipo"],
        "cliente": context.user_data["interacao_cliente"],
        "data_interacao": context.user_data["interacao_data"],
        "detalhes": context.user_data["interacao_detalhes"],
        "timestamp": datetime.now(TIMEZONE).timestamp()
    }
    try:
        db.collection("users").document(chat_id).collection("interacoes").document().set(interacao_data)
        logger.info("Interação salva para chat_id %s: %s", chat_id, interacao_data["cliente"])
    except Exception as e:
        logger.error("Erro ao salvar interação: %s", e)
        await update.message.reply_text(
            "😅 Deu um erro ao salvar a interação. Tenta de novo?",
            parse_mode="Markdown"
        )
        return ConversationHandler.END

    # Perguntar sobre follow-up
    keyboard = [
        [
            InlineKeyboardButton("✅ Sim", callback_data="followup_yes"),
            InlineKeyboardButton("❌ Não", callback_data="followup_no"),
        ]
    ]
    reply_markup = InlineKeyboardMarkup(keyboard)
    await update.message.reply_text(
        "✅ Interação registrada com sucesso! Quer agendar um follow-up? (Sim/Não)",
        parse_mode="Markdown",
        reply_markup=reply_markup
    )
    return INTERACAO_FOLLOWUP_CHOICE

async def interacao_followup_callback(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    """Lida com a escolha de follow-up (Sim/Não)."""
    query = update.callback_query
    await query.answer()
    escolha = query.data
    logger.info("Escolha de follow-up via botão: %s", escolha)
    
    if escolha == "followup_yes":
        await query.message.reply_text(
            "📅 Qual a data do follow-up? (Ex.: 15/04/2025)",
            parse_mode="Markdown"
        )
        return INTERACAO_FOLLOWUP_DATE
    elif escolha == "followup_no":
        await query.message.reply_text(
            "💬 Interação salva com sucesso, sem follow-up!",
            parse_mode="Markdown"
        )
        context.user_data.clear()
        return ConversationHandler.END
    else:
        logger.warning("Callback inválido: %s", escolha)
        return INTERACAO_FOLLOWUP_CHOICE

async def interacao_followup_date(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    """Recebe a data do follow-up e pergunta o motivo."""
    data_texto = update.message.text.strip()
    try:
        data = datetime.strptime(data_texto, "%d/%m/%Y")
        context.user_data["followup_data"] = data.strftime("%Y-%m-%d")
        logger.info("Data de follow-up recebida: %s", context.user_data["followup_data"])
        await update.message.reply_text(
            "📋 Qual o motivo do follow-up?",
            parse_mode="Markdown"
        )
        return INTERACAO_FOLLOWUP_MOTIVO
    except ValueError:
        logger.warning("Data de follow-up inválida: %s", data_texto)
        await update.message.reply_text(
            "😅 Formato de data inválido. Tenta no formato DD/MM/YYYY, tipo '15/04/2025'.",
            parse_mode="Markdown"
        )
        return INTERACAO_FOLLOWUP_DATE

async def interacao_followup_motivo(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    """Recebe o motivo do follow-up e salva no Firebase."""
    motivo = update.message.text.strip()
    if not motivo:
        logger.warning("Motivo de follow-up vazio recebido")
        await update.message.reply_text(
            "😅 Por favor, informe o motivo do follow-up!",
            parse_mode="Markdown"
        )
        return INTERACAO_FOLLOWUP_MOTIVO
    context.user_data["followup_motivo"] = motivo
    logger.info("Motivo de follow-up recebido: %s", motivo)
    
    chat_id = str(update.effective_chat.id)
    followup_data = {
        "cliente": context.user_data["interacao_cliente"],
        "data_follow": context.user_data["followup_data"],
        "descricao": context.user_data["followup_motivo"],
        "status": "pendente",
        "timestamp": datetime.now(TIMEZONE).timestamp()
    }
    
    try:
        db.collection("users").document(chat_id).collection("followups").document().set(followup_data)
        logger.info("Follow-up salvo para chat_id %s: %s", chat_id, followup_data["cliente"])
        await update.message.reply_text(
            "🚀 Interação e follow-up salvos com sucesso!",
            parse_mode="Markdown"
        )
    except Exception as e:
        logger.error("Erro ao salvar follow-up: %s", e)
        await update.message.reply_text(
            "😅 Deu um erro ao salvar o follow-up. Tenta de novo?",
            parse_mode="Markdown"
        )
    
    context.user_data.clear()
    return ConversationHandler.END

async def interacao_cancel(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    """Cancela a conversa de interação."""
    logger.info("Interação cancelada para chat_id %s", update.effective_chat.id)
    context.user_data.clear()
    await update.message.reply_text(
        "💬 Beleza, interação cancelada! Qualquer coisa, é só chamar.",
        parse_mode="Markdown"
    )
    return ConversationHandler.END