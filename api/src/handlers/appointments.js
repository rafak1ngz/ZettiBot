const { getClientesForUser, getAgendaForUser, addAppointment } = require('../database');
const { setUserState } = require('../utils/states');

function register(bot) {
  // Ver agenda de hoje
  bot.onText(/\/agenda/, async (msg) => {
    const chatId = msg.chat.id;
    console.log(`Processando /agenda para ${chatId}`);
    
    // Obter data atual no formato ISO (YYYY-MM-DD)
    const today = new Date().toISOString().split('T')[0];
    
    // Buscar compromissos do dia
    const compromissos = await getAgendaForUser(chatId, today);
    
    if (compromissos.length === 0) {
      await bot.sendMessage(
        chatId, 
        `📅 Agenda para hoje:
      
Você não tem compromissos agendados para hoje.

Use /agendar para adicionar um novo compromisso.`
      );
    } else {
      let mensagem = `📅 Agenda para hoje:\n\n`;
      
      compromissos.forEach((comp, index) => {
        const horario = comp.time || "Horário não definido";
        const cliente = comp.clients ? comp.clients.name : "Cliente não especificado";
        const tipo = comp.type || "Compromisso";
        const status = comp.status || "Agendado";
        
        mensagem += `${index + 1}. ${horario} - ${cliente}\n`;
        mensagem += `   Tipo: ${tipo} | Status: ${status}\n\n`;
      });
      
      mensagem += `\nUse /agendar para adicionar um novo compromisso.`;
      
      await bot.sendMessage(chatId, mensagem);
    }
  });

  // Agendar compromisso - início do fluxo
  bot.onText(/\/agendar/, async (msg) => {
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
    
    setUserState(chatId, 'selecting_client_for_appointment');
    
    await bot.sendMessage(
      chatId, 
      "📅 Selecione o cliente para o compromisso:",
      clientMenu
    );
  });
}

module.exports = { register };