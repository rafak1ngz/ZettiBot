import { adminSupabase } from '@/lib/supabase';

export async function logAuditoria(
  userId: string,
  acao: string,
  detalhes: any,
  telegramId?: number
) {
  try {
    await adminSupabase
      .from('audit_logs')
      .insert({
        user_id: userId,
        telegram_id: telegramId,
        acao,
        detalhes: JSON.stringify(detalhes),
        timestamp: new Date().toISOString()
      });
  } catch (error) {
    console.error('Erro ao salvar log de auditoria:', error);
  }
}

// Exemplo de uso:
// await logAuditoria(userId, 'cliente_criado', { nome_empresa: 'Empresa X' }, telegramId);