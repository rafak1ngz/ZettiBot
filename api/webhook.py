# api/webhook.py
from flask import Flask, request, Response
import telegram
import sys
import os

# Adiciona o diretório raiz ao PYTHONPATH
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from src.config import BOT_TOKEN, WEBHOOK_URL
from src.handlers.start import start_handler
from src.handlers.help import help_handler

app = Flask(__name__)
bot = telegram.Bot(token=BOT_TOKEN)

@app.route('/', methods=['POST'])
def webhook():
    if request.method == 'POST':
        update = telegram.Update.de_json(request.get_json(force=True), bot)
        
        # Processa comandos
        if update.message:
            text = update.message.text or ''
            
            if text.startswith('/start'):
                return start_handler(bot, update)
            elif text.startswith('/help') or text.startswith('/ajuda'):
                return help_handler(bot, update)
        
        return Response('ok', status=200)
    
    return Response('método não permitido', status=405)

# Handler especial para Vercel
def handler(request):
    return app(request)