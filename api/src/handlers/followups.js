const { 
  getClientesForUser, 
  addFollowup 
} = require('../utils/database');
const { setUserState, getUserState, clearUserState } = require('../utils/states');
const winston = require('winston');
const moment = require('moment');

// Validações
const validateDate = (dateString) => moment(dateString, 'DD/MM/YYYY', true).isValid();

function register(bot) {
  // Comando para iniciar follow-up
  bot.onText(/\/followup/, async (msg) => {
    const chatId = msg.chat.id;
    
    try {
      const clientes = await getClientesForUser(chatId);
      
      if (clientes.length === 0) {
        await bot.sendMessage(chatId, "❌ Você precisa cadastrar clientes primeiro. Use /cliente_add para adicionar um cliente.");
        return;
      }
      
      const clientMenu = clientes.map(cliente => `${cliente.id} - ${cliente.name}`).join('\n');
      
      await bot.sendMessage(
        chatId, 
        "📅 Selecione o cliente para o follow-up:\n\n" + clientMenu
      );
      
      setUserState(chatId, 'selecting_client_for_followup');
    } catch (error) {
      winston.error(`Erro ao iniciar follow-up: ${error.message}`);
      await bot.sendMessage(chatId, "❌ Erro ao iniciar follow-up. Tente novamente.");
    }
  });
}

async function handleFollowupStates(msg, bot) {
  const chatId = msg.chat.id;
  const text = msg.text;
  const userState = getUserState(chatId);

  if (!userState.state || !userState.state.startsWith('adding_followup_') && userState.state !== 'selecting_client_for_followup') {
    return false;
  }

  try {
    switch(userState.state) {
      case 'selecting_client_for_followup':
        const [clientId, clientName] = text.split(' - ');
        setUserState(chatId, 'adding_followup_date', { clientId, clientName });
        await bot.sendMessage(chatId, `Cliente selecionado: ${clientName}\n\nQual a data do follow-up? (DD/MM/AAAA)`);
        break;

      case 'adding_followup_date':
        if (!validateDate(text)) {
          await bot.sendMessage(chatId, "❌ Data inválida. Use o formato DD/MM/AAAA");
          return true;
        }
        
        setUserState(chatId, 'adding_followup_type', { 
          ...userState.data, 
          date: moment(text, 'DD/MM/YYYY').format('YYYY-MM-DD')
        });
        
        await bot.sendMessage(chatId, 
          `Data: ${text}\n\nTipo de follow-up (Ligação, WhatsApp, Email, Visita)`
        );
        break;
      
      case 'adding_followup_type':
        setUserState(chatId, 'adding_followup_notes', { 
          ...userState.data, 
          type: text
        });
        
        await bot.sendMessage(chatId, 
          `Tipo: ${text}\n\nAnotações do follow-up:`
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
            `Cliente: ${followupData.clientName}\n` +
            `Data: ${followupData.date}\n` +
            `Tipo: ${followupData.type}\n` +
            `Anotações: ${followupData.notes}`
          );
        } else {
          await bot.sendMessage(chatId, 
            `❌ Erro ao agendar follow-up. Tente novamente.`
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