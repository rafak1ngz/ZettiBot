import os
import json
import nest_asyncio
import logging
import asyncio

# -------------------------------
# Inicialização do Firebase
# -------------------------------
import firebase_admin
from firebase_admin import credentials, firestore

# Aplica o patch para evitar erros com o event loop
nest_asyncio.apply()

# Configura o logging
logging.basicConfig(
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    level=logging.INFO,
)

# Obtém a chave JSON do Firebase a partir da variável de ambiente "FIREBASE_CREDENTIALS"
firebase_credentials = os.environ.get("FIREBASE_CREDENTIALS")
if not firebase_credentials:
    logging.error("Variável de ambiente FIREBASE_CREDENTIALS não definida!")
    exit(1)

try:
    cred_dict = json.loads(firebase_credentials)
except json.JSONDecodeError as error:
    logging.error("Erro ao decodificar FIREBASE_CREDENTIALS: %s", error)
    exit(1)

# Inicializa o Firebase Admin com as credenciais carregadas
cred = credentials.Certificate(cred_dict)
firebase_admin.initialize_app(cred)
db = firestore.client()
logging.info("Firebase inicializado com sucesso!")

# -------------------------------
# Integração com o Telegram Bot
# -------------------------------
from telegram import Update
from telegram.ext import ApplicationBuilder, CommandHandler, ContextTypes

# Comando /start para testar a integração do bot
async def start(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    await update.message.reply_text("Olá Rafael! O bot está ativo com Firebase integrado.")

# Comando /testfirebase para testar a comunicação com o Firestore
async def testfirebase(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    try:
        # Exemplo: grava um documento de teste na coleção "test"
        doc_ref = db.collection("test").document("hello")
        doc_ref.set({
            "message": "Teste de integração Firebase!",
            "timestamp": firestore.SERVER_TIMESTAMP
        })
        await update.message.reply_text("Dados enviados com sucesso para o Firebase!")
    except Exception as error:
        logging.error("Erro ao enviar dados para o Firebase: %s", error)
        await update.message.reply_text("Erro ao enviar dados para o Firebase.")

# Função principal para iniciar o bot
async def main():
    token = os.environ.get("TELEGRAM_TOKEN")
    if not token:
        logging.error("TELEGRAM_TOKEN não definido!")
        return

    # Cria a aplicação do bot usando a nova API (assíncrona)
    application = ApplicationBuilder().token(token).build()

    # Registra os handlers para os comandos
    application.add_handler(CommandHandler("start", start))
    application.add_handler(CommandHandler("testfirebase", testfirebase))

    # Inicia o bot com polling (o loop já gerencia o processo assíncrono)
    await application.run_polling()

if __name__ == "__main__":
    asyncio.run(main())