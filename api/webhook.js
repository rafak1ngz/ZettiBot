// api/webhook.js

const TelegramBot = require('node-telegram-bot-api');
const express = require('express');
const serverless = require('serverless-http');

// Configuração
const BOT_TOKEN = process.env.BOT_TOKEN || '7914192908:AAGXiOU_E4TfR-Kuynf6V_sTgRRyUdN0umM';
const WEBHOOK_URL = process.env.WEBHOOK_URL || 'https://zettibot.vercel.app/api/webhook';
const DEBUG = true;

// Inicializa o Bot
const bot = new TelegramBot(BOT_TOKEN);

// Configura os manipuladores de comandos
bot.onText(/\/start/, async (msg) => {
  const chatId = msg.chat.id;
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
  logDebug(`Comando /start processado para ${chatId}`);
});

bot.onText(/\/help|\/ajuda/, async (msg) => {
  const chatId = msg.chat.id;
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
  logDebug(`Comando /help processado para ${chatId}`);
});

bot.onText(/\/agenda/, async (msg) => {
  const chatId = msg.chat.id;
  await bot.sendMessage(
    chatId, 
    `📅 Agenda:
    
Você não tem compromissos agendados para hoje.

Use /agendar para adicionar um novo compromisso.`
  );
  logDebug(`Comando /agenda processado para ${chatId}`);
});

bot.onText(/\/followup/, async (msg) => {
  const chatId = msg.chat.id;
  await bot.sendMessage(
    chatId, 
    `🔄 Follow-ups:
    
Você não tem follow-ups pendentes.

Use /followup_add para adicionar um novo follow-up.`
  );
  logDebug(`Comando /followup processado para ${chatId}`);
});

bot.onText(/\/clientes/, async (msg) => {
  const chatId = msg.chat.id;
  await bot.sendMessage(
    chatId, 
    `👥 Clientes:
    
Você não tem clientes cadastrados.

Use /cliente_add para adicionar um novo cliente.`
  );
  logDebug(`Comando /clientes processado para ${chatId}`);
});

// Logger para debug
function logDebug(message) {
  if (DEBUG) {
    console.log(`[DEBUG] ${new Date().toISOString()}: ${message}`);
  }
}

// Aplicação Express
const app = express();
app.use(express.json());

// Página principal
app.get('/', (req, res) => {
  res.send('ZettiBot está funcionando! 🤖');
});

// Endpoint de status
app.get('/api/status', (req, res) => {
  res.json({
    status: 'online',
    webhook_url: WEBHOOK_URL,
    timestamp: new Date().toISOString()
  });
});

// Endpoint de webhook
app.post('/api/webhook', (req, res) => {
  if (req.body && req.body.message) {
    const update = req.body;
    logDebug(`Webhook recebido: ${JSON.stringify(update)}`);
    
    try {
      // Processar atualização - isso é que faz tudo funcionar
      bot.processUpdate(update);
      logDebug('Update processado com sucesso');
    } catch (error) {
      console.error('Erro ao processar update:', error);
    }
  } else {
    logDebug('Webhook recebido sem mensagem');
  }
  
  // Sempre devolver OK para o Telegram
  res.sendStatus(200);
});

// Endpoint para configurar webhook
app.get('/api/set_webhook', (req, res) => {
  bot.setWebHook(WEBHOOK_URL)
    .then(() => {
      res.json({ success: true, webhook: WEBHOOK_URL });
      logDebug(`Webhook configurado para: ${WEBHOOK_URL}`);
    })
    .catch((error) => {
      res.json({ success: false, error: error.toString() });
      console.error('Erro ao configurar webhook:', error);
    });
});

// Helper para serverless
const serverlessHandler = serverless(app);

// Handler para Vercel
module.exports = async (req, res) => {
  const result = await serverlessHandler(req, res);
  return result;
};