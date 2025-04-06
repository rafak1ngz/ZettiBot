import sys
import logging
import time

# Configuração básica do logger para imprimir no stdout
logging.basicConfig(
    level=logging.DEBUG,
    format="%(asctime)s - %(levelname)s - %(message)s",
    handlers=[logging.StreamHandler(sys.stdout)]
)

logger = logging.getLogger("TestLogger")

logger.debug("DEBUG: Teste de log iniciando...")
logger.info("INFO: Aplicação iniciada.")
logger.warning("WARNING: Este é um aviso.")
logger.error("ERROR: Este é um erro de teste.")

# Força o flush do stdout
sys.stdout.flush()

# Aguarde alguns segundos para ver a saída antes de encerrar
time.sleep(10)