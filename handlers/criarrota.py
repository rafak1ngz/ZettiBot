import logging
import random
from telegram import Update
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
from handlers.buscapotenciais import buscar_potenciais_clientes_google

# Estados
ROTA_TIPO, ROTA_LOCALIZACAO, ROTA_RAIO, ROTA_QUANTIDADE = range(4)

# Logger
logger = logging.getLogger(__name__)

# Inicializar Google Maps
try:
    gmaps = googlemaps.Client(key=GOOGLE_API_KEY)
    logger.info("Cliente Google Maps inicializado para criarrota")
except Exception as e:
    logger.error("Erro ao inicializar Google Maps: %s", e)
    raise

async def buscar_clientes_firebase(chat_id, localizacao, tipo_cliente):
    clientes = []
    try:
        followups = db.collection("users").document(chat_id).collection("followups").limit(50).stream()
        for doc in followups:
            data = doc.to_dict()
            nome = data.get("cliente", "Sem nome")
            endereco = data.get("endereco", f"{nome}, {localizacao}")
            if tipo_cliente.lower() in nome.lower() or tipo_cliente.lower() in endereco.lower():
                geocode_result = gmaps.geocode(endereco)
                if geocode_result:
                    coordenadas = geocode_result[0]["geometry"]["location"]
                    clientes.append({
                        "nome": nome,
                        "endereco": endereco,
                        "telefone": data.get("telefone", "Não disponível"),
                        "coordenadas": coordenadas,
                        "fonte": "Firebase (Follow-up)"
                    })

        visitas = db.collection("users").document(chat_id).collection("visitas").limit(50).stream()
        for doc in visitas:
            data = doc.to_dict()
            nome = data.get("empresa", "Sem nome")
            endereco = data.get("endereco", f"{nome}, {localizacao}")
            if tipo_cliente.lower() in nome.lower() or tipo_cliente.lower() in endereco.lower():
                geocode_result = gmaps.geocode(endereco)
                if geocode_result:
                    coordenadas = geocode_result[0]["geometry"]["location"]
                    clientes.append({
                        "nome": nome,
                        "endereco": endereco,
                        "telefone": data.get("telefone", "Não disponível"),
                        "coordenadas": coordenadas,
                        "fonte": "Firebase (Visita)"
                    })

        logger.info("Clientes buscados no Firebase: %d encontrados", len(clientes))
        return clientes
    except Exception as e:
        logger.error("Erro ao buscar clientes no Firebase: %s", e)
        return []

async def criar_rota_google(localizacao_inicial, num_clientes, clientes):
    try:
        geocode_result = gmaps.geocode(localizacao_inicial)
        if not geocode_result:
            logger.warning("Localização inicial não encontrada: %s", localizacao_inicial)
            return "📍 Ops, não encontrei essa localização inicial."

        origem = geocode_result[0]["geometry"]["location"]

        if len(clientes) < num_clientes:
            num_clientes = len(clientes)

        clientes_selecionados = random.sample(clientes, num_clientes)
        waypoints = [cliente["coordenadas"] for cliente in clientes_selecionados]

        rota = gmaps.directions(
            origin=origem,
            destination=origem,
            waypoints=waypoints,
            mode="driving",
            optimize_waypoints=True
        )

        if not rota:
            logger.info("Nenhuma rota gerada para %d clientes", num_clientes)
            return "😕 Não consegui montar a rota. Tenta outra região?"

        ordem = rota[0]["waypoint_order"]
        pernas = rota[0]["legs"]

        roteiro = f"🗺️ *Rota otimizada saindo de {localizacao_inicial}:*\n"
        total_distancia = 0
        total_tempo = 0

        roteiro += f"1. *Origem* ({localizacao_inicial}): 0.0 km, 0 min\n"

        for i, idx in enumerate(ordem, start=2):
            perna = pernas[i-1]
            cliente = clientes_selecionados[idx]
            distancia = perna["distance"]["text"]
            tempo = perna["duration"]["text"]
            total_distancia += perna["distance"]["value"]
            total_tempo += perna["duration"]["value"]
            roteiro += f"{i}. *{cliente['nome']}* ({cliente['fonte']}): {distancia}, {tempo}\n"

        if len(pernas) > len(ordem):
            perna_retorno = pernas[-1]
            distancia = perna_retorno["distance"]["text"]
            tempo = perna_retorno["duration"]["text"]
            total_distancia += perna_retorno["distance"]["value"]
            total_tempo += perna_retorno["duration"]["value"]
            roteiro += f"{len(ordem) + 2}. *Retorno à Origem* ({localizacao_inicial}): {distancia}, {tempo}\n"

        roteiro += f"\n*Total*: {total_distancia/1000:.1f} km, {total_tempo//60} minutos"
        logger.info("Rota criada com sucesso: %d clientes", num_clientes)
        return roteiro
    except Exception as e:
        logger.error("Erro na criação da rota: %s", e)
        return f"😅 Deu um erro ao montar a rota: {str(e)}. Tenta de novo?"

async def criarrota_start(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    logger.info("Iniciando /criarrota para chat_id %s", update.effective_chat.id)
    await update.message.reply_text(
        "🗺️ Bora montar uma rota esperta? Qual segmento você quer visitar? (Ex.: 'indústria', 'logística')",
        parse_mode="Markdown"
    )
    return ROTA_TIPO

async def criarrota_tipo(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    context.user_data["rota_tipo"] = update.message.text.strip()
    logger.info("Tipo recebido: %s", context.user_data["rota_tipo"])
    await update.message.reply_text("📍 De onde você vai partir? (Ex.: 'Vila Velha, ES')")
    return ROTA_LOCALIZACAO

async def criarrota_localizacao(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    context.user_data["rota_localizacao"] = update.message.text.strip()
    logger.info("Localização recebida: %s", context.user_data["rota_localizacao"])
    await update.message.reply_text("📏 Qual o raio de busca em km? (Ex.: '10')")
    return ROTA_RAIO

async def criarrota_raio(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    try:
        raio = float(update.message.text.strip())
        if raio <= 0:
            raise ValueError
    except ValueError:
        logger.warning("Raio inválido: %s", update.message.text)
        await update.message.reply_text("😅 Tenta um número maior que 0, tipo '10'!")
        return ROTA_RAIO
    context.user_data["rota_raio"] = raio
    logger.info("Raio recebido: %s", raio)
    await update.message.reply_text("📋 Quantos clientes quer na rota? (Ex.: '5')")
    return ROTA_QUANTIDADE

async def criarrota_quantidade(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    try:
        quantidade = int(update.message.text.strip())
        if quantidade <= 0:
            raise ValueError
    except ValueError:
        logger.warning("Quantidade inválida: %s", update.message.text)
        await update.message.reply_text("😅 Digita um número maior que 0, tipo '5'!")
        return ROTA_QUANTIDADE

    tipo_cliente = context.user_data["rota_tipo"]
    localizacao = context.user_data["rota_localizacao"]
    raio = context.user_data["rota_raio"]
    chat_id = str(update.effective_chat.id)
    logger.info(
        "Montando rota com %d clientes para '%s' em %s (raio %s km)",
        quantidade,
        tipo_cliente,
        localizacao,
        raio
    )

    termos = [termo.strip() for termo in tipo_cliente.split(",")]
    clientes_firebase = []
    for termo in termos:
        resultado = await buscar_clientes_firebase(chat_id, localizacao, termo)
        if resultado:
            clientes_firebase.extend(resultado)

    clientes_google = []
    for termo in termos:
        resultado = await buscar_potenciais_clientes_google(localizacao, termo, raio, chat_id)
        if isinstance(resultado, list):
            clientes_google.extend(resultado)
        else:
            logger.warning("Erro do Google Maps para termo %s: %s", termo, resultado)

    todos_clientes = clientes_firebase + clientes_google

    if not todos_clientes:
        logger.info("Nenhum cliente encontrado para %s em %s", tipo_cliente, localizacao)
        await update.message.reply_text(
            "😕 Não achei clientes pra essa rota. Tenta outro segmento ou região?"
        )
        return ConversationHandler.END

    clientes_unicos = {cliente["nome"]: cliente for cliente in todos_clientes}.values()
    clientes_unicos = list(clientes_unicos)

    if quantidade > len(clientes_unicos):
        quantidade = len(clientes_unicos)
    clientes_selecionados = clientes_unicos[:quantidade]

    msg = f"🗺️ *Rota com {quantidade} clientes pra '{tipo_cliente}':*\n"
    for i, cliente in enumerate(clientes_selecionados, 1):
        msg += (
            f"{i}. *{cliente['nome']}* ({cliente['fonte']})\n"
            f"   📍 {cliente['endereco']}\n"
            f"   📞 {cliente['telefone']}\n"
        )

    rota_otimizada = await criar_rota_google(localizacao, quantidade, clientes_selecionados)
    if not isinstance(rota_otimizada, str) or "Erro" not in rota_otimizada:
        msg += "\n" + rota_otimizada

    context.user_data["clientes_rota"] = clientes_selecionados
    try:
        await update.message.reply_text(msg, parse_mode="Markdown")
        logger.info("Rota enviada com sucesso: %d clientes", quantidade)
    except Exception as e:
        logger.error("Erro ao enviar mensagem: %s", e)
        await update.message.reply_text("😅 Deu um erro ao mostrar a rota. Tenta de novo!")
    return ConversationHandler.END

async def criarrota_cancel(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    logger.info("Rota cancelada para chat_id %s", update.effective_chat.id)
    await update.message.reply_text("🗺️ Beleza, rota cancelada! Qualquer coisa, é só chamar.")
    return ConversationHandler.END

def setup_handlers(app: Application) -> None:
    """Configura os handlers do módulo."""
    criarrota_conv = ConversationHandler(
        entry_points=[CommandHandler("criarrota", criarrota_start)],
        states={
            ROTA_TIPO: [MessageHandler(filters.TEXT & ~filters.COMMAND, criarrota_tipo)],
            ROTA_LOCALIZACAO: [MessageHandler(filters.TEXT & ~filters.COMMAND, criarrota_localizacao)],
            ROTA_RAIO: [MessageHandler(filters.TEXT & ~filters.COMMAND, criarrota_raio)],
            ROTA_QUANTIDADE: [MessageHandler(filters.TEXT & ~filters.COMMAND, criarrota_quantidade)],
        },
        fallbacks=[CommandHandler("cancelar", criarrota_cancel)],
        conversation_timeout=300
    )
    app.add_handler(criarrota_conv)
    logger.info("Handler de /criarrota configurado")