const { 
  getClientesForUser, 
  addFollowup 
} = require('../utils/database');
const { setUserState, getUserState, clearUserState } = require('../utils/states');
const winston = require('winston');
const moment = require('moment');

// Validações
const validateDate = (dateString) => moment(dateString, 'DD/MM/YYYY', true).isValid();

function createFollowupKeyboard(bot, chatId) {
  return {
    reply_markup: {
      keyboard: [
        ['🚫 Cancelar Follow-up']
      ],
      resize_keyboard: true,
      one_time_keyboard: true
    }
  };
}

function register(bot) {
  // Comando para iniciar follow-up
  bot.onText(/\/followup/, async (msg) => {
    const chatId = msg.chat.id;
    
    try {
      const clientes = await getClientesForUser(chatId);
      
      if (clientes.length === 0) {
        await bot.sendMessage(chatId, "❌ Você precisa cadastrar clientes primeiro. Use /cliente_add para adicionar um cliente.", {
          reply_markup: {
            keyboard: [['/cliente_add']],
            resize_keyboard: true
          }
        });
        return;
      }
      
      const clientMenu = {
        reply_markup: {
          inline_keyboard: clientes.map(cliente => [{
            text: cliente.name,
            callback_data: `select_client_for_followup:${cliente.id}`
          }])
        }
      };
      
      await bot.sendMessage(
        chatId, 
        "📅 Selecione o cliente para o follow-up:",
        clientMenu
      );
    } catch (error) {
      winston.error(`Erro ao iniciar follow-up: ${error.message}`);
      await bot.sendMessage(chatId, "❌ Erro ao iniciar follow-up. Tente novamente.");
    }
  });

  // Handler para callbacks de seleção de cliente
  bot.on('callback_query', async (callbackQuery) => {
    const chatId = callbackQuery.message.chat.id;
    const data = callbackQuery.data;

    try {
      if (data.startsWith('select_client_for_followup:')) {
        const clientId = data.split(':')[1];
        setUserState(chatId, 'adding_followup_date', { clientId });
        
        await bot.sendMessage(chatId, 
          "📅 Data do follow-up (DD/MM/AAAA):", 
          createFollowupKeyboard(bot, chatId)
        );
        
        await bot.answerCallbackQuery(callbackQuery.id);
      }
    } catch (error) {
      winston.error(`Erro em callback de follow-up: ${error.message}`);
      await bot.sendMessage(chatId, "❌ Erro ao processar seleção. Tente novamente.");
    }
  });
}

async function handleFollowupStates(msg, bot) {
  const chatId = msg.chat.id;
  const text = msg.text;
  const userState = getUserState(chatId);

  if (text === '🚫 Cancelar Follow-up') {
    clearUserState(chatId);
    await bot.sendMessage(chatId, "❌ Follow-up cancelado.", {
      reply_markup: { remove_keyboard: true }
    });
    return true;
  }

  if (!userState.state || !userState.state.startsWith('adding_followup_')) {
    return false;
  }

  try {
    switch(userState.state) {
      case 'adding_followup_date':
        if (!validateDate(text)) {
          await bot.sendMessage(chatId, "❌ Data inválida. Use o formato DD/MM/AAAA");
          return true;
        }
        
        setUserState(chatId, 'adding_followup_type', { 
          ...userState.data, 
          date: moment(text, 'DD/MM/YYYY').format('YYYY-MM-DD')
        });
        
        const typeMenu = {
          reply_markup: {
            keyboard: [
              ['Ligação'], 
              ['WhatsApp'], 
              ['Email'], 
              ['Visita'],
              ['Outro']
            ],
            one_time_keyboard: true,
            resize_keyboard: true
          }
        };
        
        await bot.sendMessage(chatId, 
          `Data: ${text}\n\nTipo de follow-up:`, 
          typeMenu
        );
        break;
      
      case 'adding_followup_type':
        setUserState(chatId, 'adding_followup_notes', { 
          ...userState.data, 
          type: text
        });
        
        await bot.sendMessage(chatId, 
          `Tipo: ${text}\n\nAnotações do follow-up:`, 
          createFollowupKeyboard(bot, chatId)
        );
        break;
      
      case 'adding_followup_notes':
        const followupData = { 
          ...userState.data, 
          notes: text,
          clientId: userState.data.clientId
        };
        
        const followupAdded = await addFollowup(chatId, followupData);
        
        if (followupAdded) {
          await bot.sendMessage(chatId, 
            `✅ Follow-up agendado com sucesso!\n\n` +
            `Data: ${followupData.date}\n` +
            `Tipo: ${followupData.type}\n` +
            `Anotações: ${followupData.notes}`, 
            { reply_markup: { remove_keyboard: true } }
          );
        } else {
          await bot.sendMessage(chatId, 
            `❌ Erro ao agendar follow-up. Tente novamente.`, 
            { reply_markup: { remove_keyboard: true } }
          );
        }
        
        clearUserState(chatId);
        break;
    }
    return true;
  } catch (error) {
    winston.error(`Erro ao processar estado de follow-up: ${error.message}`);
    await bot.sendMessage(chatId, "❌ Erro ao processar sua mensagem. Tente novamente.");
    clearUserState(chatId);
    return false;
  }
}

module.exports = { 
  register,
  handleFollowupStates
};