const { 
  getClientesForUser, 
  addClient
} = require('../database');
const { setUserState, getUserState, clearUserState } = require('../utils/states');

// Função de registro dos handlers
function register(bot) {
  // Listar clientes
  bot.onText(/\/clientes/, async (msg) => {
    const chatId = msg.chat.id;
    
    try {
      const clientes = await getClientesForUser(chatId);
      
      if (clientes.length === 0) {
        await bot.sendMessage(chatId, 
          "👥 Você não tem clientes cadastrados. Use /cliente_add para adicionar."
        );
        return;
      }
      
      let mensagem = "👥 Seus Clientes:\n\n";
      clientes.forEach((cliente, index) => {
        mensagem += `${index + 1}. ${cliente.name} - ${cliente.company || 'Sem empresa'}\n`;
        mensagem += `   Telefone: ${cliente.phone || 'Não informado'}\n\n`;
      });
      
      await bot.sendMessage(chatId, mensagem);
    } catch (error) {
      console.error('Erro ao listar clientes:', error);
      await bot.sendMessage(chatId, "Erro ao buscar clientes. Tente novamente.");
    }
  });

  // Iniciar fluxo de adicionar cliente
  bot.onText(/\/cliente_add/, async (msg) => {
    const chatId = msg.chat.id;
    
    // Iniciar estado de adição de cliente
    setUserState(chatId, 'adding_client_name');
    
    await bot.sendMessage(chatId, 
      "🆕 Vamos adicionar um novo cliente. \n\nQual o nome do cliente?"
    );
  });

  console.log('Handlers de clientes registrados');
}

// Gerenciar estados de adição de cliente
async function handleClientStates(msg, bot) {
  const chatId = msg.chat.id;
  const text = msg.text;
  const userState = getUserState(chatId);

  if (!userState.state || !userState.state.startsWith('adding_client_')) {
    return false;
  }

  try {
    switch(userState.state) {
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
        await bot.sendMessage(chatId, `Telefone: ${text}\n\nQual o email? (ou digite 'pular' para ignorar)`);
        break;
      
      case 'adding_client_email':
        const clientData = { 
          ...userState.data, 
          email: text === 'pular' ? null : text
        };
        
        console.log('Tentando adicionar cliente:', clientData);
        
        const clientAdded = await addClient(chatId, clientData);
        
        if (clientAdded) {
          await bot.sendMessage(chatId, `✅ Cliente ${clientData.name} cadastrado com sucesso!`);
        } else {
          await bot.sendMessage(chatId, `❌ Erro ao cadastrar cliente. Tente novamente.`);
        }
        
        clearUserState(chatId);
        break;
    }
    return true;
  } catch (error) {
    console.error('Erro ao processar estado:', error);
    await bot.sendMessage(chatId, "Erro ao processar sua mensagem. Tente novamente.");
    clearUserState(chatId);
    return false;
  }
}

// Exportar todas as funções necessárias
module.exports = {
  register,
  handleClientStates
};