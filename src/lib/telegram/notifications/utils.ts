import { format, subMinutes, addMinutes, isAfter, isBefore } from 'date-fns';
import { ptBR } from 'date-fns/locale';

// Timezone padrão brasileiro
export const DEFAULT_TIMEZONE = 'America/Sao_Paulo';

/**
 * Calcula o horário de envio da notificação
 * @param dataCompromisso Data do compromisso
 * @param minutosAntes Quantos minutos antes notificar
 * @returns Data de envio da notificação
 */
export function calcularHorarioNotificacao(dataCompromisso: Date, minutosAntes: number): Date {
  return subMinutes(dataCompromisso, minutosAntes);
}

/**
 * Verifica se uma notificação deve ser enviada agora
 * @param dataEnvio Data programada para envio
 * @param toleranciaMinutos Tolerância em minutos (padrão: 1 minuto)
 * @returns true se deve ser enviada
 */
export function deveEnviarNotificacao(dataEnvio: Date, toleranciaMinutos: number = 1): boolean {
  const agora = new Date();
  const limiteInferior = subMinutes(agora, toleranciaMinutos);
  const limiteSuperior = addMinutes(agora, toleranciaMinutos);
  
  return isAfter(dataEnvio, limiteInferior) && isBefore(dataEnvio, limiteSuperior);
}

/**
 * Verifica se uma notificação está atrasada
 * @param dataEnvio Data programada para envio
 * @returns true se está atrasada
 */
export function isNotificacaoAtrasada(dataEnvio: Date): boolean {
  return isBefore(dataEnvio, new Date());
}

/**
 * Formata data para exibição em notificações
 * @param data Data para formatar
 * @param incluirHora Se deve incluir hora
 * @returns String formatada
 */
export function formatarDataNotificacao(data: Date, incluirHora: boolean = true): string {
  const pattern = incluirHora ? "dd/MM/yyyy 'às' HH:mm" : "dd/MM/yyyy";
  return format(data, pattern, { locale: ptBR });
}

/**
 * Calcula próximo horário de recorrência
 * @param dataBase Data base para cálculo
 * @param tipoRecorrencia Tipo de recorrência
 * @returns Nova data ou null se não recorrente
 */
export function calcularProximaRecorrencia(
  dataBase: Date, 
  tipoRecorrencia: 'unica' | 'diaria' | 'semanal' | 'mensal'
): Date | null {
  const novaData = new Date(dataBase);
  
  switch (tipoRecorrencia) {
    case 'diaria':
      novaData.setDate(novaData.getDate() + 1);
      return novaData;
    
    case 'semanal':
      novaData.setDate(novaData.getDate() + 7);
      return novaData;
    
    case 'mensal':
      novaData.setMonth(novaData.getMonth() + 1);
      return novaData;
    
    default:
      return null;
  }
}

/**
 * Converte string de data para Date object, considerando timezone brasileiro
 * @param dataString String de data
 * @returns Date object
 */
export function parseDataBrasil(dataString: string): Date {
  const data = new Date(dataString);
  
  // Se não especificar timezone, assumir Brasil
  if (!dataString.includes('T') || !dataString.includes('Z')) {
    // Ajustar para timezone brasileiro se necessário
    const offsetBrasil = -3; // UTC-3
    const offsetLocal = data.getTimezoneOffset() / 60;
    const diferenca = offsetBrasil - (-offsetLocal);
    
    if (diferenca !== 0) {
      data.setHours(data.getHours() + diferenca);
    }
  }
  
  return data;
}

/**
 * Gera ID único para notificação
 * @returns String UUID-like
 */
export function gerarIdNotificacao(): string {
  return `notif_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Valida se minutos antes é um valor válido
 * @param minutosAntes Valor a validar
 * @returns true se válido
 */
export function validarMinutosAntes(minutosAntes: number): boolean {
  return minutosAntes > 0 && minutosAntes <= 10080; // Máximo 1 semana
}

/**
 * Converte minutos em texto legível
 * @param minutos Quantidade de minutos
 * @returns Texto formatado
 */
export function minutosParaTexto(minutos: number): string {
  if (minutos < 60) {
    return `${minutos} minuto${minutos !== 1 ? 's' : ''}`;
  }
  
  const horas = Math.floor(minutos / 60);
  const minutosRestantes = minutos % 60;
  
  if (horas < 24) {
    if (minutosRestantes === 0) {
      return `${horas} hora${horas !== 1 ? 's' : ''}`;
    } else {
      return `${horas}h${minutosRestantes}min`;
    }
  }
  
  const dias = Math.floor(horas / 24);
  const horasRestantes = horas % 24;
  
  if (horasRestantes === 0) {
    return `${dias} dia${dias !== 1 ? 's' : ''}`;
  } else {
    return `${dias}d ${horasRestantes}h`;
  }
}