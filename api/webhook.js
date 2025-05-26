// api/webhook.js
const { setupBot } = require('./src/bot');
const { setupHandlers } = require('./src/handlers');
const landingPage = require('./web/index');

// Função para validar configuração
function validateConfig() {
  const missing = [];
  
  if (!process.env.BOT_TOKEN) missing.push('BOT_TOKEN');
  if (!process.env.SUPABASE_URL) missing.push('SUPABASE_URL');
  if (!process.env.SUPABASE_KEY) missing.push('SUPABASE_KEY');
  
  if (missing.length > 0) {
    console.error(`ERRO DE CONFIGURAÇÃO: Variáveis de ambiente ausentes: ${missing.join(', ')}`);
    return false;
  }
  
  return true;
}

// Verificar configuração no início
const configValid = validateConfig();

// Bot já configurado
const bot = setupBot();

// Configurar handlers
setupHandlers(bot);

// Handler principal para Vercel
module.exports = async (req, res) => {
  // Verificação adicional de configuração
  if (!configValid) {
    return res.status(500).json({
      success: false,
      error: 'Configuração inválida. Verifique as variáveis de ambiente.'
    });
  }

  // ROTEADOR DE URLS
  const url = new URL(req.url, `https://${req.headers.host}`);
  const path = url.pathname;

  // Rotas web (GET)
  if (req.method === 'GET') {
    // Página inicial
    if (path === '/' || path === '/index') {
      return landingPage(req, res);
    }
    
    // Página sobre
    if (path === '/about') {
      return require('./web/about')(req, res);
    }
    
    // Página de login
    if (path === '/login') {
      return require('./web/login')(req, res);
    }
    
    // Página admin
    if (path === '/admin') {
      return require('./web/admin')(req, res);
    }

    if (path === '/debug') {
      return res.status(200).json({
        webhookInfo: await bot.getWebhookInfo(),
        configValid,
        environment: process.env.NODE_ENV,
        serverTime: new Date().toISOString()
      });
    }    

    // Configuração de webhook
    if (path === '/set-webhook') {
      const WEBHOOK_URL = `https://${req.headers.host}/api/telegram-webhook`;
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
  }

  // Webhook do Telegram - movido para /api/telegram-webhook
  if (req.method === 'POST' && path === '/api/telegram-webhook') {
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

  // Login API
  if (req.method === 'POST' && path === '/api/login') {
    const { password } = req.body;
    
    if (password === process.env.SETUP_KEY) {
      // Configurar cookie de autenticação
      res.setHeader('Set-Cookie', `adminToken=${process.env.SETUP_KEY}; Path=/; HttpOnly; Max-Age=3600`);
      return res.redirect('/admin');
    } else {
      return res.redirect('/login?error=1');
    }
  }

  // Logout API
  if (req.method === 'GET' && path === '/logout') {
    res.setHeader('Set-Cookie', 'adminToken=; Path=/; HttpOnly; Max-Age=0');
    return res.redirect('/login');
  }

  // Arquivo estático se o caminho começar com /styles ou /images
  if (path.startsWith('/styles/') || path.startsWith('/images/')) {
    try {
      // Em um ambiente serverless real, você precisaria usar uma solução de Assets
      return res.status(404).send('Arquivo não encontrado');
    } catch (err) {
      return res.status(404).send('Arquivo não encontrado');
    }
  }

  // Método não permitido ou rota não encontrada
  return res.status(404).send('Página não encontrada');
};