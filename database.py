import firebase_admin
from firebase_admin import credentials, firestore
import json
from config import FIREBASE_CREDENTIALS, logger

# Inicialização do Firebase
if not FIREBASE_CREDENTIALS:
    logger.error("FIREBASE_CREDENTIALS não definida!")
    exit(1)

try:
    cred_dict = json.loads(FIREBASE_CREDENTIALS)
    logger.info("Credenciais Firebase parseadas")
    cred = credentials.Certificate(cred_dict)
    logger.info("Certificado Firebase criado")
    firebase_admin.initialize_app(cred)
    logger.info("Firebase app inicializado")
    db = firestore.client()
    logger.info("Cliente Firestore criado")
except Exception as e:
    logger.error("Erro ao inicializar Firebase: %s", e)
    exit(1)

# Função para salvar follow-up
def save_followup(chat_id, data):
    try:
        db.collection("users").document(chat_id).collection("followups").document().set(data)
        logger.info("Follow-up salvo para chat_id %s", chat_id)
    except Exception as e:
        logger.error("Erro ao salvar follow-up: %s", e)
        raise

# Função para salvar visita
def save_visit(chat_id, data):
    try:
        db.collection("users").document(chat_id).collection("visitas").document().set(data)
        logger.info("Visita salva para chat_id %s", chat_id)
    except Exception as e:
        logger.error("Erro ao salvar visita: %s", e)
        raise

# Função para salvar interação
def save_interaction(chat_id, data):
    try:
        db.collection("users").document(chat_id).collection("interacoes").document().set(data)
        logger.info("Interação salva para chat_id %s", chat_id)
    except Exception as e:
        logger.error("Erro ao salvar interação: %s", e)
        raise

# Função para buscar clientes no Firebase
def buscar_clientes_firebase(chat_id, localizacao, tipo_cliente):
    clientes = []
    try:
        followups = db.collection("users").document(chat_id).collection("followups").limit(50).stream()
        for doc in followups:
            data = doc.to_dict()
            nome = data.get("cliente", "Sem nome")
            endereco = data.get("endereco", f"{nome}, {localizacao}")
            if tipo_cliente.lower() in nome.lower() or tipo_cliente.lower() in endereco.lower():
                clientes.append({
                    'nome': nome,
                    'endereco': endereco,
                    'telefone': data.get('telefone', 'Não disponível'),
                    'fonte': 'Firebase (Follow-up)'
                })

        visitas = db.collection("users").document(chat_id).collection("visitas").limit(50).stream()
        for doc in visitas:
            data = doc.to_dict()
            nome = data.get("empresa", "Sem nome")
            endereco = data.get("endereco", f"{nome}, {localizacao}")
            if tipo_cliente.lower() in nome.lower() or tipo_cliente.lower() in endereco.lower():
                clientes.append({
                    'nome': nome,
                    'endereco': endereco,
                    'telefone': data.get('telefone', 'Não disponível'),
                    'fonte': 'Firebase (Visita)'
                })
        
        logger.info("Clientes buscados no Firebase: %d encontrados", len(clientes))
        return clientes
    except Exception as e:
        logger.error("Erro ao buscar clientes no Firebase: %s", e)
        return []