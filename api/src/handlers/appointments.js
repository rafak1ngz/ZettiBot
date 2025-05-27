const { getClientesForUser, getAgendaForUser, addAppointment } = require('../utils/database');
const { setUserState, getUserState, clearUserState } = require('../utils/states');
const winston = require('winston');
const moment = require('moment');

// Validações
const validateDate = (dateString) => moment(dateString, 'DD/MM/YYYY', true).isValid();
const validateTime = (timeString) => /^([01]\d|2[0-3]):([0-5]\d)$/.test(timeString);

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

Use /agendar para adicionar um novo compromisso.`);
        return;
      }
      
      let mensagem = `📅 Agenda para hoje:\n\n`;
      
      compromissos.forEach((comp, index) => {
        const horario = comp.time || "Horário não definido";
        const cliente = comp.clients ? comp.clients.name : "Cliente não especificado";
        const tipo = comp.type || "Compromisso";
        const status = comp.status || "Agendado";
        
        mensagem += `${index + 1}. ${horario} - ${cliente}\n`;
        mensagem += `   Tipo: ${tipo} | Status: ${status}\n\n`;
      });
      
      await bot.sendMessage(chatId, mensagem);
    } catch (error) {
      winston.error(`Erro ao buscar agenda: ${error.message}`);
      await bot.sendMessage(chatId, "❌ Erro ao buscar agenda. Tente novamente.");
    }
  });

  // Agendar compromisso
  bot.onText(/\/agendar/, async (msg) => {
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
        "📅 Selecione o cliente para o compromisso:\n\n" + clientMenu
      );
      
      setUserState(chatId, 'selecting_client_for_appointment');
    } catch (error) {
      winston.error(`Erro ao iniciar agendamento: ${error.message}`);
      await bot.sendMessage(chatId, "❌ Erro ao iniciar agendamento. Tente novamente.");
    }
  });
}

async function handleAppointmentStates(msg, bot) {
  const chatId = msg.chat.id;
  const text = msg.text;
  const userState = getUserState(chatId);

  if (!userState.state || !userState.state.startsWith('adding_appointment_') && userState.state !== 'selecting_client_for_appointment') {
    return false;
  }

  try {
    switch(userState.state) {
      case 'selecting_client_for_appointment':
        const [clientId, clientName] = text.split(' - ');
        setUserState(chatId, 'adding_appointment_date', { clientId, clientName });
        await bot.sendMessage(chatId, `Cliente selecionado: ${clientName}\n\nQual a data do compromisso? (DD/MM/AAAA)`);
        break;

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
          `Data: ${text}\n\nHorário do compromisso (HH:MM)`
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
          `Horário: ${text}\n\nTipo de compromisso (ex: Reunião, Visita)`
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
            `✅ Compromisso agendado com sucesso!\n\n` +
            `Cliente: ${appointmentData.clientName}\n` +
            `Data: ${appointmentData.date}\n` +
            `Horário: ${appointmentData.time}\n` +
            `Tipo: ${appointmentData.type}`
          );
        } else {
          await bot.sendMessage(chatId, 
            `❌ Erro ao agendar compromisso. Tente novamente.`
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