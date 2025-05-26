const TelegramBot = require('node-telegram-bot-api');

// Configuração
const BOT_TOKEN = process.env.BOT_TOKEN || '7914192908:AAGXiOU_E4TfR-Kuynf6V_sTgRRyUdN0umM';

// Inicializa o Bot
const bot = new TelegramBot(BOT_TOKEN);

// Define os handlers
function setupHandlers() {
  // Limpar handlers anteriores
  bot._textRegexpCallbacks = [];
  
  // Handler para /start
  bot.onText(/\/start/, async (msg) => {
    const chatId = msg.chat.id;
    console.log(`Processando /start para ${chatId}`);
    await bot.sendMessage(
      chatId, 
      `Olá! Eu sou o ZettiBot 🤖

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

  // Handler para /agenda
  bot.onText(/\/agenda/, async (msg) => {
    const chatId = msg.chat.id;
    console.log(`Processando /agenda para ${chatId}`);
    await bot.sendMessage(
      chatId, 
      `📅 Agenda:
    
Você não tem compromissos agendados para hoje.

Use /agendar para adicionar um novo compromisso.`
    );
  });

  // Handler para /followup
  bot.onText(/\/followup/, async (msg) => {
    const chatId = msg.chat.id;
    console.log(`Processando /followup para ${chatId}`);
    await bot.sendMessage(
      chatId, 
      `🔄 Follow-ups:
    
Você não tem follow-ups pendentes.

Use /followup_add para adicionar um novo follow-up.`
    );
  });

  // Handler para /clientes
  bot.onText(/\/clientes/, async (msg) => {
    const chatId = msg.chat.id;
    console.log(`Processando /clientes para ${chatId}`);
    await bot.sendMessage(
      chatId, 
      `👥 Clientes:
    
Você não tem clientes cadastrados.

Use /cliente_add para adicionar um novo cliente.`
    );
  });
}

// Handler principal para Vercel
module.exports = async (req, res) => {
  // Configurar handlers
  setupHandlers();

  // Para GET requests (verificação/status)
  if (req.method === 'GET') {
    const path = req.url.split('?')[0];
    
    // Verificar se é solicitação para configurar webhook
    if (path === '/set-webhook') {
      const WEBHOOK_URL = `https://${req.headers.host}`;
      try {
        await bot.setWebHook(`${WEBHOOK_URL}`);
        return res.status(200).json({
          success: true,
          message: 'Webhook configurado com sucesso',
          webhook_url: WEBHOOK_URL
        });
      } catch (error) {
        return res.status(500).json({
          success: false,
          error: error.message
        });
      }
    }
    
    // Resposta padrão para GET
    return res.status(200).send(`
      <html>
        <head><title>ZettiBot Server</title></head>
        <body>
          <h1>ZettiBot está funcionando! 🤖</h1>
          <p>Status: Online</p>
          <p><a href="/set-webhook">Configurar Webhook</a></p>
        </body>
      </html>
    `);
  }

  // Para POST requests (webhook do Telegram)
  if (req.method === 'POST') {
    try {
      const update = req.body;
      console.log('Update recebido:', JSON.stringify(update).substring(0, 100));
      
      // Processar a atualização
      if (update && update.message) {
        await bot.processUpdate(update);
      }
      
      // Responder ao Telegram
      return res.status(200).json({ ok: true });
    } catch (error) {
      console.error('Erro ao processar update:', error);
      return res.status(500).json({ error: error.message });
    }
  }

  // Método não permitido
  return res.status(405).send('Método não permitido');
};