const { setupBot } = require('./src/bot');
const { setupHandlers } = require('./src/handlers');
const { createClient } = require('@supabase/supabase-js');

// Importações de páginas web
const landingPage = require('./web/index');
const aboutPage = require('./web/about');
const loginPage = require('./web/login');
const adminPage = require('./web/admin');

// Configuração de Supabase
const supabase = createClient(
  process.env.SUPABASE_URL, 
  process.env.SUPABASE_KEY
);

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

// Inicialização do bot
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
          // Usar um endpoint específico para Telegram webhook
          const WEBHOOK_URL = `https://${req.headers.host}/api/telegram-webhook`;
          
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

  // Processamento de login (POST)
  if (req.method === 'POST' && path === '/api/login') {
    const { password } = req.body;
    
    if (password === process.env.SETUP_KEY) {
      res.setHeader('Set-Cookie', 
        `adminToken=${process.env.SETUP_KEY}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=3600`
      );
      return res.redirect('/admin');
    } else {
      return res.redirect('/login?error=1');
    }
  }

  // API de Usuários Telegram
  if (req.method === 'GET' && path === '/api/admin/telegram-users') {
    // Verificar autenticação
    if (!req.cookies || req.cookies.adminToken !== process.env.SETUP_KEY) {
      return res.status(401).json({ error: 'Não autorizado' });
    }
    
    try {
      const { data, error } = await supabase.from('users').select('*');
      
      if (error) throw error;
      
      return res.status(200).json({ users: data || [] });
    } catch (error) {
      console.error('Erro ao buscar usuários:', error);
      return res.status(500).json({ error: error.message });
    }
  }

  // Adicionar usuário Telegram
  if (req.method === 'POST' && path === '/api/admin/telegram-users/add') {
    // Verificar autenticação
    if (!req.cookies || req.cookies.adminToken !== process.env.SETUP_KEY) {
      return res.status(401).json({ error: 'Não autorizado' });
    }
    
    try {
      const { telegram_id, name } = req.body;
      
      if (!telegram_id || !name) {
        return res.status(400).json({ error: 'ID do Telegram e nome são obrigatórios' });
      }
      
      const { data, error } = await supabase.from('users').upsert({
        telegram_id,
        name,
        created_at: new Date()
      });
      
      if (error) throw error;
      
      return res.status(200).json({ success: true });
    } catch (error) {
      console.error('Erro ao adicionar usuário:', error);
      return res.status(500).json({ error: error.message });
    }
  }

  // Remover usuário Telegram
  if (req.method === 'POST' && path === '/api/admin/telegram-users/delete') {
    // Verificar autenticação
    if (!req.cookies || req.cookies.adminToken !== process.env.SETUP_KEY) {
      return res.status(401).json({ error: 'Não autorizado' });
    }
    
    try {
      const { telegram_id } = req.body;
      
      if (!telegram_id) {
        return res.status(400).json({ error: 'ID do Telegram é obrigatório' });
      }
      
      const { error } = await supabase.from('users').delete().eq('telegram_id', telegram_id);
      
      if (error) throw error;
      
      return res.status(200).json({ success: true });
    } catch (error) {
      console.error('Erro ao excluir usuário:', error);
      return res.status(500).json({ error: error.message });
    }
  }

  // Webhook do Telegram
  if (req.method === 'POST' && path === '/api/telegram-webhook') {
    try {
      const update = req.body;
      console.log('Update recebido:', JSON.stringify(update).substring(0, 100));
      
      // Verificar se o usuário está autorizado
      if (update.message) {
        const { data, error } = await supabase
          .from('users')
          .select('*')
          .eq('telegram_id', update.message.from.id)
          .single();
        
        if (error || !data) {
          // Usuário não autorizado
          await bot.sendMessage(
            update.message.chat.id, 
            "❌ Você não está autorizado a usar este bot. Entre em contato com o administrador."
          );
          return res.status(403).json({ error: 'Usuário não autorizado' });
        }
      }
      
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

  // Método não permitido ou rota não encontrada
  return res.status(404).send('Página não encontrada');
};