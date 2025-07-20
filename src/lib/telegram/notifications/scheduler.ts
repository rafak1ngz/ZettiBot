import { adminSupabase } from '@/lib/supabase';
import { 
  ConfigNotificacaoAgenda, 
  TipoNotificacao, 
  CanalNotificacao,
  TipoRecorrencia 
} from './types';
import { 
  calcularHorarioNotificacao, 
  validarMinutosAntes,
  gerarIdNotificacao 
} from './utils';
import { criarTemplateAgenda } from './templates';

/**
 * Agenda uma notificação para compromisso
 */
export async function agendarNotificacaoCompromisso(
  config: ConfigNotificacaoAgenda
): Promise<{ sucesso: boolean; erro?: string; notificacao_id?: string }> {
  try {
    // Validar entrada
    if (!validarMinutosAntes(config.minutos_antes)) {
      return { 
        sucesso: false, 
        erro: 'Tempo de antecedência inválido' 
      };
    }

    // Calcular horário de envio
    const dataEnvio = calcularHorarioNotificacao(
      config.data_compromisso, 
      config.minutos_antes
    );

    // Verificar se a data de envio não é no passado
    if (dataEnvio <= new Date()) {
      return { 
        sucesso: false, 
        erro: 'Horário de notificação seria no passado' 
      };
    }

    // Criar template da mensagem
    const template = criarTemplateAgenda({
      titulo: config.titulo_compromisso,
      cliente: config.cliente_nome,
      local: config.local,
      data: config.data_compromisso,
      minutosAntes: config.minutos_antes
    });

    // Inserir notificação no banco
    const { data: notificacao, error } = await adminSupabase
      .from('notificacoes')
      .insert({
        user_id: config.user_id,
        tipo: 'agenda' as TipoNotificacao,
        referencia_id: config.compromisso_id,
        titulo: template.titulo,
        mensagem: template.mensagem,
        data_envio: dataEnvio.toISOString(),
        minutos_antes: config.minutos_antes,
        canais: ['telegram'] as CanalNotificacao[],
        recorrencia: 'unica' as TipoRecorrencia,
        status: 'pendente'
      })
      .select('id')
      .single();

    if (error) {
      console.error('Erro ao agendar notificação:', error);
      return { 
        sucesso: false, 
        erro: 'Erro ao salvar notificação no banco' 
      };
    }

    // Atualizar campo notificacao_minutos no compromisso
    const { error: updateError } = await adminSupabase
      .from('compromissos')
      .update({ notificacao_minutos: config.minutos_antes })
      .eq('id', config.compromisso_id);

    if (updateError) {
      console.error('Erro ao atualizar compromisso:', updateError);
      // Não falhar por isso, pois a notificação foi criada
    }

    return { 
      sucesso: true, 
      notificacao_id: notificacao.id 
    };

  } catch (error) {
    console.error('Erro inesperado ao agendar notificação:', error);
    return { 
      sucesso: false, 
      erro: 'Erro inesperado no sistema' 
    };
  }
}

/**
 * Cancela notificação de compromisso
 */
export async function cancelarNotificacaoCompromisso(
  compromisso_id: string,
  user_id: string
): Promise<{ sucesso: boolean; erro?: string }> {
  try {
    // Cancelar notificações pendentes do compromisso
    const { error } = await adminSupabase
      .from('notificacoes')
      .update({ 
        status: 'cancelado',
        updated_at: new Date().toISOString()
      })
      .eq('referencia_id', compromisso_id)
      .eq('user_id', user_id)
      .eq('status', 'pendente');

    if (error) {
      console.error('Erro ao cancelar notificação:', error);
      return { 
        sucesso: false, 
        erro: 'Erro ao cancelar notificação' 
      };
    }

    // Remover campo de notificação do compromisso
    const { error: updateError } = await adminSupabase
      .from('compromissos')
      .update({ notificacao_minutos: null })
      .eq('id', compromisso_id);

    if (updateError) {
      console.error('Erro ao atualizar compromisso:', updateError);
    }

    return { sucesso: true };

  } catch (error) {
    console.error('Erro inesperado ao cancelar notificação:', error);
    return { 
      sucesso: false, 
      erro: 'Erro inesperado no sistema' 
    };
  }
}

/**
 * Atualiza notificação quando compromisso é editado
 */
export async function atualizarNotificacaoCompromisso(
  compromisso_id: string,
  user_id: string,
  novosDados: {
    titulo?: string;
    data_compromisso?: Date;
    cliente_nome?: string;
    local?: string;
    minutos_antes?: number;
  }
): Promise<{ sucesso: boolean; erro?: string }> {
  try {
    // Buscar notificação atual
    const { data: notificacaoAtual, error: fetchError } = await adminSupabase
      .from('notificacoes')
      .select('*')
      .eq('referencia_id', compromisso_id)
      .eq('user_id', user_id)
      .eq('status', 'pendente')
      .single();

    if (fetchError && fetchError.code !== 'PGRST116') {
      console.error('Erro ao buscar notificação:', fetchError);
      return { 
        sucesso: false, 
        erro: 'Erro ao buscar notificação atual' 
      };
    }

    // Se não há notificação, não há nada a fazer
    if (!notificacaoAtual) {
      return { sucesso: true };
    }

    // Preparar dados atualizados
    const dadosAtualizados: any = {
      updated_at: new Date().toISOString()
    };

    // Se mudou data ou minutos antes, recalcular data de envio
    if (novosDados.data_compromisso || novosDados.minutos_antes) {
      const dataCompromisso = novosDados.data_compromisso || new Date(notificacaoAtual.data_envio);
      const minutosAntes = novosDados.minutos_antes || notificacaoAtual.minutos_antes;
      
      const novaDataEnvio = calcularHorarioNotificacao(dataCompromisso, minutosAntes);
      
      // Verificar se nova data não é no passado
      if (novaDataEnvio <= new Date()) {
        // Cancelar notificação se seria no passado
        return await cancelarNotificacaoCompromisso(compromisso_id, user_id);
      }
      
      dadosAtualizados.data_envio = novaDataEnvio.toISOString();
      dadosAtualizados.minutos_antes = minutosAntes;
    }

    // Se mudou algum dado do compromisso, recriar template
    if (novosDados.titulo || novosDados.cliente_nome || novosDados.local || novosDados.data_compromisso) {
      const template = criarTemplateAgenda({
        titulo: novosDados.titulo || notificacaoAtual.titulo,
        cliente: novosDados.cliente_nome,
        local: novosDados.local,
        data: novosDados.data_compromisso || new Date(notificacaoAtual.data_envio),
        minutosAntes: novosDados.minutos_antes || notificacaoAtual.minutos_antes
      });
      
      dadosAtualizados.titulo = template.titulo;
      dadosAtualizados.mensagem = template.mensagem;
    }

    // Atualizar notificação
    const { error: updateError } = await adminSupabase
      .from('notificacoes')
      .update(dadosAtualizados)
      .eq('id', notificacaoAtual.id);

    if (updateError) {
      console.error('Erro ao atualizar notificação:', updateError);
      return { 
        sucesso: false, 
        erro: 'Erro ao atualizar notificação' 
      };
    }

    return { sucesso: true };

  } catch (error) {
    console.error('Erro inesperado ao atualizar notificação:', error);
    return { 
      sucesso: false, 
      erro: 'Erro inesperado no sistema' 
    };
  }
}

/**
 * Busca notificações pendentes para processamento
 */
export async function buscarNotificacoesPendentes(limite: number = 50): Promise<{
  notificacoes: any[];
  erro?: string;
}> {
  try {
    const agora = new Date();
    const { data: notificacoes, error } = await adminSupabase
      .from('notificacoes')
      .select(`
        id,
        user_id,
        tipo,
        titulo,
        mensagem,
        data_envio,
        tentativas,
        users!inner(telegram_id)
      `)
      .eq('status', 'pendente')
      .lte('data_envio', agora.toISOString())
      .lt('tentativas', 3) // Máximo 3 tentativas
      .order('data_envio', { ascending: true })
      .limit(limite);

    if (error) {
      console.error('Erro ao buscar notificações pendentes:', error);
      return { 
        notificacoes: [], 
        erro: 'Erro ao buscar notificações' 
      };
    }

    return { notificacoes: notificacoes || [] };

  } catch (error) {
    console.error('Erro inesperado ao buscar notificações:', error);
    return { 
      notificacoes: [], 
      erro: 'Erro inesperado no sistema' 
    };
  }
}

/**
 * Marca notificação como enviada
 */
export async function marcarNotificacaoEnviada(notificacao_id: string): Promise<void> {
  await adminSupabase
    .from('notificacoes')
    .update({
      status: 'enviado',
      enviado_em: new Date().toISOString(),
      updated_at: new Date().toISOString()
    })
    .eq('id', notificacao_id);
}

/**
 * Marca notificação com erro
 */
export async function marcarNotificacaoErro(
  notificacao_id: string, 
  erro: string,
  tentativas: number
): Promise<void> {
  const status = tentativas >= 3 ? 'erro' : 'pendente';
  
  await adminSupabase
    .from('notificacoes')
    .update({
      status,
      tentativas: tentativas + 1,
      erro_detalhes: erro,
      updated_at: new Date().toISOString()
    })
    .eq('id', notificacao_id);
}