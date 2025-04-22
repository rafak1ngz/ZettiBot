import logging
from telegram import Update
from telegram.ext import ContextTypes, ConversationHandler, MessageHandler, filters
from config import TIMEZONE, REMINDER_TEXT, REMINDER_DATETIME
from database import db
from datetime import datetime, timezone
from zoneinfo import ZoneInfo
from jobs import enviar_lembrete

# Logger
logger = logging.getLogger(__name__)

async def lembrete_start(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    """Inicia o comando /lembrete."""
    logger.info("Iniciando /lembrete para chat_id %s", update.effective_chat.id)
    await update.message.reply_text(
        "📝 O que você deseja lembrar?",
        parse_mode="Markdown"
    )
    return REMINDER_TEXT

async def lembrete_text(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    """Recebe o texto do lembrete e pergunta a data/hora."""
    texto = update.message.text.strip()
    if not texto:
        logger.warning("Texto do lembrete vazio recebido")
        await update.message.reply_text(
            "😅 Por favor, informe o que deseja lembrar!",
            parse_mode="Markdown"
        )
        return REMINDER_TEXT
    context.user_data["lembrete_texto"] = texto
    logger.info("Texto do lembrete recebido: %s", texto)
    await update.message.reply_text(
        "📅 Quando devo te lembrar? (Ex.: 12/04/2025 14:30)",
        parse_mode="Markdown"
    )
    return REMINDER_DATETIME

async def lembrete_datetime(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    """Recebe a data/hora do lembrete, agenda o job e salva no Firebase."""
    data_texto = update.message.text.strip()
    try:
        # Validar formato DD/MM/YYYY HH:MM
        data_hora = datetime.strptime(data_texto, "%d/%m/%Y %H:%M").replace(tzinfo=TIMEZONE)
        now = datetime.now(TIMEZONE)
        if data_hora <= now:
            logger.warning("Data/hora no passado ou atual: %s", data_texto)
            await update.message.reply_text(
                "😅 A data e hora precisam ser no futuro! Tenta novamente (Ex.: 12/04/2025 14:30).",
                parse_mode="Markdown"
            )
            return REMINDER_DATETIME
        
        context.user_data["lembrete_data_hora"] = data_hora
        logger.info("Data/hora recebida: %s", data_hora.isoformat())
        
        # Salvar lembrete no Firebase e agendar job
        chat_id = str(update.effective_chat.id)
        lembrete_data = {
            "texto": context.user_data["lembrete_texto"],
            "data_hora": data_hora.isoformat(),
            "status": "pendente",
            "chat_id": chat_id,
            "timestamp": now.timestamp()
        }
        try:
            # Salvar no Firebase
            doc_ref = db.collection("users").document(chat_id).collection("lembretes").document()
            doc_ref.set(lembrete_data)
            lembrete_id = doc_ref.id
            
            # Converter data_hora para UTC naive para JobQueue
            data_hora_utc = data_hora.astimezone(timezone.utc).replace(tzinfo=None)
            logger.debug("Agendando job para %s UTC (chat_id: %s, lembrete_id: %s)", 
                        data_hora_utc.isoformat(), chat_id, lembrete_id)
            
            # Agendar job com run_once
            job = context.job_queue.run_once(
                callback=enviar_lembrete,
                when=data_hora_utc,
                data={
                    "chat_id": chat_id,
                    "texto": lembrete_data["texto"],
                    "lembrete_id": lembrete_id
                }
            )
            
            # Salvar job_id no Firebase
            doc_ref.update({"job_id": job.id})
            
            logger.info("Lembrete salvo e agendado para chat_id %s: %s (job_id: %s, horário: %s UTC)", 
                       chat_id, lembrete_data["texto"], job.id, data_hora_utc.isoformat())
            await update.message.reply_text(
                f"🚀 Lembrete agendado para {data_hora.strftime('%d/%m/%Y %H:%M')}!",
                parse_mode="Markdown"
            )
        except Exception as e:
            logger.error("Erro ao salvar ou agendar lembrete para chat_id %s: %s", chat_id, e)
            await update.message.reply_text(
                "😅 Deu um erro ao salvar o lembrete. Tenta de novo?",
                parse_mode="Markdown"
            )
        
        context.user_data.clear()
        return ConversationHandler.END
    except ValueError:
        logger.warning("Data/hora inválida: %s", data_texto)
        await update.message.reply_text(
            "😅 Formato inválido. Tenta no formato DD/MM/YYYY HH:MM, tipo '12/04/2025 14:30'.",
            parse_mode="Markdown"
        )
        return REMINDER_DATETIME

async def lembrete_cancel(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    """Cancela a conversa de lembrete."""
    logger.info("Lembrete cancelado para chat_id %s", update.effective_chat.id)
    context.user_data.clear()
    await update.message.reply_text(
        "📝 Beleza, lembrete cancelado! Qualquer coisa, é só chamar.",
        parse_mode="Markdown"
    )
    return ConversationHandler.END