const { getUserState, setUserState, clearUserState } = require('../utils/states');
const { addClient, addAppointment, addFollowup } = require('../database');

function register(bot) {
  // Handler geral para processar estados
  bot.on('message', async (msg) => {
    const chatId = msg.chat.id;
    const text = msg.text;
    
    // Se for comando, ignorar (serão tratados pelos outros handlers)
    if (text && text.startsWith('/')) {
      return;
    }
    
    const userState = getUserState(chatId);
    if (!userState.state) {
      return; // Sem estado ativo
    }

    // Processar os estados
    switch(userState.state) {
      // Estados para adicionar cliente
      case 'adding_client_name':
        setUserState(chatId, 'adding_client_company', { name: text });
        await bot.sendMessage(chatId, `Cliente: ${text}\n\nQual a empresa?`);
        break;
      
      case 'adding_client_company':
        setUserState(chatId, 'adding_client_phone', { 
          ...userState.data, 
          company: text 
        });
        await bot.sendMessage(chatId, `Empresa: ${text}\n\nQual o telefone?`);
        break;
      
      case 'adding_client_phone':
        setUserState(chatId, 'adding_client_email', { 
          ...userState.data, 
          phone: text 
        });
        await bot.sendMessage(chatId, `Telefone: ${text}\n\nQual o email?`);
        break;
      
      case 'adding_client_email':
        const clientData = { 
          ...userState.data, 
          email: text 
        };
        
        const clientAdded = await addClient(chatId, clientData);
        
        if (clientAdded) {
          await bot.sendMessage(chatId, `✅ Cliente ${clientData.name} cadastrado com sucesso!`);
        } else {
          await bot.sendMessage(chatId, `❌ Erro ao cadastrar cliente. Tente novamente.`);
        }
        
        clearUserState(chatId);
        break;
      
      // Estados para adicionar compromisso
      case 'selecting_client_for_appointment':
        try {
          const [clientId, clientName] = text.split(' - ');
          
          setUserState(chatId, 'adding_appointment_date', { 
            clientId, 
            clientName 
          });
          
          await bot.sendMessage(
            chatId, 
            `Cliente selecionado: ${clientName}\n\nQual a data do compromisso? (YYYY-MM-DD)`
          );
        } catch (e) {
          await bot.sendMessage(chatId, "Formato inválido. Por favor, selecione um cliente da lista.");
        }
        break;
        
      case 'adding_appointment_date':
        // Validar formato de data YYYY-MM-DD
        const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
        if (!dateRegex.test(text)) {
          await bot.sendMessage(chatId, "Formato de data inválido. Use YYYY-MM-DD (ex: 2025-05-25)");
          break;
        }
        
        setUserState(chatId, 'adding_appointment_time', { 
          ...userState.data, 
          date: text 
        });
        
        await bot.sendMessage(
          chatId, 
          `Data: ${text}\n\nQual o horário? (HH:MM)`
        );
        break;
        
      case 'adding_appointment_time':
        // Validar formato de hora HH:MM
        const timeRegex = /^\d{2}:\d{2}$/;
        if (!timeRegex.test(text)) {
          await bot.sendMessage(chatId, "Formato de horário inválido. Use HH:MM (ex: 14:30)");
          break;
        }
        
        setUserState(chatId, 'adding_appointment_type', { 
          ...userState.data, 
          time: text 
        });
        
        // Menu de tipos de compromisso
        const typeMenu = {
          reply_markup: {
            keyboard: [
              ['Visita'], 
              ['Reunião'], 
              ['Apresentação'], 
              ['Entrega'], 
              ['Outro']
            ],
            one_time_keyboard: true,
            resize_keyboard: true
          }
        };
        
        await bot.sendMessage(
          chatId, 
          `Horário: ${text}\n\nQual o tipo de compromisso?`,
          typeMenu
        );
        break;
        
      case 'adding_appointment_type':
        setUserState(chatId, 'adding_appointment_notes', { 
          ...userState.data, 
          type: text 
        });
        
        await bot.sendMessage(
          chatId, 
          `Tipo: ${text}\n\nAlguma observação? (ou digite "não" para pular)`
        );
        break;
        
      case 'adding_appointment_notes':
        const appointmentData = { 
          ...userState.data, 
          notes: text === 'não' ? '' : text 
        };
        
        const appointmentAdded = await addAppointment(chatId, appointmentData);
        
        if (appointmentAdded) {
          await bot.sendMessage(
            chatId, 
            `✅ Compromisso agendado com sucesso!\n\n` +
            `Cliente: ${appointmentData.clientName}\n` +
            `Data: ${appointmentData.date}\n` +
            `Horário: ${appointmentData.time}\n` +
            `Tipo: ${appointmentData.type}`
          );
        } else {
          await bot.sendMessage(chatId, `❌ Erro ao agendar compromisso. Tente novamente.`);
        }
        
        clearUserState(chatId);
        break;
        
      // Estados para adicionar follow-up
      case 'selecting_client_for_followup':
        try {
          const [clientId, clientName] = text.split(' - ');
          
          setUserState(chatId, 'adding_followup_date', { 
            clientId, 
            clientName 
          });
          
          await bot.sendMessage(
            chatId, 
            `Cliente selecionado: ${clientName}\n\nQual a data do follow-up? (YYYY-MM-DD)`
          );
        } catch (e) {
          await bot.sendMessage(chatId, "Formato inválido. Por favor, selecione um cliente da lista.");
        }
        break;
        
      case 'adding_followup_date':
        // Validar formato de data YYYY-MM-DD
        if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) {
          await bot.sendMessage(chatId, "Formato de data inválido. Use YYYY-MM-DD (ex: 2025-05-25)");
          break;
        }
        
        setUserState(chatId, 'adding_followup_type', { 
          ...userState.data, 
          date: text 
        });
        
        // Menu de tipos de follow-up
        const followupTypeMenu = {
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
        
        await bot.sendMessage(
          chatId, 
          `Data: ${text}\n\nQual o tipo de follow-up?`,
          followupTypeMenu
        );
        break;
        
      case 'adding_followup_type':
        setUserState(chatId, 'adding_followup_notes', { 
          ...userState.data, 
          type: text 
        });
        
        await bot.sendMessage(
          chatId, 
          `Tipo: ${text}\n\nAnote o que precisa ser lembrado:`
        );
        break;
        
      case 'adding_followup_notes':
        const followupData = { 
          ...userState.data, 
          notes: text 
        };
        
        const followupAdded = await addFollowup(chatId, followupData);
        
        if (followupAdded) {
          await bot.sendMessage(
            chatId, 
            `✅ Follow-up agendado com sucesso!\n\n` +
            `Cliente: ${followupData.clientName}\n` +
            `Data: ${followupData.date}\n` +
            `Tipo: ${followupData.type}\n` +
            `Anotações: ${followupData.notes}`
          );
        } else {
          await bot.sendMessage(chatId, `❌ Erro ao agendar follow-up. Tente novamente.`);
        }
        
        clearUserState(chatId);
        break;
      
      // Estado padrão caso não reconheça
      default:
        await bot.sendMessage(chatId, `Estado não reconhecido. Use /cancelar para reiniciar.`);
    }
  });

  // Handler para cancelar qualquer fluxo
  bot.onText(/\/cancelar/, async (msg) => {
    const chatId = msg.chat.id;
    const userState = getUserState(chatId);
    
    if (userState.state) {
      clearUserState(chatId);
      await bot.sendMessage(
        chatId, 
        "🚫 Operação cancelada. O que deseja fazer agora?",
        {
          reply_markup: {
            remove_keyboard: true
          }
        }
      );
    } else {
      await bot.sendMessage(chatId, "Não há operação em andamento para cancelar.");
    }
  });
}

module.exports = { register };