import { Telegraf } from 'telegraf';
import { format } from 'date-fns';
import * as dbService from './supabase';
import axios from 'axios';

// Verifica o token do bot
const botToken = process.env.TELEGRAM_BOT_TOKEN;
if (!botToken) {
  console.error('ERRO: Token do bot não encontrado. Certifique-se de definir a variável de ambiente TELEGRAM_BOT_TOKEN.');
}

// Estados de conversação dos usuários - IMPORTANTE: definido globalmente
const userStates = {};

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
bot.command('start', async (ctx) => {
  const telegramId = ctx.from.id;
  
  // Reseta qualquer estado anterior e salva no banco
  userStates[telegramId] = { currentCommand: null };
  await dbService.saveUserState(telegramId, userStates[telegramId]);
  
  ctx.reply(
    `Olá, ${ctx.from.first_name}! 👋\n\nSou o *ZettiBot*, seu assistente digital de vendas!\n\n` +
    `Estou aqui para te ajudar a organizar clientes, follow-ups e muito mais!\n\n` +
    `Use /help para ver todos os comandos disponíveis.`,
    { parse_mode: 'Markdown' }
  );
});

// Adicione este middleware no início do arquivo, após inicializar o bot
bot.use(async (ctx, next) => {
  const telegramId = ctx.from?.id;
  if (telegramId) {
    // Carregar estado do banco de dados se não existir em memória
    if (!userStates[telegramId]) {
      const savedState = await dbService.loadUserState(telegramId);
      userStates[telegramId] = savedState || { currentCommand: null };
    }
  }
  await next();
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
  if (state.subcommand === 'novo') {
    if (state.step === 'data') {
      // Validar formato de data (simplificado)
      const dataRegex = /^\d{2}\/\d{2}\/\d{4}$/;
      if (!dataRegex.test(messageText)) {
        await ctx.reply('Por favor, use o formato DD/MM/AAAA. Por exemplo: 25/12/2023');
        return;
      }
      
      // Converter para formato SQL
      const partes = messageText.split('/');
      const dataSql = `${partes[2]}-${partes[1]}-${partes[0]}`;
      
      state.followUpData.data = dataSql;
      state.step = 'motivo';
      
      await ctx.reply('Digite o motivo ou assunto do follow-up:');
    }
    else if (state.step === 'motivo') {
      state.followUpData.motivo = messageText;
      state.step = 'confirmar';
      
      await ctx.reply(
        `*Confirme os dados do follow-up:*\n\n` +
        `*Cliente:* ${state.followUpData.clienteNome}\n` +
        `*Data:* ${state.followUpData.data.split('-').reverse().join('/')}\n` +
        `*Motivo:* ${state.followUpData.motivo}\n\n` +
        `Está correto?`,
        {
          parse_mode: 'Markdown',
          reply_markup: {
            inline_keyboard: [
              [
                { text: '✅ Confirmar', callback_data: 'followup_confirmar' },
                { text: '❌ Cancelar', callback_data: 'followup_cancelar' }
              ]
            ]
          }
        }
      );
    }
  }
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
    await ctx.reply('Quantos resultados deseja receber? (entre 1 e 10)');
  }
  else if (state.step === 'quantidade') {
    const quantidade = parseInt(messageText);
    
    if (isNaN(quantidade) || quantidade < 1 || quantidade > 10) {
      await ctx.reply('Por favor, digite um número entre 1 e 10.');
      return;
    }
    
    state.buscaData.quantidade = quantidade;
    state.step = 'processando';
    
    await ctx.reply('🔍 Buscando potenciais clientes, aguarde um momento...');
    
    try {
      // Busca usando Google Places API
      const query = encodeURIComponent(`${state.buscaData.tipo} em ${state.buscaData.localizacao}`);
      const url = `https://maps.googleapis.com/maps/api/place/textsearch/json?query=${query}&key=${process.env.GOOGLE_PLACES_API_KEY}&language=pt-BR`;
      
      const response = await axios.get(url);
      
      if (response.data.status !== 'OK') {
        throw new Error(`API error: ${response.data.status} - ${response.data.error_message || 'Unknown error'}`);
      }
      
      const results = response.data.results.slice(0, state.buscaData.quantidade);
      
      if (results.length === 0) {
        await ctx.reply(`Não foram encontrados resultados para "${state.buscaData.tipo}" em "${state.buscaData.localizacao}".`);
        // Resetar estado
        userStates[telegramId] = { currentCommand: null };
        await dbService.saveUserState(telegramId, userStates[telegramId]);
        return;
      }
      
      let message = `🏢 *Potenciais clientes encontrados:*\n\n`;
      
      results.forEach((place, index) => {
        message += `*${index + 1}. ${place.name}*\n`;
        message += `📍 ${place.formatted_address || 'Endereço não disponível'}\n`;
        if (place.rating) {
          message += `⭐ ${place.rating}/5 (${place.user_ratings_total || 0} avaliações)\n`;
        }
        message += '\n';
      });
      
      await ctx.reply(message, { parse_mode: 'Markdown' });
      
      // Opções para salvar como cliente
      const buttons = results.map((place, index) => [
        { 
          text: `Salvar: ${place.name.substring(0, 30)}`,  // Limita o tamanho para evitar erros
          callback_data: `potential_save_${index}`
        }
      ]);
      
      state.potentialResults = results;
      await dbService.saveUserState(telegramId, state);
      
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
      // Resetar estado
      userStates[telegramId] = { currentCommand: null };
      await dbService.saveUserState(telegramId, userStates[telegramId]);
    }
  }
}

// Adicionar handler para salvar potencial cliente
bot.action(/potential_save_(\d+)/, async (ctx) => {
  try {
    await ctx.answerCbQuery();
    
    const telegramId = ctx.from.id;
    const index = parseInt(ctx.match[1]);
    const state = userStates[telegramId];
    
    if (!state || !state.potentialResults || !state.potentialResults[index]) {
      await ctx.reply('Erro: Dados do potencial cliente não encontrados.');
      return;
    }
    
    const place = state.potentialResults[index];
    
    // Criar objeto de cliente
    const clienteData = {
      nomeEmpresa: place.name,
      cnpj: '',  // Não temos essa info da API
      nomeContato: '',
      telefoneContato: '',
      emailContato: ''
    };
    
    try {
      // Salvar cliente diretamente
      await dbService.adicionarCliente(telegramId, clienteData);
      
      await ctx.reply(`✅ Cliente "${place.name}" adicionado com sucesso!\n\nVocê pode editar os detalhes usando /clientes e selecionando o cliente na lista.`);
      
      // Resetar estado
      userStates[telegramId] = { currentCommand: null };
      await dbService.saveUserState(telegramId, userStates[telegramId]);
      
    } catch (error) {
      console.error('Erro ao salvar potencial como cliente:', error);
      await ctx.reply('❌ Ocorreu um erro ao salvar o cliente.');
    }
    
  } catch (error) {
    console.error('Erro no callback de potencial cliente:', error);
  }
});


// Handler para confirmação de cadastro de cliente
bot.action('cliente_confirmar', async (ctx) => {
  try {
    await ctx.answerCbQuery('Processando...');
    
    const telegramId = ctx.from.id;
    const state = userStates[telegramId];
    
    if (!state || !state.clienteData) {
      await ctx.reply('Erro: Dados do cliente não encontrados. Tente novamente com /clientes');
      return;
    }
    
    // Salvar dados no Supabase
    try {
      await dbService.adicionarCliente(telegramId, state.clienteData);
      
      await ctx.reply(`✅ Cliente ${state.clienteData.nomeEmpresa} cadastrado com sucesso!`);
      
      // Resetar estado
      userStates[telegramId] = { currentCommand: null };
      await dbService.saveUserState(telegramId, userStates[telegramId]);
      
    } catch (error) {
      console.error('Erro ao salvar cliente:', error);
      await ctx.reply('❌ Houve um erro ao salvar o cliente. Por favor, tente novamente mais tarde.');
    }
  } catch (error) {
    console.error('Erro no callback:', error);
    await ctx.reply('Ocorreu um erro. Por favor, tente novamente com /clientes');
  }
});

// Handler para cancelamento de cadastro
bot.action('cliente_cancelar', async (ctx) => {
  try {
    await ctx.answerCbQuery('Cancelado');
    
    const telegramId = ctx.from.id;
    
    // Limpar estado
    userStates[telegramId] = { currentCommand: null };
    await dbService.saveUserState(telegramId, userStates[telegramId]);
    
    await ctx.reply('❌ Cadastro cancelado. Use /clientes para iniciar novamente quando quiser.');
  } catch (error) {
    console.error('Erro ao cancelar:', error);
  }
});

// Handler para visualizar cliente
bot.action(/cliente_ver_(.+)/, async (ctx) => {
  try {
    await ctx.answerCbQuery();
    
    const clienteId = ctx.match[1];
    const telegramId = ctx.from.id;
    
    // Buscar cliente no Supabase
    try {
      const cliente = await dbService.buscarClientePorId(telegramId, clienteId);
        
      if (error) throw error;
      
      if (!cliente) {
        await ctx.reply('Cliente não encontrado. Pode ter sido excluído.');
        return;
      }
      
      // Exibir detalhes do cliente
      const mensagem = 
        `📋 *Detalhes do Cliente:*\n\n` +
        `*Empresa:* ${cliente.nome_empresa}\n` +
        `*CNPJ:* ${cliente.cnpj || 'Não informado'}\n` +
        `*Contato:* ${cliente.nome_contato || 'Não informado'}\n` +
        `*Telefone:* ${cliente.telefone_contato || 'Não informado'}\n` +
        `*E-mail:* ${cliente.email_contato || 'Não informado'}\n` +
        `*Cadastrado em:* ${new Date(cliente.created_at).toLocaleDateString('pt-BR')}`;
      
      await ctx.reply(mensagem, {
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [
            [
              { text: '✏️ Editar', callback_data: `cliente_editar_${cliente.id}` },
              { text: '🗑️ Excluir', callback_data: `cliente_excluir_${cliente.id}` }
            ],
            [
              { text: '↩️ Voltar', callback_data: 'cliente_voltar' }
            ]
          ]
        }
      });
      
    } catch (error) {
      console.error('Erro ao buscar cliente:', error);
      await ctx.reply('Ocorreu um erro ao buscar detalhes do cliente.');
    }
  } catch (error) {
    console.error('Erro no callback:', error);
  }
});

// Handler para voltar
bot.action('cliente_voltar', async (ctx) => {
  try {
    await ctx.answerCbQuery();
    
    const telegramId = ctx.from.id;
    
    // Voltar para o menu de clientes
    userStates[telegramId] = { 
      currentCommand: 'clientes',
      step: 'inicial'
    };
    
    await ctx.reply(
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
  } catch (error) {
    console.error('Erro no callback:', error);
  }
});

// Handler para selecionar cliente de follow-up
bot.action(/followup_cliente_(.+)/, async (ctx) => {
  try {
    await ctx.answerCbQuery();
    
    const clienteId = ctx.match[1];
    const telegramId = ctx.from.id;
    const state = userStates[telegramId];
    
    if (!state || state.currentCommand !== 'followup') {
      await ctx.reply('Sessão expirada. Use /followup para iniciar novamente.');
      return;
    }
    
    // Encontrar o cliente na lista
    const cliente = state.clientesList.find(c => c.id === clienteId);
    
    if (!cliente) {
      await ctx.reply('Cliente não encontrado. Tente novamente.');
      return;
    }
    
    // Armazena o cliente selecionado
    state.followUpData.clienteId = cliente.id;
    state.followUpData.clienteNome = cliente.nome_empresa;
    state.step = 'data';
    
    await ctx.reply(`Cliente selecionado: *${cliente.nome_empresa}*\n\nAgora, digite a data do follow-up (formato DD/MM/AAAA):`, {
      parse_mode: 'Markdown'
    });
    
  } catch (error) {
    console.error('Erro ao selecionar cliente para follow-up:', error);
    await ctx.reply('Ocorreu um erro. Tente novamente com /followup');
  }
});

// Handlers para confirmação e cancelamento
bot.action('followup_confirmar', async (ctx) => {
  try {
    await ctx.answerCbQuery('Processando...');
    
    const telegramId = ctx.from.id;
    const state = userStates[telegramId];
    
    if (!state || !state.followUpData) {
      await ctx.reply('Erro: Dados do follow-up não encontrados. Tente novamente com /followup');
      return;
    }
    
    try {
      await dbService.adicionarFollowUp(telegramId, state.followUpData);
      
      await ctx.reply(`✅ Follow-up para ${state.followUpData.clienteNome} cadastrado com sucesso!`);
      
      // Resetar estado
      userStates[telegramId] = { currentCommand: null };
      await dbService.saveUserState(telegramId, userStates[telegramId]);
      
    } catch (error) {
      console.error('Erro ao salvar follow-up:', error);
      await ctx.reply('❌ Houve um erro ao salvar o follow-up. Por favor, tente novamente mais tarde.');
    }
  } catch (error) {
    console.error('Erro no callback:', error);
    await ctx.reply('Ocorreu um erro. Por favor, tente novamente com /followup');
  }
});

bot.action('followup_cancelar', async (ctx) => {
  try {
    await ctx.answerCbQuery('Cancelado');
    
    const telegramId = ctx.from.id;
    
    // Limpar estado
    userStates[telegramId] = { currentCommand: null };
    await dbService.saveUserState(telegramId, userStates[telegramId]);
    
    await ctx.reply('❌ Cadastro de follow-up cancelado. Use /followup para iniciar novamente quando quiser.');
  } catch (error) {
    console.error('Erro ao cancelar:', error);
  }
});

// Configuração necessária para o webhook
bot.telegram.getMe().then((botInfo) => {
  bot.options.username = botInfo.username;
});

export default bot;