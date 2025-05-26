const TelegramBot = require('node-telegram-bot-api');
const { createClient } = require('@supabase/supabase-js');

// Configuração
const BOT_TOKEN = process.env.BOT_TOKEN || '7914192908:AAGXiOU_E4TfR-Kuynf6V_sTgRRyUdN0umM';
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;

// Inicializa o Bot
const bot = new TelegramBot(BOT_TOKEN);

// Inicializa Supabase
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// Funções de banco de dados
async function registerUser(userId, name, username) {
  try {
    const { data, error } = await supabase
      .from('users')
      .upsert({ 
        telegram_id: userId, 
        name: name, 
        username: username, 
        created_at: new Date()
      });
    
    if (error) throw error;
    console.log(`Usuário ${userId} registrado/atualizado`);
    return true;
  } catch (err) {
    console.error(`Erro ao registrar usuário ${userId}:`, err);
    return false;
  }
}

async function getClientesForUser(userId) {
  try {
    const { data, error } = await supabase
      .from('clients')
      .select('*')
      .eq('user_id', userId);
      
    if (error) throw error;
    return data || [];
  } catch (err) {
    console.error(`Erro ao buscar clientes para ${userId}:`, err);
    return [];
  }
}

async function getFollowupsForUser(userId, status = 'pendente') {
  try {
    const { data, error } = await supabase
      .from('followups')
      .select('*')
      .eq('user_id', userId)
      .eq('status', status);
      
    if (error) throw error;
    return data || [];
  } catch (err) {
    console.error(`Erro ao buscar follow-ups para ${userId}:`, err);
    return [];
  }
}

async function getAgendaForUser(userId, date) {
  try {
    const { data, error } = await supabase
      .from('appointments')
      .select('*, clients(*)')
      .eq('user_id', userId)
      .eq('date', date);
      
    if (error) throw error;
    return data || [];
  } catch (err) {
    console.error(`Erro ao buscar agenda para ${userId}:`, err);
    return [];
  }
}

// Define os handlers
function setupHandlers() {
  // Limpar handlers anteriores
  bot._textRegexpCallbacks = [];
  
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

  // Handler para /agenda
  bot.onText(/\/agenda/, async (msg) => {
    const chatId = msg.chat.id;
    console.log(`Processando /agenda para ${chatId}`);
    
    // Obter data atual no formato ISO (YYYY-MM-DD)
    const today = new Date().toISOString().split('T')[0];
    
    // Buscar compromissos do dia
    const compromissos = await getAgendaForUser(chatId, today);
    
    if (compromissos.length === 0) {
      await bot.sendMessage(
        chatId, 
        `📅 Agenda para hoje:
      
Você não tem compromissos agendados para hoje.

Use /agendar para adicionar um novo compromisso.`
      );
    } else {
      let mensagem = `📅 Agenda para hoje:\n\n`;
      
      compromissos.forEach((comp, index) => {
        const horario = comp.time || "Horário não definido";
        const cliente = comp.clients ? comp.clients.name : "Cliente não especificado";
        const tipo = comp.type || "Compromisso";
        const status = comp.status || "Agendado";
        
        mensagem += `${index + 1}. ${horario} - ${cliente}\n`;
        mensagem += `   Tipo: ${tipo} | Status: ${status}\n\n`;
      });
      
      mensagem += `\nUse /agendar para adicionar um novo compromisso.`;
      
      await bot.sendMessage(chatId, mensagem);
    }
  });

  // Handler para /followup
  bot.onText(/\/followup/, async (msg) => {
    const chatId = msg.chat.id;
    console.log(`Processando /followup para ${chatId}`);
    
    // Buscar follow-ups pendentes
    const followups = await getFollowupsForUser(chatId, 'pendente');
    
    if (followups.length === 0) {
      await bot.sendMessage(
        chatId, 
        `🔄 Follow-ups Pendentes:
      
Você não tem follow-ups pendentes.

Use /followup_add para adicionar um novo follow-up.`
      );
    } else {
      let mensagem = `🔄 Follow-ups Pendentes:\n\n`;
      
      followups.forEach((followup, index) => {
        const data = followup.date || "Data não definida";
        const tipo = followup.type || "Contato";
        const obs = followup.notes || "Sem observações";
        
        mensagem += `${index + 1}. ${data} - ${tipo}\n`;
        mensagem += `   Obs: ${obs}\n\n`;
      });
      
      mensagem += `\nUse /followup_add para adicionar um novo follow-up.`;
      
      await bot.sendMessage(chatId, mensagem);
    }
  });

  // Handler para /clientes
  bot.onText(/\/clientes/, async (msg) => {
    const chatId = msg.chat.id;
    console.log(`Processando /clientes para ${chatId}`);
    
    // Buscar clientes
    const clientes = await getClientesForUser(chatId);
    
    if (clientes.length === 0) {
      await bot.sendMessage(
        chatId, 
        `👥 Clientes:
      
Você não tem clientes cadastrados.

Use /cliente_add para adicionar um novo cliente.`
      );
    } else {
      let mensagem = `👥 Seus Clientes:\n\n`;
      
      clientes.forEach((cliente, index) => {
        const nome = cliente.name || "Nome não definido";
        const empresa = cliente.company || "Empresa não definida";
        const telefone = cliente.phone || "Sem telefone";
        
        mensagem += `${index + 1}. ${nome} - ${empresa}\n`;
        mensagem += `   Tel: ${telefone}\n\n`;
      });
      
      mensagem += `\nUse /cliente_add para adicionar um novo cliente.`;
      
      await bot.sendMessage(chatId, mensagem);
    }
  });

  // Implementar mais handlers para outros comandos...
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
        <head>
          <title>ZettiBot Server</title>
          <style>
            body { font-family: Arial, sans-serif; max-width: 800px; margin: 0 auto; padding: 20px; }
            h1 { color: #1E4E8C; }
            .status { padding: 15px; background-color: #f4f4f4; border-radius: 5px; margin: 20px 0; }
            .btn { display: inline-block; background-color: #1E4E8C; color: white; padding: 10px 15px; 
                  text-decoration: none; border-radius: 4px; margin-top: 10px; }
            .btn:hover { background-color: #0D2744; }
          </style>
        </head>
        <body>
          <h1>ZettiBot está funcionando! 🤖</h1>
          <div class="status">
            <p><strong>Status:</strong> Online</p>
            <p><strong>Versão:</strong> 1.0.0</p>
            <p><strong>Data/Hora:</strong> ${new Date().toLocaleString()}</p>
          </div>
          <a href="/set-webhook" class="btn">Configurar Webhook</a>
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