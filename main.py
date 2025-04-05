import os
import logging
import asyncio
import nest_asyncio  # Importa o nest_asyncio
from telegram import Update
from telegram.ext import ApplicationBuilder, CommandHandler, ContextTypes

# Aplica o patch para permitir reentrar no event loop
nest_asyncio.apply()

# Configura o logging para facilitar o debug
logging.basicConfig(
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    level=logging.INFO,
)

# Função assíncrona para tratar o comando /start
async def start(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    await update.message.reply_text("Olá Rafael! Seu bot está ativo e pronto para gerenciar suas tarefas.")

async def main():
    token = os.getenv("TELEGRAM_TOKEN")
    if not token:
        print("Erro: TELEGRAM_TOKEN não definido.")
        return

    # Cria a aplicação utilizando ApplicationBuilder
    application = ApplicationBuilder().token(token).build()
    # Adiciona o handler para o comando /start
    application.add_handler(CommandHandler("start", start))
    # Inicia o bot com polling de forma assíncrona
    await application.run_polling()

if __name__ == '__main__':
    asyncio.run(main())