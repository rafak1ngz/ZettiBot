const { setupBot } = require('./src/bot');
const { setupHandlers } = require('./src/handlers');

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

// Se configuração inválida, gerar erro para interromper execução
if (!configValid) {
  throw new Error('Configuração inválida. Verifique as variáveis de ambiente.');
}

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
            .status { 
              padding: 15px; 
              background-color: ${configValid ? '#e6f3ff' : '#ffebee'}; 
              border-radius: 5px; 
              margin: 20px 0; 
              border: 1px solid ${configValid ? '#1E4E8C' : '#f44336'};
            }
            .btn { 
              display: inline-block; 
              background-color: #1E4E8C; 
              color: white; 
              padding: 10px 15px; 
              text-decoration: none; 
              border-radius: 4px; 
              margin-top: 10px; 
            }
            .btn:hover { background-color: #0D2744; }
          </style>
        </head>
        <body>
          <h1>ZettiBot está funcionando! 🤖</h1>
          <div class="status">
            <p><strong>Status:</strong> ${configValid ? 'Online ✅' : 'Configuração Inválida ❌'}</p>
            ${!configValid ? `<p><strong>Erro:</strong> Verifique as variáveis de ambiente</p>` : ''}
            <p><strong>Versão:</strong> 1.0.0</p>
            <p><strong>Data/Hora:</strong> ${new Date().toLocaleString()}</p>
          </div>
          ${configValid ? '<a href="/set-webhook" class="btn">Configurar Webhook</a>' : ''}
        </body>
      </html>
    `);
  }

  // Para POST requests (webhook do Telegram)
  if (req.method === 'POST') {
    try {
      const update = req.body;
      console.log('Update recebido:', JSON.stringify(update).substring(0, 100));
      
      // Processar a atualização apenas se configuração for válida
      if (configValid && update && update.message) {
        await bot.processUpdate(update);
      }
      
      // Responder ao Telegram
      return res.status(200).json({ ok: true });
    } catch (error) {
      console.error('Erro ao processar update:', error);
      return res.status(500).json({ 
        error: error.message,
        config_valid: configValid 
      });
    }
  }

  // Método não permitido
  return res.status(405).send('Método não permitido');
};