import { adminSupabase } from '@/lib/supabase';

/**
 * Limpar sessão de um usuário específico
 */
export async function clearUserSession(telegramId: number) {
  try {
    const { error } = await adminSupabase
      .from('sessions')
      .delete()
      .eq('telegram_id', telegramId);
      
    if (error) {
      console.error('Erro ao limpar sessão:', error);
      return false;
    }
    
    return true;
  } catch (error) {
    console.error('Erro inesperado ao limpar sessão:', error);
    return false;
  }
}

/**
 * Criar nova sessão para um usuário
 */
export async function createUserSession(
  telegramId: number, 
  userId: string, 
  command: string, 
  step: string, 
  data: any = {}
) {
  try {
    // Limpar sessões existentes primeiro
    await clearUserSession(telegramId);
    
    const { error } = await adminSupabase
      .from('sessions')
      .insert([{
        telegram_id: telegramId,
        user_id: userId,
        command,
        step,
        data,
        updated_at: new Date().toISOString()
      }]);
      
    if (error) {
      console.error('Erro ao criar sessão:', error);
      return false;
    }
    
    return true;
  } catch (error) {
    console.error('Erro inesperado ao criar sessão:', error);
    return false;
  }
}

/**
 * Atualizar sessão existente
 */
export async function updateUserSession(
  telegramId: number, 
  updates: { step?: string; data?: any }
) {
  try {
    const updateData: any = {
      updated_at: new Date().toISOString()
    };
    
    if (updates.step) updateData.step = updates.step;
    if (updates.data) updateData.data = updates.data;
    
    const { error } = await adminSupabase
      .from('sessions')
      .update(updateData)
      .eq('telegram_id', telegramId);
      
    if (error) {
      console.error('Erro ao atualizar sessão:', error);
      return false;
    }
    
    return true;
  } catch (error) {
    console.error('Erro inesperado ao atualizar sessão:', error);
    return false;
  }
}

/**
 * Obter sessão ativa de um usuário
 */
export async function getUserSession(telegramId: number) {
  try {
    const { data: sessions, error } = await adminSupabase
      .from('sessions')
      .select('*')
      .eq('telegram_id', telegramId)
      .order('updated_at', { ascending: false })
      .limit(1);
      
    if (error) {
      console.error('Erro ao buscar sessão:', error);
      return null;
    }
    
    return sessions && sessions.length > 0 ? sessions[0] : null;
  } catch (error) {
    console.error('Erro inesperado ao buscar sessão:', error);
    return null;
  }
}

/**
 * Verificar se usuário está autenticado
 */
export function isUserAuthenticated(ctx: any): boolean {
  return !!ctx.state.user?.id;
}

/**
 * Obter ID do usuário autenticado
 */
export function getUserId(ctx: any): string | null {
  return ctx.state.user?.id || null;
}

/**
 * Obter ID do Telegram do usuário
 */
export function getTelegramId(ctx: any): number | null {
  return ctx.from?.id || null;
}