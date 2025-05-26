import os
from supabase import create_client
from src.config import SUPABASE_URL, SUPABASE_KEY

# Inicializa cliente Supabase
supabase = create_client(SUPABASE_URL, SUPABASE_KEY)

def setup_database():
    """Verifica se as tabelas existem no Supabase"""
    # Nota: No Supabase, você já teria criado as tabelas no painel
    pass

def add_user(telegram_id, name, username):
    """Adiciona ou atualiza usuário no banco"""
    try:
        data = {
            'telegram_id': telegram_id,
            'name': name,
            'username': username,
            'created_at': 'now()'  # Função do PostgreSQL
        }
        
        # Insere com "upsert" (atualiza se existir)
        result = supabase.table('users').upsert(data).execute()
        return result
    except Exception as e:
        print(f"Erro ao adicionar usuário: {e}")
        return None

def get_user(telegram_id):
    """Busca usuário pelo ID do Telegram"""
    try:
        result = supabase.table('users').select('*').eq('telegram_id', telegram_id).execute()
        return result.data[0] if result.data else None
    except Exception as e:
        print(f"Erro ao buscar usuário: {e}")
        return None