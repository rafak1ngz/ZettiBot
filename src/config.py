import os
from dotenv import load_dotenv

# Carrega variáveis de ambiente (para desenvolvimento local)
load_dotenv()

# Configurações do Bot
BOT_TOKEN = os.getenv('BOT_TOKEN')
WEBHOOK_URL = os.getenv('WEBHOOK_URL')  # URL da sua função Vercel

# Configurações Supabase
SUPABASE_URL = os.getenv('SUPABASE_URL')
SUPABASE_KEY = os.getenv('SUPABASE_KEY')

# Configurações Google Maps
GMAPS_API_KEY = os.getenv('GMAPS_API_KEY', '')

# Configurações gerais
BOT_NAME = 'ZettiBot'
BOT_USERNAME = os.getenv('BOT_USERNAME', '@SeuZettiBotTelegram')

# Modo de desenvolvimento
IS_DEV = os.getenv('ENVIRONMENT', 'development') == 'development'