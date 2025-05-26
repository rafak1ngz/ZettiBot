const axios = require('axios');

// Inicialização prévia do cliente Axios
const axiosInstance = axios.create({
  timeout: 5000
});

module.exports = async (req, res) => {
  // Para requisições GET simples
  if (req.method === 'GET') {
    return res.status(200).send('ZettiBot está funcionando!');
  }

  // Para webhooks do Telegram (POST)
  if (req.method === 'POST') {
    try {
      const update = req.body;
      console.log('Update recebido:', JSON.stringify(update).substring(0, 200) + '...');
      
      // Responder ao Telegram imediatamente
      res.status(200).json({ status: 'ok' });
      
      // Processar a mensagem depois de responder
      if (update && update.message) {
        processUpdate(update).catch(error => {
          console.error('Erro ao processar update:', error);
        });
      }
      
      return;
    } 
    catch (error) {
      console.error('Erro no webhook:', error);
      return res.status(500).json({ error: error.toString() });
    }
  }
  
  // Outros métodos não são permitidos
  return res.status(405).send('Method not allowed');
};

// Função para processar update separadamente
async function processUpdate(update) {
  if (update.message) {
    const chatId = update.message.chat.id;
    const messageText = update.message.text || '';
    console.log(`Processando mensagem: "${messageText}" do chat ID: ${chatId}`);
    
    if (messageText === '/start') {
      await handleStart(chatId);
    } 
    else if (messageText === '/help' || messageText === '/ajuda') {
      await handleHelp(chatId);
    }
    else if (messageText === '/agenda' || messageText === '/agenda_hoje') {
      await handleAgenda(chatId);
    }
    else if (messageText === '/followup' || messageText === '/followups') {
      await handleFollowup(chatId);
    }
    else if (messageText === '/clientes') {
      await handleClientes(chatId);
    }
    else if (messageText === '/comissao') {
      await handleComissao(chatId);
    }
    else {
      await sendMessage(chatId, "Desculpe, não entendi esse comando. Use /help para ver os comandos disponíveis.");
    }
  }
}

// Função para enviar mensagem
async function sendMessage(chatId, text) {
  const botToken = process.env.BOT_TOKEN;
  const url = `https://api.telegram.org/bot${botToken}/sendMessage`;
  
  console.log(`Enviando mensagem para chat ${chatId}`);
  
  try {
    const response = await axiosInstance.post(url, {
      chat_id: chatId,
      text: text
    });
    console.log('Mensagem enviada com sucesso');
    return response.data;
  } catch (error) {
    console.error('Erro ao enviar mensagem:', error.response?.data || error.message);
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

  return await sendMessage(chatId, welcomeMessage);
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

  return await sendMessage(chatId, helpMessage);
}

// Handler do comando /agenda
async function handleAgenda(chatId) {
  // Futuramente vamos implementar integração com o banco de dados
  const message = `
📅 Agenda de Hoje:

Você não tem compromissos agendados para hoje.

Use /agendar para criar um novo compromisso.
`;

  return await sendMessage(chatId, message);
}

// Handler do comando /followup
async function handleFollowup(chatId) {
  // Futuramente vamos implementar integração com o banco de dados
  const message = `
🔄 Follow-ups Pendentes:

Você não tem follow-ups pendentes.

Use /followup_add para criar um novo follow-up.
`;

  return await sendMessage(chatId, message);
}

// Handler do comando /clientes
async function handleClientes(chatId) {
  // Futuramente vamos implementar integração com o banco de dados
  const message = `
👥 Seus Clientes:

Você ainda não cadastrou nenhum cliente.

Use /cliente_add para adicionar um novo cliente.
`;

  return await sendMessage(chatId, message);
}

// Handler do comando /comissao
async function handleComissao(chatId) {
  // Futuramente vamos implementar integração com o banco de dados
  const message = `
💰 Comissões:

Você não tem comissões registradas.

Use /comissao_add para registrar uma nova comissão.
`;

  return await sendMessage(chatId, message);
}