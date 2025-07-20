import { adminSupabase } from '@/lib/supabase';

export async function limparSessoesAntigas(): Promise<void> {
  try {
    // Limpar sessões com mais de 1 hora
    const umAhoraAtras = new Date();
    umAhoraAtras.setHours(umAhoraAtras.getHours() - 1);
    
    const { error } = await adminSupabase
      .from('sessions')
      .delete()
      .lt('updated_at', umAhoraAtras.toISOString());
      
    if (!error) {
      console.log('✅ Sessões antigas limpas com sucesso');
    }
  } catch (error) {
    console.error('❌ Erro ao limpar sessões antigas:', error);
  }
}

// ✅ Executar limpeza periodicamente
export const cleanupMiddleware = async () => {
  // Executar limpeza uma vez por hora
  const agora = new Date();
  if (agora.getMinutes() === 0) {
    await limparSessoesAntigas();
  }
};