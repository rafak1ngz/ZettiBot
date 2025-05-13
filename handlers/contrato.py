import logging
from telegram import Update, InlineKeyboardButton, InlineKeyboardMarkup
from telegram.ext import ContextTypes, ConversationHandler, CommandHandler, MessageHandler, CallbackQueryHandler, filters
from datetime import datetime, timedelta
from config import TIMEZONE
from database import db

# Logger
logger = logging.getLogger(__name__)

# Estados da conversa
CONTRATO_MENU, CONTRATO_REGISTRAR_CLIENTE, CONTRATO_REGISTRAR_DATA, CONTRATO_REGISTRAR_VALOR, CONTRATO_REGISTRAR_DESCRICAO, CONTRATO_REGISTRAR_PRAZO, CONTRATO_ATUALIZAR_SELECAO, CONTRATO_ATUALIZAR_DATA, CONTRATO_EXCLUIR_SELECAO = range(9)

async def contrato_start(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    """Inicia o comando /contrato."""
    chat_id = update.effective_chat.id
    logger.info("Tentando iniciar /contrato para chat_id %s", chat_id)
    try:
        keyboard = [
            [InlineKeyboardButton("📊 Ver contratos finalizados", callback_data="contratos_finalizados")],
            [InlineKeyboardButton("⏳ Ver contratos pendentes", callback_data="contratos_pendentes")],
            [InlineKeyboardButton("📋 Acompanhar contratos", callback_data="contratos_acompanhar")]
        ]
        reply_markup = InlineKeyboardMarkup(keyboard)
        await update.message.reply_text(
            "📋 O que você quer fazer?",
            reply_markup=reply_markup,
            parse_mode="Markdown"
        )
        logger.info("Mensagem de menu enviada para chat_id %s", chat_id)
    except Exception as e:
        logger.error("Erro ao iniciar /contrato para chat_id %s: %s", chat_id, e)
    return CONTRATO_MENU

async def contrato_menu_callback(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    """Processa a seleção do menu."""
    query = update.callback_query
    await query.answer()
    chat_id = str(query.message.chat_id)
    option = query.data
    logger.info("Opção selecionada para chat_id %s: %s", chat_id, option)

    try:
        if option == "contratos_finalizados":
            contratos = db.collection("users").document(chat_id).collection("contratos").where("status", "==", "concluido").stream()
            message = "✅ Contratos finalizados:\n"
            contratos_list = []
            for doc in contratos:
                data = doc.to_dict()
                vencimento = datetime.fromisoformat(data['data_vencimento']).strftime('%d/%m/%Y') if 'data_vencimento' in data else "Sem vencimento"
                contratos_list.append(f"• {data['cliente']}: {data['descricao']} - Assinado em {datetime.fromisoformat(data['data_assinatura']).strftime('%d/%m/%Y')} - Vence em {vencimento}")
            if contratos_list:
                message += "\n".join(contratos_list)
            else:
                message = "❌ Nenhum contrato finalizado encontrado."
            await query.message.reply_text(message, parse_mode="Markdown")
            logger.info("Lista de contratos finalizados enviada para chat_id %s", chat_id)
            return ConversationHandler.END

        elif option == "contratos_pendentes":
            contratos = db.collection("users").document(chat_id).collection("contratos").where("status", "==", "pendente").stream()
            message = "⏳ Contratos pendentes:\n"
            contratos_list = []
            for doc in contratos:
                data = doc.to_dict()
                contratos_list.append(f"• {data['cliente']}: {data['descricao']} - Enviado em {datetime.fromisoformat(data['data_envio']).strftime('%d/%m/%Y')}")
            if contratos_list:
                message += "\n".join(contratos_list)
            else:
                message = "❌ Nenhum contrato pendente encontrado."
            await query.message.reply_text(message, parse_mode="Markdown")
            logger.info("Lista de contratos pendentes enviada para chat_id %s", chat_id)
            return ConversationHandler.END

        elif option == "contratos_acompanhar":
            keyboard = [
                [InlineKeyboardButton("📝 Registrar novo contrato", callback_data="registrar_contrato")],
                [InlineKeyboardButton("✅ Atualizar status", callback_data="atualizar_contrato")],
                [InlineKeyboardButton("🗑️ Cancelar contrato", callback_data="excluir_contrato")]
            ]
            reply_markup = InlineKeyboardMarkup(keyboard)
            await query.message.reply_text(
                "📋 Escolha uma opção:",
                reply_markup=reply_markup,
                parse_mode="Markdown"
            )
            logger.info("Menu de acompanhamento enviado para chat_id %s", chat_id)
            return CONTRATO_MENU
    except Exception as e:
        logger.error("Erro ao processar opção %s para chat_id %s: %s", option, chat_id, e)
        await query.message.reply_text("❌ Algo deu errado. Tente novamente.", parse_mode="Markdown")
        return ConversationHandler.END

async def contrato_registrar_start(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    """Inicia o registro de um novo contrato."""
    query = update.callback_query
    await query.answer()
    chat_id = query.message.chat_id
    logger.info("Iniciando registro de contrato para chat_id %s", chat_id)
    await query.message.reply_text(
        "🏢 Qual é o cliente do contrato?",
        parse_mode="Markdown"
    )
    return CONTRATO_REGISTRAR_CLIENTE

async def contrato_registrar_cliente(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    """Recebe o nome do cliente."""
    cliente = update.message.text.strip()
    chat_id = update.effective_chat.id
    if not cliente:
        logger.warning("Nome do cliente vazio recebido para chat_id %s", chat_id)
        await update.message.reply_text(
            "❌ Informe o nome do cliente.",
            parse_mode="Markdown"
        )
        return CONTRATO_REGISTRAR_CLIENTE
    context.user_data["contrato_cliente"] = cliente
    logger.info("Cliente recebido para chat_id %s: %s", chat_id, cliente)
    await update.message.reply_text(
        "📅 Quando o contrato foi enviado? (Ex.: 20/04/2025)",
        parse_mode="Markdown"
    )
    return CONTRATO_REGISTRAR_DATA

async def contrato_registrar_data(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    """Recebe a data de envio do contrato."""
    data_texto = update.message.text.strip()
    chat_id = update.effective_chat.id
    try:
        data_envio = datetime.strptime(data_texto, "%d/%m/%Y").replace(tzinfo=TIMEZONE)
        context.user_data["contrato_data_envio"] = data_envio
        logger.info("Data de envio recebida para chat_id %s: %s", chat_id, data_envio.isoformat())
        await update.message.reply_text(
            "💰 Qual o valor do contrato? (Ex.: 10000.00)",
            parse_mode="Markdown"
        )
        return CONTRATO_REGISTRAR_VALOR
    except ValueError:
        logger.warning("Data inválida para chat_id %s: %s", chat_id, data_texto)
        await update.message.reply_text(
            "❌ Use DD/MM/YYYY, como 20/04/2025.",
            parse_mode="Markdown"
        )
        return CONTRATO_REGISTRAR_DATA

async def contrato_registrar_valor(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    """Recebe o valor do contrato."""
    valor_texto = update.message.text.strip()
    chat_id = update.effective_chat.id
    try:
        valor = float(valor_texto)
        if valor <= 0:
            raise ValueError("Valor deve ser positivo")
        context.user_data["contrato_valor"] = valor
        logger.info("Valor recebido para chat_id %s: %s", chat_id, valor)
        await update.message.reply_text(
            "📋 Descreva o contrato (ex.: Fornecimento de equipamentos).",
            parse_mode="Markdown"
        )
        return CONTRATO_REGISTRAR_DESCRICAO
    except ValueError:
        logger.warning("Valor inválido para chat_id %s: %s", chat_id, valor_texto)
        await update.message.reply_text(
            "❌ Informe um valor válido, como 10000.00.",
            parse_mode="Markdown"
        )
        return CONTRATO_REGISTRAR_VALOR

async def contrato_registrar_descricao(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    """Recebe a descrição do contrato."""
    descricao = update.message.text.strip()
    chat_id = update.effective_chat.id
    if not descricao:
        logger.warning("Descrição vazia recebida para chat_id %s", chat_id)
        await update.message.reply_text(
            "❌ Informe a descrição do contrato.",
            parse_mode="Markdown"
        )
        return CONTRATO_REGISTRAR_DESCRICAO
    context.user_data["contrato_descricao"] = descricao
    logger.info("Descrição recebida para chat_id %s: %s", chat_id, descricao)
    await update.message.reply_text(
        "⏳ Qual o prazo do contrato em meses? (Ex.: 12)",
        parse_mode="Markdown"
    )
    return CONTRATO_REGISTRAR_PRAZO

async def contrato_registrar_prazo(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    """Recebe o prazo do contrato e salva o contrato pendente sem data de vencimento."""
    prazo_texto = update.message.text.strip()
    chat_id = str(update.effective_chat.id)
    try:
        prazo_meses = int(prazo_texto)
        if prazo_meses <= 0:
            raise ValueError("Prazo deve ser positivo")
        context.user_data["contrato_prazo_meses"] = prazo_meses
        
        contrato_data = {
            "cliente": context.user_data["contrato_cliente"],
            "data_envio": context.user_data["contrato_data_envio"].isoformat(),
            "valor": context.user_data["contrato_valor"],
            "descricao": context.user_data["contrato_descricao"],
            "status": "pendente",
            "prazo_meses": prazo_meses,
            "timestamp": datetime.now(TIMEZONE).timestamp()
        }
        
        doc_ref = db.collection("users").document(chat_id).collection("contratos").document()
        doc_ref.set(contrato_data)
        logger.info("Contrato pendente salvo para chat_id %s: %s", chat_id, contrato_data["cliente"])
        await update.message.reply_text(
            f"✅ Contrato pendente registrado para {contrato_data['cliente']} com prazo de {prazo_meses} meses.",
            parse_mode="Markdown"
        )
    except ValueError:
        logger.warning("Prazo inválido para chat_id %s: %s", chat_id, prazo_texto)
        await update.message.reply_text(
            "❌ Informe um número inteiro positivo para o prazo em meses.",
            parse_mode="Markdown"
        )
        return CONTRATO_REGISTRAR_PRAZO
    except Exception as e:
        logger.error("Erro ao salvar contrato para chat_id %s: %s", chat_id, e)
        await update.message.reply_text(
            "❌ Algo deu errado. Tente de novo.",
            parse_mode="Markdown"
        )
    
    context.user_data.clear()
    return ConversationHandler.END

async def contrato_atualizar_start(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    """Inicia a atualização de status de um contrato."""
    query = update.callback_query
    await query.answer()
    chat_id = str(query.message.chat_id)
    logger.info("Iniciando atualização de contrato para chat_id %s", chat_id)
    
    try:
        contratos = list(db.collection("users").document(chat_id).collection("contratos").where("status", "==", "pendente").stream())
        if not contratos:
            logger.info("Nenhum contrato pendente encontrado para chat_id %s", chat_id)
            await query.message.reply_text(
                "❌ Nenhum contrato pendente encontrado.",
                parse_mode="Markdown"
            )
            return ConversationHandler.END
        
        keyboard = [
            [InlineKeyboardButton(
                f"{doc.to_dict()['cliente']}: {doc.to_dict()['descricao']}",
                callback_data=f"atualizar_contrato:{doc.id}"
            )] for doc in contratos
        ]
        reply_markup = InlineKeyboardMarkup(keyboard)
        await query.message.reply_text(
            "📋 Selecione o contrato para atualizar:",
            reply_markup=reply_markup,
            parse_mode="Markdown"
        )
        logger.info("Lista de contratos pendentes enviada para chat_id %s", chat_id)
        return CONTRATO_ATUALIZAR_SELECAO
    except Exception as e:
        logger.error("Erro ao listar contratos pendentes para chat_id %s: %s", chat_id, e)
        await query.message.reply_text(
            "❌ Algo deu errado. Tente novamente.",
            parse_mode="Markdown"
        )
        return ConversationHandler.END

async def contrato_atualizar_selecao(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    """Recebe a seleção do contrato a ser atualizado."""
    query = update.callback_query
    await query.answer()
    chat_id = query.message.chat_id
    contrato_id = query.data.split(":")[1]
    context.user_data["contrato_id"] = contrato_id
    logger.info("Contrato selecionado para atualização para chat_id %s: %s", chat_id, contrato_id)
    await query.message.reply_text(
        "📅 Quando o contrato foi assinado? (Ex.: 25/04/2025)",
        parse_mode="Markdown"
    )
    return CONTRATO_ATUALIZAR_DATA

async def contrato_atualizar_data(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    """Recebe a data de assinatura, calcula a data de vencimento e atualiza o contrato."""
    data_texto = update.message.text.strip()
    chat_id = str(update.effective_chat.id)
    contrato_id = context.user_data["contrato_id"]
    try:
        data_assinatura = datetime.strptime(data_texto, "%d/%m/%Y").replace(tzinfo=TIMEZONE)
        logger.info("Data de assinatura recebida para chat_id %s: %s", chat_id, data_assinatura.isoformat())
        
        # Recuperar o contrato para obter o prazo
        doc_ref = db.collection("users").document(chat_id).collection("contratos").document(contrato_id)
        doc = doc_ref.get()
        if not doc.exists:
            raise ValueError("Contrato não encontrado")
        contrato_data = doc.to_dict()
        prazo_meses = contrato_data["prazo_meses"]
        
        # Calcular data_vencimento com base em data_assinatura
        data_vencimento = data_assinatura + timedelta(days=30 * prazo_meses)
        
        doc_ref.update({
            "status": "concluido",
            "data_assinatura": data_assinatura.isoformat(),
            "data_vencimento": data_vencimento.isoformat(),
            "timestamp": datetime.now(TIMEZONE).timestamp()
        })
        logger.info("Contrato atualizado para concluído para chat_id %s: %s", chat_id, contrato_id)
        await update.message.reply_text(
            f"✅ Contrato atualizado para concluído em {data_assinatura.strftime('%d/%m/%Y')} com vencimento em {data_vencimento.strftime('%d/%m/%Y')}!",
            parse_mode="Markdown"
        )
    except ValueError as e:
        logger.warning("Data ou contrato inválido para chat_id %s: %s", chat_id, str(e))
        await update.message.reply_text(
            "❌ Use DD/MM/YYYY, como 25/04/2025, ou contrato não encontrado.",
            parse_mode="Markdown"
        )
        return CONTRATO_ATUALIZAR_DATA
    except Exception as e:
        logger.error("Erro ao atualizar contrato para chat_id %s: %s", chat_id, e)
        await update.message.reply_text(
            "❌ Algo deu errado. Tente de novo.",
            parse_mode="Markdown"
        )
    
    context.user_data.clear()
    return ConversationHandler.END

async def contrato_excluir_start(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    """Inicia a exclusão de um contrato pendente."""
    query = update.callback_query
    await query.answer()
    chat_id = str(query.message.chat_id)
    logger.info("Iniciando exclusão de contrato para chat_id %s", chat_id)
    
    try:
        contratos = list(db.collection("users").document(chat_id).collection("contratos").where("status", "==", "pendente").stream())
        if not contratos:
            logger.info("Nenhum contrato pendente encontrado para exclusão para chat_id %s", chat_id)
            await query.message.reply_text(
                "❌ Nenhum contrato pendente encontrado.",
                parse_mode="Markdown"
            )
            return ConversationHandler.END
        
        keyboard = [
            [InlineKeyboardButton(
                f"{doc.to_dict()['cliente']}: {doc.to_dict()['descricao']}",
                callback_data=f"excluir_contrato:{doc.id}"
            )] for doc in contratos
        ]
        reply_markup = InlineKeyboardMarkup(keyboard)
        await query.message.reply_text(
            "🗑️ Selecione o contrato para cancelar:",
            reply_markup=reply_markup,
            parse_mode="Markdown"
        )
        logger.info("Lista de contratos pendentes para exclusão enviada para chat_id %s", chat_id)
        return CONTRATO_EXCLUIR_SELECAO
    except Exception as e:
        logger.error("Erro ao listar contratos pendentes para exclusão para chat_id %s: %s", chat_id, e)
        await query.message.reply_text(
            "❌ Algo deu errado. Tente novamente.",
            parse_mode="Markdown"
        )
        return ConversationHandler.END

async def contrato_excluir_selecao(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    """Exclui o contrato selecionado."""
    query = update.callback_query
    await query.answer()
    chat_id = str(query.message.chat_id)
    contrato_id = query.data.split(":")[1]
    logger.info("Contrato selecionado para exclusão para chat_id %s: %s", chat_id, contrato_id)
    
    try:
        doc_ref = db.collection("users").document(chat_id).collection("contratos").document(contrato_id)
        doc = doc_ref.get()
        if doc.exists and doc.to_dict().get("status") == "pendente":
            doc_ref.delete()
            logger.info("Contrato excluído para chat_id %s: %s", chat_id, contrato_id)
            await query.message.reply_text(
                "🗑️ Contrato cancelado com sucesso!",
                parse_mode="Markdown"
            )
        else:
            logger.warning("Contrato não encontrado ou não pendente para chat_id %s: %s", chat_id, contrato_id)
            await query.message.reply_text(
                "❌ Contrato não encontrado ou não pode ser cancelado.",
                parse_mode="Markdown"
            )
    except Exception as e:
        logger.error("Erro ao excluir contrato para chat_id %s: %s", chat_id, e)
        await query.message.reply_text(
            "❌ Algo deu errado. Tente novamente.",
            parse_mode="Markdown"
        )
    
    context.user_data.clear()
    return ConversationHandler.END

async def contrato_cancel(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    """Cancela a conversa de contrato."""
    chat_id = update.effective_chat.id
    logger.info("Contrato cancelado para chat_id %s", chat_id)
    context.user_data.clear()
    await update.message.reply_text(
        "📝 Beleza, operação cancelada! Qualquer coisa, é só chamar.",
        parse_mode="Markdown"
    )
    return ConversationHandler.END

def setup_handlers(application):
    """Configura os handlers para o comando /contrato."""
    logger.info("Configurando handler de /contrato")
    contrato_conv = ConversationHandler(
        entry_points=[CommandHandler("contrato", contrato_start)],
        states={
            CONTRATO_MENU: [
                CallbackQueryHandler(contrato_menu_callback, pattern="^contratos_(finalizados|pendentes|acompanhar)$"),
                CallbackQueryHandler(contrato_registrar_start, pattern="^registrar_contrato$"),
                CallbackQueryHandler(contrato_atualizar_start, pattern="^atualizar_contrato$"),
                CallbackQueryHandler(contrato_excluir_start, pattern="^excluir_contrato$")
            ],
            CONTRATO_REGISTRAR_CLIENTE: [MessageHandler(filters.TEXT & ~filters.COMMAND, contrato_registrar_cliente)],
            CONTRATO_REGISTRAR_DATA: [MessageHandler(filters.TEXT & ~filters.COMMAND, contrato_registrar_data)],
            CONTRATO_REGISTRAR_VALOR: [MessageHandler(filters.TEXT & ~filters.COMMAND, contrato_registrar_valor)],
            CONTRATO_REGISTRAR_DESCRICAO: [MessageHandler(filters.TEXT & ~filters.COMMAND, contrato_registrar_descricao)],
            CONTRATO_REGISTRAR_PRAZO: [MessageHandler(filters.TEXT & ~filters.COMMAND, contrato_registrar_prazo)],
            CONTRATO_ATUALIZAR_SELECAO: [CallbackQueryHandler(contrato_atualizar_selecao, pattern="^atualizar_contrato:")],
            CONTRATO_ATUALIZAR_DATA: [MessageHandler(filters.TEXT & ~filters.COMMAND, contrato_atualizar_data)],
            CONTRATO_EXCLUIR_SELECAO: [CallbackQueryHandler(contrato_excluir_selecao, pattern="^excluir_contrato:")]
        },
        fallbacks=[CommandHandler("cancelar", contrato_cancel)],
        conversation_timeout=300
    )
    application.add_handler(contrato_conv)
    logger.info("Handler de /contrato configurado")