import { adminSupabase } from '@/lib/supabase';
import { CriarNotificacaoInput } from './types';
import { validarDataAgendamento, timestampLog } from './utils';

export async function criarNotificacao(input: CriarNotificacaoInput): Promise<{ sucesso: boolean; erro?: string; id?: string }> {
  try {
    console.log(`${timestampLog()} - Criando notificação:`, {
      tipo: input.tipo,
      telegram_id: input.telegram_id,
      agendado_para: input.agendado_para.toISOString()
    });

    // Validar data de agendamento
    const validacao = validarDataAgendamento(input.agendado_para);
    if (!validacao.valida) {
      return {
        sucesso: false,
        erro: validacao.erro
      };
    }

    // Inserir notificação no banco
    const { data, error } = await adminSupabase
      .from('notificacoes')
      .insert({
        user_id: input.user_id,
        telegram_id: input.telegram_id,
        tipo: input.tipo,
        titulo: input.titulo,
        mensagem: input.mensagem,
        agendado_para: input.agendado_para.toISOString(),
        status: 'pendente',
        tentativas: 0,
        metadata: input.metadata || {},
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .select('id')
      .single();

    if (error) {
      console.error(`${timestampLog()} - Erro ao criar notificação:`, error);
      return {
        sucesso: false,
        erro: `Erro no banco de dados: ${error.message}`
      };
    }

    console.log(`${timestampLog()} - Notificação criada com sucesso:`, data.id);
    return {
      sucesso: true,
      id: data.id
    };

  } catch (error) {
    console.error(`${timestampLog()} - Erro inesperado ao criar notificação:`, error);
    return {
      sucesso: false,
      erro: `Erro inesperado: ${error instanceof Error ? error.message : 'Erro desconhecido'}`
    };
  }
}

export async function buscarNotificacoesPendentes(): Promise<any[]> {
  try {
    console.log(`${timestampLog()} - Buscando notificações pendentes...`);

    const agora = new Date().toISOString();

    const { data, error } = await adminSupabase
      .from('notificacoes')
      .select('*')
      .eq('status', 'pendente')
      .lte('agendado_para', agora)
      .lt('tentativas', 3) // Máximo 3 tentativas
      .order('agendado_para', { ascending: true })
      .limit(50); // Processar no máximo 50 por vez

    if (error) {
      console.error(`${timestampLog()} - Erro ao buscar notificações:`, error);
      return [];
    }

    console.log(`${timestampLog()} - Encontradas ${data?.length || 0} notificações pendentes`);
    return data || [];

  } catch (error) {
    console.error(`${timestampLog()} - Erro inesperado ao buscar notificações:`, error);
    return [];
  }
}

export async function marcarNotificacaoComoEnviada(id: string): Promise<boolean> {
  try {
    const { error } = await adminSupabase
      .from('notificacoes')
      .update({
        status: 'enviado',
        enviado_em: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .eq('id', id);

    if (error) {
      console.error(`${timestampLog()} - Erro ao marcar notificação como enviada:`, error);
      return false;
    }

    return true;
  } catch (error) {
    console.error(`${timestampLog()} - Erro inesperado ao marcar como enviada:`, error);
    return false;
  }
}

export async function marcarNotificacaoComoErro(id: string, erroDetalhes: string): Promise<boolean> {
  try {
    // Buscar número atual de tentativas
    const { data: notificacao } = await adminSupabase
      .from('notificacoes')
      .select('tentativas')
      .eq('id', id)
      .single();

    const novasTentativas = (notificacao?.tentativas || 0) + 1;
    const novoStatus = novasTentativas >= 3 ? 'erro' : 'pendente';

    const { error } = await adminSupabase
      .from('notificacoes')
      .update({
        status: novoStatus,
        tentativas: novasTentativas,
        erro_detalhes: erroDetalhes,
        updated_at: new Date().toISOString()
      })
      .eq('id', id);

    if (error) {
      console.error(`${timestampLog()} - Erro ao marcar notificação como erro:`, error);
      return false;
    }

    console.log(`${timestampLog()} - Notificação ${id} marcada como ${novoStatus} (tentativa ${novasTentativas})`);
    return true;
  } catch (error) {
    console.error(`${timestampLog()} - Erro inesperado ao marcar como erro:`, error);
    return false;
  }
}

export async function cancelarNotificacao(id: string): Promise<boolean> {
  try {
    const { error } = await adminSupabase
      .from('notificacoes')
      .update({
        status: 'cancelado',
        updated_at: new Date().toISOString()
      })
      .eq('id', id);

    if (error) {
      console.error(`${timestampLog()} - Erro ao cancelar notificação:`, error);
      return false;
    }

    console.log(`${timestampLog()} - Notificação ${id} cancelada`);
    return true;
  } catch (error) {
    console.error(`${timestampLog()} - Erro inesperado ao cancelar notificação:`, error);
    return false;
  }
}

export async function limpezaNotificacoesAntigas(): Promise<void> {
  try {
    console.log(`${timestampLog()} - Iniciando limpeza de notificações antigas...`);

    // Remover notificações enviadas há mais de 7 dias
    const seteDiasAtras = new Date();
    seteDiasAtras.setDate(seteDiasAtras.getDate() - 7);

    const { error } = await adminSupabase
      .from('notificacoes')
      .delete()
      .eq('status', 'enviado')
      .lt('enviado_em', seteDiasAtras.toISOString());

    if (error) {
      console.error(`${timestampLog()} - Erro na limpeza:`, error);
      return;
    }

    console.log(`${timestampLog()} - Limpeza concluída`);
  } catch (error) {
    console.error(`${timestampLog()} - Erro inesperado na limpeza:`, error);
  }
}