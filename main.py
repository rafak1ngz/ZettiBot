import nest_asyncio
from telegram import Update
from telegram.ext import (
    ApplicationBuilder,
    CommandHandler,
    ConversationHandler,
    MessageHandler,
    filters,
    CallbackQueryHandler,
    ContextTypes,
)
from config import *
from handlers.basic import inicio, ajuda, quem_visitar, quem_visitar_callback
from handlers.followup import (
    followup_start,
    followup_client,
    followup_date,
    followup_description,
    followup_cancel,
)
from handlers.visita import (
    visita_start,
    visita_company,
    visita_date,
    visita_motive,
    visita_followup_callback,
    visita_followup_date,
    visita_followup_motivo,
    visita_cancel,
    VISIT_COMPANY,
    VISIT_DATE,
    VISIT_MOTIVE,
    VISIT_FOLLOWUP_CHOICE,
    VISIT_FOLLOWUP_DATE,
    VISIT_FOLLOWUP_MOTIVO,
)
from handlers.interacao import (
    interacao_start,
    interacao_tipo,
    interacao_cliente,
    interacao_data,
    interacao_detalhes,
    interacao_cancel,
    INTERACAO_TIPO,
    INTERACAO_CLIENTE,
    INTERACAO_DATA,
    INTERACAO_DETALHES,
)
from handlers.editar import (
    editar_start,
    editar_category_callback,
    editar_record_callback,
    editar_field_callback,
    editar_new_value,
    editar_cancel,
)
from handlers.filtrar import (
    filtrar_start,
    filtrar_category_callback,
    filtrar_type_callback,
    filtrar_value,
    filtrar_cancel,
)
from handlers.historico import (
    historico_conv_start,
    historico_conv_start_received,
    historico_conv_end_received,
    historico_conv_cancel,
)
from handlers.excluir import (
    excluir_start,
    excluir_category_callback,
    excluir_record_callback,
    excluir_confirm_callback,
    excluir_cancel,
    DELETE_CATEGORY,
    DELETE_RECORD,
    DELETE_CONFIRM,
)
from handlers.buscapotenciais import setup_handlers as buscapotenciais_setup
from handlers.criarrota import setup_handlers as criarrota_setup
from jobs import *
from datetime import time

# Patch para nest_asyncio
nest_asyncio.apply()

async def error_handler(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    logger.error(f"Erro no update {update}: {context.error}")

async def main():
    logger.info("Iniciando função main()")

    if not TELEGRAM_TOKEN:
        logger.error("TELEGRAM_TOKEN não definido!")
        return

    logger.info("TELEGRAM_TOKEN encontrado, construindo aplicação")
    try:
        app = ApplicationBuilder().token(TELEGRAM_TOKEN).build()
        logger.info("Aplicação Telegram construída com sucesso")
    except Exception as e:
        logger.error("Erro ao construir aplicação Telegram: %s", e)
        return

    app.add_error_handler(error_handler)

    logger.info("Iniciando configuração de handlers")

    # Handlers para comandos simples
    app.add_handler(CommandHandler("inicio", inicio))
    app.add_handler(CommandHandler("ajuda", ajuda))
    app.add_handler(CommandHandler("quemvisitar", quem_visitar))
    app.add_handler(CallbackQueryHandler(quem_visitar_callback, pattern="^quemvisitar_done:"))

    # Conversação para Follow-up
    followup_conv = ConversationHandler(
        entry_points=[CommandHandler("followup", followup_start)],
        states={
            FOLLOWUP_CLIENT: [MessageHandler(filters.TEXT & ~filters.COMMAND, followup_client)],
            FOLLOWUP_DATE: [MessageHandler(filters.TEXT & ~filters.COMMAND, followup_date)],
            FOLLOWUP_DESCRIPTION: [
                MessageHandler(filters.TEXT & ~filters.COMMAND, followup_description)
            ],
        },
        fallbacks=[CommandHandler("cancelar", followup_cancel)],
        conversation_timeout=300,
    )
    app.add_handler(followup_conv)

    # Conversação para Visita
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
        conversation_timeout=300,
    )
    app.add_handler(visita_conv)

    # Conversação para Interação
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
        conversation_timeout=300,
    )
    app.add_handler(interacao_conv)

    # Conversação para Editar
    editar_conv = ConversationHandler(
        entry_points=[CommandHandler("editar", editar_start)],
        states={
            EDIT_CATEGORY: [
                CallbackQueryHandler(editar_category_callback, pattern="^edit_category:")
            ],
            EDIT_RECORD: [CallbackQueryHandler(editar_record_callback, pattern="^edit_record:")],
            EDIT_FIELD: [CallbackQueryHandler(editar_field_callback, pattern="^edit_field:")],
            EDIT_NEW_VALUE: [MessageHandler(filters.TEXT & ~filters.COMMAND, editar_new_value)],
        },
        fallbacks=[CommandHandler("cancelar", editar_cancel)],
        conversation_timeout=300,
    )
    app.add_handler(editar_conv)

    # Conversação para Filtrar
    filtrar_conv = ConversationHandler(
        entry_points=[CommandHandler("filtrar", filtrar_start)],
        states={
            FILTER_CATEGORY: [
                CallbackQueryHandler(filtrar_category_callback, pattern="^filter_category:")
            ],
            FILTER_TYPE: [CallbackQueryHandler(filtrar_type_callback, pattern="^filter_type:")],
            FILTER_VALUE: [MessageHandler(filters.TEXT & ~filters.COMMAND, filtrar_value)],
        },
        fallbacks=[CommandHandler("cancelar", filtrar_cancel)],
        conversation_timeout=300,
    )
    app.add_handler(filtrar_conv)

    # Conversação para Histórico
    historico_conv = ConversationHandler(
        entry_points=[CommandHandler("historico", historico_conv_start)],
        states={
            HIST_START: [
                MessageHandler(filters.TEXT & ~filters.COMMAND, historico_conv_start_received)
            ],
            HIST_END: [
                MessageHandler(filters.TEXT & ~filters.COMMAND, historico_conv_end_received)
            ],
        },
        fallbacks=[CommandHandler("cancelar", historico_conv_cancel)],
        conversation_timeout=300,
    )
    app.add_handler(historico_conv)

    # Conversação para Excluir
    excluir_conv = ConversationHandler(
        entry_points=[CommandHandler("excluir", excluir_start)],
        states={
            DELETE_CATEGORY: [
                CallbackQueryHandler(excluir_category_callback, pattern="^delete_category:")
            ],
            DELETE_RECORD: [
                CallbackQueryHandler(excluir_record_callback, pattern="^delete_record:")],
            DELETE_CONFIRM: [
                CallbackQueryHandler(excluir_confirm_callback, pattern="^delete_confirm:")
            ],
        },
        fallbacks=[CommandHandler("cancelar", excluir_cancel)],
        conversation_timeout=300,
    )
    app.add_handler(excluir_conv)

    # Configurar Busca de Potenciais
    buscapotenciais_setup(app)

    # Configurar Criar Rota
    criarrota_setup(app)

    logger.info("Handlers configurados, iniciando polling")

    try:
        await app.run_polling()
        logger.info("Bot iniciado com sucesso")
    except Exception as e:
        logger.error("Erro ao iniciar polling: %s", e)

if __name__ == "__main__":
    import asyncio

    asyncio.run(main())