const axios = require('axios');

module.exports = async (req, res) => {
  // Para requisições GET simples
  if (req.method === 'GET') {
    return res.status(200).send('ZettiBot está funcionando!');
  }

  // Para webhooks do Telegram (POST)
  if (req.method === 'POST') {
    try {
      const update = req.body;
      
      // Verifica se é uma mensagem
      if (update && update.message) {
        const chatId = update.message.chat.id;
        const messageText = update.message.text || '';
        
        // Processa comandos
        if (messageText === '/start') {
          await handleStart(chatId);
        } 
        else if (messageText === '/help' || messageText === '/ajuda') {
          await handleHelp(chatId);
        }
        else {
          await sendMessage(chatId, "Desculpe, não entendi esse comando. Use /help para ver os comandos disponíveis.");
        }
      }
      
      // Retorna sucesso para o Telegram
      return res.status(200).json({ status: 'ok' });
    } 
    catch (error) {
      console.error('Erro ao processar webhook:', error);
      return res.status(500).json({ error: error.toString() });
    }
  }
  
  // Outros métodos não são permitidos
  return res.status(405).send('Method not allowed');
};

// Função para enviar mensagem
async function sendMessage(chatId, text) {
  const botToken = process.env.BOT_TOKEN;
  const url = `https://api.telegram.org/bot${botToken}/sendMessage`;
  
  try {
    await axios.post(url, {
      chat_id: chatId,
      text: text
      // Removido o parse_mode: 'Markdown'
    });
  } catch (error) {
    console.error('Erro ao enviar mensagem:', error);
    throw error;
  }
}

// Handler do comando /start
async function handleStart(chatId) {
  const welcomeMessage = `
Olá! Eu sou o ZettiBot 🤖

Estou aqui para auxiliar vendedores externos a terem mais produtividade.

Principais comandos:
/agenda - Ver compromissos do dia
/followup - Gerenciar follow-ups
/clientes - Listar clientes
/help - Ver todos os comandos
`;

  await sendMessage(chatId, welcomeMessage);
}

// Handler do comando /help
async function handleHelp(chatId) {
  const helpMessage = `
Comandos disponíveis:

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
/help - Mostrar esta lista de comandos
`;

  await sendMessage(chatId, helpMessage);
}