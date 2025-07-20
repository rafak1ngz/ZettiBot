import { Telegraf } from 'telegraf';
import { adminSupabase } from '@/lib/supabase';
import {
  handleAgenda,
  handleNovoCompromisso,
  handleVincularCliente,
  handleSemCliente,
  handleListarCompromissos,
  handleSelecionarCliente,
  handleEditarCompromisso
} from './handlers';
import { registerAgendaCallbacks } from './callbacks';

// ============================================================================
// REGISTRAR TODOS OS COMANDOS E CALLBACKS DE AGENDA
// ============================================================================
export function registerAgendaCommands(bot: Telegraf) {
  
  // ========================================================================
  // COMANDO PRINCIPAL
  // ========================================================================
  bot.command('agenda', handleAgenda);

  // ========================================================================
  // CALLBACKS DO MENU PRINCIPAL
  // ========================================================================
  bot.action('menu_agenda', (ctx) => {
    ctx.answerCbQuery();
    return handleAgenda(ctx);
  });

  // ========================================================================
  // REGISTRAR TODOS OS CALLBACKS (INCLUINDO NOTIFICAÇÕES)
  // ========================================================================
  registerAgendaCallbacks(bot);

  console.log('✅ Módulo de agenda com notificações registrado com sucesso!');
}