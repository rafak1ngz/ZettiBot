from telegram import InlineKeyboardButton, InlineKeyboardMarkup, Update
from telegram.ext import ContextTypes, ConversationHandler
from config import *
from database import db
from datetime import datetime

async def editar_start(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    logger.info("Iniciando comando /editar para chat_id %s", update.effective_chat.id)
    options = [
        [InlineKeyboardButton("Follow-ups", callback_data="edit_category:followups")],
        [InlineKeyboardButton("Visitas", callback_data="edit_category:visitas")],
        [InlineKeyboardButton("Interações", callback_data="edit_category:interacoes")]
    ]
    reply_markup = InlineKeyboardMarkup(options)
    await update.message.reply_text("📝 O que você quer editar?", reply_markup=reply_markup)
    return EDIT_CATEGORY

async def editar_category_callback(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    query = update.callback_query
    if not query:
        logger.error("Nenhum CallbackQuery em editar_category_callback, chat_id %s", update.effective_chat.id)
        await update.message.reply_text("😅 Algo deu errado. Tenta usar /editar novamente!")
        return ConversationHandler.END
    await query.answer()
    category = query.data.split(":", 1)[1]
    context.user_data["edit_category"] = category
    chat_id = str(query.message.chat.id)
    logger.info("Categoria selecionada para editar: %s, chat_id: %s", category, chat_id)
    try:
        docs = list(db.collection("users").document(chat_id).collection(category).limit(10).stream())
        if not docs:
            logger.info("Nenhum registro encontrado em %s para chat_id %s", category, chat_id)
            await query.edit_message_text("😕 Não achei registros nessa categoria.")
            return ConversationHandler.END
        msg = f"📋 Escolha o registro para editar:\n"
        options = []
        context.user_data["edit_records"] = {}
        for i, doc in enumerate(docs, 1):
            data = doc.to_dict()
            if category == "followups":
                label = f"{data.get('cliente', 'Sem cliente')} - {data.get('data_follow', 'Sem data')}"
            elif category == "visitas":
                label = f"{data.get('empresa', 'Sem empresa')} - {data.get('data_visita', 'Sem data')}"
            else:
                label = f"{data.get('cliente', 'Sem cliente')} - {data.get('resumo', 'Sem resumo')[:20]}..."
            msg += f"{i}. {label}\n"
            context.user_data["edit_records"][str(i)] = doc.id
            options.append([InlineKeyboardButton(f"Editar #{i}", callback_data=f"edit_record:{i}")])
        reply_markup = InlineKeyboardMarkup(options)
        await query.edit_message_text(msg, parse_mode="Markdown", reply_markup=reply_markup)
        return EDIT_RECORD
    except Exception as e:
        logger.error("Erro ao listar registros para editar, chat_id %s: %s", chat_id, e)
        await query.edit_message_text("😅 Deu um erro ao listar os registros.")
        return ConversationHandler.END

async def editar_record_callback(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    query = update.callback_query
    if not query:
        logger.error("Nenhum CallbackQuery em editar_record_callback, chat_id %s", update.effective_chat.id)
        await update.message.reply_text("😅 Algo deu errado. Tenta usar /editar novamente!")
        return ConversationHandler.END
    await query.answer()
    record_index = query.data.split(":", 1)[1]
    record_id = context.user_data["edit_records"].get(record_index)
    if not record_id:
        logger.error("Registro inválido para edição, índice: %s, chat_id %s", record_index, update.effective_chat.id)
        await query.edit_message_text("😅 Registro inválido. Tenta de novo?")
        return ConversationHandler.END
    context.user_data["edit_record_id"] = record_id
    category = context.user_data["edit_category"]
    logger.info("Registro selecionado para edição: %s, categoria: %s, chat_id: %s", record_id, category, update.effective_chat.id)
    fields = {
        "followups": ["cliente", "data_follow", "descricao", "status"],
        "visitas": ["empresa", "data_visita", "classificacao", "motivo"],
        "interacoes": ["cliente", "resumo", "followup"]
    }
    options = [[InlineKeyboardButton(field.capitalize(), callback_data=f"edit_field:{field}")] for field in fields[category]]
    reply_markup = InlineKeyboardMarkup(options)
    await query.edit_message_text(f"📝 Qual campo você quer editar em {category}?", reply_markup=reply_markup)
    return EDIT_FIELD

async def editar_field_callback(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    query = update.callback_query
    if not query:
        logger.error("Nenhum CallbackQuery em editar_field_callback, chat_id %s", update.effective_chat.id)
        await update.message.reply_text("😅 Algo deu errado. Tenta usar /editar novamente!")
        return ConversationHandler.END
    await query.answer()
    field = query.data.split(":", 1)[1]
    context.user_data["edit_field"] = field
    logger.info("Campo selecionado para edição: %s, chat_id: %s", field, update.effective_chat.id)
    if field in ["data_follow", "data_visita", "followup"]:
        await query.edit_message_text("📅 Digite o novo valor para esse campo (Ex.: 10/04/2025):")
    else:
        await query.edit_message_text(f"📝 Digite o novo valor para {field}:")
    return EDIT_NEW_VALUE

async def editar_new_value(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    logger.info("Entrou em editar_new_value para chat_id %s", update.effective_chat.id)
    
    if not update.message or not update.message.text:
        logger.error("Nenhuma mensagem válida recebida em editar_new_value, chat_id %s", update.effective_chat.id)
        await update.effective_chat.send_message("😅 Algo deu errado. Tenta usar /editar novamente!")
        return ConversationHandler.END
    
    new_value = update.message.text.strip()
    chat_id = str(update.effective_chat.id)
    
    logger.info("Valor recebido: '%s', chat_id: %s", new_value, chat_id)
    
    category = context.user_data.get("edit_category")
    record_id = context.user_data.get("edit_record_id")
    field = context.user_data.get("edit_field")
    
    logger.info("Contexto: categoria=%s, record_id=%s, field=%s, chat_id=%s", 
                category, record_id, field, chat_id)
    
    if not all([category, record_id, field]):
        logger.error("Contexto inválido: category=%s, record_id=%s, field=%s, chat_id=%s", 
                     category, record_id, field, chat_id)
        await update.message.reply_text("😅 Algo deu errado no processo de edição. Tenta usar /editar novamente!")
        return ConversationHandler.END
    
    if not new_value:
        logger.info("Valor vazio fornecido para campo %s, chat_id %s", field, chat_id)
        await update.message.reply_text("😅 O valor não pode ser vazio. Tenta de novo!")
        return EDIT_NEW_VALUE
    
    try:
        if field in ["data_follow", "data_visita", "followup"]:
            logger.debug("Validando data: %s, chat_id %s", new_value, chat_id)
            try:
                parsed_date = datetime.strptime(new_value, "%d/%m/%Y")
                new_value = parsed_date.date().isoformat()
                logger.debug("Data convertida para ISO: %s, chat_id %s", new_value, chat_id)
            except ValueError:
                logger.info("Data inválida fornecida: %s, chat_id %s", new_value, chat_id)
                await update.message.reply_text("😅 Data inválida! Tenta assim: 10/04/2025")
                return EDIT_NEW_VALUE
        
        logger.info("Atualizando registro no Firebase: users/%s/%s/%s, campo=%s, valor=%s", 
                    chat_id, category, record_id, field, new_value)
        db.collection("users").document(chat_id).collection(category).document(record_id).update({field: new_value})
        
        logger.info("Registro atualizado com sucesso para chat_id %s", chat_id)
        await update.message.reply_text("✅ Registro atualizado com sucesso!")
    
    except Exception as e:
        logger.error("Erro ao editar registro para chat_id %s: %s", chat_id, e)
        await update.message.reply_text("😅 Deu um erro ao editar. Tenta de novo?")
    
    return ConversationHandler.END

async def editar_cancel(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    logger.info("Comando /editar cancelado para chat_id %s", update.effective_chat.id)
    await update.message.reply_text("📝 Edição cancelada!")
    return ConversationHandler.END