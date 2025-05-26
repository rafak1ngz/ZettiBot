import json
import os
import requests

def handler(request):
    # Verifica se é um método POST (webhook do Telegram)
    if request.method == 'POST':
        try:
            # Obtém o payload do Telegram
            update = request.get_json()
            
            # Verifica se o update contém uma mensagem
            if 'message' in update:
                # Extrai informações básicas
                chat_id = update['message']['chat']['id']
                message_text = update['message'].get('text', '')
                
                # Processa comandos básicos
                if message_text == '/start':
                    return handle_start(chat_id)
                elif message_text == '/help' or message_text == '/ajuda':
                    return handle_help(chat_id)
                else:
                    # Resposta padrão para mensagens não reconhecidas
                    return send_message(chat_id, "Desculpe, não entendi esse comando. Use /help para ver os comandos disponíveis.")
            
            # Retorna sucesso para o Telegram
            return {'statusCode': 200, 'body': json.dumps({'status': 'ok'})}
        
        except Exception as e:
            # Log de erro (você pode substituir por um sistema de logging mais robusto)
            print(f"Erro no processamento do webhook: {str(e)}")
            return {'statusCode': 500, 'body': json.dumps({'error': str(e)})}
    
    # Para requisições GET, mantém a mensagem anterior
    return {'statusCode': 200, 'body': 'ZettiBot está funcionando!'}

def send_message(chat_id, text):
    """
    Envia mensagem para um chat específico
    """
    bot_token = os.environ.get('BOT_TOKEN')
    url = f'https://api.telegram.org/bot{bot_token}/sendMessage'
    
    payload = {
        'chat_id': chat_id,
        'text': text
    }
    
    try:
        response = requests.post(url, json=payload)
        return {'statusCode': 200, 'body': response.text}
    except Exception as e:
        print(f"Erro ao enviar mensagem: {str(e)}")
        return {'statusCode': 500, 'body': str(e)}

def handle_start(chat_id):
    """
    Processa o comando /start
    """
    welcome_message = """
    Olá! Eu sou o ZettiBot 🤖

    Estou aqui para auxiliar vendedores externos a terem mais produtividade.

    Principais comandos:
    /agenda - Ver compromissos do dia
    /followup - Gerenciar follow-ups
    /clientes - Listar clientes
    /help - Ver todos os comandos
    """
    
    return send_message(chat_id, welcome_message)

def handle_help(chat_id):
    """
    Processa o comando /help
    """
    help_message = """
    Comandos disponíveis:

    📅 Agenda
    /agenda_hoje - Ver compromissos do dia
    /agendar - Adicionar novo compromisso

    👥 Clientes
    /cliente_add - Cadastrar novo cliente
    /clientes - Listar clientes
    /cliente_busca - Buscar cliente

    🔄 Follow-up
    /followup_add - Criar novo follow-up
    /followups - Listar follow-ups pendentes

    💰 Comissões
    /comissao - Consultar comissões
    /comissao_add - Registrar nova comissão

    ℹ️ Outros
    /start - Iniciar bot
    /help - Mostrar esta lista de comandos
    """
    
    return send_message(chat_id, help_message)