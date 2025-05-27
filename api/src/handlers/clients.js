const { 
  getClientesForUser, 
  addClient,
  searchClients
} = require('../utils/database');
const { setUserState, getUserState, clearUserState } = require('../utils/states');
const winston = require('winston');

const validateName = (name) => name && name.length >= 2;
const validatePhone = (phone) => /^\(\d{2}\)\s?\d{4,5}-?\d{4}$/.test(phone);
const validateEmail = (email) => email === 'pular' || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

function register(bot) {
  // Listar clientes
  bot.command('clientes', async (ctx) => {
    const chatId = ctx.chat.id;
    
    try {
      const clientes = await getClientesForUser(chatId);
      
      if (clientes.length === 0) {
        await ctx.reply(
          "👥 Você não tem clientes cadastrados. Use /cliente_add para adicionar.",
          {
            reply_markup: {
              keyboard: [['/cliente_add']],
              resize_keyboard: true
            }
          }
        );
        return;
      }
      
      let mensagem = "👥 Seus Clientes:\n\n";
      clientes.forEach((cliente, index) => {
        mensagem += `${index + 1}. ${cliente.name} - ${cliente.company || 'Sem empresa'}\n`;
        mensagem += `   Telefone: ${cliente.phone || 'Não informado'}\n\n`;
      });
      
      await ctx.reply(mensagem);
    } catch (error) {
      winston.error(`Erro ao listar clientes: ${error.message}`);
      await ctx.reply("Erro ao buscar clientes. Tente novamente.");
    }
  });

  // Buscar cliente
  bot.command('buscar_cliente', async (ctx) => {
    const chatId = ctx.chat.id;
    setUserState(chatId, 'searching_client');
    await ctx.reply("🔍 Digite o nome ou empresa para buscar:");
  });

  // Adicionar cliente
  bot.command('cliente_add', async (ctx) => {
    const chatId = ctx.chat.id;
    setUserState(chatId, 'adding_client_name');
    await ctx.reply("🆕 Vamos adicionar um novo cliente. \n\nQual o nome do contato?");
  });

  // Handler para mensagens normais
  bot.on('text', async (ctx) => {
    const result = await handleClientStates(ctx.message, ctx);
    if (!result) {
      // Se não for um estado de cliente, passar para o próximo handler
      return;
    }
  });
}

async function handleClientStates(msg, ctx) {
  const chatId = msg.chat.id;
  const text = msg.text;
  const userState = getUserState(chatId);

  if (!userState.state || !userState.state.startsWith('adding_client_') && !userState.state.startsWith('searching_')) {
    return false;
  }

  try {
    switch(userState.state) {
      case 'searching_client':
        const resultados = await searchClients(chatId, text);
        if (resultados.length > 0) {
          let mensagem = "🔍 Resultados da busca:\n\n";
          resultados.forEach((cliente, index) => {
            mensagem += `${index + 1}. ${cliente.name} - ${cliente.company || 'Sem empresa'}\n`;
          });
          await ctx.reply(mensagem);
        } else {
          await ctx.reply("❌ Nenhum cliente encontrado.");
        }
        clearUserState(chatId);
        break;

      case 'adding_client_name':
        if (!validateName(text)) {
          await ctx.reply("❌ Nome inválido. Digite um nome válido.");
          return true;
        }
        setUserState(chatId, 'adding_client_company', { name: text });
        await ctx.reply(`Cliente: ${text}\n\nQual a empresa?`);
        break;
      
      case 'adding_client_company':
        setUserState(chatId, 'adding_client_phone', { 
          ...userState.data, 
          company: text || 'Não informada'
        });
        await ctx.reply(
          `Empresa: ${text || 'Não informada'}\n\nQual o telefone? (formato: (99) 99999-9999)`
        );
        break;
      
      case 'adding_client_phone':
        if (!validatePhone(text)) {
          await ctx.reply("❌ Telefone inválido. Use o formato (99) 99999-9999");
          return true;
        }
        setUserState(chatId, 'adding_client_email', { 
          ...userState.data, 
          phone: text 
        });
        await ctx.reply(
          `Telefone: ${text}\n\nQual o email? (ou digite 'pular' para ignorar)`
        );
        break;
      
      case 'adding_client_email':
        if (text !== 'pular' && !validateEmail(text)) {
          await ctx.reply("❌ Email inválido. Digite um email válido ou 'pular'.");
          return true;
        }
        
        const clientData = { 
          ...userState.data, 
          email: text === 'pular' ? null : text
        };
        
        const clientAdded = await addClient(chatId, clientData);
        
        if (clientAdded) {
          await ctx.reply(`✅ Cliente ${clientData.name} cadastrado com sucesso!`);
        } else {
          await ctx.reply(`❌ Erro ao cadastrar cliente. Tente novamente.`);
        }
        
        clearUserState(chatId);
        break;
    }
    return true;
  } catch (error) {
    winston.error(`Erro ao processar estado de cliente: ${error.message}`);
    await ctx.reply("❌ Erro ao processar sua mensagem. Tente novamente.");
    clearUserState(chatId);
    return false;
  }
}

module.exports = {
  register,
  handleClientStates
};