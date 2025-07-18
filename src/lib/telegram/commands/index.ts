import { Telegraf } from 'telegraf';
import { handleStart } from './start';
import { handleAjuda } from './ajuda';
import { handleCancelar, handleMenuPrincipal } from './menu';
import { 
  handleClientes, 
  handleClientesAdicionar, 
  handleClientesListar, 
  handleClientesBuscar,
  registerClientesCallbacks 
} from './clientes';
import { 
  handleAgenda,
  registerAgendaCallbacks
} from './agenda';

export const registerCommands = (bot: Telegraf) => {
  //=============================================================================
  // COMANDOS BÁSICOS
  //=============================================================================
  bot.command(['start', 'inicio'], handleStart);
  bot.command('ajuda', handleAjuda);
  bot.command('cancelar', handleCancelar);
  bot.action('cancelar_acao', handleCancelar);

  //=============================================================================
  // COMANDOS MENU PRINCIPAL
  //=============================================================================
  bot.action('menu_principal', (ctx) => {
    ctx.answerCbQuery();
    return handleMenuPrincipal(ctx);
  });

  bot.action('menu_clientes', (ctx) => {
    ctx.answerCbQuery();
    return handleClientes(ctx);
  });

  bot.action('menu_agenda', (ctx) => {
    ctx.answerCbQuery();
    return handleAgenda(ctx);
  });

  bot.action('menu_followup', (ctx) => {
    ctx.answerCbQuery();
    // Temporariamente, avise que está em desenvolvimento
    return ctx.reply('O módulo de Follow Up está em desenvolvimento. Em breve estará disponível!');
  });

  bot.action('menu_lembretes', (ctx) => {
    ctx.answerCbQuery();
    // Temporariamente, avise que está em desenvolvimento
    return ctx.reply('O módulo de Lembretes está em desenvolvimento. Em breve estará disponível!');
  });

  bot.action('menu_ajuda', (ctx) => {
    ctx.answerCbQuery();
    return handleAjuda(ctx);
  });

  //=============================================================================
  // COMANDOS DE CLIENTES
  //=============================================================================
  bot.command('clientes', handleClientes);
  bot.command('clientes_adicionar', handleClientesAdicionar);
  bot.command('clientes_listar', handleClientesListar);
  bot.command('clientes_buscar', handleClientesBuscar);
  
  //=============================================================================
  // COMANDOS DE AGENDA
  //=============================================================================
  bot.command('agenda', handleAgenda);

  //=============================================================================
  // REGISTRAR CALLBACKS DOS MÓDULOS
  //=============================================================================
  registerClientesCallbacks(bot);
  registerAgendaCallbacks(bot);
};

// Re-exportar função do menu principal para uso externo
export { handleMenuPrincipal };