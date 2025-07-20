// ✅ UTILITÁRIOS CENTRALIZADOS PARA FUSO HORÁRIO
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

// Constante do fuso brasileiro
const BRASIL_UTC_OFFSET = -3; // UTC-3

/**
 * Converter horário brasileiro para UTC (para salvar no banco)
 */
export function brasilParaUTC(dataBrasil: Date): Date {
  return new Date(dataBrasil.getTime() + (3 * 60 * 60 * 1000));
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
 * Criar data brasileira a partir de dia/mês/ano/hora/minuto e converter para UTC
 */
export function criarDataBrasil(ano: number, mes: number, dia: number, hora: number, minuto: number): Date {
  // Criar data local brasileira
  const dataLocal = new Date(ano, mes, dia, hora, minuto, 0, 0);
  
  // ✅ CORREÇÃO: Converter para UTC antes de retornar
  const dataUTC = brasilParaUTC(dataLocal);
  
  console.log('=== DEBUG criarDataBrasil ===');
  console.log('Input:', { ano, mes, dia, hora, minuto });
  console.log('Data local criada:', dataLocal.toLocaleString('pt-BR'));
  console.log('Data UTC para salvar:', dataUTC.toISOString());
  console.log('==========================');
  
  return dataUTC;
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
export function estaNoPassadoBrasil(dataUTC: Date): boolean {
  const agoraUTC = new Date(); // Agora em UTC (servidor)
  
  console.log('=== DEBUG estaNoPassadoBrasil ===');
  console.log('Data UTC para verificar:', dataUTC.toISOString());
  console.log('Agora UTC (servidor):', agoraUTC.toISOString());
  console.log('Data Brasil (display):', utcParaBrasil(dataUTC).toLocaleString('pt-BR'));
  console.log('Agora Brasil (display):', utcParaBrasil(agoraUTC).toLocaleString('pt-BR'));
  console.log('É passado?', dataUTC <= agoraUTC);
  console.log('Diferença (min):', Math.floor((dataUTC.getTime() - agoraUTC.getTime()) / (1000 * 60)));
  console.log('==============================');
  
  return dataUTC <= agoraUTC;
}

/**
 * Parse de hora brasileira para data UTC - VERSÃO CORRIGIDA
 */
export function parseHoraBrasil(dataBase: Date, horaTexto: string): Date | null {
  const regex = /^([0-1]?[0-9]|2[0-3]):?([0-5][0-9])$/;
  const match = horaTexto.replace(/\s/g, '').match(regex);
  
  if (!match) return null;
  
  const horas = parseInt(match[1]);
  const minutos = parseInt(match[2]);
  
  if (horas < 0 || horas > 23 || minutos < 0 || minutos > 59) return null;
  
  // ✅ CORREÇÃO: Usar criarDataBrasil que já converte para UTC
  return criarDataBrasil(
    dataBase.getFullYear(),
    dataBase.getMonth(),
    dataBase.getDate(),
    horas,
    minutos
  );
}