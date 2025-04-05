import os
import json
import logging
import asyncio
import nest_asyncio
from datetime import datetime

# -------------------------------
# Inicialização do Firebase
# -------------------------------
import firebase_admin
from firebase_admin import credentials, firestore

# Aplica o patch para o asyncio (necessário em alguns ambientes, como o Railway)
nest_asyncio.apply()

# Configura o logging
logging.basicConfig(
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
    level=logging.INFO,
)

# Obtém as credenciais do Firebase através da variável de ambiente "FIREBASE_CREDENTIALS"
firebase_credentials = os.environ.get("FIREBASE_CREDENTIALS")
if not firebase_credentials:
    logging.error("Variável de ambiente FIREBASE_CREDENTIALS não definida!")
    exit(1)

try:
    cred_dict = json.loads(firebase_credentials)
except json.JSONDecodeError as error:
    logging.error("Erro ao decodificar FIREBASE_CREDENTIALS: %s", error)
    exit(1)

# Inicializa o Firebase Admin e o cliente Firestore
cred = credentials.Certificate(cred_dict)
firebase_admin.initialize_app(cred)
db = firestore.client()
logging.info("Firebase inicializado com sucesso!")

# -------------------------------
# Integração com o Telegram Bot
# -------------------------------
from telegram import Update
from telegram.ext import ApplicationBuilder, CommandHandler, ContextTypes

# Comando /start para testar se o bot está ativo
async def start(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    await update.message.reply_text("Olá Rafael! Seu bot está ativo e integrado com o Firebase.")

# Comando /testfirebase para testar a integração com o Firestore
async def testfirebase(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    try:
        doc_ref = db.collection("test").document("hello")
        doc_ref.set({
            "message": "Teste de integração Firebase!",
            "timestamp": firestore.SERVER_TIMESTAMP
        })
        await update.message.reply_text("Dados enviados com sucesso para o Firebase!")
    except Exception as error:
        logging.error("Erro ao enviar dados para o Firebase: %s", error)
        await update.message.reply_text("Erro ao enviar dados para o Firebase.")

# Comando /followup para registrar follow-ups e lembretes
# Exemplo de uso: /followup EmpresaX 25/04/2025 Ligar para confirmar proposta
async def followup(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    try:
        args = context.args
        if len(args) < 3:
            await update.message.reply_text(
                "Uso: /followup <cliente> <data(dd/mm/yyyy)> <descrição>"
            )
            return

        cliente = args[0]
        data_str = args[1]
        descricao = " ".join(args[2:])

        # Converte a data recebida para o formato ISO para armazenar no Firestore
        try:
            data_follow = datetime.strptime(data_str, "%d/%m/%Y").date()
        except ValueError:
            await update.message.reply_text("Formato de data inválido! Utilize dd/mm/yyyy.")
            return

        # Cria um documento na coleção "followups" do Firestore
        doc_ref = db.collection("followups").document()
        doc_ref.set({
            "cliente": cliente,
            "data_follow": data_follow.isoformat(),
            "descricao": descricao,
            "criado_em": datetime.now().isoformat()
        })

        await update.message.reply_text(
            f"Follow-up para {cliente} registrado para {data_follow.isoformat()} com sucesso!"
        )
    except Exception as e:
        logging.error("Erro ao registrar follow-up: %s", e)
        await update.message.reply_text("Erro ao registrar follow-up: " + str(e))

# Função principal para iniciar o bot
async def main():
    token = os.environ.get("TELEGRAM_TOKEN")
    if not token:
        logging.error("TELEGRAM_TOKEN não definido!")
        return

    application = ApplicationBuilder().token(token).build()

    # Registra os handlers para os comandos
    application.add_handler(CommandHandler("start", start))
    application.add_handler(CommandHandler("testfirebase", testfirebase))
    application.add_handler(CommandHandler("followup", followup))

    # Inicia o bot com polling de forma assíncrona
    await application.run_polling()

if __name__ == "__main__":
    asyncio.run(main())