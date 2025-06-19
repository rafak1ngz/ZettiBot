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

// Comando universal de cancelamento
bot.command('cancelar', async (ctx) => {
  try {
    console.log('Comando /cancelar recebido');
    const telegramId = ctx.from.id;
    
    // Resetar estado global
    userStates[telegramId] = { currentCommand: null };
    
    // Limpar qualquer contexto ou estado anterior
    ctx.session = null;
    
    // Salvar estado no banco
    try {
      await dbService.saveUserState(telegramId, userStates[telegramId]);
      console.log('Estado resetado com sucesso no banco de dados');
    } catch (error) {
      console.error('Erro ao salvar estado resetado:', error);
    }
    
    // Mensagem de cancelamento
    await ctx.reply(
      `✖️ Operação cancelada!\n\n` +
      `Você foi redirecionado para o início. Use /help para ver os comandos disponíveis.`,
      {
        reply_markup: {
          keyboard: [
            ['/help', '/start']
          ],
          resize_keyboard: true,
          one_time_keyboard: true
        }
      }
    );
  } catch (error) {
    console.error('Erro no comando cancelar:', error);
    await ctx.reply('Houve um erro ao cancelar a operação. Tente usar /start para recomeçar.');
  }
});

// Middleware para verificar se o bot está ativo
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
  { command: 'cancelar', description: 'Cancelar operação atual' },
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

bot.use(async (ctx, next) => {
  // Verificar se é um comando /cancelar
  if (ctx.message && ctx.message.text === '/cancelar') {
    const telegramId = ctx.from?.id;
    if (telegramId) {
      // Resetar estado global
      userStates[telegramId] = { currentCommand: null };
      
      // Salvar estado no banco
      await dbService.saveUserState(telegramId, userStates[telegramId]);
      
      // Mensagem de cancelamento
      await ctx.reply(
        `✖️ Operação cancelada!\n\n` +
        `Você foi redirecionado para o início. Use /help para ver os comandos disponíveis.`,
        {
          reply_markup: {
            keyboard: [
              ['/help', '/start']
            ],
            resize_keyboard: true,
            one_time_keyboard: true
          }
        }
      );
      
      return; // Importante: não continuar para next()
    }
  }
  
  await next();
});

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
// Comando /criarrota
bot.command('criarrota', async (ctx) => {
  const telegramId = ctx.from.id;
  
  userStates[telegramId] = { 
    currentCommand: 'criarrota',
    step: 'definir_ponto_partida',
    rotaData: {
      paradas: []
    }
  };
  
  await ctx.reply(
    `🚗 *Criação de Rota Otimizada* 🚗\n\n` +
    `Vamos primeiro definir seu ponto de partida.\n\n` +
    `Digite o nome e endereço do seu ponto de partida, separados por vírgula.\n` +
    `Por exemplo: *Meu Escritório, Av. Principal, 100 - Centro*`,
    { parse_mode: 'Markdown' }
  );
});

// Função para processar a criação de rota
async function handleRotaText(ctx, telegramId, state, messageText) {
  // Verificar se é cancelamento em qualquer etapa
  if (messageText.toUpperCase() === 'CANCELAR') {
    userStates[telegramId] = { currentCommand: null };
    await dbService.saveUserState(telegramId, userStates[telegramId]);
    await ctx.reply('✅ Operação de criação de rota cancelada.');
    return;
  }

  // Etapa 1: Definir ponto de partida
  if (state.step === 'definir_ponto_partida') {
    // Identificar a primeira vírgula para separar nome e endereço
    const primeiraVirgula = messageText.indexOf(',');
    
    if (primeiraVirgula === -1) {
      await ctx.reply(`❌ Formato incorreto: "${messageText}"\nPor favor use: *Nome do Local, Endereço completo*`, 
        { parse_mode: 'Markdown' });
      return;
    }
    
    const nome = messageText.substring(0, primeiraVirgula).trim();
    const endereco = messageText.substring(primeiraVirgula + 1).trim();
    
    if (!nome || !endereco) {
      await ctx.reply(`❌ Informações incompletas. Certifique-se de incluir nome e endereço.`);
      return;
    }
    
    // Adicionar ponto de partida
    state.rotaData.partida = {
      nome,
      endereco
    };
    
    // Avançar para próxima etapa
    state.step = 'definir_ponto_final';
    await dbService.saveUserState(telegramId, state);
    
    await ctx.reply(
      `✅ Ponto de partida definido: *${nome}*\n\n` +
      `Agora, digite o nome e endereço do seu ponto final (destino), separados por vírgula.\n` +
      `Por exemplo: *Cliente ABC, Rua Secundária, 200 - Bairro*`,
      { parse_mode: 'Markdown' }
    );
    return;
  }
  
  // Etapa 2: Definir ponto final
  else if (state.step === 'definir_ponto_final') {
    // Identificar a primeira vírgula para separar nome e endereço
    const primeiraVirgula = messageText.indexOf(',');
    
    if (primeiraVirgula === -1) {
      await ctx.reply(`❌ Formato incorreto: "${messageText}"\nPor favor use: *Nome do Local, Endereço completo*`, 
        { parse_mode: 'Markdown' });
      return;
    }
    
    const nome = messageText.substring(0, primeiraVirgula).trim();
    const endereco = messageText.substring(primeiraVirgula + 1).trim();
    
    if (!nome || !endereco) {
      await ctx.reply(`❌ Informações incompletas. Certifique-se de incluir nome e endereço.`);
      return;
    }
    
    // Adicionar ponto final
    state.rotaData.destino = {
      nome,
      endereco
    };
    
    // Iniciar lista de paradas com os dois pontos (serão removidos depois)
    state.rotaData.paradas = [
      { 
        nome: state.rotaData.partida.nome, 
        endereco: state.rotaData.partida.endereco,
        tipo: 'partida'
      },
      { 
        nome: state.rotaData.destino.nome, 
        endereco: state.rotaData.destino.endereco,
        tipo: 'destino'
      }
    ];
    
    // Avançar para próxima etapa
    state.step = 'adicionar_paradas';
    await dbService.saveUserState(telegramId, state);
    
    await ctx.reply(
      `✅ Ponto final definido: *${nome}*\n\n` +
      `Agora, vamos adicionar paradas intermediárias.\n\n` +
      `Digite as empresas e endereços separados por vírgula, uma por linha.\n` +
      `Por exemplo:\n\n` +
      `*Cliente XYZ, Rua Exemplo, 123 - Bairro*\n\n` +
      `Quando terminar, digite *PRONTO* ou clique no botão abaixo.\n` +
      `Para cancelar a qualquer momento, digite *CANCELAR*.`,
      { 
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [
            [{ text: "✅ PRONTO (Gerar Rota)", callback_data: "rota_pronto" }],
            [{ text: "❌ CANCELAR", callback_data: "rota_cancelar" }]
          ]
        }
      }
    );
    return;
  }
  
  // Etapa 3: Adicionar paradas intermediárias
  else if (state.step === 'adicionar_paradas') {
    if (messageText.toUpperCase() === 'PRONTO') {
      await gerarRota(ctx, telegramId, state);
      return;
    }
    
    // Processar paradas intermediárias
    try {
      const linhas = messageText.split('\n').filter(linha => linha.trim() !== '');
      
      for (const linha of linhas) {
        // Identificar a primeira vírgula para separar nome e endereço
        const primeiraVirgula = linha.indexOf(',');
        
        if (primeiraVirgula === -1) {
          await ctx.reply(`❌ Formato incorreto na linha: "${linha}"\nPor favor use: *Nome da Empresa, Endereço completo*`,
            { parse_mode: 'Markdown' });
          continue;
        }
        
        const nome = linha.substring(0, primeiraVirgula).trim();
        const endereco = linha.substring(primeiraVirgula + 1).trim();
        
        if (!nome || !endereco) {
          await ctx.reply(`❌ Informações incompletas na linha: "${linha}"\nCertifique-se de incluir nome e endereço.`);
          continue;
        }
        
        // Adicionar parada intermediária
        state.rotaData.paradas.push({
          nome,
          endereco,
          tipo: 'intermediaria'
        });
        
        // Confirmar adição
        await ctx.reply(`✅ Adicionada parada: *${nome}*`, { 
          parse_mode: 'Markdown',
          reply_markup: {
            inline_keyboard: [
              [{ text: "✅ PRONTO (Gerar Rota)", callback_data: "rota_pronto" }],
              [{ text: "❌ CANCELAR", callback_data: "rota_cancelar" }]
            ]
          }
        });
      }
      
      // Atualizar estado
      await dbService.saveUserState(telegramId, state);
      
    } catch (error) {
      console.error('Erro ao processar paradas para rota:', error);
      await ctx.reply('Ocorreu um erro ao processar sua solicitação. Tente novamente.');
    }
  }
}

// Handler para botão "PRONTO"
bot.action('rota_pronto', async (ctx) => {
  try {
    await ctx.answerCbQuery();
    const telegramId = ctx.from.id;
    const state = userStates[telegramId];
    
    if (!state || state.currentCommand !== 'criarrota') {
      await ctx.reply('Sessão expirada. Use /criarrota para iniciar novamente.');
      return;
    }
    
    await gerarRota(ctx, telegramId, state);
  } catch (error) {
    console.error('Erro ao finalizar rota:', error);
    await ctx.reply('Ocorreu um erro. Tente novamente com /criarrota');
  }
});

// Handler para botão "CANCELAR"
bot.action('rota_cancelar', async (ctx) => {
  try {
    await ctx.answerCbQuery();
    const telegramId = ctx.from.id;
    
    // Limpar estado
    userStates[telegramId] = { currentCommand: null };
    await dbService.saveUserState(telegramId, userStates[telegramId]);
    
    await ctx.reply('✅ Operação de criação de rota cancelada.');
  } catch (error) {
    console.error('Erro ao cancelar:', error);
  }
});

// Função para gerar a rota final
async function gerarRota(ctx, telegramId, state) {
  try {
    // Verificar se há paradas definidas
    if (!state.rotaData.partida || !state.rotaData.destino) {
      await ctx.reply('Erro: Pontos de partida ou destino não definidos.');
      return;
    }
    
    await ctx.reply('🔄 Gerando rota otimizada, aguarde um momento...');
    
    // Preparar endereços para a API do Google Maps
    const origem = encodeURIComponent(state.rotaData.partida.endereco);
    const destino = encodeURIComponent(state.rotaData.destino.endereco);
    
    // Filtrar apenas paradas intermediárias
    const waypoints = state.rotaData.paradas
      .filter(parada => parada.tipo === 'intermediaria')
      .map(parada => encodeURIComponent(parada.endereco));
    
    // Construir URL para o Google Maps
    let mapsUrl = `https://www.google.com/maps/dir/?api=1&origin=${origem}&destination=${destino}`;
    
    // Adicionar waypoints se existirem
    if (waypoints.length > 0) {
      mapsUrl += `&waypoints=${waypoints.join('|')}`;
    }
    
    // Adicionar otimização
    mapsUrl += '&travelmode=driving&dir_action=navigate&optimize=true';
    
    // Contar total de paradas (intermediárias + origem + destino)
    const totalParadas = waypoints.length + 2;
    
    // Enviar URL para o usuário
    await ctx.reply(
      `🗺️ *Sua rota está pronta!*\n\n` +
      `*Partida:* ${state.rotaData.partida.nome}\n` +
      `*Destino:* ${state.rotaData.destino.nome}\n` +
      `*Paradas intermediárias:* ${waypoints.length}\n` +
      `*Total de pontos:* ${totalParadas}\n\n` +
      `Clique no link abaixo para abrir a rota otimizada no Google Maps:`,
      { parse_mode: 'Markdown' }
    );
    
    await ctx.reply(mapsUrl);
    
    // Resetar estado
    userStates[telegramId] = { currentCommand: null };
    await dbService.saveUserState(telegramId, userStates[telegramId]);
    
  } catch (error) {
    console.error('Erro ao gerar rota:', error);
    await ctx.reply('Ocorreu um erro ao gerar a rota. Verifique se os endereços estão corretos e tente novamente.');
  }
}

// Handler para seleção do ponto de partida
bot.action(/rota_inicio_(\d+)/, async (ctx) => {
  try {
    await ctx.answerCbQuery();
    
    const telegramId = ctx.from.id;
    const inicioIndex = parseInt(ctx.match[1]);
    const state = userStates[telegramId];
    
    if (!state || state.currentCommand !== 'criarrota' || !state.rotaData || !state.rotaData.paradas) {
      await ctx.reply('Sessão expirada. Use /criarrota para iniciar novamente.');
      return;
    }
    
    // Salvar ponto de partida
    state.rotaData.pontoInicial = inicioIndex;
    
    // Criar botões para selecionar ponto final (excluindo o ponto inicial)
    const paradasButtons = state.rotaData.paradas
      .map((parada, index) => {
        if (index !== inicioIndex) {
          return [{
            text: `${index + 1}. ${parada.nome}`,
            callback_data: `rota_fim_${index}`
          }];
        }
        return null;
      })
      .filter(botao => botao !== null);
    
    await ctx.reply(
      `🏁 Ponto de partida definido: *${state.rotaData.paradas[inicioIndex].nome}*\n\n` +
      'Agora, selecione o *PONTO FINAL* da sua rota:',
      {
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: paradasButtons
        }
      }
    );
    
  } catch (error) {
    console.error('Erro ao selecionar ponto inicial:', error);
    await ctx.reply('Ocorreu um erro. Tente novamente com /criarrota');
  }
});

// Handler para seleção do ponto final
bot.action(/rota_fim_(\d+)/, async (ctx) => {
  try {
    await ctx.answerCbQuery();
    
    const telegramId = ctx.from.id;
    const fimIndex = parseInt(ctx.match[1]);
    const state = userStates[telegramId];
    
    if (!state || state.currentCommand !== 'criarrota' || !state.rotaData || !state.rotaData.paradas) {
      await ctx.reply('Sessão expirada. Use /criarrota para iniciar novamente.');
      return;
    }
    
    // Salvar ponto final
    state.rotaData.pontoFinal = fimIndex;
    
    await ctx.reply('🔄 Gerando rota otimizada, aguarde um momento...');
    
    try {
      // Preparar endereços para a API do Google Maps
      const paradas = state.rotaData.paradas;
      const origem = encodeURIComponent(paradas[state.rotaData.pontoInicial].endereco);
      const destino = encodeURIComponent(paradas[state.rotaData.pontoFinal].endereco);
      
      // Separar as paradas intermediárias (waypoints)
      const waypoints = paradas
        .filter((_, index) => index !== state.rotaData.pontoInicial && index !== state.rotaData.pontoFinal)
        .map(parada => encodeURIComponent(parada.endereco))
        .join('|');
      
      // Construir URL para a API de direções
      let mapsUrl = `https://www.google.com/maps/dir/?api=1&origin=${origem}&destination=${destino}`;
      
      // Adicionar waypoints se existirem
      if (waypoints) {
        mapsUrl += `&waypoints=${waypoints}`;
      }
      
      // Adicionar optimização
      mapsUrl += '&travelmode=driving&dir_action=navigate';
      
      // Enviar URL para o usuário
      await ctx.reply(
        `🗺️ *Sua rota está pronta!*\n\n` +
        `*Ponto de partida:* ${paradas[state.rotaData.pontoInicial].nome}\n` +
        `*Ponto final:* ${paradas[state.rotaData.pontoFinal].nome}\n` +
        `*Total de paradas:* ${paradas.length}\n\n` +
        `Clique no link abaixo para abrir a rota no Google Maps:`,
        { parse_mode: 'Markdown' }
      );
      
      await ctx.reply(mapsUrl);
      
      // Resetar estado
      userStates[telegramId] = { currentCommand: null };
      await dbService.saveUserState(telegramId, userStates[telegramId]);
      
    } catch (error) {
      console.error('Erro ao gerar rota:', error);
      await ctx.reply('Ocorreu um erro ao gerar a rota. Verifique se os endereços estão corretos e tente novamente.');
    }
    
  } catch (error) {
    console.error('Erro ao selecionar ponto final:', error);
    await ctx.reply('Ocorreu um erro. Tente novamente com /criarrota');
  }
});


// Handler para mensagens de texto
bot.on('text', async (ctx) => {
  const telegramId = ctx.from.id;
  const messageText = ctx.message.text;
  
  // Verificar se é uma solicitação de cancelamento
  if (messageText.toLowerCase() === 'cancelar') {
    // Resetar estado
    userStates[telegramId] = { currentCommand: null };
    await dbService.saveUserState(telegramId, userStates[telegramId]);
    
    await ctx.reply(
      `✖️ Operação cancelada!\n\n` +
      `Use /help para ver os comandos disponíveis.`,
      {
        reply_markup: {
          keyboard: [
            ['/help', '/start']
          ],
          resize_keyboard: true,
          one_time_keyboard: true
        }
      }
    );
    return;
  }
  
  // Se não há estado para o usuário, ignorar
  if (!userStates[telegramId]) return;
  
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
  
  // Processamento para o comando /criarrota
  else if (state.currentCommand === 'criarrota') {
    await handleRotaText(ctx, telegramId, state, messageText);
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
  // Subcomando: editar cliente
  else if (state.subcommand === 'editar' && state.step === 'editar_campo') {
    try {

      console.log('Editando cliente, estado atual:', JSON.stringify(state));
      console.log('Campo a editar:', state.campoAtual);
      console.log('Novo valor:', messageText);
  
      // Atualiza o campo específico no objeto clienteData
      const propriedade = campoParaProperty(state.campoAtual);

      console.log('Propriedade mapeada:', propriedade);

      state.clienteData[propriedade] = messageText; // 'state' em vez de 'sstate'
      
      console.log('Estado após atualização de campo:', JSON.stringify(state.clienteData));

      // Atualiza o cliente no banco de dados
      await dbService.atualizarCliente(telegramId, state.clienteId, state.clienteData);
      
      await ctx.reply(`✅ Campo atualizado com sucesso!`);
      
      // Mostrar cliente atualizado
      const cliente = await dbService.buscarClientePorId(telegramId, state.clienteId);
      
      const mensagem = 
        `📋 *Detalhes do Cliente (Atualizado):*\n\n` +
        `*Empresa:* ${cliente.nome_empresa}\n` +
        `*CNPJ:* ${cliente.cnpj || 'Não informado'}\n` +
        `*Contato:* ${cliente.nome_contato || 'Não informado'}\n` +
        `*Telefone:* ${cliente.telefone_contato || 'Não informado'}\n` +
        `*E-mail:* ${cliente.email_contato || 'Não informado'}\n` +
        `*Atualizado em:* ${new Date().toLocaleDateString('pt-BR')}`;
      
      await ctx.reply(mensagem, {
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [
            [
              { text: '✏️ Editar outro campo', callback_data: `cliente_editar_${cliente.id}` },
              { text: '🗑️ Excluir', callback_data: `cliente_excluir_${cliente.id}` }
            ],
            [
              { text: '↩️ Voltar', callback_data: 'cliente_voltar' }
            ]
          ]
        }
      });
      
    } catch (error) {
      console.error('Erro ao atualizar cliente:', error);
      await ctx.reply('Ocorreu um erro ao atualizar o cliente. Tente novamente mais tarde.');
    }
  }
}

// Handler para mensagens de texto do comando /agenda
async function handleAgendaText(ctx, telegramId, state, messageText) {
  // Subcomando: novo compromisso
  if (state.subcommand === 'novo') {
    if (state.step === 'data') {
      // Validar formato de data (DD/MM/AAAA)
      const dataRegex = /^\d{2}\/\d{2}\/\d{4}$/;
      if (!dataRegex.test(messageText)) {
        await ctx.reply('Por favor, use o formato DD/MM/AAAA. Por exemplo: 25/12/2023');
        return;
      }
      
      // Converter para formato SQL (AAAA-MM-DD)
      const partes = messageText.split('/');
      const dataSql = `${partes[2]}-${partes[1]}-${partes[0]}`;
      
      state.compromissoData.data = dataSql;
      state.step = 'horario';
      
      await ctx.reply('Digite o horário do compromisso (formato HH:MM):');
    }
    else if (state.step === 'horario') {
      // Validar formato de horário (HH:MM)
      const horarioRegex = /^\d{2}:\d{2}$/;
      if (!horarioRegex.test(messageText)) {
        await ctx.reply('Por favor, use o formato HH:MM. Por exemplo: 14:30');
        return;
      }
      
      state.compromissoData.horario = messageText;
      state.step = 'descricao';
      
      await ctx.reply('Digite uma descrição ou assunto para o compromisso:');
    }
    else if (state.step === 'descricao') {
      state.compromissoData.descricao = messageText;
      state.step = 'vincular_cliente';
      
      await ctx.reply(
        'Deseja vincular este compromisso a um cliente?',
        {
          reply_markup: {
            inline_keyboard: [
              [
                { text: '✅ Sim', callback_data: 'agenda_vincular_sim' },
                { text: '❌ Não', callback_data: 'agenda_vincular_nao' }
              ]
            ]
          }
        }
      );
    }
  }
  // Subcomando: ver compromissos - data específica
  else if (state.subcommand === 'ver' && state.step === 'informar_data') {
    // Validar formato de data
    const dataRegex = /^\d{2}\/\d{2}\/\d{4}$/;
    if (!dataRegex.test(messageText)) {
      await ctx.reply('Por favor, use o formato DD/MM/AAAA. Por exemplo: 25/12/2023');
      return;
    }
    
    // Converter para formato SQL
    const partes = messageText.split('/');
    const dataSql = `${partes[2]}-${partes[1]}-${partes[0]}`;
    
    await mostrarCompromissosData(ctx, telegramId, dataSql);
  }
}

// Handler para escolha de vincular ou não um cliente ao compromisso
bot.action('agenda_vincular_sim', async (ctx) => {
  try {
    await ctx.answerCbQuery();
    const telegramId = ctx.from.id;
    const state = userStates[telegramId];
    
    if (!state || state.currentCommand !== 'agenda' || state.subcommand !== 'novo') {
      await ctx.reply('Sessão expirada. Use /agenda para iniciar novamente.');
      return;
    }
    
    // Buscar clientes do usuário para selecionar
    try {
      const clientes = await dbService.listarClientes(telegramId);
      
      if (clientes.length === 0) {
        await ctx.reply('Você não tem clientes cadastrados. O compromisso será criado sem vínculo com cliente.');
        state.step = 'confirmar';
        await confirmarCompromisso(ctx, telegramId, state);
        return;
      }
      
      state.step = 'selecionar_cliente';
      state.clientesList = clientes;
      
      // Criar botões para selecionar cliente
      const clienteButtons = clientes.map(cliente => [
        { 
          text: cliente.nome_empresa,
          callback_data: `agenda_cliente_${cliente.id}`
        }
      ]);
      
      // Adicionar opção para cancelar seleção
      clienteButtons.push([{ text: '↩️ Voltar', callback_data: 'agenda_vincular_nao' }]);
      
      await ctx.reply(
        'Selecione o cliente para vincular ao compromisso:',
        {
          reply_markup: {
            inline_keyboard: clienteButtons
          }
        }
      );
      
    } catch (error) {
      console.error('Erro ao buscar clientes:', error);
      await ctx.reply('Ocorreu um erro ao buscar clientes. O compromisso será criado sem vínculo.');
      state.step = 'confirmar';
      await confirmarCompromisso(ctx, telegramId, state);
    }
    
  } catch (error) {
    console.error('Erro no callback de vínculo com cliente:', error);
  }
});

// Handler para não vincular cliente
bot.action('agenda_vincular_nao', async (ctx) => {
  try {
    await ctx.answerCbQuery();
    const telegramId = ctx.from.id;
    const state = userStates[telegramId];
    
    if (!state || state.currentCommand !== 'agenda' || state.subcommand !== 'novo') {
      await ctx.reply('Sessão expirada. Use /agenda para iniciar novamente.');
      return;
    }
    
    state.step = 'confirmar';
    await confirmarCompromisso(ctx, telegramId, state);
    
  } catch (error) {
    console.error('Erro no callback de não vincular cliente:', error);
  }
});

// Handler para seleção de cliente para compromisso
bot.action(/agenda_cliente_(.+)/, async (ctx) => {
  try {
    await ctx.answerCbQuery();
    
    const clienteId = ctx.match[1];
    const telegramId = ctx.from.id;
    const state = userStates[telegramId];
    
    if (!state || state.currentCommand !== 'agenda' || state.subcommand !== 'novo') {
      await ctx.reply('Sessão expirada. Use /agenda para iniciar novamente.');
      return;
    }
    
    // Encontrar o cliente na lista
    const cliente = state.clientesList.find(c => c.id === clienteId);
    
    if (!cliente) {
      await ctx.reply('Cliente não encontrado. Tente novamente.');
      return;
    }
    
    // Armazenar o cliente selecionado
    state.compromissoData.clienteId = cliente.id;
    state.compromissoData.clienteNome = cliente.nome_empresa;
    
    state.step = 'confirmar';
    await confirmarCompromisso(ctx, telegramId, state);
    
  } catch (error) {
    console.error('Erro ao selecionar cliente para compromisso:', error);
  }
});

// Função para mostrar e confirmar dados do compromisso
async function confirmarCompromisso(ctx, telegramId, state) {
  try {
    const dataFormatada = state.compromissoData.data.split('-').reverse().join('/');
    
    // Montar mensagem de confirmação
    let mensagem = 
      `*Confirme os dados do compromisso:*\n\n` +
      `*Data:* ${dataFormatada}\n` +
      `*Horário:* ${state.compromissoData.horario}\n` +
      `*Descrição:* ${state.compromissoData.descricao}\n`;
      
    if (state.compromissoData.clienteId) {
      mensagem += `*Cliente:* ${state.compromissoData.clienteNome}\n`;
    } else {
      mensagem += `*Cliente:* Não vinculado\n`;
    }
    
    mensagem += `\nEstá correto?`;
    
    await ctx.reply(mensagem, {
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [
          [
            { text: '✅ Confirmar', callback_data: 'agenda_confirmar' },
            { text: '❌ Cancelar', callback_data: 'agenda_cancelar' }
          ]
        ]
      }
    });
    
  } catch (error) {
    console.error('Erro ao mostrar confirmação de compromisso:', error);
    await ctx.reply('Ocorreu um erro ao preparar a confirmação do compromisso.');
  }
}

// Handler para confirmação de compromisso
bot.action('agenda_confirmar', async (ctx) => {
  try {
    await ctx.answerCbQuery('Processando...');
    
    const telegramId = ctx.from.id;
    const state = userStates[telegramId];
    
    if (!state || !state.compromissoData) {
      await ctx.reply('Erro: Dados do compromisso não encontrados. Tente novamente com /agenda');
      return;
    }
    
    try {
      // Salvar compromisso
      await dbService.agendarCompromisso(telegramId, state.compromissoData);
      
      await ctx.reply(`✅ Compromisso agendado com sucesso para ${state.compromissoData.data.split('-').reverse().join('/')} às ${state.compromissoData.horario}!`);
      
      // Resetar estado
      userStates[telegramId] = { currentCommand: null };
      await dbService.saveUserState(telegramId, userStates[telegramId]);
      
    } catch (error) {
      console.error('Erro ao salvar compromisso:', error);
      await ctx.reply('❌ Houve um erro ao salvar o compromisso. Por favor, tente novamente mais tarde.');
    }
  } catch (error) {
    console.error('Erro no callback de confirmação:', error);
    await ctx.reply('Ocorreu um erro. Por favor, tente novamente com /agenda');
  }
});

// Handler para cancelamento de compromisso
bot.action('agenda_cancelar', async (ctx) => {
  try {
    await ctx.answerCbQuery('Cancelado');
    
    const telegramId = ctx.from.id;
    
    // Limpar estado
    userStates[telegramId] = { currentCommand: null };
    await dbService.saveUserState(telegramId, userStates[telegramId]);
    
    await ctx.reply('❌ Agendamento cancelado. Use /agenda para iniciar novamente quando quiser.');
  } catch (error) {
    console.error('Erro ao cancelar:', error);
  }
});

// Handler para seleção de visualização de compromissos por data
bot.action('agenda_data_outra', async (ctx) => {
  try {
    await ctx.answerCbQuery();
    
    const telegramId = ctx.from.id;
    const state = userStates[telegramId];
    
    if (!state || state.currentCommand !== 'agenda') {
      await ctx.reply('Sessão expirada. Use /agenda para iniciar novamente.');
      return;
    }
    
    state.subcommand = 'ver';
    state.step = 'informar_data';
    
    await ctx.reply('Digite a data que deseja visualizar (formato DD/MM/AAAA):');
    
  } catch (error) {
    console.error('Erro ao solicitar data de visualização:', error);
  }
});

// Handler para ver compromissos de hoje
bot.action(/agenda_data_(.+)/, async (ctx) => {
  try {
    await ctx.answerCbQuery();
    
    const dataSelecionada = ctx.match[1]; // Formato AAAA-MM-DD
    const telegramId = ctx.from.id;
    
    await mostrarCompromissosData(ctx, telegramId, dataSelecionada);
    
  } catch (error) {
    console.error('Erro ao buscar compromissos da data:', error);
    await ctx.reply('Ocorreu um erro ao buscar seus compromissos. Tente novamente mais tarde.');
  }
});

// Função para mostrar compromissos de uma data
async function mostrarCompromissosData(ctx, telegramId, data) {
  try {
    const compromissos = await dbService.listarCompromissos(telegramId, data);
    
    if (compromissos.length === 0) {
      const dataFormatada = data.split('-').reverse().join('/');
      await ctx.reply(`Você não tem compromissos agendados para ${dataFormatada}.`);
      
      // Resetar estado
      userStates[telegramId] = { currentCommand: null };
      await dbService.saveUserState(telegramId, userStates[telegramId]);
      return;
    }
    
    const dataFormatada = data.split('-').reverse().join('/');
    let mensagem = `📅 *Compromissos para ${dataFormatada}:*\n\n`;
    
    compromissos.sort((a, b) => a.horario.localeCompare(b.horario));
    
    compromissos.forEach((compromisso, index) => {
      mensagem += `⏰ *${compromisso.horario}* - ${compromisso.descricao}\n`;
      
      if (compromisso.cliente_id && compromisso.clientes) {
        mensagem += `🏢 Cliente: ${compromisso.clientes.nome_empresa}\n`;
      }
      
      if (index < compromissos.length - 1) {
        mensagem += `\n------------------\n\n`;
      }
    });
    
    await ctx.reply(mensagem, { parse_mode: 'Markdown' });
    
    // Resetar estado
    userStates[telegramId] = { currentCommand: null };
    await dbService.saveUserState(telegramId, userStates[telegramId]);
    
  } catch (error) {
    console.error('Erro ao mostrar compromissos:', error);
    await ctx.reply('Ocorreu um erro ao buscar seus compromissos. Tente novamente mais tarde.');
  }
}

// Funções auxiliares de texto para follow-up
async function handleFollowupText(ctx, telegramId, state, messageText) {
  if (state.subcommand === 'novo') {
    // Data
    if (state.step === 'data') {
      const dataRegex = /^\d{2}\/\d{2}\/\d{4}$/;
      if (!dataRegex.test(messageText)) {
        await ctx.reply('Por favor, use o formato DD/MM/AAAA. Por exemplo: 25/12/2023');
        return;
      }
      
      const partes = messageText.split('/');
      const dataSql = `${partes[2]}-${partes[1]}-${partes[0]}`;
      
      state.followUpData.data = dataSql;
      state.step = 'horario'; // Novo passo para horário
      
      await ctx.reply('Digite o horário do follow-up (formato HH:MM):');
    }
    // Horário (novo)
    else if (state.step === 'horario') {
      const horarioRegex = /^\d{2}:\d{2}$/;
      if (!horarioRegex.test(messageText)) {
        await ctx.reply('Por favor, use o formato HH:MM. Por exemplo: 14:30');
        return;
      }
      
      state.followUpData.horario = messageText;
      state.step = 'motivo';
      
      await ctx.reply('Digite o motivo ou descrição do follow-up:');
    }
    // Motivo
    else if (state.step === 'motivo') {
      state.followUpData.motivo = messageText;
      state.step = 'observacao'; // Novo passo para observação
      
      await ctx.reply(
        'Deseja adicionar uma observação?\n' +
        'Digite a observação ou envie "pular" para continuar sem observação.'
      );
    }
    // Observação (novo)
    else if (state.step === 'observacao') {
      state.followUpData.observacao = messageText.toLowerCase() === 'pular' ? null : messageText;
      state.step = 'confirmar';
      
      // Montar mensagem de confirmação
      let mensagem = 
        `*Confirme os dados do Follow-up:*\n\n` +
        `*Cliente:* ${state.followUpData.clienteNome || 'Sem empresa'}\n` +
        `*Data:* ${state.followUpData.data.split('-').reverse().join('/')}\n` +
        `*Horário:* ${state.followUpData.horario}\n` +
        `*Motivo:* ${state.followUpData.motivo}\n`;
      
      if (state.followUpData.observacao) {
        mensagem += `*Observação:* ${state.followUpData.observacao}\n`;
      }
      
      mensagem += `\nEstá correto?`;
      
      await ctx.reply(mensagem, {
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [
            [
              { text: '✅ Confirmar', callback_data: 'followup_confirmar' },
              { text: '❌ Cancelar', callback_data: 'followup_cancelar' }
            ]
          ]
        }
      });
    }
  }
}

// Handlers de callback para follow-up
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

// Confirmação de follow-up
bot.action('followup_confirmar', async (ctx) => {
  try {
    await ctx.answerCbQuery('Processando...');
    
    const telegramId = ctx.from.id;
    const state = userStates[telegramId];
    
    if (!state || !state.followUpData) {
      await ctx.reply('Erro: Dados do follow-up não encontrados.');
      return;
    }
    
    // Salvar follow-up
    await dbService.adicionarFollowUp(telegramId, state.followUpData);
    
    await ctx.reply(`✅ Follow-up para ${state.followUpData.clienteNome} cadastrado com sucesso!`);
    
    // Resetar estado
    userStates[telegramId] = { currentCommand: null };
    await dbService.saveUserState(telegramId, userStates[telegramId]);
    
  } catch (error) {
    console.error('Erro ao confirmar follow-up:', error);
    await ctx.reply('Ocorreu um erro ao salvar o follow-up.');
  }
});

// Cancelamento de follow-up
bot.action('followup_cancelar', async (ctx) => {
  try {
    await ctx.answerCbQuery('Cancelado');
    
    const telegramId = ctx.from.id;
    
    // Limpar estado
    userStates[telegramId] = { currentCommand: null };
    await dbService.saveUserState(telegramId, userStates[telegramId]);
    
    await ctx.reply('❌ Cadastro de follow-up cancelado.');
  } catch (error) {
    console.error('Erro ao cancelar follow-up:', error);
  }
});

// Filtros de follow-up
bot.action(/followup_filtro_(.+)/, async (ctx) => {
  try {
    await ctx.answerCbQuery();
    
    const filtro = ctx.match[1];
    const telegramId = ctx.from.id;
    
    const statusMap = {
      'a_realizar': 'A Realizar',
      'pendente': 'Pendente',
      'feito': 'Feito'
    };
    
    const followUps = await dbService.listarFollowUps(telegramId, { 
      status: statusMap[filtro] 
    });
    
    if (followUps.length === 0) {
      await ctx.reply(`Não existem follow-ups com status "${statusMap[filtro]}".`);
      return;
    }
    
    let mensagem = `*Follow-ups - ${statusMap[filtro]}:*\n\n`;
    
    // Adicionar descrição resumida de cada follow-up na mensagem
    followUps.forEach((followUp, index) => {
      const dataFormatada = followUp.data.split('-').reverse().join('/');
      
      mensagem += `*${index + 1}. ${dataFormatada}* - ${followUp.clientes.nome_empresa}\n`;
      mensagem += `📝 ${followUp.motivo}\n\n`;
    });
    
    await ctx.reply(mensagem, { parse_mode: 'Markdown' });
    
    // Criar botões para ver detalhes de cada follow-up
    const buttons = followUps.map((followUp, index) => {
      const dataFormatada = followUp.data.split('-').reverse().join('/');
      return [{ 
        text: `Ver detalhes: ${dataFormatada} - ${followUp.clientes.nome_empresa.substring(0, 20)}...`,
        callback_data: `followup_detalhes_${followUp.id}`
      }];
    });
    
    // Adicionar botão de voltar ao menu
    buttons.push([{ text: '↩️ Voltar', callback_data: 'followup_voltar' }]);
    
    // Enviar botões como mensagem separada
    await ctx.reply('Selecione um follow-up para ver detalhes ou atualizar status:', {
      reply_markup: {
        inline_keyboard: buttons
      }
    });
    
  } catch (error) {
    console.error('Erro ao filtrar follow-ups:', error);
    await ctx.reply('Ocorreu um erro ao buscar follow-ups.');
  }
});

// Comando /followup
bot.command('followup', async (ctx) => {
  const telegramId = ctx.from.id;
  
  try {
    const clientes = await dbService.listarClientes(telegramId);
    
    if (clientes.length === 0) {
      await ctx.reply('Você precisa ter clientes cadastrados para criar follow-ups.');
      return;
    }
    
    userStates[telegramId] = { 
      currentCommand: 'followup',
      step: 'inicial',
      clientesList: clientes
    };
    
    // Menu de opções de follow-up
    await ctx.reply(
      'O que deseja fazer?',
      {
        reply_markup: {
          inline_keyboard: [
            [{ text: '👁️ Ver follow-ups', callback_data: 'followup_ver' }],
            [{ text: '📝 Registrar novo', callback_data: 'followup_novo' }]
          ]
        }
      }
    );
    
  } catch (error) {
    console.error('Erro ao iniciar followup:', error);
    await ctx.reply('Ocorreu um erro ao iniciar follow-ups.');
  }
});

bot.action('followup_novo', async (ctx) => {
  try {
    await ctx.answerCbQuery();
    const telegramId = ctx.from.id;
    
    try {
      const clientes = await dbService.listarClientes(telegramId);
      
      // Criar botões de clientes com opção "Sem Empresa"
      const clienteButtons = [
        ...clientes.map(cliente => [
          { 
            text: cliente.nome_empresa,
            callback_data: `followup_cliente_${cliente.id}`
          }
        ]),
        [{ text: '🚫 Sem Empresa Específica', callback_data: 'followup_cliente_sem_empresa' }]
      ];
      
      userStates[telegramId] = { 
        currentCommand: 'followup',
        subcommand: 'novo',
        step: 'selecionar_cliente',
        followUpData: {},
        clientesList: clientes
      };
      
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
      await ctx.reply('Ops! Ocorreu um erro ao buscar seus clientes.');
    }
    
  } catch (error) {
    console.error('Erro ao preparar novo follow-up:', error);
  }
});

// Novo handler para follow-up sem cliente específico
bot.action('followup_cliente_sem_empresa', async (ctx) => {
  try {
    await ctx.answerCbQuery();
    const telegramId = ctx.from.id;
    const state = userStates[telegramId];
    
    // Armazena cliente como null
    state.followUpData.clienteId = null;
    state.followUpData.clienteNome = 'Sem Empresa';
    state.step = 'data';
    
    await ctx.reply('Follow-up sem cliente específico. Digite a data do follow-up (formato DD/MM/AAAA):', {
      parse_mode: 'Markdown'
    });
    
  } catch (error) {
    console.error('Erro ao selecionar sem empresa:', error);
  }
});

bot.action('followup_ver', async (ctx) => {
  try {
    await ctx.answerCbQuery();
    
    // Menu de filtros de follow-up
    await ctx.reply(
      'Como deseja visualizar os follow-ups?',
      {
        reply_markup: {
          inline_keyboard: [
            [
              { text: 'A Realizar', callback_data: 'followup_filtro_a_realizar' },
              { text: 'Pendentes', callback_data: 'followup_filtro_pendente' }
            ],
            [
              { text: 'Realizados', callback_data: 'followup_filtro_feito' }
            ]
          ]
        }
      }
    );
    
  } catch (error) {
    console.error('Erro ao ver follow-ups:', error);
    await ctx.reply('Ocorreu um erro ao buscar follow-ups.');
  }
});

// Handler para exibir detalhes de um follow-up quando selecionado
bot.action(/followup_detalhes_(.+)/, async (ctx) => {
  try {
    await ctx.answerCbQuery();
    
    const followupId = ctx.match[1];
    const telegramId = ctx.from.id;
    
    try {
      // Buscar follow-up no Supabase
      const followup = await dbService.buscarFollowUpPorId(telegramId, followupId);
      
      if (!followup) {
        await ctx.reply('Follow-up não encontrado ou já excluído.');
        return;
      }
      
      // Formatar data
      const dataFormatada = followup.data.split('-').reverse().join('/');
      
      // Exibir detalhes do follow-up
      const mensagem = 
        `📋 *Detalhes do Follow-up:*\n\n` +
        `*Cliente:* ${followup.clientes.nome_empresa}\n` +
        `*Data:* ${dataFormatada}\n` +
        `*Motivo:* ${followup.motivo}\n` +
        `*Status:* ${followup.status}\n` +
        `*Criado em:* ${new Date(followup.created_at).toLocaleDateString('pt-BR')}`;
      
      // Preparar botões de ação baseado no status atual
      let statusButtons = [];
      
      if (followup.status === 'A Realizar') {
        statusButtons = [
          [{ text: '✅ Marcar como Feito', callback_data: `followup_status_${followupId}_Feito` }],
          [{ text: '⚠️ Marcar como Pendente', callback_data: `followup_status_${followupId}_Pendente` }]
        ];
      } 
      else if (followup.status === 'Pendente') {
        statusButtons = [
          [{ text: '✅ Marcar como Feito', callback_data: `followup_status_${followupId}_Feito` }],
          [{ text: '🔄 Marcar como A Realizar', callback_data: `followup_status_${followupId}_A Realizar` }]
        ];
      }
      else if (followup.status === 'Feito') {
        statusButtons = [
          [{ text: '🔄 Marcar como A Realizar', callback_data: `followup_status_${followupId}_A Realizar` }],
          [{ text: '⚠️ Marcar como Pendente', callback_data: `followup_status_${followupId}_Pendente` }]
        ];
      }
      
      // Adicionar botão de voltar
      statusButtons.push([{ text: '↩️ Voltar', callback_data: 'followup_voltar' }]);
      
      await ctx.reply(mensagem, {
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: statusButtons
        }
      });
      
    } catch (error) {
      console.error('Erro ao buscar detalhes do follow-up:', error);
      await ctx.reply('Ocorreu um erro ao buscar os detalhes deste follow-up.');
    }
    
  } catch (error) {
    console.error('Erro no callback de detalhes de follow-up:', error);
  }
});

// Handler para atualizar status do follow-up
bot.action(/followup_status_(.+)_(.+)/, async (ctx) => {
  try {
    await ctx.answerCbQuery('Atualizando status...');
    
    const followupId = ctx.match[1];
    const novoStatus = ctx.match[2];
    const telegramId = ctx.from.id;
    
    try {
      // Atualizar status no banco de dados
      await dbService.atualizarStatusFollowUp(followupId, novoStatus);
      
      // Mostrar confirmação
      await ctx.reply(`✅ Status do follow-up atualizado para: *${novoStatus}*`, {
        parse_mode: 'Markdown'
      });
      
      // Opção para voltar à lista de follow-ups
      await ctx.reply('O que deseja fazer agora?', {
        reply_markup: {
          inline_keyboard: [
            [{ text: '↩️ Voltar para follow-ups', callback_data: 'followup_ver' }],
            [{ text: '📝 Registrar novo', callback_data: 'followup_novo' }]
          ]
        }
      });
      
    } catch (error) {
      console.error('Erro ao atualizar status do follow-up:', error);
      await ctx.reply('Ocorreu um erro ao atualizar o status. Tente novamente mais tarde.');
    }
    
  } catch (error) {
    console.error('Erro no callback de atualização de status:', error);
  }
});

// Handler para voltar ao menu de follow-up
bot.action('followup_voltar', async (ctx) => {
  try {
    await ctx.answerCbQuery();
    const telegramId = ctx.from.id;
    
    // Resetar para o menu inicial de follow-up
    userStates[telegramId] = { 
      currentCommand: 'followup',
      step: 'inicial'
    };
    
    await ctx.reply(
      'O que deseja fazer?',
      {
        reply_markup: {
          inline_keyboard: [
            [{ text: '👁️ Ver follow-ups', callback_data: 'followup_ver' }],
            [{ text: '📝 Registrar novo', callback_data: 'followup_novo' }]
          ]
        }
      }
    );
    
  } catch (error) {
    console.error('Erro ao voltar para menu de follow-up:', error);
  }
});

// Função para processar mensagens de texto para lembretes
async function handleLembreteText(ctx, telegramId, state, messageText) {
  // Subcomando: novo lembrete
  if (state.subcommand === 'novo') {
    if (state.step === 'data') {
      // Validar formato de data (DD/MM/AAAA)
      const dataRegex = /^\d{2}\/\d{2}\/\d{4}$/;
      if (!dataRegex.test(messageText)) {
        await ctx.reply('Por favor, use o formato DD/MM/AAAA. Por exemplo: 25/12/2023');
        return;
      }
      
      // Converter para formato SQL (AAAA-MM-DD)
      const partes = messageText.split('/');
      const dataSql = `${partes[2]}-${partes[1]}-${partes[0]}`;
      
      state.lembreteData.data = dataSql;
      state.step = 'horario';
      
      await ctx.reply('Digite o horário do lembrete (formato HH:MM):');
    }
    else if (state.step === 'horario') {
      // Validar formato de horário (HH:MM)
      const horarioRegex = /^\d{2}:\d{2}$/;
      if (!horarioRegex.test(messageText)) {
        await ctx.reply('Por favor, use o formato HH:MM. Por exemplo: 14:30');
        return;
      }
      
      state.lembreteData.horario = messageText;
      state.step = 'texto';
      
      await ctx.reply('Digite o texto do lembrete:');
    }
    else if (state.step === 'texto') {
      state.lembreteData.texto = messageText;
      state.step = 'vincular_cliente';
      
      await ctx.reply(
        'Deseja vincular este lembrete a um cliente?',
        {
          reply_markup: {
            inline_keyboard: [
              [
                { text: '✅ Sim', callback_data: 'lembrete_vincular_sim' },
                { text: '❌ Não', callback_data: 'lembrete_vincular_nao' }
              ]
            ]
          }
        }
      );
    }
  }
  // Subcomando: ver lembretes
  else if (state.subcommand === 'ver') {
    // Implementação futura para filtrar lembretes por data/período
    await ctx.reply('Funcionalidade de visualização de lembretes será implementada em breve.');
  }
}

// Handlers para callbacks de lembretes
bot.action('lembrete_vincular_sim', async (ctx) => {
  try {
    await ctx.answerCbQuery();
    const telegramId = ctx.from.id;
    const state = userStates[telegramId];
    
    if (!state || state.currentCommand !== 'lembrete' || state.subcommand !== 'novo') {
      await ctx.reply('Sessão expirada. Use /lembrete para iniciar novamente.');
      return;
    }
    
    // Buscar clientes do usuário para selecionar
    try {
      const clientes = await dbService.listarClientes(telegramId);
      
      if (clientes.length === 0) {
        await ctx.reply('Você não tem clientes cadastrados. O lembrete será criado sem vínculo com cliente.');
        state.step = 'confirmar';
        await confirmarLembrete(ctx, telegramId, state);
        return;
      }
      
      state.step = 'selecionar_cliente';
      state.clientesList = clientes;
      
      // Criar botões para selecionar cliente
      const clienteButtons = clientes.map(cliente => [
        { 
          text: cliente.nome_empresa,
          callback_data: `lembrete_cliente_${cliente.id}`
        }
      ]);
      
      // Adicionar opção para cancelar seleção
      clienteButtons.push([{ text: '↩️ Voltar', callback_data: 'lembrete_vincular_nao' }]);
      
      await ctx.reply(
        'Selecione o cliente para vincular ao lembrete:',
        {
          reply_markup: {
            inline_keyboard: clienteButtons
          }
        }
      );
      
    } catch (error) {
      console.error('Erro ao buscar clientes para lembrete:', error);
      await ctx.reply('Ocorreu um erro ao buscar clientes. O lembrete será criado sem vínculo.');
      state.step = 'confirmar';
      await confirmarLembrete(ctx, telegramId, state);
    }
    
  } catch (error) {
    console.error('Erro no callback de vínculo com cliente no lembrete:', error);
  }
});

// Handler para não vincular cliente
bot.action('lembrete_vincular_nao', async (ctx) => {
  try {
    await ctx.answerCbQuery();
    const telegramId = ctx.from.id;
    const state = userStates[telegramId];
    
    if (!state || state.currentCommand !== 'lembrete' || state.subcommand !== 'novo') {
      await ctx.reply('Sessão expirada. Use /lembrete para iniciar novamente.');
      return;
    }
    
    state.step = 'confirmar';
    await confirmarLembrete(ctx, telegramId, state);
    
  } catch (error) {
    console.error('Erro no callback de não vincular cliente no lembrete:', error);
  }
});

// Handler para seleção de cliente para lembrete
bot.action(/lembrete_cliente_(.+)/, async (ctx) => {
  try {
    await ctx.answerCbQuery();
    
    const clienteId = ctx.match[1];
    const telegramId = ctx.from.id;
    const state = userStates[telegramId];
    
    if (!state || state.currentCommand !== 'lembrete' || state.subcommand !== 'novo') {
      await ctx.reply('Sessão expirada. Use /lembrete para iniciar novamente.');
      return;
    }
    
    // Encontrar o cliente na lista
    const cliente = state.clientesList.find(c => c.id === clienteId);
    
    if (!cliente) {
      await ctx.reply('Cliente não encontrado. Tente novamente.');
      return;
    }
    
    // Armazenar o cliente selecionado
    state.lembreteData.clienteId = cliente.id;
    state.lembreteData.clienteNome = cliente.nome_empresa;
    
    state.step = 'confirmar';
    await confirmarLembrete(ctx, telegramId, state);
    
  } catch (error) {
    console.error('Erro ao selecionar cliente para lembrete:', error);
  }
});

// Função para mostrar e confirmar dados do lembrete
async function confirmarLembrete(ctx, telegramId, state) {
  try {
    const dataFormatada = state.lembreteData.data.split('-').reverse().join('/');
    
    // Montar mensagem de confirmação
    let mensagem = 
      `*Confirme os dados do lembrete:*\n\n` +
      `*Data:* ${dataFormatada}\n` +
      `*Horário:* ${state.lembreteData.horario}\n` +
      `*Texto:* ${state.lembreteData.texto}\n`;
      
    if (state.lembreteData.clienteId) {
      mensagem += `*Cliente:* ${state.lembreteData.clienteNome}\n`;
    } else {
      mensagem += `*Cliente:* Não vinculado\n`;
    }
    
    mensagem += `\nEstá correto?`;
    
    await ctx.reply(mensagem, {
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [
          [
            { text: '✅ Confirmar', callback_data: 'lembrete_confirmar' },
            { text: '❌ Cancelar', callback_data: 'lembrete_cancelar' }
          ]
        ]
      }
    });
    
  } catch (error) {
    console.error('Erro ao mostrar confirmação de lembrete:', error);
    await ctx.reply('Ocorreu um erro ao preparar a confirmação do lembrete.');
  }
}

// Handler para confirmação de lembrete
bot.action('lembrete_confirmar', async (ctx) => {
  try {
    await ctx.answerCbQuery('Processando...');
    
    const telegramId = ctx.from.id;
    const state = userStates[telegramId];
    
    if (!state || !state.lembreteData) {
      await ctx.reply('Erro: Dados do lembrete não encontrados. Tente novamente com /lembrete');
      return;
    }
    
    try {
      // Salvar lembrete
      await dbService.adicionarLembrete(telegramId, state.lembreteData);
      
      await ctx.reply(`✅ Lembrete agendado com sucesso para ${state.lembreteData.data.split('-').reverse().join('/')} às ${state.lembreteData.horario}!`);
      
      // Resetar estado
      userStates[telegramId] = { currentCommand: null };
      await dbService.saveUserState(telegramId, userStates[telegramId]);
      
    } catch (error) {
      console.error('Erro ao salvar lembrete:', error);
      await ctx.reply('❌ Houve um erro ao salvar o lembrete. Por favor, tente novamente mais tarde.');
    }
  } catch (error) {
    console.error('Erro no callback de confirmação de lembrete:', error);
    await ctx.reply('Ocorreu um erro. Por favor, tente novamente com /lembrete');
  }
});

// Handler para cancelamento de lembrete
bot.action('lembrete_cancelar', async (ctx) => {
  try {
    await ctx.answerCbQuery('Cancelado');
    
    const telegramId = ctx.from.id;
    
    // Limpar estado
    userStates[telegramId] = { currentCommand: null };
    await dbService.saveUserState(telegramId, userStates[telegramId]);
    
    await ctx.reply('❌ Criação de lembrete cancelada. Use /lembrete para iniciar novamente quando quiser.');
  } catch (error) {
    console.error('Erro ao cancelar lembrete:', error);
  }
});

// Modificar o comando /lembrete para adicionar a opção de ver lembretes
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

// Handler para iniciar novo lembrete
bot.action('lembrete_novo', async (ctx) => {
  try {
    await ctx.answerCbQuery();
    const telegramId = ctx.from.id;
    
    userStates[telegramId] = { 
      currentCommand: 'lembrete',
      subcommand: 'novo',
      step: 'data',
      lembreteData: {}
    };
    
    await ctx.reply('Digite a data do lembrete (formato DD/MM/AAAA):');
    
  } catch (error) {
    console.error('Erro ao iniciar novo lembrete:', error);
  }
});

// Handler para ver lembretes
bot.action('lembrete_ver', async (ctx) => {
  try {
    await ctx.answerCbQuery();
    const telegramId = ctx.from.id;
    
    // Buscar lembretes futuros do usuário
    const lembretes = await dbService.listarLembretes(telegramId);
    
    if (lembretes.length === 0) {
      await ctx.reply('Você não tem lembretes agendados.');
      return;
    }
    
    let mensagem = `📅 *Seus Lembretes Futuros:*\n\n`;
    
    lembretes.forEach((lembrete, index) => {
      const dataFormatada = lembrete.data.split('-').reverse().join('/');
      
      mensagem += `*${index + 1}. ${dataFormatada} - ${lembrete.horario}*\n`;
      mensagem += `📝 ${lembrete.texto}\n`;
      
      if (lembrete.cliente_id && lembrete.clientes) {
        mensagem += `🏢 Cliente: ${lembrete.clientes.nome_empresa}\n`;
      }
      
      mensagem += '\n';
    });
    
    await ctx.reply(mensagem, { parse_mode: 'Markdown' });
    
  } catch (error) {
    console.error('Erro ao listar lembretes:', error);
    await ctx.reply('Ocorreu um erro ao buscar seus lembretes.');
  }
});


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

// Handler para editar cliente
bot.action(/cliente_editar_(.+)/, async (ctx) => {
  try {
    await ctx.answerCbQuery();
    
    const clienteId = ctx.match[1];
    const telegramId = ctx.from.id;
    
    // Buscar cliente no banco para edição
    try {
      const cliente = await dbService.buscarClientePorId(telegramId, clienteId);
      
      if (!cliente) {
        await ctx.reply('Cliente não encontrado. Pode ter sido excluído.');
        return;
      }
      
      // Configurar estado para edição
      userStates[telegramId] = { 
        currentCommand: 'clientes',
        subcommand: 'editar',
        step: 'selecionar_campo',
        clienteId: cliente.id,
        clienteData: {
          nomeEmpresa: cliente.nome_empresa,
          cnpj: cliente.cnpj,
          nomeContato: cliente.nome_contato,
          telefoneContato: cliente.telefone_contato,
          emailContato: cliente.email_contato
        }
      };
      
      // Exibir opções para edição
      await ctx.reply(
        `📝 *Editar Cliente:* ${cliente.nome_empresa}\n\n` +
        `Selecione o campo que deseja editar:`,
        {
          parse_mode: 'Markdown',
          reply_markup: {
            inline_keyboard: [
              [{ text: 'Nome da Empresa', callback_data: 'editar_nome_empresa' }],
              [{ text: 'CNPJ', callback_data: 'editar_cnpj' }],
              [{ text: 'Nome do Contato', callback_data: 'editar_nome_contato' }],
              [{ text: 'Telefone', callback_data: 'editar_telefone_contato' }],
              [{ text: 'E-mail', callback_data: 'editar_email_contato' }],
              [{ text: '↩️ Voltar', callback_data: `cliente_ver_${clienteId}` }]
            ]
          }
        }
      );
    } catch (error) {
      console.error('Erro ao buscar cliente para edição:', error);
      await ctx.reply('Ocorreu um erro ao buscar detalhes do cliente.');
    }
  } catch (error) {
    console.error('Erro no callback de edição:', error);
  }
});

// Handlers para campos de edição
bot.action(/editar_(.+)/, async (ctx) => {
  try {
    await ctx.answerCbQuery();
    
    const telegramId = ctx.from.id;
    const campo = ctx.match[1];
    const state = userStates[telegramId];
    
    if (!state || state.subcommand !== 'editar' || !state.clienteData) {
      await ctx.reply('Sessão expirada. Use /clientes para iniciar novamente.');
      return;
    }
    
    // Mapear nomes de exibição para os campos
    const camposNomes = {
      'nome_empresa': 'nome da empresa',
      'cnpj': 'CNPJ',
      'nome_contato': 'nome do contato',
      'telefone_contato': 'telefone do contato',
      'email_contato': 'e-mail do contato'
    };
    
    state.step = 'editar_campo';
    state.campoAtual = campo;
    
    // Valor atual do campo
    const valorAtual = state.clienteData[campoParaProperty(campo)] || 'Não informado';
    
    await ctx.reply(
      `📝 Editando ${camposNomes[campo]}\n\n` +
      `Valor atual: *${valorAtual}*\n\n` +
      `Digite o novo valor:`,
      { parse_mode: 'Markdown' }
    );
    
  } catch (error) {
    console.error('Erro ao iniciar edição de campo:', error);
    await ctx.reply('Ocorreu um erro. Tente novamente.');
  }
});

// Função para converter nome de campo para propriedade no objeto clienteData
function campoParaProperty(campo) {
  const mapeamento = {
    'nome_empresa': 'nomeEmpresa',
    'cnpj': 'cnpj',
    'nome_contato': 'nomeContato',
    'telefone_contato': 'telefoneContato',
    'email_contato': 'emailContato'
  };
  return mapeamento[campo] || campo; // Adicionei fallback para evitar undefined
}


// Handler para excluir cliente
bot.action(/cliente_excluir_(.+)/, async (ctx) => {
  try {
    await ctx.answerCbQuery();
    
    const clienteId = ctx.match[1];
    const telegramId = ctx.from.id;
    
    // Buscar cliente para exibir confirmação
    try {
      const cliente = await dbService.buscarClientePorId(telegramId, clienteId);
      
      if (!cliente) {
        await ctx.reply('Cliente não encontrado. Pode ter sido excluído.');
        return;
      }
      
      await ctx.reply(
        `⚠️ *ATENÇÃO!* ⚠️\n\n` +
        `Você está prestes a excluir o cliente:\n` +
        `*${cliente.nome_empresa}*\n\n` +
        `Esta ação é irreversível!\n` +
        `Deseja continuar?`,
        {
          parse_mode: 'Markdown',
          reply_markup: {
            inline_keyboard: [
              [
                { text: '❌ SIM, excluir cliente', callback_data: `confirmar_exclusao_${clienteId}` },
                { text: 'Cancelar', callback_data: `cliente_ver_${clienteId}` }
              ]
            ]
          }
        }
      );
    } catch (error) {
      console.error('Erro ao buscar cliente para exclusão:', error);
      await ctx.reply('Ocorreu um erro ao buscar detalhes do cliente.');
    }
  } catch (error) {
    console.error('Erro no callback de exclusão:', error);
  }
});

// Handler para confirmar exclusão
bot.action(/confirmar_exclusao_(.+)/, async (ctx) => {
  try {
    await ctx.answerCbQuery();
    
    const clienteId = ctx.match[1];
    const telegramId = ctx.from.id;
    
    try {
      // Excluir cliente
      await dbService.excluirCliente(telegramId, clienteId);
      
      await ctx.reply('✅ Cliente excluído com sucesso!');
      
      // Voltar para menu de clientes
      userStates[telegramId] = { currentCommand: 'clientes', step: 'inicial' };
      
      await ctx.reply(
        'O que você deseja fazer agora?',
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
      console.error('Erro ao excluir cliente:', error);
      await ctx.reply('Ocorreu um erro ao excluir o cliente. Tente novamente mais tarde.');
    }
  } catch (error) {
    console.error('Erro na confirmação de exclusão:', error);
  }
});

// Configuração necessária para o webhook
bot.telegram.getMe().then((botInfo) => {
  bot.options.username = botInfo.username;
});

export default bot;