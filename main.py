import os
import logging
from telegram import Update
from telegram.ext import Updater, CommandHandler, CallbackContext

# Configura o logging
logging.basicConfig(format='%(asctime)s - %(name)s - %(levelname)s - %(message)s', level=logging.INFO)

def start(update: Update, context: CallbackContext) -> None:
    update.message.reply_text("Olá Rafael! Seu bot está ativo e pronto para gerenciar suas tarefas.")

def main():
    token = os.environ.get("TELEGRAM_TOKEN")
    if not token:
        print("Erro: TELEGRAM_TOKEN não definido.")
        return
    # Remova o parâmetro `use_context`
    updater = Updater(token)
    dp = updater.dispatcher

    dp.add_handler(CommandHandler("start", start))

    updater.start_polling()
    updater.idle()

if __name__ == "__main__":
    main()