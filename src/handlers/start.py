# src/handlers/start.py
from telegram import Update, Bot
import json
from src.database import add_user

def start_handler(bot: Bot, update: Update):
    user = update.message.from_user
    
    # Salva usuário no banco
    add_user(
        telegram_id=user.id, 
        name=user.full_name, 
        username=user.username
    )
    
    message = f"""
    Olá, eu sou o ZettiBot! 🤖

    Estou aqui para revolucionar sua gestão de vendas.
    
    Principais comandos:
    /agenda - Ver compromissos 📅
    /cliente - Gerenciar clientes 👥
    /followup - Acompanhar leads 🔄
    /ajuda - Lista completa de comandos ℹ️
    """
    
    bot.send_message(
        chat_id=update.message.chat_id,
        text=message
    )
    
    return json.dumps({'status': 'ok'})