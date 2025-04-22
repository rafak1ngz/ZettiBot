from telegram import InlineKeyboardButton, InlineKeyboardMarkup, Update
from telegram.ext import ContextTypes, ConversationHandler
from config import *
from database import db

# Estados para o ConversationHandler
DELETE_CATEGORY, DELETE_RECORD, DELETE_CONFIRM = range(3)

async def excluir_start(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    logger.info("Iniciando comando /excluir para chat_id %s", update.effective_chat.id)
    options = [
        [InlineKeyboardButton("Follow-ups", callback_data="delete_category:followups")],
        [InlineKeyboardButton("Visitas", callback_data="delete_category:visitas")],
        [InlineKeyboardButton("Interações", callback_data="delete_category:interacoes")]
    ]
    reply_markup = InlineKeyboardMarkup(options)
    await update.message.reply_text("🗑️ O que você quer excluir?", reply_markup=reply_markup)
    return DELETE_CATEGORY

async def excluir_category_callback(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    query = update.callback_query
    if not query:
        logger.error("Nenhum CallbackQuery em excluir_category_callback, chat_id %s", update.effective_chat.id)
        await update.message.reply_text("😅 Algo deu errado. Tenta usar /excluir novamente!")
        return ConversationHandler.END
    await query.answer()
    category = query.data.split(":", 1)[1]
    context.user_data["delete_category"] = category
    chat_id = str(query.message.chat.id)
    logger.info("Categoria selecionada para excluir: %s, chat_id: %s", category, chat_id)
    try:
        docs = list(db.collection("users").document(chat_id).collection(category).limit(10).stream())
        if not docs:
            logger.info("Nenhum registro encontrado em %s para chat_id %s", category, chat_id)
            await query.edit_message_text("😕 Não achei registros nessa categoria.")
            return ConversationHandler.END
        msg = f"🗑️ Escolha o registro para excluir:\n"
        options = []
        context.user_data["delete_records"] = {}
        for i, doc in enumerate(docs, 1):
            data = doc.to_dict()
            if category == "followups":
                label = f"{data.get('cliente', 'Sem cliente')} - {data.get('data_follow', 'Sem data')}"
            elif category == "visitas":
                label = f"{data.get('empresa', 'Sem empresa')} - {data.get('data_visita', 'Sem data')}"
            else:
                label = f"{data.get('cliente', 'Sem cliente')} - {data.get('resumo', 'Sem resumo')[:20]}..."
            msg += f"{i}. {label}\n"
            context.user_data["delete_records"][str(i)] = doc.id
            options.append([InlineKeyboardButton(f"Excluir #{i}", callback_data=f"delete_record:{i}")])
        reply_markup = InlineKeyboardMarkup(options)
        await query.edit_message_text(msg, parse_mode="Markdown", reply_markup=reply_markup)
        return DELETE_RECORD
    except Exception as e:
        logger.error("Erro ao listar registros para excluir, chat_id %s: %s", chat_id, e)
        await query.edit_message_text("😅 Deu um erro ao listar os registros.")
        return ConversationHandler.END

async def excluir_record_callback(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    query = update.callback_query
    if not query:
        logger.error("Nenhum CallbackQuery em excluir_record_callback, chat_id %s", update.effective_chat.id)
        await update.message.reply_text("😅 Algo deu errado. Tenta usar /excluir novamente!")
        return ConversationHandler.END
    await query.answer()
    record_index = query.data.split(":", 1)[1]
    record_id = context.user_data["delete_records"].get(record_index)
    if not record_id:
        logger.error("Registro inválido para exclusão, índice: %s, chat_id %s", record_index, update.effective_chat.id)
        await query.edit_message_text("😅 Registro inválido. Tenta de novo?")
        return ConversationHandler.END
    context.user_data["delete_record_id"] = record_id
    category = context.user_data["delete_category"]
    logger.info("Registro selecionado para exclusão: %s, categoria: %s, chat_id: %s", record_id, category, update.effective_chat.id)
    options = [
        [InlineKeyboardButton("✅ Confirmar", callback_data="delete_confirm:yes")],
        [InlineKeyboardButton("❌ Cancelar", callback_data="delete_confirm:no")]
    ]
    reply_markup = InlineKeyboardMarkup(options)
    await query.edit_message_text(f"🗑️ Tem certeza que quer excluir este registro de {category}?", reply_markup=reply_markup)
    return DELETE_CONFIRM

async def excluir_confirm_callback(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    query = update.callback_query
    if not query:
        logger.error("Nenhum CallbackQuery em excluir_confirm_callback, chat_id %s", update.effective_chat.id)
        await update.message.reply_text("😅 Algo deu errado. Tenta usar /excluir novamente!")
        return ConversationHandler.END
    await query.answer()
    choice = query.data.split(":", 1)[1]
    chat_id = str(query.message.chat.id)
    
    if choice == "no":
        logger.info("Exclusão cancelada para chat_id %s", chat_id)
        await query.edit_message_text("🗑️ Exclusão cancelada!")
        return ConversationHandler.END
    
    category = context.user_data.get("delete_category")
    record_id = context.user_data.get("delete_record_id")
    
    logger.info("Confirmando exclusão: categoria=%s, record_id=%s, chat_id=%s", category, record_id, chat_id)
    
    if not all([category, record_id]):
        logger.error("Contexto inválido para exclusão: category=%s, record_id=%s, chat_id=%s", category, record_id, chat_id)
        await query.edit_message_text("😅 Algo deu errado no processo de exclusão. Tenta usar /excluir novamente!")
        return ConversationHandler.END
    
    try:
        logger.info("Excluindo registro no Firebase: users/%s/%s/%s", chat_id, category, record_id)
        db.collection("users").document(chat_id).collection(category).document(record_id).delete()
        logger.info("Registro excluído com sucesso para chat_id %s", chat_id)
        await query.edit_message_text("✅ Registro excluído com sucesso!")
    except Exception as e:
        logger.error("Erro ao excluir registro para chat_id %s: %s", chat_id, e)
        await query.edit_message_text("😅 Deu um erro ao excluir. Tenta de novo?")
    
    return ConversationHandler.END

async def excluir_cancel(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    logger.info("Comando /excluir cancelado para chat_id %s", update.effective_chat.id)
    await update.message.reply_text("🗑️ Exclusão cancelada!")
    return ConversationHandler.END