import os
import json
import logging
import asyncio
import nest_asyncio
import sys
from datetime import datetime

# Aplica o patch do nest_asyncio (ajuda em ambientes onde já existe um event loop)
nest_asyncio.apply()

# ------------------------------------------------------------------------------
# Configuração personalizada de Logging para envio para stdout
# ------------------------------------------------------------------------------
logger = logging.getLogger()
logger.setLevel(logging.INFO)

# Remove os handlers existentes (caso haja) e cria um novo handler para stdout
for handler in logger.handlers[:]:
    logger.removeHandler(handler)

console_handler = logging.StreamHandler(sys.stdout)
console_handler.setLevel(logging.INFO)
formatter = logging.Formatter("%(asctime)s - %(name)s - %(levelname)s - %(message)s")
console_handler.setFormatter(formatter)
logger.addHandler(console_handler)

# Se desejar adicionar um FileHandler para armazenar logs em arquivo, pode fazê-lo aqui.
# ------------------------------------------------------------------------------
# Fim da configuração de Logging
# ------------------------------------------------------------------------------

# ------------------------------------------------------------------------------
# Inicialização do Firebase
# ------------------------------------------------------------------------------
import firebase_admin
from firebase_admin import credentials, firestore

firebase_credentials = os.environ.get("FIREBASE_CREDENTIALS")
if not firebase_credentials:
    logger.error("Variável de ambiente FIREBASE_CREDENTIALS não definida!")
    exit(1)

try:
    cred_dict = json.loads(firebase_credentials)
except json.JSONDecodeError as error:
    logger.error("Erro ao decodificar FIREBASE_CREDENTIALS: %s", error)
    exit(1)

cred = credentials.Certificate(cred_dict)
firebase_admin.initialize_app(cred)
db = firestore.client()
logger.info("Firebase inicializado com sucesso!")

# ------------------------------------------------------------------------------
# Integração com o Telegram Bot (usando a API assíncrona)
# ------------------------------------------------------------------------------
from telegram import Update
from telegram.ext import ApplicationBuilder, CommandHandler, ContextTypes

async def start(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    await update.message.reply_text("Olá Rafael! Seu bot está ativo e integrado com o Firebase.")
    logger.info("Comando /start executado.")

async def testfirebase(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    try:
        doc_ref = db.collection("test").document("hello")
        doc_ref.set({
            "message": "Teste de integração Firebase!",
            "timestamp": firestore.SERVER_TIMESTAMP
        })
        await update.message.reply_text("Dados enviados com sucesso para o Firebase!")
        logger.info("Comando /testfirebase executado com sucesso.")
    except Exception as error:
        logger.error("Erro ao enviar dados para o Firebase: %s", error)
        await update.message.reply_text("Erro ao enviar dados para o Firebase.")

async def followup(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    try:
        args = context.args
        if len(args) < 3:
            await update.message.reply_text("Uso: /followup <cliente> <data(dd/mm/yyyy)> <descrição>")
            logger.warning("Comando /followup chamado com parâmetros insuficientes.")
            return

        cliente = args[0]
        data_str = args[1]
        descricao = " ".join(args[2:])

        try:
            data_follow = datetime.strptime(data_str, "%d/%m/%Y").date()
        except ValueError:
            await update.message.reply_text("Formato de data inválido! Utilize dd/mm/yyyy.")
            logger.warning("Formato de data inválido fornecido ao comando /followup.")
            return

        doc_ref = db.collection("followups").document()
        doc_ref.set({
            "cliente": cliente,
            "data_follow": data_follow.isoformat(),
            "descricao": descricao,
            "criado_em": datetime.now().isoformat()
        })

        await update.message.reply_text(f"Follow-up para {cliente} registrado para {data_follow.isoformat()} com sucesso!")
        logger.info(f"Follow-up registrado para {cliente} com data {data_follow.isoformat()}.")
    except Exception as e:
        logger.error("Erro ao registrar follow-up: %s", e)
        await update.message.reply_text("Erro ao registrar follow-up: " + str(e))

# Error handler para capturar exceções e registrar os erros
async def error_handler(update: object, context: ContextTypes.DEFAULT_TYPE) -> None:
    logger.error("Exception while handling an update: %s", context.error)

async def main():
    token = os.environ.get("TELEGRAM_TOKEN")
    if not token:
        logger.error("TELEGRAM_TOKEN não definido!")
        return

    application = ApplicationBuilder().token(token).build()
    application.add_handler(CommandHandler("start", start))
    application.add_handler(CommandHandler("testfirebase", testfirebase))
    application.add_handler(CommandHandler("followup", followup))
    application.add_error_handler(error_handler)

    logger.info("Iniciando o bot...")
    await application.run_polling()

if __name__ == '__main__':
    asyncio.run(main())