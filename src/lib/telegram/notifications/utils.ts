import { format, addMinutes, addHours, addDays } from 'date-fns';
import { ptBR } from 'date-fns/locale';

// Timezone do Brasil (UTC-3)
const BRASIL_TIMEZONE_OFFSET = -3;

export function agora(): Date {
  return new Date();
}

export function agoraUTC(): Date {
  const now = new Date();
  return new Date(now.getTime() + (now.getTimezoneOffset() * 60000));
}

export function formatarDataHora(data: Date): string {
  return format(data, "dd/MM/yyyy 'às' HH:mm", { locale: ptBR });
}

export function formatarTempo(data: Date): string {
  return format(data, 'HH:mm', { locale: ptBR });
}

export function formatarData(data: Date): string {
  return format(data, 'dd/MM/yyyy', { locale: ptBR });
}

export function adicionarMinutos(data: Date, minutos: number): Date {
  return addMinutes(data, minutos);
}

export function adicionarHoras(data: Date, horas: number): Date {
  return addHours(data, horas);
}

export function adicionarDias(data: Date, dias: number): Date {
  return addDays(data, dias);
}

export function calcularTempoAntes(dataBase: Date, minutosAntes: number): Date {
  return adicionarMinutos(dataBase, -minutosAntes);
}

// Converter string ISO para Date considerando timezone brasileiro
export function parseISOString(isoString: string): Date {
  return new Date(isoString);
}

// Verificar se uma data está no passado
export function estaNoPassado(data: Date): boolean {
  return data < agora();
}

// Verificar se uma notificação deve ser processada agora
export function deveProcessarAgora(agendadoPara: string): boolean {
  const dataAgendada = parseISOString(agendadoPara);
  const agora_atual = agora();
  
  // Processar se a data agendada for menor ou igual ao momento atual
  // com tolerância de 1 minuto para evitar problemas de sincronização
  return dataAgendada <= adicionarMinutos(agora_atual, 1);
}

// Gerar timestamp para logs
export function timestampLog(): string {
  return format(agora(), 'yyyy-MM-dd HH:mm:ss', { locale: ptBR });
}

// Calcular diferença em minutos entre duas datas
export function diferencaEmMinutos(data1: Date, data2: Date): number {
  return Math.abs(Math.floor((data1.getTime() - data2.getTime()) / (1000 * 60)));
}

// Validar se uma data de agendamento é válida (não no passado)
export function validarDataAgendamento(data: Date): { valida: boolean; erro?: string } {
  if (estaNoPassado(data)) {
    return {
      valida: false,
      erro: 'A data de agendamento não pode ser no passado'
    };
  }
  
  // Verificar se não está muito no futuro (mais de 30 dias)
  const diasNoFuturo = diferencaEmMinutos(data, agora()) / (60 * 24);
  if (diasNoFuturo > 30) {
    return {
      valida: false,
      erro: 'A data de agendamento não pode ser mais de 30 dias no futuro'
    };
  }
  
  return { valida: true };
}