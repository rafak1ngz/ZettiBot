const { getClientesForUser, getAgendaForUser, addAppointment } = require('../utils/database');
const { setUserState, getUserState, clearUserState } = require('../utils/states');
const winston = require('winston');
const moment = require('moment');

// Validações
const validateDate = (dateString) => moment(dateString, 'DD/MM/YYYY', true).isValid();
const validateTime = (timeString) => /^([01]\d|2[0-3]):([0-5]\d)$/.test(timeString);

function createAppointmentKeyboard(bot, chatId) {
  return {
    reply_markup: {
      keyboard: [
        ['🚫 Cancelar Agendamento']
      ],
      resize_keyboard: true,
      one_time_keyboard: true
    }
  };
}

function register(bot) {
  // Ver agenda de hoje
  bot.onText(/\/agenda/, async (msg) => {
    const chatId = msg.chat.id;
    
    try {
      const today = moment().format('YYYY-MM-DD');
      const compromissos = await getAgendaForUser(chatId, today);
      
      if (compromissos.length === 0) {
        await bot.sendMessage(chatId, `📅 Agenda para hoje:
        
Você não tem compromissos agendados para hoje.

Use /agendar para adicionar um novo compromisso.`, {
          reply_markup: {
            keyboard: [['/agendar']],
            resize_keyboard: true
          }
        });
        return;
      }
      
      let mensagem = `📅 Agenda para hoje:\n\n`;
      
      const inlineKeyboard = {
        reply_markup: {
          inline_keyboard: compromissos.map(comp => [{
            text: `${comp.time} - ${comp.clients.name}`,
            callback_data: `ver_compromisso:${comp.id}`
          }])
        }
      };
      
      compromissos.forEach((comp, index) => {
        const horario = comp.time || "Horário não definido";
        const cliente = comp.clients ? comp.clients.name : "Cliente não especificado";
        const tipo = comp.type || "Compromisso";
        const status = comp.status || "Agendado";
        
        mensagem += `${index + 1}. ${horario} - ${cliente}\n`;
        mensagem += `   Tipo: ${tipo} | Status: ${status}\n\n`;
      });
      
      mensagem += `\nClique no compromisso para mais detalhes.`;
      
      await bot.sendMessage(chatId, mensagem, inlineKeyboard);
    } catch (error) {
      winston.error(`Erro ao buscar agenda: ${error.message}`);
      await bot.sendMessage(chatId, "❌ Erro ao buscar agenda. Tente novamente.");
    }
  });

  // Agendar compromisso - início do fluxo
  bot.onText(/\/agendar/, async (msg) => {
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
            callback_data: `select_client_for_appointment:${cliente.id}`
          }])
        }
      };
      
      await bot.sendMessage(
        chatId, 
        "📅 Selecione o cliente para o compromisso:",
        clientMenu
      );
    } catch (error) {
      winston.error(`Erro ao iniciar agendamento: ${error.message}`);
      await bot.sendMessage(chatId, "❌ Erro ao iniciar agendamento. Tente novamente.");
    }
  });

  // Handler para callbacks de seleção de cliente e detalhes de compromisso
  bot.on('callback_query', async (callbackQuery) => {
    const chatId = callbackQuery.message.chat.id;
    const data = callbackQuery.data;

    try {
      if (data.startsWith('select_client_for_appointment:')) {
        const clientId = data.split(':')[1];
        setUserState(chatId, 'adding_appointment_date', { clientId });
        
        await bot.sendMessage(chatId, 
          "📅 Data do compromisso (DD/MM/AAAA):", 
          createAppointmentKeyboard(bot, chatId)
        );
        
        await bot.answerCallbackQuery(callbackQuery.id);
      } else if (data.startsWith('ver_compromisso:')) {
        const compromissoId = data.split(':')[1];
        // Lógica para mostrar detalhes do compromisso
        await bot.answerCallbackQuery(callbackQuery.id);
      }
    } catch (error) {
      winston.error(`Erro em callback de compromisso: ${error.message}`);
      await bot.sendMessage(chatId, "❌ Erro ao processar seleção. Tente novamente.");
    }
  });
}

async function handleAppointmentStates(msg, bot) {
  const chatId = msg.chat.id;
  const text = msg.text;
  const userState = getUserState(chatId);

  if (text === '🚫 Cancelar Agendamento') {
    clearUserState(chatId);
    await bot.sendMessage(chatId, "❌ Agendamento cancelado.", {
      reply_markup: { remove_keyboard: true }
    });
    return true;
  }

  if (!userState.state || !userState.state.startsWith('adding_appointment_')) {
    return false;
  }

  try {
    switch(userState.state) {
      case 'adding_appointment_date':
        if (!validateDate(text)) {
          await bot.sendMessage(chatId, "❌ Data inválida. Use o formato DD/MM/AAAA");
          return true;
        }
        
        setUserState(chatId, 'adding_appointment_time', { 
          ...userState.data, 
          date: moment(text, 'DD/MM/YYYY').format('YYYY-MM-DD')
        });
        
        await bot.sendMessage(chatId, 
          `Data: ${text}\n\nHorário do compromisso (HH:MM)`, 
          createAppointmentKeyboard(bot, chatId)
        );
        break;
      
      case 'adding_appointment_time':
        if (!validateTime(text)) {
          await bot.sendMessage(chatId, "❌ Horário inválido. Use o formato HH:MM");
          return true;
        }
        
        setUserState(chatId, 'adding_appointment_type', { 
          ...userState.data, 
          time: text
        });
        
        await bot.sendMessage(chatId, 
          `Horário: ${text}\n\nTipo de compromisso (ex: Reunião, Visita)`, 
          createAppointmentKeyboard(bot, chatId)
        );
        break;
      
      case 'adding_appointment_type':
        const appointmentData = { 
          ...userState.data, 
          type: text,
          clientId: userState.data.clientId
        };
        
        const appointmentAdded = await addAppointment(chatId, appointmentData);
        
        if (appointmentAdded) {
          await bot.sendMessage(chatId, 
            `✅ Compromisso agendado com sucesso!`, 
            { reply_markup: { remove_keyboard: true } }
          );
        } else {
          await bot.sendMessage(chatId, 
            `❌ Erro ao agendar compromisso. Tente novamente.`, 
            { reply_markup: { remove_keyboard: true } }
          );
        }
        
        clearUserState(chatId);
        break;
    }
    return true;
  } catch (error) {
    winston.error(`Erro ao processar estado de compromisso: ${error.message}`);
    await bot.sendMessage(chatId, "❌ Erro ao processar sua mensagem. Tente novamente.");
    clearUserState(chatId);
    return false;
  }
}

module.exports = { 
  register,
  handleAppointmentStates
};