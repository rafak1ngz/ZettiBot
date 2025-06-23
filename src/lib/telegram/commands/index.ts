import { Telegraf } from 'telegraf';
import { handleStart } from './start';
import { handleAjuda } from './ajuda';
import { handleClientes, handleClientesAdicionar, handleClientesListar } from './clientes';
// Importação de comandos futuros:
// import { handleAgenda } from './agenda';
// import { handleFollowUp } from './followup';
// import { handleLembrete } from './lembrete';

export const registerCommands = (bot: Telegraf) => {
  //=============================================================================
  // COMANDOS BÁSICOS
  //=============================================================================
  bot.command(['start', 'inicio'], handleStart);
  bot.command('ajuda', handleAjuda);
  
  //=============================================================================
  // COMANDOS DE CLIENTES
  //=============================================================================
  bot.command('clientes', handleClientes);
  bot.command('clientes_adicionar', handleClientesAdicionar);
  bot.command('clientes_listar', handleClientesListar);
  // Comandos futuros de clientes:
  // bot.command('clientes_buscar', handleClientesBuscar);
  // bot.command('clientes_editar', handleClientesEditar);
  
  //=============================================================================
  // COMANDOS DE AGENDA (comentados até implementação)
  //=============================================================================
  // bot.command('agenda', handleAgenda);
  // bot.command('agenda_registrar', handleAgendaRegistrar);
  // bot.command('agenda_visualizar', handleAgendaVisualizar);
  
  //=============================================================================
  // COMANDOS DE FOLLOW-UP (comentados até implementação)
  //=============================================================================
  // bot.command('followup', handleFollowUp);
  // bot.command('followup_iniciar', handleFollowUpIniciar);
  // bot.command('followup_visualizar', handleFollowUpVisualizar);
  
  //=============================================================================
  // COMANDOS DE LEMBRETES (comentados até implementação)
  //=============================================================================
  // bot.command('lembrete', handleLembrete);
  // bot.command('lembrete_criar', handleLembreteCriar);
  // bot.command('lembrete_visualizar', handleLembreteVisualizar);
};