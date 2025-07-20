// ✅ UTILITÁRIOS CENTRALIZADOS PARA FUSO HORÁRIO
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

// Constante do fuso brasileiro
const BRASIL_UTC_OFFSET = -3; // UTC-3

/**
 * Converter horário brasileiro para UTC (para salvar no banco)
 */
export function brasilParaUTC(dataBrasil: Date): Date {
  const offsetLocal = dataBrasil.getTimezoneOffset() * 60000; // Offset local em ms
  const utc = dataBrasil.getTime() + offsetLocal; // Converter para UTC
  return new Date(utc);
}


/**
 * Converter UTC para horário brasileiro (para exibir ao usuário)  
 */
export function utcParaBrasil(dataUTC: Date): Date {
  return new Date(dataUTC.getTime() - (3 * 60 * 60 * 1000));
}

/**
 * Obter data/hora atual no Brasil
 */
export function agoraBrasil(): Date {
  return utcParaBrasil(new Date());
}

/**
 * Criar data brasileira a partir de dia/mês/ano/hora/minuto
 */
export function criarDataBrasil(ano: number, mes: number, dia: number, hora: number, minuto: number): Date {
  const dataLocal = new Date(ano, mes, dia, hora, minuto, 0, 0);

  // Debug para ver o que está acontecendo  
  console.log('=== DEBUG criarDataBrasil ===');
  console.log('Input:', { ano, mes, dia, hora, minuto });
  console.log('Data local criada:', dataLocal.toLocaleString('pt-BR'));
  console.log('UTC para salvar:', dataLocal.toISOString());
  console.log('==========================');

  return dataLocal; // Retornar como está - o Date() já considera fuso local
}

/**
 * Formatar data UTC para exibição brasileira
 */
export function formatarDataBrasil(dataUTC: Date, formato: string = "dd/MM/yyyy 'às' HH:mm"): string {
  const dataBrasil = utcParaBrasil(dataUTC);
  return format(dataBrasil, formato, { locale: ptBR });
}

/**
 * Calcular diferença em minutos entre duas datas UTC
 */
export function diferencaMinutos(dataUTC1: Date, dataUTC2: Date): number {
  return Math.floor((dataUTC1.getTime() - dataUTC2.getTime()) / (1000 * 60));
}

/**
 * Verificar se data UTC está no passado (considerando fuso brasileiro)
 */
export function estaNoPassadoBrasil(dataParaVerificar: Date): boolean {
  const agora = new Date();
  
  console.log('=== DEBUG estaNoPassadoBrasil ===');
  console.log('Data para verificar:', dataParaVerificar.toLocaleString('pt-BR'));
  console.log('Agora:', agora.toLocaleString('pt-BR'));
  console.log('É passado?', dataParaVerificar <= agora);
  console.log('Diferença (min):', Math.floor((dataParaVerificar.getTime() - agora.getTime()) / (1000 * 60)));
  console.log('==============================');
  
  return dataParaVerificar <= agora;
}

/**
 * Parse de hora brasileira para data UTC - VERSÃO SIMPLIFICADA
 */
export function parseHoraBrasil(dataBase: Date, horaTexto: string): Date | null {
  const regex = /^([0-1]?[0-9]|2[0-3]):?([0-5][0-9])$/;
  const match = horaTexto.replace(/\s/g, '').match(regex);
  
  if (!match) return null;
  
  const horas = parseInt(match[1]);
  const minutos = parseInt(match[2]);
  
  if (horas < 0 || horas > 23 || minutos < 0 || minutos > 59) return null;
  
  const dataCompleta = new Date(
    dataBase.getFullYear(),
    dataBase.getMonth(), 
    dataBase.getDate(),
    horas,
    minutos,
    0,
    0
  );
  
  return dataCompleta;
}