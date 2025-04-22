import logging
from telegram import Update, InlineKeyboardButton, InlineKeyboardMarkup
from telegram.ext import (
    Application,
    CommandHandler,
    ContextTypes,
    ConversationHandler,
    MessageHandler,
    filters,
)
from config import GOOGLE_API_KEY, TIMEZONE
from database import db
import googlemaps
from datetime import datetime
import json

# Estados
BUSCA_TIPO, BUSCA_LOCALIZACAO, BUSCA_RAIO, BUSCA_QUANTIDADE = range(4)

# Logger
logger = logging.getLogger(__name__)

# Inicializar Google Maps
try:
    gmaps = googlemaps.Client(key=GOOGLE_API_KEY)
    logger.info("Cliente Google Maps inicializado")
except Exception as e:
    logger.error("Erro ao inicializar Google Maps: %s", e)
    raise

async def buscar_potenciais_clientes_google(localizacao, tipo_cliente, raio_km, chat_id):
    cache_key = f"cache_{chat_id}_{localizacao}_{tipo_cliente}_{raio_km}"
    logger.info("Buscando clientes para cache_key: %s", cache_key)
    try:
        cache = db.collection("cache").document(cache_key).get()
        if cache.exists and (datetime.now().timestamp() - cache.to_dict().get("timestamp", 0)) < 24 * 3600:
            logger.info("Usando cache para busca de clientes: %s", cache_key)
            return cache.to_dict().get("resultados", [])

        geocode_result = gmaps.geocode(localizacao)
        if not geocode_result:
            logger.warning("Localização não encontrada: %s", localizacao)
            return "📍 Ops, não encontrei essa localização. Tenta outra?"

        lat = geocode_result[0]["geometry"]["location"]["lat"]
        lng = geocode_result[0]["geometry"]["location"]["lng"]

        resultados = []
        lugares = gmaps.places_nearby(
            location=(lat, lng),
            radius=raio_km * 1000,
            keyword=tipo_cliente,
            type="establishment",
        )

        for lugar in lugares["results"][:5]:
            nome = lugar.get("name", "Sem nome")
            endereco = lugar.get("vicinity", "Sem endereço")
            place_id = lugar["place_id"]
            detalhes = gmaps.place(place_id=place_id, fields=["formatted_phone_number"])
            telefone = detalhes["result"].get("formatted_phone_number", "Não disponível")
            resultados.append(
                {
                    "nome": nome,
                    "endereco": endereco,
                    "telefone": telefone,
                    "coordenadas": lugar["geometry"]["location"],
                    "fonte": "Google Maps",
                }
            )

        if not resultados:
            logger.info("Nenhum cliente encontrado para %s em %s", tipo_cliente, localizacao)
            return "😕 Nenhum cliente encontrado nessa região. Tenta outro segmento?"

        db.collection("cache").document(cache_key).set(
            {"resultados": resultados, "timestamp": datetime.now().timestamp()}
        )
        logger.info("Clientes salvos no cache: %d encontrados", len(resultados))
        return resultados

    except Exception as e:
        logger.error("Erro na busca de clientes no Google Maps: %s", e)
        return f"😅 Deu um erro ao buscar clientes: {str(e)}. Tenta de novo?"

async def buscapotenciais_start(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    logger.info("Iniciando /buscapotenciais para chat_id %s", update.effective_chat.id)
    await update.message.reply_text(
        "🔍 E aí, parceiro! Que tipo de cliente você quer encontrar? (Ex.: 'indústria', 'logística')",
        parse_mode="Markdown",
    )
    return BUSCA_TIPO

async def buscapotenciais_tipo(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    context.user_data["busca_tipo"] = update.message.text.strip()
    logger.info("Tipo recebido: %s", context.user_data["busca_tipo"])
    await update.message.reply_text("📍 Qual a região? (Ex.: 'Vila Velha, ES')")
    return BUSCA_LOCALIZACAO

async def buscapotenciais_localizacao(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    context.user_data["busca_localizacao"] = update.message.text.strip()
    logger.info("Localização recebida: %s", context.user_data["busca_localizacao"])
    await update.message.reply_text("📏 Até quantos km você quer buscar? (Ex.: '10')")
    return BUSCA_RAIO

async def buscapotenciais_raio(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    try:
        raio = float(update.message.text.strip())
        if raio <= 0:
            raise ValueError
    except ValueError:
        logger.warning("Raio inválido: %s", update.message.text)
        await update.message.reply_text("😅 Tenta um número maior que 0, tipo '10'!")
        return BUSCA_RAIO
    context.user_data["busca_raio"] = raio
    logger.info("Raio recebido: %s", raio)
    await update.message.reply_text("📋 Quantos clientes quer ver? (Ex.: '5')")
    return BUSCA_QUANTIDADE

async def buscapotenciais_quantidade(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    try:
        quantidade = int(update.message.text.strip())
        if quantidade <= 0:
            raise ValueError
    except ValueError:
        logger.warning("Quantidade inválida: %s", update.message.text)
        await update.message.reply_text("😅 Digita um número maior que 0, tipo '5'!")
        return BUSCA_QUANTIDADE

    tipo_cliente = context.user_data["busca_tipo"]
    localizacao = context.user_data["busca_localizacao"]
    raio = context.user_data["busca_raio"]
    chat_id = str(update.effective_chat.id)
    logger.info(
        "Buscando %d clientes para '%s' em %s (raio %s km)",
        quantidade,
        tipo_cliente,
        localizacao,
        raio,
    )

    termos = [termo.strip() for termo in tipo_cliente.split(",")]
    clientes = []

    for termo in termos:
        resultado = await buscar_potenciais_clientes_google(localizacao, termo, raio, chat_id)
        if isinstance(resultado, list):
            clientes.extend(resultado)
        elif isinstance(resultado, str):
            await update.message.reply_text(resultado)
            return ConversationHandler.END

    if not clientes:
        logger.info("Nenhum cliente encontrado para %s em %s", tipo_cliente, localizacao)
        await update.message.reply_text(
            "😕 Não achei nenhum cliente com esses termos. Tenta outra região ou segmento?"
        )
        return ConversationHandler.END

    clientes_unicos = {cliente["nome"]: cliente for cliente in clientes}.values()
    clientes_unicos = list(clientes_unicos)

    if quantidade > len(clientes_unicos):
        quantidade = len(clientes_unicos)

    msg = f"🔍 *Achei esses clientes pra '{tipo_cliente}' ({quantidade} de {len(clientes_unicos)}):*\n"
    for cliente in clientes_unicos[:quantidade]:
        msg += (
            f"• *{cliente['nome']}* ({cliente['fonte']})\n"
            f"  📍 {cliente['endereco']}\n"
            f"  📞 {cliente['telefone']}\n"
        )

    context.user_data["clientes_potenciais"] = clientes_unicos
    try:
        await update.message.reply_text(msg, parse_mode="Markdown")
        logger.info("Clientes enviados: %d exibidos", quantidade)
    except Exception as e:
        logger.error("Erro ao enviar mensagem: %s", e)
        await update.message.reply_text("😅 Deu um erro ao mostrar os clientes. Tenta de novo!")
    return ConversationHandler.END

async def buscapotenciais_cancel(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    logger.info("Busca cancelada para chat_id %s", update.effective_chat.id)
    await update.message.reply_text("🔍 Beleza, busca cancelada! Qualquer coisa, é só chamar.")
    return ConversationHandler.END

def setup_handlers(app: Application) -> None:
    """Configura os handlers do módulo."""
    buscapotenciais_conv = ConversationHandler(
        entry_points=[CommandHandler("buscapotenciais", buscapotenciais_start)],
        states={
            BUSCA_TIPO: [MessageHandler(filters.TEXT & ~filters.COMMAND, buscapotenciais_tipo)],
            BUSCA_LOCALIZACAO: [
                MessageHandler(filters.TEXT & ~filters.COMMAND, buscapotenciais_localizacao)
            ],
            BUSCA_RAIO: [MessageHandler(filters.TEXT & ~filters.COMMAND, buscapotenciais_raio)],
            BUSCA_QUANTIDADE: [
                MessageHandler(filters.TEXT & ~filters.COMMAND, buscapotenciais_quantidade)
            ],
        },
        fallbacks=[CommandHandler("cancelar", buscapotenciais_cancel)],
        conversation_timeout=300,
    )
    app.add_handler(buscapotenciais_conv)
    logger.info("Handler de /buscapotenciais configurado")