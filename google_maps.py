import googlemaps
import random
from config import GOOGLE_API_KEY, logger, TIMEZONE
from database import db  # Importamos db de database.py
from datetime import datetime

# Inicialização do Google Maps
if not GOOGLE_API_KEY:
    logger.error("GOOGLE_API_KEY não definida!")
    exit(1)

try:
    gmaps = googlemaps.Client(key=GOOGLE_API_KEY)
    logger.info("Cliente Google Maps criado")
except Exception as e:
    logger.error("Erro ao inicializar Google Maps: %s", e)
    exit(1)

# Função para buscar clientes no Google Maps com cache
def buscar_potenciais_clientes_google(localizacao, tipo_cliente, raio_km=10, chat_id=None):
    cache_key = f"cache_{chat_id}_{localizacao}_{tipo_cliente}_{raio_km}"
    try:
        cache = db.collection("cache").document(cache_key).get()
        if cache.exists and (datetime.now(TIMEZONE).timestamp() - cache.to_dict().get("timestamp", 0)) < 24 * 3600:
            logger.info("Usando cache para busca de clientes: %s", cache_key)
            return cache.to_dict().get("resultados", [])
        
        geocode_result = gmaps.geocode(localizacao)
        if not geocode_result:
            return "📍 Ops, não encontrei essa localização. Tenta outra?"
        
        lat = geocode_result[0]['geometry']['location']['lat']
        lng = geocode_result[0]['geometry']['location']['lng']
        
        resultados = []
        lugares = gmaps.places_nearby(
            location=(lat, lng),
            radius=raio_km * 1000,
            keyword=tipo_cliente,
            type="establishment"
        )
        
        for lugar in lugares['results'][:5]:
            nome = lugar.get('name', 'Sem nome')
            endereco = lugar.get('vicinity', 'Sem endereço')
            place_id = lugar['place_id']
            detalhes = gmaps.place(place_id=place_id, fields=['formatted_phone_number'])
            telefone = detalhes['result'].get('formatted_phone_number', 'Não disponível')
            resultados.append({
                'nome': nome,
                'endereco': endereco,
                'telefone': telefone,
                'coordenadas': lugar['geometry']['location'],
                'fonte': 'Google Maps'
            })
        
        if not resultados:
            return "😕 Nenhum cliente encontrado nessa região. Tenta outro segmento?"
        
        db.collection("cache").document(cache_key).set({
            "resultados": resultados,
            "timestamp": datetime.now(TIMEZONE).timestamp()
        })
        logger.info("Clientes buscados no Google Maps: %d encontrados", len(resultados))
        return resultados
    except Exception as e:
        logger.error("Erro na busca de clientes no Google Maps: %s", e)
        return f"😅 Deu um erro ao buscar clientes: {str(e)}. Tenta de novo?"

# Função para criar rota no Google Maps
def criar_rota_google(localizacao_inicial, num_clientes, clientes):
    try:
        geocode_result = gmaps.geocode(localizacao_inicial)
        if not geocode_result:
            return "📍 Ops, não encontrei essa localização inicial."
        
        origem = geocode_result[0]['geometry']['location']
        
        if len(clientes) < num_clientes:
            num_clientes = len(clientes)
        
        clientes_selecionados = random.sample(clientes, num_clientes)
        waypoints = [cliente['coordenadas'] for cliente in clientes_selecionados]
        
        rota = gmaps.directions(
            origin=origem,
            destination=origem,
            waypoints=waypoints,
            mode="driving",
            optimize_waypoints=True
        )
        
        if not rota:
            return "😕 Não consegui montar a rota. Tenta outra região?"
        
        ordem = rota[0]['waypoint_order']
        pernas = rota[0]['legs']
        
        roteiro = f"🗺️ *Rota otimizada saindo de {localizacao_inicial}:*\n"
        total_distancia = 0
        total_tempo = 0
        
        roteiro += f"1. *Origem* ({localizacao_inicial}): 0.0 km, 0 min\n"
        
        for i, idx in enumerate(ordem, start=2):
            perna = pernas[i-1]
            cliente = clientes_selecionados[idx]
            distancia = perna['distance']['text']
            tempo = perna['duration']['text']
            total_distancia += perna['distance']['value']
            total_tempo += perna['duration']['value']
            roteiro += f"{i}. *{cliente['nome']}* ({cliente['fonte']}): {distancia}, {tempo}\n"
        
        if len(pernas) > len(ordem):
            perna_retorno = pernas[-1]
            distancia = perna_retorno['distance']['text']
            tempo = perna_retorno['duration']['text']
            total_distancia += perna_retorno['distance']['value']
            total_tempo += perna_retorno['duration']['value']
            roteiro += f"{len(ordem) + 2}. *Retorno à Origem* ({localizacao_inicial}): {distancia}, {tempo}\n"
        
        roteiro += f"\n*Total*: {total_distancia/1000:.1f} km, {total_tempo//60} minutos"
        logger.info("Rota criada com sucesso: %d clientes", num_clientes)
        return roteiro
    except Exception as e:
        logger.error("Erro na criação da rota: %s", e)
        return f"😅 Deu um erro ao montar a rota: {str(e)}. Tenta de novo?"