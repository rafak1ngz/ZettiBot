import os
import json
import logging
from zoneinfo import ZoneInfo

# Configuração do Logger
logging.basicConfig(
    format='%(asctime)s - %(levelname)s - %(name)s - %(message)s',
    level=logging.INFO
)
logger = logging.getLogger("__main__")
logging.getLogger("httpx").setLevel(logging.WARNING)

# Fuso horário
TIMEZONE = ZoneInfo("America/Sao_Paulo")

# Variáveis de ambiente
TELEGRAM_TOKEN = os.environ.get("TELEGRAM_TOKEN")
FIREBASE_CREDENTIALS = os.environ.get("FIREBASE_CREDENTIALS")
GOOGLE_API_KEY = os.environ.get("GOOGLE_API_KEY")

# Verificações
if not TELEGRAM_TOKEN:
    logger.error("TELEGRAM_TOKEN não definido!")
    exit(1)
if not GOOGLE_API_KEY:
    logger.error("GOOGLE_API_KEY não definido!")
    exit(1)

# Estados para fluxos do Telegram
FOLLOWUP_CLIENT, FOLLOWUP_DATE, FOLLOWUP_DESCRIPTION = range(3)
VISIT_COMPANY, VISIT_DATE, VISIT_CATEGORY, VISIT_MOTIVE, VISIT_FOLLOWUP_CHOICE, VISIT_FOLLOWUP_DATE, VISIT_FOLLOWUP_MOTIVO = range(3, 10)
INTERACAO_TIPO, INTERACAO_CLIENTE, INTERACAO_DATA, INTERACAO_DETALHES, INTERACAO_FOLLOWUP_CHOICE, INTERACAO_FOLLOWUP_DATE, INTERACAO_FOLLOWUP_MOTIVO = range(4, 11)
REMINDER_TEXT, REMINDER_DATETIME = range(100, 102)
REPORT_START, REPORT_END = range(300, 302)
HIST_START, HIST_END = range(400, 402)
EDIT_CATEGORY, EDIT_RECORD, EDIT_FIELD, EDIT_NEW_VALUE = range(500, 504)
DELETE_CATEGORY, DELETE_RECORD, DELETE_CONFIRMATION = range(600, 603)
FILTER_CATEGORY, FILTER_TYPE, FILTER_VALUE = range(700, 703)
BUSCA_TIPO, BUSCA_LOCALIZACAO, BUSCA_RAIO, BUSCA_QUANTIDADE = range(900, 904)
ROTA_TIPO, ROTA_LOCALIZACAO, ROTA_RAIO, ROTA_QUANTIDADE = range(910, 914)
REAGENDAR_DATA = "REAGENDAR_DATA"

