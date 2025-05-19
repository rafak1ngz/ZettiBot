import logging
from telegram import Update, InlineKeyboardButton, InlineKeyboardMarkup
from telegram.ext import ContextTypes, ConversationHandler, MessageHandler, CallbackQueryHandler, filters
from config import TIMEZONE, VISIT_COMPANY, VISIT_DATE, VISIT_MOTIVE, VISIT_FOLLOWUP_CHOICE, VISIT_FOLLOWUP_DATE, VISIT_FOLLOWUP_MOTIVO
from database import db
from datetime import datetime

# Logger
logger = logging.getLogger(__name__)

async def visita_start(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    """Inicia o comando /visita."""
    logger.info("Iniciando /visita para chat_id %s", update.effective_chat.id)
    await update.message.reply_text(
        "🏢 Show, qual empresa você visitou?",
        parse_mode="Markdown"
    )
    return VISIT_COMPANY

async def visita_company(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    """Recebe o nome da empresa e pergunta a data da visita."""
    empresa = update.message.text.strip()
    if not empresa:
        logger.warning("Nome da empresa vazio recebido")
        await update.message.reply_text(
            "😅 Por favor, informe o nome da empresa!",
            parse_mode="Markdown"
        )
        return VISIT_COMPANY
    context.user_data["visita_empresa"] = empresa
    logger.info("Empresa recebida: %s", empresa)
    await update.message.reply_text(
        "📅 Qual a data da visita? (Ex.: 12/04/2025)",
        parse_mode="Markdown"
    )
    return VISIT_DATE

async def visita_date(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    """Recebe a data da visita e pergunta o motivo."""
    data_texto = update.message.text.strip()
    try:
        data = datetime.strptime(data_texto, "%d/%m/%Y")
        context.user_data["visita_data"] = data.strftime("%Y-%m-%d")
        logger.info("Data recebida: %s", context.user_data["visita_data"])
        await update.message.reply_text(
            "📋 Qual foi o motivo da visita? (Ex.: venda, manutenção, aluguel)",
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
    """Recebe o motivo da visita e pergunta sobre follow-up."""
    motivo = update.message.text.strip()
    if not motivo:
        logger.warning("Motivo vazio recebido")
        await update.message.reply_text(
            "😅 Por favor, informe o motivo da visita!",
            parse_mode="Markdown"
        )
        return VISIT_MOTIVE
    context.user_data["visita_motivo"] = motivo
    logger.info("Motivo recebido: %s", motivo)
    
    # Salvar visita no Firebase
    chat_id = str(update.effective_chat.id)
    visita_data = {
        "empresa": context.user_data["visita_empresa"],
        "endereco": "",
        "telefone": "",
        "data_visita": context.user_data["visita_data"],
        "motivo": context.user_data["visita_motivo"],
        "timestamp": datetime.now(TIMEZONE).timestamp()
    }
    try:
        db.collection("users").document(chat_id).collection("visitas").document().set(visita_data)
        logger.info("Visita salva para chat_id %s: %s", chat_id, visita_data["empresa"])
    except Exception as e:
        logger.error("Erro ao salvar visita: %s", e)
        await update.message.reply_text(
            "😅 Deu um erro ao salvar a visita. Tenta de novo?",
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
        "✅ Visita registrada com sucesso! Quer agendar um follow-up? (Sim/Não)",
        parse_mode="Markdown",
        reply_markup=reply_markup
    )
    return VISIT_FOLLOWUP_CHOICE

async def visita_followup_callback(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
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
        return VISIT_FOLLOWUP_DATE
    elif escolha == "followup_no":
        await query.message.reply_text(
            "🏢 Visita salva com sucesso, sem follow-up!",
            parse_mode="Markdown"
        )
        context.user_data.clear()
        return ConversationHandler.END
    else:
        logger.warning("Callback inválido: %s", escolha)
        return VISIT_FOLLOWUP_CHOICE

async def visita_followup_date(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
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
        return VISIT_FOLLOWUP_MOTIVO
    except ValueError:
        logger.warning("Data de follow-up inválida: %s", data_texto)
        await update.message.reply_text(
            "😅 Formato de data inválido. Tenta no formato DD/MM/YYYY, tipo '15/04/2025'.",
            parse_mode="Markdown"
        )
        return VISIT_FOLLOWUP_DATE

async def visita_followup_motivo(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    """Recebe o motivo do follow-up e salva no Firebase."""
    motivo = update.message.text.strip()
    if not motivo:
        logger.warning("Motivo de follow-up vazio recebido")
        await update.message.reply_text(
            "😅 Por favor, informe o motivo do follow-up!",
            parse_mode="Markdown"
        )
        return VISIT_FOLLOWUP_MOTIVO
    context.user_data["followup_motivo"] = motivo
    logger.info("Motivo de follow-up recebido: %s", motivo)
    
    chat_id = str(update.effective_chat.id)
    followup_data = {
        "cliente": context.user_data["visita_empresa"],
        "data_follow": context.user_data["followup_data"],
        "descricao": context.user_data["followup_motivo"],  # Alterado para "descricao" para consistência com outros handlers
        "status": "pendente",
        "timestamp": datetime.now(TIMEZONE).timestamp()
    }
    
    try:
        db.collection("users").document(chat_id).collection("followups").document().set(followup_data)
        logger.info("Follow-up salvo para chat_id %s: %s", chat_id, followup_data["cliente"])
        await update.message.reply_text(
            "🚀 Visita e follow-up salvos com sucesso!",
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

async def visita_cancel(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    """Cancela a conversa de visita."""
    logger.info("Visita cancelada para chat_id %s", update.effective_chat.id)
    context.user_data.clear()
    await update.message.reply_text(
        "🏢 Beleza, visita cancelada! Qualquer coisa, é só chamar.",
        parse_mode="Markdown"
    )
    return ConversationHandler.END