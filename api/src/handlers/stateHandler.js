const { getUserState, clearUserState } = require('../utils/states');
const clientHandlers = require('./clients');
const appointmentHandlers = require('./appointments');
const followupHandlers = require('./followups');
const winston = require('winston');

async function processMessage(msg, bot) {
  const chatId = msg.chat.id;
  const text = msg.text;
  
  // Se for comando, ignorar (serão tratados pelos outros handlers)
  if (text && text.startsWith('/')) {
    return false;
  }
  
  try {
    // Tenta processar estados de clientes
    const clientResult = await clientHandlers.handleClientStates(msg, bot);
    if (clientResult) return true;

    // Tenta processar estados de compromissos
    const appointmentResult = await appointmentHandlers.handleAppointmentStates(msg, bot);
    if (appointmentResult) return true;

    // Tenta processar estados de follow-ups
    const followupResult = await followupHandlers.handleFollowupStates(msg, bot);
    if (followupResult) return true;

    // Se nenhum handler processou, verifica estado geral
    const userState = getUserState(chatId);
    
    if (userState.state) {
      await bot.sendMessage(
        chatId, 
        "❓ Parece que a operação anterior não foi concluída. Use /cancelar para reiniciar.",
        {
          reply_markup: {
            keyboard: [['/cancelar']],
            resize_keyboard: true
          }
        }
      );
      return true;
    }

    return false;
  } catch (error) {
    winston.error(`Erro no processamento de estado: ${error.message}`);
    await bot.sendMessage(
      chatId, 
      "❌ Ocorreu um erro inesperado. Por favor, tente novamente.",
      {
        reply_markup: {
          remove_keyboard: true
        }
      }
    );
    return true;
  }
}

function register(bot) {
  // Handler geral para processar mensagens
  bot.on('message', async (msg) => {
    await processMessage(msg, bot);
  });

  // Handler para cancelar qualquer fluxo
  bot.onText(/\/cancelar/, async (msg) => {
    const chatId = msg.chat.id;
    const userState = getUserState(chatId);
    
    try {
      if (userState.state) {
        clearUserState(chatId);
        await bot.sendMessage(
          chatId, 
          "🚫 Operação cancelada. O que deseja fazer agora?",
          {
            reply_markup: {
              keyboard: [
                ['/clientes', '/agenda'],
                ['/agendar', '/followup']
              ],
              resize_keyboard: true
            }
          }
        );
      } else {
        await bot.sendMessage(
          chatId, 
          "Não há operação em andamento para cancelar.",
          {
            reply_markup: {
              keyboard: [
                ['/clientes', '/agenda'],
                ['/agendar', '/followup']
              ],
              resize_keyboard: true
            }
          }
        );
      }
    } catch (error) {
      winston.error(`Erro no comando /cancelar: ${error.message}`);
      await bot.sendMessage(
        chatId, 
        "❌ Erro ao processar cancelamento. Tente novamente."
      );
    }
  });

  winston.info('Handlers de estado registrados');
}

module.exports = { 
  register,
  processMessage 
};