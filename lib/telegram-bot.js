import { Telegraf } from 'telegraf';
import { format } from 'date-fns';
import * as dbService from './supabase';
import axios from 'axios';

// Verifica o token do bot
const botToken = process.env.TELEGRAM_BOT_TOKEN;
if (!botToken) {
  console.error('ERRO: Token do bot não encontrado. Certifique-se de definir a variável de ambiente TELEGRAM_BOT_TOKEN.');
}

// Inicializa o bot
const bot = new Telegraf(botToken);

// Ativa o modo de captura de erros
bot.catch((err, ctx) => {
  console.error('Bot error:', err);
  // Notifica o usuário sobre o erro, se possível
  ctx.reply('Ops! Ocorreu um erro no processamento. Por favor, tente novamente mais tarde.').catch(e => {
    console.error('Error notifying user about error:', e);
  });
});

// Configuração do modo de webhook para o Vercel
bot.telegram.getMe().then((botInfo) => {
  bot.options.username = botInfo.username;
  console.log(`Bot iniciado! @${botInfo.username}`);
}).catch(err => {
  console.error('Error fetching bot info:', err);
});

// Configuração de comandos
bot.telegram.setMyCommands([
  { command: 'start', description: 'Iniciar o bot' },
  { command: 'help', description: 'Ver comandos disponíveis' },
  { command: 'clientes', description: 'Gerenciar clientes' },
  { command: 'agenda', description: 'Gerenciar agenda' },
  { command: 'followup', description: 'Gerenciar follow-ups' },
  { command: 'lembrete', description: 'Gerenciar lembretes' },
  { command: 'visita', description: 'Registrar visita' },
  { command: 'buscapotencial', description: 'Buscar potenciais clientes' },
  { command: 'criarrota', description: 'Criar rota otimizada' },
]);

// Comando /start
bot.command('start', (ctx) => {
  const telegramId = ctx.from.id;
  
  // Reseta qualquer estado anterior
  userStates[telegramId] = { currentCommand: null };
  
  ctx.reply(
    `Olá, ${ctx.from.first_name}! 👋\n\nSou o *ZettiBot*, seu assistente digital de vendas!\n\n` +
    `Estou aqui para te ajudar a organizar clientes, follow-ups e muito mais!\n\n` +
    `Use /help para ver todos os comandos disponíveis.`,
    { parse_mode: 'Markdown' }
  );
});

// Comando /help
bot.command('help', (ctx) => {
  const telegramId = ctx.from.id;
  userStates[telegramId] = { currentCommand: null };
  
  ctx.reply(
    `*Comandos disponíveis:*\n\n` +
    `/clientes - Gerenciar sua carteira de clientes\n` +
    `/agenda - Ver ou agendar compromissos\n` +
    `/followup - Gerenciar seus follow-ups\n` +
    `/lembrete - Configurar lembretes\n` +
    `/visita - Registrar visitas a clientes\n` +
    `/buscapotencial - Buscar potenciais clientes\n` +
    `/criarrota - Criar rota otimizada`,
    { parse_mode: 'Markdown' }
  );
});

// Comando /clientes
bot.command('clientes', (ctx) => {
  const telegramId = ctx.from.id;
  userStates[telegramId] = { 
    currentCommand: 'clientes',
    step: 'inicial'
  };
  
  ctx.reply(
    'O que você deseja fazer?',
    {
      reply_markup: {
        inline_keyboard: [
          [{ text: '➕ Adicionar cliente', callback_data: 'cliente_adicionar' }],
          [{ text: '🔍 Buscar cliente', callback_data: 'cliente_buscar' }],
          [{ text: '📄 Listar todos', callback_data: 'cliente_listar' }]
        ]
      }
    }
  );
});

// Handlers para callbacks do comando /clientes
bot.action('cliente_adicionar', async (ctx) => {
  await ctx.answerCbQuery();
  const telegramId = ctx.from.id;
  
  userStates[telegramId] = { 
    currentCommand: 'clientes',
    subcommand: 'adicionar',
    step: 'nome_empresa',
    clienteData: {}
  };
  
  await ctx.reply('Digite o nome da empresa:');
});

bot.action('cliente_buscar', async (ctx) => {
  await ctx.answerCbQuery();
  const telegramId = ctx.from.id;
  
  userStates[telegramId] = { 
    currentCommand: 'clientes',
    subcommand: 'buscar',
    step: 'termo_busca'
  };
  
  await ctx.reply('Digite o nome ou parte do nome da empresa:');
});

bot.action('cliente_listar', async (ctx) => {
  await ctx.answerCbQuery();
  const telegramId = ctx.from.id;
  
  try {
    const clientes = await dbService.listarClientes(telegramId);
    
    if (clientes.length === 0) {
      await ctx.reply('Você ainda não tem clientes cadastrados.');
      return;
    }
    
    // Cria botões inline para cada cliente
    const clienteButtons = clientes.map(cliente => [
      { 
        text: cliente.nome_empresa,
        callback_data: `cliente_ver_${cliente.id}`
      }
    ]);
    
    await ctx.reply(
      `Você tem ${clientes.length} clientes cadastrados:`,
      {
        reply_markup: {
          inline_keyboard: clienteButtons
        }
      }
    );
    
  } catch (error) {
    console.error('Erro ao listar clientes:', error);
    await ctx.reply('Ops! Ocorreu um erro ao buscar seus clientes. Tente novamente mais tarde.');
  }
});

// Comando /agenda
bot.command('agenda', (ctx) => {
  const telegramId = ctx.from.id;
  userStates[telegramId] = { 
    currentCommand: 'agenda',
    step: 'inicial'
  };
  
  ctx.reply(
    'O que você deseja fazer?',
    {
      reply_markup: {
        inline_keyboard: [
          [{ text: '👁️ Ver compromissos', callback_data: 'agenda_ver' }],
          [{ text: '📝 Registrar novo', callback_data: 'agenda_novo' }]
        ]
      }
    }
  );
});

// Handlers para callbacks do comando /agenda
bot.action('agenda_ver', async (ctx) => {
  await ctx.answerCbQuery();
  const telegramId = ctx.from.id;
  
  userStates[telegramId] = { 
    currentCommand: 'agenda',
    subcommand: 'ver',
    step: 'selecionar_data'
  };
  
  const hoje = format(new Date(), 'yyyy-MM-dd');
  
  await ctx.reply(
    'Qual data você quer visualizar?',
    {
      reply_markup: {
        inline_keyboard: [
          [{ text: 'Hoje', callback_data: `agenda_data_${hoje}` }],
          [{ text: 'Outra data', callback_data: 'agenda_data_outra' }]
        ]
      }
    }
  );
});

bot.action('agenda_novo', async (ctx) => {
  await ctx.answerCbQuery();
  const telegramId = ctx.from.id;
  
  userStates[telegramId] = { 
    currentCommand: 'agenda',
    subcommand: 'novo',
    step: 'data',
    compromissoData: {}
  };
  
  await ctx.reply('Digite a data do compromisso (formato DD/MM/AAAA):');
});

// Comando /followup
bot.command('followup', (ctx) => {
  const telegramId = ctx.from.id;
  userStates[telegramId] = { 
    currentCommand: 'followup',
    step: 'inicial'
  };
  
  ctx.reply(
    'O que você deseja fazer?',
    {
      reply_markup: {
        inline_keyboard: [
          [{ text: '👁️ Ver follow-ups', callback_data: 'followup_ver' }],
          [{ text: '📝 Registrar novo', callback_data: 'followup_novo' }]
        ]
      }
    }
  );
});

// Handlers para callbacks do comando /followup
bot.action('followup_ver', async (ctx) => {
  await ctx.answerCbQuery();
  const telegramId = ctx.from.id;
  
  userStates[telegramId] = { 
    currentCommand: 'followup',
    subcommand: 'ver',
    step: 'selecionar_filtro'
  };
  
  await ctx.reply(
    'Como deseja filtrar os follow-ups?',
    {
      reply_markup: {
        inline_keyboard: [
          [{ text: 'Por data', callback_data: 'followup_filtro_data' }],
          [{ text: 'A Realizar', callback_data: 'followup_filtro_a_realizar' }],
          [{ text: 'Pendentes', callback_data: 'followup_filtro_pendente' }],
          [{ text: 'Realizados', callback_data: 'followup_filtro_feito' }]
        ]
      }
    }
  );
});

bot.action('followup_novo', async (ctx) => {
  await ctx.answerCbQuery();
  const telegramId = ctx.from.id;
  
  try {
    const clientes = await dbService.listarClientes(telegramId);
    
    if (clientes.length === 0) {
      await ctx.reply('Você ainda não tem clientes cadastrados. Cadastre um cliente primeiro com /clientes.');
      return;
    }
    
    userStates[telegramId] = { 
      currentCommand: 'followup',
      subcommand: 'novo',
      step: 'selecionar_cliente',
      followUpData: {},
      clientesList: clientes
    };
    
    // Cria botões inline para cada cliente
    const clienteButtons = clientes.map(cliente => [
      { 
        text: cliente.nome_empresa,
        callback_data: `followup_cliente_${cliente.id}`
      }
    ]);
    
    await ctx.reply(
      'Selecione o cliente para o follow-up:',
      {
        reply_markup: {
          inline_keyboard: clienteButtons
        }
      }
    );
    
  } catch (error) {
    console.error('Erro ao listar clientes para follow-up:', error);
    await ctx.reply('Ops! Ocorreu um erro ao buscar seus clientes. Tente novamente mais tarde.');
  }
});

// Comando /lembrete
bot.command('lembrete', (ctx) => {
  const telegramId = ctx.from.id;
  userStates[telegramId] = { 
    currentCommand: 'lembrete',
    step: 'inicial'
  };
  
  ctx.reply(
    'O que você deseja fazer?',
    {
      reply_markup: {
        inline_keyboard: [
          [{ text: '👁️ Ver lembretes', callback_data: 'lembrete_ver' }],
          [{ text: '📝 Registrar novo', callback_data: 'lembrete_novo' }]
        ]
      }
    }
  );
});

// Comando /visita
bot.command('visita', async (ctx) => {
  const telegramId = ctx.from.id;
  
  try {
    const clientes = await dbService.listarClientes(telegramId);
    
    if (clientes.length === 0) {
      await ctx.reply('Você ainda não tem clientes cadastrados. Cadastre um cliente primeiro com /clientes.');
      return;
    }
    
    userStates[telegramId] = { 
      currentCommand: 'visita',
      step: 'selecionar_cliente',
      visitaData: {},
      clientesList: clientes
    };
    
    // Cria botões inline para cada cliente
    const clienteButtons = clientes.map(cliente => [
      { 
        text: cliente.nome_empresa,
        callback_data: `visita_cliente_${cliente.id}`
      }
    ]);
    
    await ctx.reply(
      'Selecione o cliente para registrar visita:',
      {
        reply_markup: {
          inline_keyboard: clienteButtons
        }
      }
    );
    
  } catch (error) {
    console.error('Erro ao listar clientes para visita:', error);
    await ctx.reply('Ops! Ocorreu um erro ao buscar seus clientes. Tente novamente mais tarde.');
  }
});

// Comando /buscapotencial
bot.command('buscapotencial', (ctx) => {
  const telegramId = ctx.from.id;
  userStates[telegramId] = { 
    currentCommand: 'buscapotencial',
    step: 'tipo_empresa'
  };
  
  ctx.reply('Qual o tipo de empresa que você está procurando? (Ex: indústria, metalúrgica, logística)');
});

// Comando /criarrota
bot.command('criarrota', async (ctx) => {
  const telegramId = ctx.from.id;
  
  try {
    const clientes = await dbService.listarClientes(telegramId);
    
    if (clientes.length < 2) {
      await ctx.reply('Você precisa ter pelo menos 2 clientes cadastrados para criar uma rota. Cadastre clientes primeiro com /clientes.');
      return;
    }
    
    userStates[telegramId] = { 
      currentCommand: 'criarrota',
      step: 'selecionar_clientes',
      rotaData: {
        clientesSelecionados: []
      },
      clientesList: clientes
    };
    
    // Cria botões inline para cada cliente
    const clienteButtons = clientes.map(cliente => [
      { 
        text: cliente.nome_empresa,
        callback_data: `rota_add_cliente_${cliente.id}`
      }
    ]);
    
    // Adiciona botão para finalizar seleção
    clienteButtons.push([{ text: '✅ Finalizar seleção', callback_data: 'rota_finalizar' }]);
    
    await ctx.reply(
      'Selecione os clientes para incluir na rota (selecione vários):',
      {
        reply_markup: {
          inline_keyboard: clienteButtons
        }
      }
    );
    
  } catch (error) {
    console.error('Erro ao listar clientes para rota:', error);
    await ctx.reply('Ops! Ocorreu um erro ao buscar seus clientes. Tente novamente mais tarde.');
  }
});

// Handler para mensagens de texto
bot.on('text', async (ctx) => {
  const telegramId = ctx.from.id;
  const messageText = ctx.message.text;
  
  // Se não há estado para o usuário, ignorar
  if (!userStates[telegramId]) return;
  
  const state = userStates[telegramId];
  
  // Processamento para o comando /clientes
  if (state.currentCommand === 'clientes') {
    await handleClientesText(ctx, telegramId, state, messageText);
  }
  
  // Processamento para o comando /agenda
  else if (state.currentCommand === 'agenda') {
    await handleAgendaText(ctx, telegramId, state, messageText);
  }
  
  // Processamento para o comando /followup
  else if (state.currentCommand === 'followup') {
    await handleFollowupText(ctx, telegramId, state, messageText);
  }
  
  // Processamento para o comando /lembrete
  else if (state.currentCommand === 'lembrete') {
    await handleLembreteText(ctx, telegramId, state, messageText);
  }
  
  // Processamento para o comando /visita
  else if (state.currentCommand === 'visita') {
    await handleVisitaText(ctx, telegramId, state, messageText);
  }
  
  // Processamento para o comando /buscapotencial
  else if (state.currentCommand === 'buscapotencial') {
    await handleBuscaPotencialText(ctx, telegramId, state, messageText);
  }
});

// Funções auxiliares para processar textos de cada comando
async function handleClientesText(ctx, telegramId, state, messageText) {
  // Subcomando: adicionar cliente
  if (state.subcommand === 'adicionar') {
    if (state.step === 'nome_empresa') {
      state.clienteData.nomeEmpresa = messageText;
      state.step = 'cnpj';
      await ctx.reply('Digite o CNPJ da empresa (apenas números):');
    }
    else if (state.step === 'cnpj') {
      state.clienteData.cnpj = messageText;
      state.step = 'nome_contato';
      await ctx.reply('Digite o nome do contato:');
    }
    else if (state.step === 'nome_contato') {
      state.clienteData.nomeContato = messageText;
      state.step = 'telefone_contato';
      await ctx.reply('Digite o telefone do contato:');
    }
    else if (state.step === 'telefone_contato') {
      state.clienteData.telefoneContato = messageText;
      state.step = 'email_contato';
      await ctx.reply('Digite o email do contato:');
    }
    else if (state.step === 'email_contato') {
      state.clienteData.emailContato = messageText;
      state.step = 'confirmar';
      
      await ctx.reply(
        `*Confirme os dados:*\n\n` +
        `*Empresa:* ${state.clienteData.nomeEmpresa}\n` +
        `*CNPJ:* ${state.clienteData.cnpj}\n` +
        `*Contato:* ${state.clienteData.nomeContato}\n` +
        `*Telefone:* ${state.clienteData.telefoneContato}\n` +
        `*Email:* ${state.clienteData.emailContato}\n\n` +
        `Está correto?`,
        {
          parse_mode: 'Markdown',
          reply_markup: {
            inline_keyboard: [
              [
                { text: '✅ Confirmar', callback_data: 'cliente_confirmar' },
                { text: '❌ Cancelar', callback_data: 'cliente_cancelar' }
              ]
            ]
          }
        }
      );
    }
  }
  
  // Subcomando: buscar cliente
  else if (state.subcommand === 'buscar' && state.step === 'termo_busca') {
    try {
      const termoBusca = messageText;
      const clientes = await dbService.buscarCliente(telegramId, termoBusca);
      
      if (clientes.length === 0) {
        await ctx.reply(`Nenhum cliente encontrado com o termo "${termoBusca}".`);
        return;
      }
      
      // Cria botões inline para cada cliente
      const clienteButtons = clientes.map(cliente => [
        { 
          text: cliente.nome_empresa,
          callback_data: `cliente_ver_${cliente.id}`
        }
      ]);
      
      await ctx.reply(
        `Encontrados ${clientes.length} clientes com o termo "${termoBusca}":`,
        {
          reply_markup: {
            inline_keyboard: clienteButtons
          }
        }
      );
      
    } catch (error) {
      console.error('Erro ao buscar clientes:', error);
      await ctx.reply('Ops! Ocorreu um erro ao buscar clientes. Tente novamente mais tarde.');
    }
  }
}

async function handleAgendaText(ctx, telegramId, state, messageText) {
  // Implementação da lógica para processamento de mensagens de texto do comando /agenda
}

async function handleFollowupText(ctx, telegramId, state, messageText) {
  // Implementação da lógica para processamento de mensagens de texto do comando /followup
}

async function handleLembreteText(ctx, telegramId, state, messageText) {
  // Implementação da lógica para processamento de mensagens de texto do comando /lembrete
}

async function handleVisitaText(ctx, telegramId, state, messageText) {
  // Implementação da lógica para processamento de mensagens de texto do comando /visita
}

async function handleBuscaPotencialText(ctx, telegramId, state, messageText) {
  if (state.step === 'tipo_empresa') {
    state.buscaData = {
      tipo: messageText
    };
    state.step = 'localizacao';
    await ctx.reply('Qual a localização? (cidade, bairro ou endereço)');
  }
  else if (state.step === 'localizacao') {
    state.buscaData.localizacao = messageText;
    state.step = 'quantidade';
    await ctx.reply('Quantos resultados deseja receber? (5-10)');
  }
  else if (state.step === 'quantidade') {
    const quantidade = parseInt(messageText);
    
    if (isNaN(quantidade) || quantidade < 1 || quantidade > 20) {
      await ctx.reply('Por favor, digite um número entre 1 e 20.');
      return;
    }
    
    state.buscaData.quantidade = quantidade;
    state.step = 'processando';
    
    await ctx.reply('🔍 Buscando potenciais clientes, aguarde um momento...');
    
    try {
      // Aqui faríamos a integração com a API do Google Places
      const lugar = encodeURIComponent(`${state.buscaData.tipo} em ${state.buscaData.localizacao}`);
      const url = `https://maps.googleapis.com/maps/api/place/textsearch/json?query=${lugar}&key=${process.env.GOOGLE_PLACES_API_KEY}&language=pt-BR`;
      
      const response = await axios.get(url);
      const results = response.data.results.slice(0, state.buscaData.quantidade);
      
      if (results.length === 0) {
        await ctx.reply(`Não foram encontrados resultados para "${state.buscaData.tipo}" em "${state.buscaData.localizacao}".`);
        delete userStates[telegramId];
        return;
      }
      
      let message = `🏢 *Potenciais clientes encontrados:*\n\n`;
      
      results.forEach((place, index) => {
        message += `*${index + 1}. ${place.name}*\n`;
        message += `📍 ${place.formatted_address}\n`;
        if (place.rating) {
          message += `⭐ ${place.rating}/5 (${place.user_ratings_total || 0} avaliações)\n`;
        }
        message += '\n';
      });
      
      await ctx.reply(message, { parse_mode: 'Markdown' });
      
      // Opções para salvar como cliente
      const buttons = results.map((place, index) => [
        { 
          text: `Salvar: ${place.name}`,
          callback_data: `potential_save_${index}`
        }
      ]);
      
      state.potentialResults = results;
      
      await ctx.reply(
        'Deseja salvar algum destes como cliente?',
        {
          reply_markup: {
            inline_keyboard: buttons
          }
        }
      );
      
    } catch (error) {
      console.error('Erro na busca de potenciais:', error);
      await ctx.reply('Ops! Ocorreu um erro ao buscar potenciais clientes. Tente novamente mais tarde.');
    }
  }
}

// Configuração necessária para o webhook
bot.telegram.getMe().then((botInfo) => {
  bot.options.username = botInfo.username;
});

export default bot;