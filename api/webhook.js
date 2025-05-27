const { Telegraf } = require('telegraf');
const commandsHandler = require('./src/handlers/commands');
const clientsHandler = require('./src/handlers/clients');
const appointmentsHandler = require('./src/handlers/appointments');
const followupsHandler = require('./src/handlers/followups');
const stateHandler = require('./src/handlers/stateHandler');
const { createClient } = require('@supabase/supabase-js');

// Importações de páginas web
const landingPage = require('./web/index');
const aboutPage = require('./web/about');
const loginPage = require('./web/login');
const adminPage = require('./web/admin');

// Configuração de Supabase
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

// Função para parsear corpo do POST (form urlencoded)
async function parsePostBody(req) {
  return new Promise((resolve) => {
    if (req.method !== 'POST') return resolve({});

    let data = '';
    req.on('data', chunk => {
      data += chunk.toString();
    });

    req.on('end', () => {
      try {
        const parsed = Object.fromEntries(new URLSearchParams(data));
        resolve(parsed);
      } catch {
        resolve({});
      }
    });
  });
}

// Parse simples de cookies
function parseCookies(req) {
  const cookies = {};
  const cookieHeader = req.headers.cookie;
  if (cookieHeader) {
    cookieHeader.split(';').forEach(cookie => {
      const parts = cookie.split('=');
      const key = parts[0].trim();
      const val = parts[1] ? parts[1].trim() : '';
      cookies[key] = val;
    });
  }
  return cookies;
}

const bot = new Telegraf(process.env.BOT_TOKEN);

commandsHandler.register(bot);
clientsHandler.register(bot);
appointmentsHandler.register(bot);
followupsHandler.register(bot);
stateHandler.register(bot);

module.exports = async (req, res) => {
  const configValid = validateConfig();
  if (!configValid) {
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ success: false, error: 'Configuração inválida. Verifique variáveis de ambiente.' }));
    return;
  }

  req.cookies = parseCookies(req);

  const url = new URL(req.url, `https://${req.headers.host}`);
  const path = url.pathname;

  if (req.method === 'GET') {
    switch (path) {
      case '/':
      case '/index':
        await landingPage(req, res);
        return;

      case '/about':
        await aboutPage(req, res);
        return;

      case '/login':
        await loginPage(req, res);
        return;

      case '/admin':
        if (!req.cookies || req.cookies.adminToken !== process.env.SETUP_KEY) {
          res.writeHead(302, { Location: '/login' });
          res.end();
          return;
        }
        await adminPage(req, res);
        return;

      case '/logout':
        res.setHeader('Set-Cookie', 'adminToken=; Path=/; HttpOnly; Max-Age=0');
        res.writeHead(302, { Location: '/login' });
        res.end();
        return;

      case '/set-webhook':
        try {
          const WEBHOOK_URL = `https://${req.headers.host}/api/telegram-webhook`;
          await bot.setWebHook(WEBHOOK_URL);
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: true, message: 'Webhook configurado', webhook_url: WEBHOOK_URL }));
        } catch (err) {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: err.message }));
        }
        return;

      default:
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('Página não encontrada');
        return;
    }
  }

  // POST
  if (req.method === 'POST') {
    const postBody = await parsePostBody(req);

    if (path === '/api/login') {
      const password = postBody.password;
      if (password === process.env.SETUP_KEY) {
        res.setHeader('Set-Cookie', `adminToken=${process.env.SETUP_KEY}; Path=/; HttpOnly; Max-Age=3600`);
        res.writeHead(302, { Location: '/admin' });
        res.end();
        return;
      } else {
        res.writeHead(302, { Location: '/login?error=1' });
        res.end();
        return;
      }
    }

    if (path === '/api/telegram-webhook') {
      try {
        // Responder imediatamente
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true }));

        const update = req.body || postBody;
        console.log('Update recebido:', JSON.stringify(update).slice(0, 100));

        if (update && update.message) {
          if (supabase) {
            try {
              const { data, error } = await supabase
                .from('users')
                .select('*')
                .eq('telegram_id', update.message.from.id)
                .single();

              if (error || !data) {
                await bot.sendMessage(update.message.chat.id,
                  "❌ Você não está autorizado a usar este bot. Entre em contato com o administrador."
                );
                return;
              }
            } catch (e) {
              console.error('Erro na verificação de autorização:', e);
            }
          }
          await bot.processUpdate(update);
        }
      } catch (error) {
        console.error('Erro ao processar update:', error);
      }
      return;
    }

    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Rota POST não encontrada');
    return;
  }

  // Não permitido
  res.writeHead(405, { 'Content-Type': 'text/plain' });
  res.end('Método não permitido');
};