const { registerUser } = require('../database');

function register(bot) {
  // Handler para /start
  bot.onText(/\/start/, async (msg) => {
    const chatId = msg.chat.id;
    const name = msg.from.first_name;
    const username = msg.from.username;
    
    console.log(`Processando /start para ${chatId}`);
    
    // Registrar usuário
    await registerUser(chatId, name, username);
    
    await bot.sendMessage(
      chatId, 
      `Olá, ${name}! Eu sou o ZettiBot 🤖

Estou aqui para auxiliar vendedores externos a terem mais produtividade.

Principais comandos:
/agenda - Ver compromissos do dia
/followup - Gerenciar follow-ups
/clientes - Listar clientes
/help - Ver todos os comandos`
    );
  });

  // Handler para /help
  bot.onText(/\/help|\/ajuda/, async (msg) => {
    const chatId = msg.chat.id;
    console.log(`Processando /help para ${chatId}`);
    await bot.sendMessage(
      chatId, 
      `Comandos disponíveis:

📅 Agenda
/agenda_hoje - Ver compromissos do dia
/agendar - Adicionar novo compromisso

👥 Clientes
/cliente_add - Cadastrar novo cliente
/clientes - Listar clientes
/cliente_busca - Buscar cliente

🔄 Follow-up
/followup_add - Criar novo follow-up
/followups - Listar follow-ups pendentes

💰 Comissões
/comissao - Consultar comissões
/comissao_add - Registrar nova comissão

ℹ️ Outros
/start - Iniciar bot
/help - Mostrar esta lista de comandos`
    );
  });
}

module.exports = { register };