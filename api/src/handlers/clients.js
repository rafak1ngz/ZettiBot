const { 
  getClientesForUser, 
  addClient,
  searchClients
} = require('../utils/database');
const { setUserState, getUserState, clearUserState } = require('../utils/states');
const winston = require('winston');dações
const validateName = (name) => name && name.length >= 2;
const validatePhone = (phone) => /^\(\d{2}\)\s?\d{4,5}-?\d{4}$/.test(phone);
const validateEmail = (email) => email === 'pular' || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

function createClientKeyboard(bot, chatId) {
  return {
    reply_markup: {
      keyboard: [
        ['🚫 Cancelar Cadastro']
      ],
      resize_keyboard: true,
      one_time_keyboard: true
    }
  };
}

function register(bot) {
  // Listar clientes com botões de ação
  bot.onText(/\/clientes/, async (msg) => {
    const chatId = msg.chat.id;
    
    try {
      const clientes = await getClientesForUser(chatId);
      
      if (clientes.length === 0) {
        await bot.sendMessage(chatId, 
          "👥 Você não tem clientes cadastrados. Use /cliente_add para adicionar.", 
          {
            reply_markup: {
              keyboard: [
                ['/cliente_add']
              ],
              resize_keyboard: true
            }
          }
        );
        return;
      }
      
      let mensagem = "👥 Seus Clientes:\n\n";
      const keyboard = {
        reply_markup: {
          inline_keyboard: clientes.map(cliente => [
            { 
              text: `${cliente.name} - ${cliente.company || 'Sem empresa'}`, 
              callback_data: `cliente_detalhes:${cliente.id}` 
            }
          ])
        }
      };
      
      await bot.sendMessage(chatId, mensagem, keyboard);
    } catch (error) {
      winston.error(`Erro ao listar clientes: ${error.message}`);
      await bot.sendMessage(chatId, "❌ Erro ao buscar clientes. Tente novamente.");
    }
  });

  // Busca de clientes
  bot.onText(/\/buscar_cliente/, async (msg) => {
    const chatId = msg.chat.id;
    
    setUserState(chatId, 'searching_client');
    await bot.sendMessage(chatId, 
      "🔍 Digite o nome ou empresa para buscar:", 
      {
        reply_markup: {
          keyboard: [['🚫 Cancelar Busca']],
          resize_keyboard: true
        }
      }
    );
  });

  // Iniciar fluxo de adicionar cliente
  bot.onText(/\/cliente_add/, async (msg) => {
    const chatId = msg.chat.id;
    
    setUserState(chatId, 'adding_client_name');
    
    await bot.sendMessage(chatId, 
      "🆕 Vamos adicionar um novo cliente. \n\nQual o nome do contato?", 
      createClientKeyboard(bot, chatId)
    );
  });

  // Handler para callbacks de detalhes do cliente
  bot.on('callback_query', async (callbackQuery) => {
    const chatId = callbackQuery.message.chat.id;
    const data = callbackQuery.data;

    if (data.startsWith('cliente_detalhes:')) {
      const clientId = data.split(':')[1];
      // Implementar lógica de mostrar detalhes do cliente
      await bot.answerCallbackQuery(callbackQuery.id);
    }
  });

  winston.info('Handlers de clientes registrados');
}

async function handleClientStates(msg, bot) {
  const chatId = msg.chat.id;
  const text = msg.text;
  const userState = getUserState(chatId);

  // Tratamento de cancelamento
  if (text === '🚫 Cancelar Cadastro' || text === '🚫 Cancelar Busca') {
    clearUserState(chatId);
    await bot.sendMessage(chatId, "❌ Operação cancelada.", {
      reply_markup: { remove_keyboard: true }
    });
    return true;
  }

  if (!userState.state || !userState.state.startsWith('adding_client_') && !userState.state.startsWith('searching_')) {
    return false;
  }

  try {
    switch(userState.state) {
      case 'searching_client':
        const resultados = await searchClients(chatId, text);
        if (resultados.length > 0) {
          let mensagem = "🔍 Resultados da busca:\n\n";
          resultados.forEach((cliente, index) => {
            mensagem += `${index + 1}. ${cliente.name} - ${cliente.company || 'Sem empresa'}\n`;
          });
          await bot.sendMessage(chatId, mensagem);
        } else {
          await bot.sendMessage(chatId, "❌ Nenhum cliente encontrado.");
        }
        clearUserState(chatId);
        break;

      case 'adding_client_name':
        if (!validateName(text)) {
          await bot.sendMessage(chatId, "❌ Nome inválido. Digite um nome válido.");
          return true;
        }
        setUserState(chatId, 'adding_client_company', { name: text });
        await bot.sendMessage(chatId, 
          `Cliente: ${text}\n\nQual a empresa?`, 
          createClientKeyboard(bot, chatId)
        );
        break;
      
      case 'adding_client_company':
        setUserState(chatId, 'adding_client_phone', { 
          ...userState.data, 
          company: text || 'Não informada'
        });
        await bot.sendMessage(chatId, 
          `Empresa: ${text || 'Não informada'}\n\nQual o telefone? (formato: (99) 99999-9999)`, 
          createClientKeyboard(bot, chatId)
        );
        break;
      
      case 'adding_client_phone':
        if (!validatePhone(text)) {
          await bot.sendMessage(chatId, "❌ Telefone inválido. Use o formato (99) 99999-9999");
          return true;
        }
        setUserState(chatId, 'adding_client_email', { 
          ...userState.data, 
          phone: text 
        });
        await bot.sendMessage(chatId, 
          `Telefone: ${text}\n\nQual o email? (ou digite 'pular' para ignorar)`, 
          createClientKeyboard(bot, chatId)
        );
        break;
      
      case 'adding_client_email':
        if (text !== 'pular' && !validateEmail(text)) {
          await bot.sendMessage(chatId, "❌ Email inválido. Digite um email válido ou 'pular'.");
          return true;
        }
        
        const clientData = { 
          ...userState.data, 
          email: text === 'pular' ? null : text
        };
        
        const clientAdded = await addClient(chatId, clientData);
        
        if (clientAdded) {
          await bot.sendMessage(chatId, 
            `✅ Cliente ${clientData.name} cadastrado com sucesso!`,
            { reply_markup: { remove_keyboard: true } }
          );
        } else {
          await bot.sendMessage(chatId, 
            `❌ Erro ao cadastrar cliente. Tente novamente.`,
            { reply_markup: { remove_keyboard: true } }
          );
        }
        
        clearUserState(chatId);
        break;
    }
    return true;
  } catch (error) {
    winston.error(`Erro ao processar estado de cliente: ${error.message}`);
    await bot.sendMessage(chatId, "❌ Erro ao processar sua mensagem. Tente novamente.");
    clearUserState(chatId);
    return false;
  }
}

module.exports = {
  register,
  handleClientStates
};