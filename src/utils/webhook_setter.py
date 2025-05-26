# src/utils/webhook_setter.py
import requests
from src.config import BOT_TOKEN, WEBHOOK_URL

def set_telegram_webhook():
    """Configura o webhook do Telegram"""
    url = f"https://api.telegram.org/bot{BOT_TOKEN}/setWebhook"
    params = {
        "url": WEBHOOK_URL,
        "drop_pending_updates": True
    }
    
    response = requests.get(url, params=params)
    return response.json()

# Use este método para configurar quando necessário