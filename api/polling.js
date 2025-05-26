const axios = require('axios');

// Armazenamento em memória para último update_id processado
let lastUpdateId = 0;

// Função para processar mensagens
async function processMessages(messages) {
  const botToken = process.env.BOT_TOKEN;
  
  for (const update of messages) {
    if (update.update_id > lastUpdateId) {
      lastUpdateId = update.update_id;
      
      if (update.message && update.message.text) {
        const chatId = update.message.chat.id;
        const text = update.message.text;
        
        console.log(`Processando mensagem: ${text}`);
        
        let responseText = "Comando não reconhecido. Use /help para ajuda.";
        
        if (text === '/start') {
          responseText = "Olá! Sou o ZettiBot, seu assistente de vendas externas. Use /help para ver comandos.";
        } 
        else if (text === '/help' || text === '/ajuda') {
          responseText = "Comandos disponíveis:\n/start - Iniciar bot\n/help - Ver comandos\n/agenda - Gerenciar agenda\n/followup - Gerenciar follow-ups\n/clientes - Gerenciar clientes";
        }
        else if (text === '/agenda') {
          responseText = "Agenda: Você não tem compromissos agendados.";
        }
        else if (text === '/followup') {
          responseText = "Follow-ups: Você não tem follow-ups pendentes.";
        }
        else if (text === '/clientes') {
          responseText = "Clientes: Você não tem clientes cadastrados.";
        }
        
        try {
          // Enviar resposta
          await axios.post(
            `https://api.telegram.org/bot${botToken}/sendMessage`,
            {
              chat_id: chatId,
              text: responseText
            }
          );
        } catch (error) {
          console.error(`Erro ao enviar mensagem: ${error.message}`);
        }
      }
    }
  }
}

module.exports = async (req, res) => {
  try {
    const botToken = process.env.BOT_TOKEN;
    
    // Reduzir timeout para processamento mais rápido
    const response = await axios.get(
      `https://api.telegram.org/bot${botToken}/getUpdates`,
      {
        params: {
          offset: lastUpdateId + 1,
          timeout: 30  // Aumentei para 30 segundos
        },
        // Adicionar timeout na requisição
        timeout: 40000 
      }
    );
    
    const updates = response.data.result;
    console.log(`Processando ${updates.length} mensagens`);
    
    if (updates.length > 0) {
      // Processar mensagens em paralelo para maior velocidade
      await Promise.all(updates.map(processMessage));
    }
    
    return res.status(200).json({
      status: 'ok',
      processadas: updates.length
    });
  } catch (error) {
    console.error(`Erro no polling: ${error.message}`);
    return res.status(500).json({ error: error.message });
  }
};

// Função separada para processamento
async function processMessage(update) {
  // Lógica de processamento da mensagem
  // Similar ao código anterior
}