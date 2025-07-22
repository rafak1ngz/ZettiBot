// ============================================================================
// UTILITÁRIOS SIMPLIFICADOS PARA FUSO HORÁRIO - VERSÃO CORRIGIDA
// ============================================================================

import { format, parse, isValid, addDays } from 'date-fns';
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
export function criarDataBrasil(ano: number, mes: number, dia: number, hora: number = 0, minuto: number = 0): Date {
  // Criar data local brasileira
  const dataLocal = new Date(ano, mes, dia, hora, minuto, 0, 0);
  
  // Converter para UTC antes de retornar
  return brasilParaUTC(dataLocal);
}

/**
 * Formatar data UTC para exibição brasileira
 */
export function formatarDataBrasil(dataUTC: Date, formato: string = "dd/MM/yyyy 'às' HH:mm"): string {
  const dataBrasil = utcParaBrasil(dataUTC);
  return format(dataBrasil, formato, { locale: ptBR });
}

/**
 * Verificar se data UTC está no passado (considerando fuso brasileiro)
 */
export function estaNoPassadoBrasil(dataUTC: Date): boolean {
  const agoraUTC = new Date(); // Agora em UTC (servidor)
  return dataUTC <= agoraUTC;
}

/**
 * ✅ NOVA: Parse de data brasileira - VERSÃO SIMPLIFICADA
 * Recebe string de data e retorna Date em horário brasileiro
 */
export function parseDataBrasil(dataTexto: string): Date | null {
  try {
    // Verificar atalhos de data
    if (dataTexto.toLowerCase() === 'hoje') {
      return new Date();
    } else if (dataTexto.toLowerCase() === 'amanhã') {
      return addDays(new Date(), 1);
    } else if (dataTexto.toLowerCase() === 'próxima semana') {
      return addDays(new Date(), 7);
    }
    
    // Tentar parsing de data formato DD/MM ou DD/MM/YYYY
    let data;
    if (dataTexto.includes('/')) {
      const partes = dataTexto.split('/');
      if (partes.length === 2) {
        // Formato DD/MM - usar ano atual
        const anoAtual = new Date().getFullYear();
        data = parse(`${dataTexto}/${anoAtual}`, 'dd/MM/yyyy', new Date());
      } else if (partes.length === 3) {
        // Formato DD/MM/YYYY
        data = parse(dataTexto, 'dd/MM/yyyy', new Date());
      } else {
        return null;
      }
    } else {
      return null;
    }
    
    return isValid(data) ? data : null;
  } catch {
    return null;
  }
}

/**
 * ✅ NOVA: Parse de hora brasileira - VERSÃO SIMPLIFICADA 
 * Recebe data base e string de hora, retorna Date completa
 */
export function parseHoraBrasil(dataBase: Date, horaTexto: string): Date | null {
  const regex = /^([0-1]?[0-9]|2[0-3]):?([0-5][0-9])$/;
  const match = horaTexto.replace(/\s/g, '').match(regex);
  
  if (!match) return null;
  
  const horas = parseInt(match[1]);
  const minutos = parseInt(match[2]);
  
  if (horas < 0 || horas > 23 || minutos < 0 || minutos > 59) return null;
  
  // Criar nova data com a hora especificada
  return new Date(
    dataBase.getFullYear(),
    dataBase.getMonth(),
    dataBase.getDate(),
    horas,
    minutos,
    0,
    0
  );
}

/**
 * ✅ NOVA: Parse simplificado de data/hora - UMA FUNÇÃO APENAS
 * Para usar nos followups onde não sabemos se é data ou hora
 */
export function parseDataHoraBrasil(textoCompleto: string): Date | null {
  // Se contém :, pode ser hora
  if (textoCompleto.includes(':')) {
    const hoje = new Date();
    return parseHoraBrasil(hoje, textoCompleto);
  }
  
  // Senão, tratar como data
  return parseDataBrasil(textoCompleto);
}

/**
 * Calcular diferença em minutos entre duas datas UTC
 */
export function diferencaMinutos(dataUTC1: Date, dataUTC2: Date): number {
  return Math.floor((dataUTC1.getTime() - dataUTC2.getTime()) / (1000 * 60));
}

/**
 * Gerar timestamp para logs
 */
export function timestampLog(): string {
  return format(agoraBrasil(), 'yyyy-MM-dd HH:mm:ss', { locale: ptBR });
}