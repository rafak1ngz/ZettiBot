from telegram import InlineKeyboardButton, InlineKeyboardMarkup, Update
from telegram.ext import ContextTypes, ConversationHandler
from config import *
from database import db
from datetime import datetime
import unicodedata

def normalize_text(text: str) -> str:
    """Normaliza texto removendo acentos e convertendo para minúsculas."""
    if not text:
        return ""
    text = ''.join(c for c in unicodedata.normalize('NFD', text) if unicodedata.category(c) != 'Mn')
    return text.lower().strip()

async def filtrar_start(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    logger.info("Iniciando comando /filtrar para chat_id %s", update.effective_chat.id)
    options = [
        [InlineKeyboardButton("Follow-ups", callback_data="filter_category:followups")],
        [InlineKeyboardButton("Visitas", callback_data="filter_category:visitas")],
        [InlineKeyboardButton("Interações", callback_data="filter_category:interacoes")]
    ]
    reply_markup = InlineKeyboardMarkup(options)
    await update.message.reply_text("🔍 O que você quer filtrar?", reply_markup=reply_markup)
    return FILTER_CATEGORY

async def filtrar_category_callback(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    query = update.callback_query
    if not query:
        logger.error("Nenhum CallbackQuery recebido em filtrar_category_callback")
        await update.message.reply_text("😅 Algo deu errado. Tenta usar /filtrar novamente!")
        return ConversationHandler.END
    
    await query.answer()
    category = query.data.split(":", 1)[1]
    context.user_data["filter_category"] = category
    logger.info("Categoria selecionada: %s", category)
    
    options = [
        [InlineKeyboardButton("Cliente/Empresa", callback_data="filter_type:cliente")],
        [InlineKeyboardButton("Data", callback_data="filter_type:data")],
        [InlineKeyboardButton("Status/Classificação", callback_data="filter_type:status")]
    ]
    reply_markup = InlineKeyboardMarkup(options)
    await query.edit_message_text("🔍 Filtrar por qual campo?", reply_markup=reply_markup)
    return FILTER_TYPE

async def filtrar_type_callback(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    query = update.callback_query
    if not query:
        logger.error("Nenhum CallbackQuery recebido em filtrar_type_callback")
        await update.message.reply_text("😅 Algo deu errado. Tenta usar /filtrar novamente!")
        return ConversationHandler.END
    
    await query.answer()
    filter_type = query.data.split(":", 1)[1]
    context.user_data["filter_type"] = filter_type
    logger.info("Tipo de filtro selecionado: %s", filter_type)
    
    if filter_type == "cliente":
        await query.edit_message_text("🔍 Digite o nome do cliente ou empresa:")
    elif filter_type == "data":
        await query.edit_message_text("🔍 Digite a data (Ex.: 10/04/2025):")
    else:
        await query.edit_message_text("🔍 Digite o status ou classificação (Ex.: pendente, Cliente Ativo):")
    return FILTER_VALUE

async def filtrar_value(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    logger.info("Entrou em filtrar_value para chat_id %s", update.effective_chat.id)
    
    value = update.message.text.strip()
    chat_id = str(update.message.chat.id)
    category = context.user_data.get("filter_category")
    filter_type = context.user_data.get("filter_type")
    
    logger.info("Filtrando %s por %s com valor '%s' para chat_id %s", category, filter_type, value, chat_id)
    
    if not category or not filter_type:
        logger.error("Categoria ou tipo de filtro não definido: category=%s, filter_type=%s", category, filter_type)
        await update.message.reply_text("😅 Algo deu errado no filtro. Tenta usar /filtrar novamente!")
        return ConversationHandler.END
    
    try:
        # Busca documentos no Firebase
        collection_ref = db.collection("users").document(chat_id).collection(category)
        logger.debug("Consultando coleção: users/%s/%s", chat_id, category)
        docs = list(collection_ref.stream())
        logger.info("Encontrados %d documentos em %s para chat_id %s", len(docs), category, chat_id)
        
        if not docs:
            logger.info("Coleção %s vazia para chat_id %s", category, chat_id)
            await update.message.reply_text(f"😕 Não há registros em {category}. Tenta registrar algo com /followup ou /visita!")
            return ConversationHandler.END
        
        msg = f"🔍 *Resultados para {category}*\n\n"
        found = False
        
        # Normaliza o valor de entrada
        normalized_value = normalize_text(value)
        logger.debug("Valor normalizado: '%s'", normalized_value)
        
        for doc in docs:
            data = doc.to_dict() or {}
            logger.debug("Processando documento ID %s: %s", doc.id, data)
            
            if not data:
                logger.warning("Documento ID %s vazio ou inválido em %s", doc.id, category)
                continue
            
            match = False
            
            if filter_type == "cliente":
                key = "cliente" if category in ["followups", "interacoes"] else "empresa"
                data_value = data.get(key, "")
                if not data_value:
                    logger.debug("Campo %s ausente ou vazio no documento ID %s", key, doc.id)
                    continue
                normalized_data_value = normalize_text(data_value)
                # Busca parcial: "Climario" encontra "Climario (Vila Velha)"
                if normalized_value and normalized_value in normalized_data_value:
                    match = True
                    logger.debug("Match encontrado para %s: '%s' contém '%s'", key, normalized_data_value, normalized_value)
            
            elif filter_type == "data":
                key = "data_follow" if category == "followups" else "data_visita" if category == "visitas" else "criado_em"
                data_value = data.get(key, "")
                if not data_value:
                    logger.debug("Campo %s ausente ou vazio no documento ID %s", key, doc.id)
                    continue
                logger.debug("Comparando data: campo=%s, valor=%s", key, data_value)
                try:
                    # Suporta múltiplos formatos de data
                    data_date = None
                    for fmt in ["%Y-%m-%d", "%Y-%m-%dT%H:%M:%S.%f", "%Y-%m-%dT%H:%M:%S.%f%z"]:
                        try:
                            data_date = datetime.strptime(data_value, fmt).strftime("%d/%m/%Y")
                            break
                        except ValueError:
                            continue
                    if not data_date:
                        data_date = datetime.fromisoformat(data_value.replace("Z", "+00:00")).strftime("%d/%m/%Y")
                    if value == data_date:
                        match = True
                        logger.debug("Match encontrado para data: %s == %s", value, data_date)
                except Exception as e:
                    logger.debug("Erro ao comparar data %s: %s", data_value, e)
            
            else:  # status
                key = "status" if category == "followups" else "classificacao" if category == "visitas" else None
                if not key:
                    logger.debug("Filtro de status não suportado para %s", category)
                    continue
                data_value = data.get(key, "")
                if not data_value:
                    logger.debug("Campo %s ausente ou vazio no documento ID %s", key, doc.id)
                    continue
                normalized_data_value = normalize_text(data_value)
                if normalized_value and normalized_value in normalized_data_value:
                    match = True
                    logger.debug("Match encontrado para %s: '%s' contém '%s'", key, normalized_data_value, normalized_value)
            
            if match:
                found = True
                if category == "followups":
                    data_follow = data.get("data_follow", "Sem data")
                    try:
                        data_fmt = datetime.strptime(data_follow, "%Y-%m-%d").strftime("%d/%m/%Y")
                    except:
                        try:
                            data_fmt = datetime.fromisoformat(data_follow.replace("Z", "+00:00")).strftime("%d/%m/%Y")
                        except:
                            data_fmt = data_follow
                    msg += f"• {data.get('cliente', 'Sem cliente')} - {data_fmt} - {data.get('status', 'Sem status')}\n"
                elif category == "visitas":
                    data_visita = data.get("data_visita", "Sem data")
                    try:
                        data_fmt = datetime.strptime(data_visita, "%Y-%m-%d").strftime("%d/%m/%Y")
                    except:
                        try:
                            data_fmt = datetime.fromisoformat(data_visita.replace("Z", "+00:00")).strftime("%d/%m/%Y")
                        except:
                            data_fmt = data_visita
                    msg += f"• {data.get('empresa', 'Sem empresa')} - {data_fmt} - {data.get('classificacao', 'Sem classificação')}\n"
                else:
                    criado_em = data.get("criado_em", "Sem data")
                    try:
                        data_fmt = datetime.fromisoformat(criado_em.replace("Z", "+00:00")).strftime("%d/%m/%Y")
                    except:
                        try:
                            data_fmt = datetime.strptime(criado_em, "%Y-%m-%dT%H:%M:%S.%f%z").strftime("%d/%m/%Y")
                        except:
                            data_fmt = criado_em
                    msg += f"• {data.get('cliente', 'Sem cliente')} - {data.get('resumo', 'Sem resumo')[:50]}... ({data_fmt})\n"
        
        if not found:
            msg = f"😕 Não achei nada em {category} com '{value}' para esse filtro. Tenta outro valor?"
            logger.info("Nenhum registro encontrado para filtro %s='%s' em %s", filter_type, value, category)
        
        logger.info("Enviando resposta para chat_id %s: %s", chat_id, msg[:100])
        await update.message.reply_text(msg, parse_mode="Markdown")
    
    except Exception as e:
        logger.error("Erro ao filtrar registros para chat_id %s: %s", chat_id, e)
        await update.message.reply_text("😅 Deu um erro ao filtrar. Tenta de novo?")
    
    logger.info("Finalizando filtrar_value para chat_id %s", chat_id)
    return ConversationHandler.END

async def filtrar_cancel(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    logger.info("Comando /filtrar cancelado para chat_id %s", update.effective_chat.id)
    await update.message.reply_text("🔍 Filtro cancelado!")
    return ConversationHandler.END