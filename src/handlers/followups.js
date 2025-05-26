const { getClientesForUser, getFollowupsForUser, addFollowup } = require('../database');
const { setUserState } = require('../utils/states');

function register(bot) {
  // Ver follow-ups pendentes
  bot.onText(/\/followup|\/followups/, async (msg) => {
    const chatId = msg.chat.id;
    console.log(`Processando /followup para ${chatId}`);
    
    // Buscar follow-ups pendentes
    const followups = await getFollowupsForUser(chatId, 'pendente');
    
    if (followups.length === 0) {
      await bot.sendMessage(
        chatId, 
        `🔄 Follow-ups Pendentes:
      
Você não tem follow-ups pendentes.

Use /followup_add para adicionar um novo follow-up.`
      );
    } else {
      let mensagem = `🔄 Follow-ups Pendentes:\n\n`;
      
      followups.forEach((followup, index) => {
        const data = followup.date || "Data não definida";
        const tipo = followup.type || "Contato";
        const obs = followup.notes || "Sem observações";
        
        mensagem += `${index + 1}. ${data} - ${tipo}\n`;
        mensagem += `   Obs: ${obs}\n\n`;
      });
      
      mensagem += `\nUse /followup_add para adicionar um novo follow-up.`;
      
      await bot.sendMessage(chatId, mensagem);
    }
  });

  // Adicionar follow-up - início do fluxo
  bot.onText(/\/followup_add/, async (msg) => {
    const chatId = msg.chat.id;
    
    // Buscar clientes do usuário
    const clientes = await getClientesForUser(chatId);
    
    if (clientes.length === 0) {
      await bot.sendMessage(
        chatId, 
        "❌ Você precisa cadastrar clientes primeiro. Use /cliente_add para adicionar um cliente."
      );
      return;
    }
    
    // Criar menu de seleção de cliente
    const clientMenu = {
      reply_markup: {
        keyboard: clientes.map(cliente => [`${cliente.id} - ${cliente.name}`]),
        one_time_keyboard: true,
        resize_keyboard: true
      }
    };
    
    setUserState(chatId, 'selecting_client_for_followup');
    
    await bot.sendMessage(
      chatId, 
      "🔄 Selecione o cliente para o follow-up:",
      clientMenu
    );
  });
}

module.exports = { register };