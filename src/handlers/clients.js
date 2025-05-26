const { getClientesForUser, addClient } = require('../database');
const { setUserState } = require('../utils/states');

function register(bot) {
  // Lista de clientes
  bot.onText(/\/clientes/, async (msg) => {
    const chatId = msg.chat.id;
    console.log(`Processando /clientes para ${chatId}`);
    
    // Buscar clientes
    const clientes = await getClientesForUser(chatId);
    
    if (clientes.length === 0) {
      await bot.sendMessage(
        chatId, 
        `👥 Clientes:
      
Você não tem clientes cadastrados.

Use /cliente_add para adicionar um novo cliente.`
      );
    } else {
      let mensagem = `👥 Seus Clientes:\n\n`;
      
      clientes.forEach((cliente, index) => {
        const nome = cliente.name || "Nome não definido";
        const empresa = cliente.company || "Empresa não definida";
        const telefone = cliente.phone || "Sem telefone";
        
        mensagem += `${index + 1}. ${nome} - ${empresa}\n`;
        mensagem += `   Tel: ${telefone}\n\n`;
      });
      
      mensagem += `\nUse /cliente_add para adicionar um novo cliente.`;
      
      await bot.sendMessage(chatId, mensagem);
    }
  });

  // Adicionar cliente - início do fluxo
  bot.onText(/\/cliente_add/, async (msg) => {
    const chatId = msg.chat.id;
    
    // Iniciar fluxo de adicionar cliente
    setUserState(chatId, 'adding_client_name');
    
    await bot.sendMessage(
      chatId, 
      "🆕 Vamos adicionar um novo cliente. \n\nQual o nome do cliente/contato?"
    );
  });
}

module.exports = { register };