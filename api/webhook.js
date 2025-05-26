const axios = require('axios');

module.exports = async (req, res) => {
  // Log detalhado de entrada
  console.log('Webhook recebido:', JSON.stringify({
    method: req.method,
    body: req.body,
    headers: req.headers
  }));

  // Para requisições GET simples
  if (req.method === 'GET') {
    return res.status(200).send('ZettiBot está funcionando!');
  }

  // Para webhooks do Telegram (POST)
  if (req.method === 'POST') {
    try {
      // Log do corpo da requisição
      console.log('Corpo da requisição:', JSON.stringify(req.body));

      const update = req.body;
      
      // Resposta imediata ao Telegram
      res.status(200).json({ status: 'ok' });

      // Processamento do update
      if (update && update.message) {
        console.log('Mensagem recebida:', JSON.stringify(update.message));
        
        const chatId = update.message.chat.id;
        const messageText = update.message.text || '';
        
        console.log(`Chat ID: ${chatId}, Mensagem: ${messageText}`);

        // Processamento síncrono para garantir logs
        if (messageText === '/start') {
          console.log('Processando /start');
          await sendMessageWithLogging(chatId, `
Olá! Eu sou o ZettiBot 🤖

Estou aqui para auxiliar vendedores externos a terem mais produtividade.

Principais comandos:
/agenda - Ver compromissos do dia
/followup - Gerenciar follow-ups
/clientes - Listar clientes
/help - Ver todos os comandos
`);
        } 
        else if (messageText === '/help' || messageText === '/ajuda') {
          console.log('Processando /help');
          await sendMessageWithLogging(chatId, `
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
`);
        }
        else {
          console.log('Comando não reconhecido');
          await sendMessageWithLogging(chatId, "Desculpe, não entendi esse comando. Use /help para ver os comandos disponíveis.");
        }
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

// Função para enviar mensagem com log detalhado
async function sendMessageWithLogging(chatId, text) {
  const botToken = process.env.BOT_TOKEN;
  const url = `https://api.telegram.org/bot${botToken}/sendMessage`;
  
  console.log(`Enviando mensagem para chat ${chatId}`);
  console.log(`Texto da mensagem: ${text}`);
  
  try {
    const response = await axios.post(url, {
      chat_id: chatId,
      text: text
    });
    
    console.log('Resposta da API do Telegram:', JSON.stringify(response.data));
    return response.data;
  } catch (error) {
    console.error('Erro detalhado ao enviar mensagem:', 
      error.response ? JSON.stringify(error.response.data) : error.message
    );
    throw error;
  }
}