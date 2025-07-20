import { formatarDataHora, formatarTempo } from './utils';
import { TipoNotificacao } from './types';

export interface TemplateAgenda {
  titulo: string;
  cliente_nome: string;
  data_compromisso: Date;
  local?: string;
  descricao?: string;
  minutos_antes: number;
}

export interface TemplateFollowup {
  cliente_nome: string;
  dias_sem_contato: number;
  ultimo_contato: Date;
  vendedor_nome?: string;
}

export interface TemplateLembrete {
  titulo: string;
  descricao?: string;
  prioridade: 'baixa' | 'media' | 'alta';
}

export interface TemplateResumo {
  periodo: 'diario' | 'semanal' | 'mensal';
  total_compromissos: number;
  total_clientes: number;
  vendedor_nome?: string;
}

export function gerarMensagemAgenda(dados: TemplateAgenda): string {
  const { titulo, cliente_nome, data_compromisso, local, descricao, minutos_antes } = dados;
  
  const tempoTexto = minutos_antes < 60 
    ? `${minutos_antes} minutos`
    : `${Math.floor(minutos_antes / 60)} hora(s)`;
  
  let mensagem = `🔔 <b>Lembrete de Compromisso</b>\n\n`;
  mensagem += `⏰ Seu compromisso será em <b>${tempoTexto}</b>!\n\n`;
  mensagem += `📋 <b>${titulo}</b>\n`;
  mensagem += `🏢 <b>Cliente:</b> ${cliente_nome}\n`;
  mensagem += `📅 <b>Horário:</b> ${formatarDataHora(data_compromisso)}\n`;
  
  if (local) {
    mensagem += `📍 <b>Local:</b> ${local}\n`;
  }
  
  if (descricao) {
    mensagem += `💬 <b>Observações:</b> ${descricao}\n`;
  }
  
  mensagem += `\n🚀 <b>Boa sorte no seu compromisso!</b>`;
  
  return mensagem;
}

export function gerarMensagemFollowup(dados: TemplateFollowup): string {
  const { cliente_nome, dias_sem_contato, ultimo_contato } = dados;
  
  let mensagem = `📞 <b>Follow-up Pendente</b>\n\n`;
  mensagem += `⚠️ Já se passaram <b>${dias_sem_contato} dias</b> sem contato!\n\n`;
  mensagem += `🏢 <b>Cliente:</b> ${cliente_nome}\n`;
  mensagem += `📅 <b>Último contato:</b> ${formatarDataHora(ultimo_contato)}\n\n`;
  mensagem += `💡 <b>Que tal retomar o contato hoje?</b>\n`;
  mensagem += `📈 Cada follow-up é uma oportunidade de fechar mais vendas!`;
  
  return mensagem;
}

export function gerarMensagemLembrete(dados: TemplateLembrete): string {
  const { titulo, descricao, prioridade } = dados;
  
  const emojiPrioridade = {
    baixa: '💡',
    media: '⚠️',
    alta: '🚨'
  };
  
  const textoPrioridade = {
    baixa: 'Informação',
    media: 'Atenção',
    alta: 'Urgente'
  };
  
  let mensagem = `${emojiPrioridade[prioridade]} <b>Lembrete - ${textoPrioridade[prioridade]}</b>\n\n`;
  mensagem += `📝 <b>${titulo}</b>\n`;
  
  if (descricao) {
    mensagem += `\n💬 ${descricao}\n`;
  }
  
  mensagem += `\n✅ <b>Não se esqueça de marcar como concluído!</b>`;
  
  return mensagem;
}

export function gerarMensagemResumo(dados: TemplateResumo): string {
  const { periodo, total_compromissos, total_clientes } = dados;
  
  const textoPeriodo = {
    diario: 'Resumo do Dia',
    semanal: 'Resumo da Semana',
    mensal: 'Resumo do Mês'
  };
  
  let mensagem = `📊 <b>${textoPeriodo[periodo]}</b>\n\n`;
  mensagem += `📅 <b>Compromissos:</b> ${total_compromissos}\n`;
  mensagem += `👥 <b>Clientes ativos:</b> ${total_clientes}\n\n`;
  
  if (total_compromissos > 0) {
    mensagem += `🎯 <b>Continue assim! Você está no caminho certo!</b>`;
  } else {
    mensagem += `💡 <b>Que tal agendar alguns compromissos para aumentar suas vendas?</b>`;
  }
  
  return mensagem;
}

export function gerarMensagemPersonalizada(
  tipo: TipoNotificacao,
  titulo: string,
  conteudo: string
): string {
  const emojis = {
    agenda: '📅',
    followup: '📞',
    lembrete: '💡',
    resumo: '📊'
  };
  
  return `${emojis[tipo]} <b>${titulo}</b>\n\n${conteudo}`;
}

// Template para erro de notificação (uso interno)
export function gerarMensagemErro(erro: string): string {
  return `❌ <b>Erro ao processar notificação</b>\n\n` +
         `🔧 Detalhes técnicos: ${erro}\n\n` +
         `💡 Entre em contato com o suporte se o problema persistir.`;
}