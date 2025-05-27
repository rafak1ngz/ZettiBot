const { setupBot } = require('./src/bot');
const { setupHandlers } = require('./src/handlers');
const { createClient } = require('@supabase/supabase-js');

// Importações de páginas web
const landingPage = require('./web/index');
const aboutPage = require('./web/about');
const loginPage = require('./web/login');
const adminPage = require('./web/admin');

// Inicialização do Supabase
const supabase = process.env.SUPABASE_URL && process.env.SUPABASE_KEY 
  ? createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY)
  : null;

// Função para validar configuração
function validateConfig() {
  const missing = [];
  
  if (!process.env.BOT_TOKEN) missing.push('BOT_TOKEN');
  if (!process.env.SUPABASE_URL) missing.push('SUPABASE_URL');
  if (!process.env.SUPABASE_KEY) missing.push('SUPABASE_KEY');
  if (!process.env.SETUP_KEY) missing.push('SETUP_KEY');
  
  if (missing.length > 0) {
    console.error(`ERRO DE CONFIGURAÇÃO: Variáveis de ambiente ausentes: ${missing.join(', ')}`);
    return false;
  }
  
  return true;
}

// Bot já configurado
const bot = setupBot();
setupHandlers(bot);

// Handler principal para Vercel
module.exports = async (req, res) => {
  // Validar configuração
  const configValid = validateConfig();
  if (!configValid) {
    return res.status(500).json({
      success: false,
      error: 'Configuração inválida. Verifique as variáveis de ambiente.'
    });
  }

  // Extração de URL e método
  const url = new URL(req.url, `https://${req.headers.host}`);
  const path = url.pathname;

  // Roteamento de páginas web (GET)
  if (req.method === 'GET') {
    switch(path) {
      case '/':
      case '/index':
        return landingPage(req, res);
      
      case '/about':
        return aboutPage(req, res);
      
      case '/login':
        return loginPage(req, res);
      
      case '/admin':
        // Verificar autenticação para admin
        if (!req.cookies || req.cookies.adminToken !== process.env.SETUP_KEY) {
          return res.redirect('/login');
        }
        return adminPage(req, res);
      
      case '/logout':
        res.setHeader('Set-Cookie', 'adminToken=; Path=/; HttpOnly; Max-Age=0');
        return res.redirect('/login');
      
      case '/set-webhook':
        try {
          const WEBHOOK_URL = `https://${req.headers.host}/api/webhook`;
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

  // Webhook do Telegram
  if (req.method === 'POST' && path === '/api/telegram-webhook') {
    try {
      const update = req.body;
      console.log('Update recebido:', JSON.stringify(update).substring(0, 100));

      // Responder ao Telegram imediatamente para evitar timeout
      res.status(200).json({ ok: true });
      
      // Processar a mensagem de forma assíncrona
      (async () => {
        if (update && update.message) {
          // Verificar autorização
          if (supabase) {
            try {
              const { data, error } = await supabase
                .from('users')
                .select('*')
                .eq('telegram_id', update.message.from.id)
                .single();
              
              if (error || !data) {
                await bot.sendMessage(
                  update.message.chat.id, 
                  "❌ Você não está autorizado a usar este bot. Entre em contato com o administrador."
                );
                return;
              }
            } catch (err) {
              console.error('Erro ao verificar autorização:', err);
            }
          }

          // Processar a mensagem
          await bot.processUpdate(update);
        }
      })().catch(error => {
        console.error('Erro ao processar mensagem:', error);
      });
    } catch (error) {
      console.error('Erro ao processar update:', error);
    }
  }

  // Método não permitido ou rota não encontrada
  return res.status(404).send('Página não encontrada');
};