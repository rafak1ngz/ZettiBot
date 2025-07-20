import { TemplateNotificacao } from './types';
import { formatarDataNotificacao, minutosParaTexto } from './utils';

interface DadosCompromisso {
  titulo: string;
  cliente?: string;
  local?: string;
  data: Date;
  minutosAntes: number;
}

interface DadosLembrete {
  titulo: string;
  descricao?: string;
  data: Date;
}

interface DadosResumo {
  periodo: string;
  totalCompromissos: number;
  totalClientes: number;
  proximosCompromissos: Array<{
    titulo: string;
    data: Date;
    cliente?: string;
  }>;
}

/**
 * Template para notificação de compromisso da agenda
 */
export function criarTemplateAgenda(dados: DadosCompromisso): TemplateNotificacao {
  const tempoAntes = minutosParaTexto(dados.minutosAntes);
  const dataFormatada = formatarDataNotificacao(dados.data);
  
  const titulo = `⏰ Compromisso em ${tempoAntes}`;
  
  let mensagem = `📅 **${dados.titulo}**\n`;
  mensagem += `🕐 ${dataFormatada}\n`;
  
  if (dados.cliente) {
    mensagem += `👥 Cliente: ${dados.cliente}\n`;
  }
  
  if (dados.local) {
    mensagem += `📍 Local: ${dados.local}\n`;
  }
  
  mensagem += `\n💪 Prepare-se para mais uma conquista!`;
  
  return {
    titulo,
    mensagem,
    emojis: '⏰📅'
  };
}

/**
 * Template para notificação de lembrete
 */
export function criarTemplateLembrete(dados: DadosLembrete): TemplateNotificacao {
  const dataFormatada = formatarDataNotificacao(dados.data);
  
  const titulo = `🔔 Lembrete ZettiBot`;
  
  let mensagem = `📋 **${dados.titulo}**\n`;
  mensagem += `🕐 ${dataFormatada}\n`;
  
  if (dados.descricao) {
    mensagem += `\n📝 ${dados.descricao}\n`;
  }
  
  mensagem += `\n✅ Hora de colocar em prática!`;
  
  return {
    titulo,
    mensagem,
    emojis: '🔔📋'
  };
}

/**
 * Template para resumo diário/semanal/mensal
 */
export function criarTemplateResumo(dados: DadosResumo): TemplateNotificacao {
  const titulo = `📊 Resumo ${dados.periodo}`;
  
  let mensagem = `**Seu desempenho ${dados.periodo.toLowerCase()}:**\n\n`;
  mensagem += `📅 **${dados.totalCompromissos}** compromissos\n`;
  mensagem += `👥 **${dados.totalClientes}** clientes atendidos\n`;
  
  if (dados.proximosCompromissos.length > 0) {
    mensagem += `\n🔜 **Próximos compromissos:**\n`;
    dados.proximosCompromissos.slice(0, 3).forEach(compromisso => {
      const dataFormatada = formatarDataNotificacao(compromisso.data);
      mensagem += `• ${compromisso.titulo} - ${dataFormatada}`;
      if (compromisso.cliente) {
        mensagem += ` (${compromisso.cliente})`;
      }
      mensagem += `\n`;
    });
  }
  
  mensagem += `\n🚀 Continue focado nos seus objetivos!`;
  
  return {
    titulo,
    mensagem,
    emojis: '📊🚀'
  };
}

/**
 * Template para alertas (follow-ups atrasados, clientes sem contato, etc.)
 */
export function criarTemplateAlerta(tipo: string, dados: any): TemplateNotificacao {
  switch (tipo) {
    case 'followup_atrasado':
      return {
        titulo: `⚠️ Follow-up em atraso`,
        mensagem: `🎯 **${dados.cliente}**\n` +
                 `📅 Último contato: ${formatarDataNotificacao(dados.ultimoContato, false)}\n` +
                 `⏰ ${dados.diasAtraso} dias sem contato\n\n` +
                 `💡 Que tal retomar essa conversa?`,
        emojis: '⚠️🎯'
      };
    
    case 'cliente_sem_contato':
      return {
        titulo: `📞 Cliente sem contato recente`,
        mensagem: `👥 **${dados.cliente}**\n` +
                 `📅 Último contato: ${formatarDataNotificacao(dados.ultimoContato, false)}\n` +
                 `⏰ ${dados.diasSemContato} dias de silêncio\n\n` +
                 `🎯 Hora de reativar essa relação!`,
        emojis: '📞👥'
      };
    
    case 'meta_vendas':
      return {
        titulo: `🎯 Atualização de Meta`,
        mensagem: `📈 **Meta do Mês**\n` +
                 `✅ Realizado: R$ ${dados.realizado.toLocaleString('pt-BR')}\n` +
                 `🎯 Meta: R$ ${dados.meta.toLocaleString('pt-BR')}\n` +
                 `📊 ${dados.percentual}% concluído\n\n` +
                 `${dados.percentual >= 100 ? '🎉 Parabéns! Meta batida!' : '💪 Vamos em frente!'}`,
        emojis: '🎯📈'
      };
    
    default:
      return {
        titulo: `🔔 Alerta ZettiBot`,
        mensagem: `📋 ${dados.mensagem || 'Você tem uma pendência para resolver.'}\n\n` +
                 `✅ Verifique sua agenda para mais detalhes.`,
        emojis: '🔔📋'
      };
  }
}

/**
 * Template para confirmação de agendamento de notificação
 */
export function criarTemplateConfirmacao(minutosAntes: number, compromisso: string): string {
  const tempoAntes = minutosParaTexto(minutosAntes);
  
  return `✅ **Notificação agendada!**\n\n` +
         `⏰ Você será lembrado **${tempoAntes}** antes do compromisso:\n` +
         `📅 "${compromisso}"\n\n` +
         `🔔 A notificação chegará via Telegram.`;
}

/**
 * Template para quando o usuário escolhe não receber notificação
 */
export function criarTemplateNaoNotificar(): string {
  return `🔕 **Notificação desabilitada**\n\n` +
         `Você não receberá lembretes para este compromisso.\n\n` +
         `💡 Você pode ativar notificações editando o compromisso posteriormente.`;
}