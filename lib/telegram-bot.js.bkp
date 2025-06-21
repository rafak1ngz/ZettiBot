// 1. Configuração e Inicialização
import { Telegraf } from 'telegraf';
import { format } from 'date-fns';
import * as dbService from './supabase';
import axios from 'axios';

// Verifica o token do bot
const botToken = process.env.TELEGRAM_BOT_TOKEN;
if (!botToken) {
  console.error('ERRO: Token do bot não encontrado. Defina TELEGRAM_BOT_TOKEN nas variáveis de ambiente.');
  process.exit(1); // Encerra o processo se o token estiver ausente
}

// Estados globais dos usuários
const userStates = {};

// Inicializa o bot
const bot = new Telegraf(botToken);

// Define os comandos disponíveis no menu do Telegram
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

// Configuração para webhook
bot.telegram.getMe().then((botInfo) => {
  bot.options.username = botInfo.username;
});

// 2. Middlewares
// Middleware de captura de erros
bot.catch((err, ctx) => {
  console.error('Erro no bot:', err);
  ctx.reply('Ops! Ocorreu um erro no processamento. Tente novamente mais tarde.')
    .catch(e => console.error('Erro ao notificar usuário:', e));
});

// Middleware para carregar estado do usuário do banco
bot.use(async (ctx, next) => {
  const telegramId = ctx.from?.id;
  if (telegramId && !userStates[telegramId]) {
    const savedState = await dbService.loadUserState(telegramId);
    userStates[telegramId] = savedState || { currentCommand: null };
  }
  await next();
});

// Middleware para comando /cancelar em qualquer contexto
bot.use(async (ctx, next) => {
  if (ctx.message?.text === '/cancelar') {
    const telegramId = ctx.from?.id;
    if (telegramId) {
      await resetUserState(ctx, telegramId);
      return;
    }
  }
  await next();
});

// 3. Comandos Principais
// Comando /start
bot.command('start', async (ctx) => {
  const telegramId = ctx.from.id;
  userStates[telegramId] = { currentCommand: null };
  await dbService.saveUserState(telegramId, userStates[telegramId]);

  await ctx.reply(
    `Olá, ${ctx.from.first_name}! 👋\n\nSou o *ZettiBot*, seu assistente de vendas!\n\n` +
    `Estou aqui para ajudar com clientes, follow-ups e mais!\n\nUse /help para ver os comandos.`,
    { parse_mode: 'Markdown' }
  );
});

// Comando /help
bot.command('help', async (ctx) => {
  const telegramId = ctx.from.id;
  userStates[telegramId] = { currentCommand: null };
  await dbService.saveUserState(telegramId, userStates[telegramId]);

  await ctx.reply(
    `*Comandos disponíveis:*\n\n` +
    `/clientes - Gerenciar clientes\n` +
    `/agenda - Ver ou agendar compromissos\n` +
    `/followup - Gerenciar follow-ups\n` +
    `/lembrete - Configurar lembretes\n` +
    `/visita - Registrar visitas\n` +
    `/buscapotencial - Buscar potenciais clientes\n` +
    `/criarrota - Criar rota otimizada`,
    { parse_mode: 'Markdown' }
  );
});

// Comando /clientes
bot.command('clientes', async (ctx) => {
  const telegramId = ctx.from.id;
  userStates[telegramId] = { currentCommand: 'clientes', step: 'inicial' };
  await dbService.saveUserState(telegramId, userStates[telegramId]);

  await ctx.reply(
    'O que você deseja fazer?',
    {
      reply_markup: {
        inline_keyboard: [
          [{ text: '➕ Adicionar cliente', callback_data: 'cliente_adicionar' }],
          [{ text: '🔍 Buscar cliente', callback_data: 'cliente_buscar' }],
          [{ text: '📄 Listar todos', callback_data: 'cliente_listar' }],
        ],
      },
    }
  );
});

// Comando /agenda
bot.command('agenda', async (ctx) => {
  const telegramId = ctx.from.id;
  userStates[telegramId] = { currentCommand: 'agenda', step: 'inicial' };
  await dbService.saveUserState(telegramId, userStates[telegramId]);

  await ctx.reply(
    'O que você deseja fazer?',
    {
      reply_markup: {
        inline_keyboard: [
          [{ text: '👁️ Ver compromissos', callback_data: 'agenda_ver' }],
          [{ text: '📝 Registrar novo', callback_data: 'agenda_novo' }],
        ],
      },
    }
  );
});

// Comando /followup
bot.command('followup', async (ctx) => {
  const telegramId = ctx.from.id;
  try {
    const clientes = await dbService.listarClientes(telegramId);
    if (!clientes.length) {
      await ctx.reply('Você precisa ter clientes cadastrados para criar follow-ups.');
      return;
    }
    userStates[telegramId] = { currentCommand: 'followup', step: 'inicial', clientesList: clientes };
    await dbService.saveUserState(telegramId, userStates[telegramId]);

    await ctx.reply(
      'O que deseja fazer?',
      {
        reply_markup: {
          inline_keyboard: [
            [{ text: '👁️ Ver follow-ups', callback_data: 'followup_ver' }],
            [{ text: '📝 Registrar novo', callback_data: 'followup_novo' }],
          ],
        },
      }
    );
  } catch (error) {
    console.error('Erro ao iniciar /followup:', error);
    await ctx.reply('Erro ao carregar follow-ups. Tente novamente.');
  }
});

// Comando /lembrete
bot.command('lembrete', async (ctx) => {
  const telegramId = ctx.from.id;
  userStates[telegramId] = { currentCommand: 'lembrete', step: 'inicial' };
  await dbService.saveUserState(telegramId, userStates[telegramId]);

  await ctx.reply(
    'O que você deseja fazer?',
    {
      reply_markup: {
        inline_keyboard: [
          [{ text: '👁️ Ver lembretes', callback_data: 'lembrete_ver' }],
          [{ text: '📝 Registrar novo', callback_data: 'lembrete_novo' }],
        ],
      },
    }
  );
});

// Comando /visita
bot.command('visita', async (ctx) => {
  const telegramId = ctx.from.id;
  try {
    const clientes = await dbService.listarClientes(telegramId);
    if (!clientes.length) {
      await ctx.reply('Cadastre um cliente primeiro com /clientes.');
      return;
    }
    userStates[telegramId] = { currentCommand: 'visita', step: 'selecionar_cliente', clientesList: clientes, visitaData: {} };
    await dbService.saveUserState(telegramId, userStates[telegramId]);

    const clienteButtons = clientes.map(cliente => [{ text: cliente.nome_empresa, callback_data: `visita_cliente_${cliente.id}` }]);
    await ctx.reply('Selecione o cliente para registrar visita:', { reply_markup: { inline_keyboard: clienteButtons } });
  } catch (error) {
    console.error('Erro em /visita:', error);
    await ctx.reply('Erro ao carregar clientes. Tente novamente.');
  }
});

// Comando /buscapotencial
bot.command('buscapotencial', async (ctx) => {
  const telegramId = ctx.from.id;
  userStates[telegramId] = { currentCommand: 'buscapotencial', step: 'tipo_empresa' };
  await dbService.saveUserState(telegramId, userStates[telegramId]);

  await ctx.reply('Qual o tipo de empresa? (Ex: indústria, metalúrgica, logística)');
});

// Comando /criarrota
bot.command('criarrota', async (ctx) => {
  const telegramId = ctx.from.id;
  userStates[telegramId] = {
    currentCommand: 'criarrota',
    step: 'definir_ponto_partida',
    rotaData: { paradas: [] },
  };
  await dbService.saveUserState(telegramId, userStates[telegramId]);

  await ctx.reply(
    `🚗 *Criação de Rota Otimizada*\n\n` +
    `Digite o nome e endereço do ponto de partida, separados por vírgula.\n` +
    `Exemplo: *Meu Escritório, Av. Principal, 100 - Centro*`,
    { parse_mode: 'Markdown' }
  );
});

// Comando /cancelar
bot.command('cancelar', async (ctx) => {
  await resetUserState(ctx, ctx.from.id);
});

// 4. Handlers de Ações (Callbacks)
// Callbacks para /clientes
bot.action('cliente_adicionar', async (ctx) => {
  await ctx.answerCbQuery();
  const telegramId = ctx.from.id;
  userStates[telegramId] = { currentCommand: 'clientes', subcommand: 'adicionar', step: 'nome_empresa', clienteData: {} };
  await dbService.saveUserState(telegramId, userStates[telegramId]);
  await ctx.reply('Digite o nome da empresa:');
});

bot.action('cliente_buscar', async (ctx) => {
  await ctx.answerCbQuery();
  const telegramId = ctx.from.id;
  userStates[telegramId] = { currentCommand: 'clientes', subcommand: 'buscar', step: 'termo_busca' };
  await dbService.saveUserState(telegramId, userStates[telegramId]);
  await ctx.reply('Digite o nome ou parte do nome da empresa:');
});

bot.action('cliente_listar', async (ctx) => {
  await ctx.answerCbQuery();
  const telegramId = ctx.from.id;
  try {
    const clientes = await dbService.listarClientes(telegramId);
    if (!clientes.length) {
      await ctx.reply('Você ainda não tem clientes cadastrados.');
      return;
    }
    const clienteButtons = clientes.map(cliente => [{ text: cliente.nome_empresa, callback_data: `cliente_ver_${cliente.id}` }]);
    await ctx.reply(`Você tem ${clientes.length} clientes cadastrados:`, { reply_markup: { inline_keyboard: clienteButtons } });
  } catch (error) {
    console.error('Erro ao listar clientes:', error);
    await ctx.reply('Erro ao listar clientes. Tente novamente.');
  }
});

bot.action(/cliente_ver_(.+)/, async (ctx) => {
  await ctx.answerCbQuery();
  const clienteId = ctx.match[1];
  const telegramId = ctx.from.id;
  try {
    const cliente = await dbService.buscarClientePorId(telegramId, clienteId);
    if (!cliente) {
      await ctx.reply('Cliente não encontrado.');
      return;
    }
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
            { text: '🗑️ Excluir', callback_data: `cliente_excluir_${cliente.id}` },
          ],
          [{ text: '↩️ Voltar', callback_data: 'cliente_voltar' }],
        ],
      },
    });
  } catch (error) {
    console.error('Erro ao visualizar cliente:', error);
    await ctx.reply('Erro ao buscar detalhes do cliente.');
  }
});

bot.action(/cliente_editar_(.+)/, async (ctx) => {
  await ctx.answerCbQuery();
  const clienteId = ctx.match[1];
  const telegramId = ctx.from.id;
  try {
    const cliente = await dbService.buscarClientePorId(telegramId, clienteId);
    if (!cliente) {
      await ctx.reply('Cliente não encontrado.');
      return;
    }
    userStates[telegramId] = {
      currentCommand: 'clientes',
      subcommand: 'editar',
      step: 'selecionar_campo',
      clienteId,
      clienteData: {
        nomeEmpresa: cliente.nome_empresa,
        cnpj: cliente.cnpj,
        nomeContato: cliente.nome_contato,
        telefoneContato: cliente.telefone_contato,
        emailContato: cliente.email_contato,
      },
    };
    await dbService.saveUserState(telegramId, userStates[telegramId]);
    await ctx.reply(
      `📝 *Editar Cliente:* ${cliente.nome_empresa}\n\nSelecione o campo que deseja editar:`,
      {
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [
            [{ text: 'Nome da Empresa', callback_data: 'editar_nome_empresa' }],
            [{ text: 'CNPJ', callback_data: 'editar_cnpj' }],
            [{ text: 'Nome do Contato', callback_data: 'editar_nome_contato' }],
            [{ text: 'Telefone', callback_data: 'editar_telefone_contato' }],
            [{ text: 'E-mail', callback_data: 'editar_email_contato' }],
            [{ text: '↩️ Voltar', callback_data: `cliente_ver_${clienteId}` }],
          ],
        },
      }
    );
  } catch (error) {
    console.error('Erro ao editar cliente:', error);
    await ctx.reply('Erro ao carregar cliente para edição.');
  }
});

bot.action(/editar_(.+)/, async (ctx) => {
  await ctx.answerCbQuery();
  const telegramId = ctx.from.id;
  const campo = ctx.match[1];
  const state = userStates[telegramId];
  if (!state || state.subcommand !== 'editar') {
    await ctx.reply('Sessão expirada. Use /clientes para continuar.');
    return;
  }
  const camposNomes = {
    nome_empresa: 'nome da empresa',
    cnpj: 'CNPJ',
    nome_contato: 'nome do contato',
    telefone_contato: 'telefone do contato',
    email_contato: 'e-mail do contato',
  };
  state.step = 'editar_campo';
  state.campoAtual = campo;
  await dbService.saveUserState(telegramId, state);
  const valorAtual = state.clienteData[campoParaProperty(campo)] || 'Não informado';
  await ctx.reply(
    `📝 Editando ${camposNomes[campo]}\n\nValor atual: *${valorAtual}*\n\nDigite o novo valor:`,
    { parse_mode: 'Markdown' }
  );
});

bot.action(/cliente_excluir_(.+)/, async (ctx) => {
  await ctx.answerCbQuery();
  const clienteId = ctx.match[1];
  const telegramId = ctx.from.id;
  try {
    const cliente = await dbService.buscarClientePorId(telegramId, clienteId);
    if (!cliente) {
      await ctx.reply('Cliente não encontrado.');
      return;
    }
    await ctx.reply(
      `⚠️ *ATENÇÃO!*\n\nVocê está prestes a excluir:\n*${cliente.nome_empresa}*\n\nEsta ação é irreversível! Continuar?`,
      {
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [
            [
              { text: '❌ SIM, excluir', callback_data: `confirmar_exclusao_${clienteId}` },
              { text: 'Cancelar', callback_data: `cliente_ver_${clienteId}` },
            ],
          ],
        },
      }
    );
  } catch (error) {
    console.error('Erro ao preparar exclusão:', error);
    await ctx.reply('Erro ao carregar cliente para exclusão.');
  }
});

bot.action(/confirmar_exclusao_(.+)/, async (ctx) => {
  await ctx.answerCbQuery();
  const clienteId = ctx.match[1];
  const telegramId = ctx.from.id;
  try {
    await dbService.excluirCliente(telegramId, clienteId);
    await ctx.reply('✅ Cliente excluído com sucesso!');
    userStates[telegramId] = { currentCommand: 'clientes', step: 'inicial' };
    await dbService.saveUserState(telegramId, userStates[telegramId]);
    await ctx.reply(
      'O que você deseja fazer agora?',
      {
        reply_markup: {
          inline_keyboard: [
            [{ text: '➕ Adicionar cliente', callback_data: 'cliente_adicionar' }],
            [{ text: '🔍 Buscar cliente', callback_data: 'cliente_buscar' }],
            [{ text: '📄 Listar todos', callback_data: 'cliente_listar' }],
          ],
        },
      }
    );
  } catch (error) {
    console.error('Erro ao excluir cliente:', error);
    await ctx.reply('Erro ao excluir cliente. Tente novamente.');
  }
});

bot.action('cliente_voltar', async (ctx) => {
  await ctx.answerCbQuery();
  const telegramId = ctx.from.id;
  userStates[telegramId] = { currentCommand: 'clientes', step: 'inicial' };
  await dbService.saveUserState(telegramId, userStates[telegramId]);
  await ctx.reply(
    'O que você deseja fazer?',
    {
      reply_markup: {
        inline_keyboard: [
          [{ text: '➕ Adicionar cliente', callback_data: 'cliente_adicionar' }],
          [{ text: '🔍 Buscar cliente', callback_data: 'cliente_buscar' }],
          [{ text: '📄 Listar todos', callback_data: 'cliente_listar' }],
        ],
      },
    }
  );
});

// Callbacks para /agenda
bot.action('agenda_ver', async (ctx) => {
  await ctx.answerCbQuery();
  const telegramId = ctx.from.id;
  userStates[telegramId] = { currentCommand: 'agenda', subcommand: 'ver', step: 'selecionar_data' };
  await dbService.saveUserState(telegramId, userStates[telegramId]);
  const hoje = format(new Date(), 'yyyy-MM-dd');
  await ctx.reply(
    'Qual data você quer visualizar?',
    {
      reply_markup: {
        inline_keyboard: [
          [{ text: 'Hoje', callback_data: `agenda_data_${hoje}` }],
          [{ text: 'Outra data', callback_data: 'agenda_data_outra' }],
        ],
      },
    }
  );
});

bot.action('agenda_novo', async (ctx) => {
  await ctx.answerCbQuery();
  const telegramId = ctx.from.id;
  userStates[telegramId] = { currentCommand: 'agenda', subcommand: 'novo', step: 'data', compromissoData: {} };
  await dbService.saveUserState(telegramId, userStates[telegramId]);
  await ctx.reply('Digite a data do compromisso (formato DD/MM/AAAA):');
});

bot.action(/agenda_data_(.+)/, async (ctx) => {
  await ctx.answerCbQuery();
  const dataSelecionada = ctx.match[1];
  const telegramId = ctx.from.id;
  await mostrarCompromissosData(ctx, telegramId, dataSelecionada);
});

bot.action('agenda_data_outra', async (ctx) => {
  await ctx.answerCbQuery();
  const telegramId = ctx.from.id;
  userStates[telegramId] = { currentCommand: 'agenda', subcommand: 'ver', step: 'informar_data' };
  await dbService.saveUserState(telegramId, userStates[telegramId]);
  await ctx.reply('Digite a data que deseja visualizar (formato DD/MM/AAAA):');
});

bot.action('agenda_vincular_sim', async (ctx) => {
  await ctx.answerCbQuery();
  const telegramId = ctx.from.id;
  const state = userStates[telegramId];
  if (!state || state.currentCommand !== 'agenda') {
    await ctx.reply('Sessão expirada. Use /agenda para continuar.');
    return;
  }
  try {
    const clientes = await dbService.listarClientes(telegramId);
    if (!clientes.length) {
      await ctx.reply('Sem clientes cadastrados. Criando compromisso sem vínculo.');
      state.step = 'confirmar';
      await confirmarCompromisso(ctx, telegramId, state);
      return;
    }
    state.step = 'selecionar_cliente';
    state.clientesList = clientes;
    await dbService.saveUserState(telegramId, state);
    const clienteButtons = clientes.map(cliente => [{ text: cliente.nome_empresa, callback_data: `agenda_cliente_${cliente.id}` }]);
    clienteButtons.push([{ text: '↩️ Voltar', callback_data: 'agenda_vincular_nao' }]);
    await ctx.reply('Selecione o cliente para vincular:', { reply_markup: { inline_keyboard: clienteButtons } });
  } catch (error) {
    console.error('Erro ao vincular cliente:', error);
    await ctx.reply('Erro ao buscar clientes. Criando sem vínculo.');
    state.step = 'confirmar';
    await confirmarCompromisso(ctx, telegramId, state);
  }
});

bot.action('agenda_vincular_nao', async (ctx) => {
  await ctx.answerCbQuery();
  const telegramId = ctx.from.id;
  const state = userStates[telegramId];
  if (!state || state.currentCommand !== 'agenda') {
    await ctx.reply('Sessão expirada. Use /agenda para continuar.');
    return;
  }
  state.step = 'confirmar';
  await dbService.saveUserState(telegramId, state);
  await confirmarCompromisso(ctx, telegramId, state);
});

bot.action(/agenda_cliente_(.+)/, async (ctx) => {
  await ctx.answerCbQuery();
  const clienteId = ctx.match[1];
  const telegramId = ctx.from.id;
  const state = userStates[telegramId];
  if (!state || state.currentCommand !== 'agenda') {
    await ctx.reply('Sessão expirada. Use /agenda para continuar.');
    return;
  }
  const cliente = state.clientesList.find(c => c.id === clienteId);
  if (!cliente) {
    await ctx.reply('Cliente não encontrado.');
    return;
  }
  state.compromissoData.clienteId = cliente.id;
  state.compromissoData.clienteNome = cliente.nome_empresa;
  state.step = 'confirmar';
  await dbService.saveUserState(telegramId, state);
  await confirmarCompromisso(ctx, telegramId, state);
});

bot.action('agenda_confirmar', async (ctx) => {
  await ctx.answerCbQuery('Processando...');
  const telegramId = ctx.from.id;
  const state = userStates[telegramId];
  if (!state || !state.compromissoData) {
    await ctx.reply('Erro: Dados do compromisso não encontrados.');
    return;
  }
  try {
    await dbService.agendarCompromisso(telegramId, state.compromissoData);
    await ctx.reply(
      `✅ Compromisso agendado para ${state.compromissoData.data.split('-').reverse().join('/')} às ${state.compromissoData.horario}!`
    );
    await resetUserState(ctx, telegramId);
  } catch (error) {
    console.error('Erro ao salvar compromisso:', error);
    await ctx.reply('Erro ao salvar compromisso. Tente novamente.');
  }
});

bot.action('agenda_cancelar', async (ctx) => {
  await ctx.answerCbQuery('Cancelado');
  await resetUserState(ctx, ctx.from.id);
  await ctx.reply('❌ Agendamento cancelado. Use /agenda para continuar.');
});

// Callbacks para /followup
bot.action('followup_ver', async (ctx) => {
  await ctx.answerCbQuery();
  const telegramId = ctx.from.id;
  userStates[telegramId] = { currentCommand: 'followup', subcommand: 'ver', step: 'selecionar_filtro' };
  await dbService.saveUserState(telegramId, userStates[telegramId]);
  await ctx.reply(
    'Como deseja filtrar os follow-ups?',
    {
      reply_markup: {
        inline_keyboard: [
          [{ text: 'Por data', callback_data: 'followup_filtro_data' }],
          [{ text: 'A Realizar', callback_data: 'followup_filtro_a_realizar' }],
          [{ text: 'Pendentes', callback_data: 'followup_filtro_pendente' }],
          [{ text: 'Realizados', callback_data: 'followup_filtro_feito' }],
        ],
      },
    }
  );
});

bot.action('followup_novo', async (ctx) => {
  await ctx.answerCbQuery();
  const telegramId = ctx.from.id;
  try {
    const clientes = await dbService.listarClientes(telegramId);
    const clienteButtons = [
      ...clientes.map(cliente => [{ text: cliente.nome_empresa, callback_data: `followup_cliente_${cliente.id}` }]),
      [{ text: '🚫 Sem Empresa', callback_data: 'followup_cliente_sem_empresa' }],
    ];
    userStates[telegramId] = {
      currentCommand: 'followup',
      subcommand: 'novo',
      step: 'selecionar_cliente',
      followUpData: {},
      clientesList: clientes,
    };
    await dbService.saveUserState(telegramId, userStates[telegramId]);
    await ctx.reply('Selecione o cliente para o follow-up:', { reply_markup: { inline_keyboard: clienteButtons } });
  } catch (error) {
    console.error('Erro ao listar clientes para follow-up:', error);
    await ctx.reply('Erro ao buscar clientes.');
  }
});

bot.action(/followup_cliente_(.+)/, async (ctx) => {
  await ctx.answerCbQuery();
  const clienteId = ctx.match[1];
  const telegramId = ctx.from.id;
  const state = userStates[telegramId];
  if (!state || state.currentCommand !== 'followup') {
    await ctx.reply('Sessão expirada. Use /followup para continuar.');
    return;
  }
  const cliente = state.clientesList.find(c => c.id === clienteId);
  if (!cliente) {
    await ctx.reply('Cliente não encontrado.');
    return;
  }
  state.followUpData.clienteId = cliente.id;
  state.followUpData.clienteNome = cliente.nome_empresa;
  state.step = 'data';
  await dbService.saveUserState(telegramId, state);
  await ctx.reply(`Cliente selecionado: *${cliente.nome_empresa}*\n\nDigite a data do follow-up (DD/MM/AAAA):`, {
    parse_mode: 'Markdown',
  });
});

bot.action('followup_cliente_sem_empresa', async (ctx) => {
  await ctx.answerCbQuery();
  const telegramId = ctx.from.id;
  const state = userStates[telegramId];
  state.followUpData.clienteId = null;
  state.followUpData.clienteNome = 'Sem Empresa';
  state.step = 'data';
  await dbService.saveUserState(telegramId, state);
  await ctx.reply('Follow-up sem cliente. Digite a data (DD/MM/AAAA):', { parse_mode: 'Markdown' });
});

bot.action('followup_confirmar', async (ctx) => {
  await ctx.answerCbQuery('Processando...');
  const telegramId = ctx.from.id;
  const state = userStates[telegramId];
  if (!state || !state.followUpData) {
    await ctx.reply('Erro: Dados do follow-up não encontrados.');
    return;
  }
  try {
    await dbService.adicionarFollowUp(telegramId, state.followUpData);
    await ctx.reply(`✅ Follow-up para ${state.followUpData.clienteNome} cadastrado com sucesso!`);
    await resetUserState(ctx, telegramId);
  } catch (error) {
    console.error('Erro ao salvar follow-up:', error);
    await ctx.reply('Erro ao salvar follow-up.');
  }
});

bot.action('followup_cancelar', async (ctx) => {
  await ctx.answerCbQuery('Cancelado');
  await resetUserState(ctx, ctx.from.id);
  await ctx.reply('❌ Cadastro de follow-up cancelado.');
});

bot.action(/followup_filtro_(.+)/, async (ctx) => {
  await ctx.answerCbQuery();
  const filtro = ctx.match[1];
  const telegramId = ctx.from.id;
  const statusMap = { a_realizar: 'A Realizar', pendente: 'Pendente', feito: 'Feito' };
  try {
    const followUps = await dbService.listarFollowUps(telegramId, { status: statusMap[filtro] });
    if (!followUps.length) {
      await ctx.reply(`Não há follow-ups com status "${statusMap[filtro]}".`);
      return;
    }
    let mensagem = `*Follow-ups - ${statusMap[filtro]}:*\n\n`;
    followUps.forEach((followUp, index) => {
      const dataFormatada = followUp.data.split('-').reverse().join('/');
      mensagem += `*${index + 1}. ${dataFormatada}* - ${followUp.clientes?.nome_empresa || 'Sem Empresa'}\n📝 ${followUp.motivo}\n\n`;
    });
    await ctx.reply(mensagem, { parse_mode: 'Markdown' });
    const buttons = followUps.map((followUp, index) => [
      {
        text: `Ver: ${followUp.data.split('-').reverse().join('/')} - ${followUp.clientes?.nome_empresa.substring(0, 20) || 'Sem Empresa'}...`,
        callback_data: `followup_detalhes_${followUp.id}`,
      },
    ]);
    buttons.push([{ text: '↩️ Voltar', callback_data: 'followup_voltar' }]);
    await ctx.reply('Selecione um follow-up para detalhes:', { reply_markup: { inline_keyboard: buttons } });
  } catch (error) {
    console.error('Erro ao filtrar follow-ups:', error);
    await ctx.reply('Erro ao buscar follow-ups.');
  }
});

bot.action(/followup_detalhes_(.+)/, async (ctx) => {
  await ctx.answerCbQuery();
  const followupId = ctx.match[1];
  const telegramId = ctx.from.id;
  try {
    const followup = await dbService.buscarFollowUpPorId(telegramId, followupId);
    if (!followup) {
      await ctx.reply('Follow-up não encontrado.');
      return;
    }
    const dataFormatada = followup.data.split('-').reverse().join('/');
    const mensagem =
      `📋 *Detalhes do Follow-up:*\n\n` +
      `*Cliente:* ${followup.clientes?.nome_empresa || 'Sem Empresa'}\n` +
      `*Data:* ${dataFormatada}\n` +
      `*Motivo:* ${followup.motivo}\n` +
      `*Status:* ${followup.status}\n` +
      `*Criado em:* ${new Date(followup.created_at).toLocaleDateString('pt-BR')}`;
    let statusButtons = [];
    if (followup.status === 'A Realizar') {
      statusButtons = [
        [{ text: '✅ Marcar como Feito', callback_data: `followup_status_${followupId}_Feito` }],
        [{ text: '⚠️ Marcar como Pendente', callback_data: `followup_status_${followupId}_Pendente` }],
      ];
    } else if (followup.status === 'Pendente') {
      statusButtons = [
        [{ text: '✅ Marcar como Feito', callback_data: `followup_status_${followupId}_Feito` }],
        [{ text: '🔄 Marcar como A Realizar', callback_data: `followup_status_${followupId}_A Realizar` }],
      ];
    } else if (followup.status === 'Feito') {
      statusButtons = [
        [{ text: '🔄 Marcar como A Realizar', callback_data: `followup_status_${followupId}_A Realizar` }],
        [{ text: '⚠️ Marcar como Pendente', callback_data: `followup_status_${followupId}_Pendente` }],
      ];
    }
    statusButtons.push([{ text: '↩️ Voltar', callback_data: 'followup_voltar' }]);
    await ctx.reply(mensagem, { parse_mode: 'Markdown', reply_markup: { inline_keyboard: statusButtons } });
  } catch (error) {
    console.error('Erro ao buscar detalhes do follow-up:', error);
    await ctx.reply('Erro ao carregar detalhes do follow-up.');
  }
});

bot.action(/followup_status_(.+)_(.+)/, async (ctx) => {
  await ctx.answerCbQuery('Atualizando status...');
  const followupId = ctx.match[1];
  const novoStatus = ctx.match[2];
  const telegramId = ctx.from.id;
  try {
    await dbService.atualizarStatusFollowUp(followupId, novoStatus);
    await ctx.reply(`✅ Status atualizado para: *${novoStatus}*`, { parse_mode: 'Markdown' });
    await ctx.reply('O que deseja fazer agora?', {
      reply_markup: {
        inline_keyboard: [
          [{ text: '↩️ Voltar para follow-ups', callback_data: 'followup_ver' }],
          [{ text: '📝 Registrar novo', callback_data: 'followup_novo' }],
        ],
      },
    });
  } catch (error) {
    console.error('Erro ao atualizar status:', error);
    await ctx.reply('Erro ao atualizar status.');
  }
});

bot.action('followup_voltar', async (ctx) => {
  await ctx.answerCbQuery();
  const telegramId = ctx.from.id;
  userStates[telegramId] = { currentCommand: 'followup', step: 'inicial' };
  await dbService.saveUserState(telegramId, userStates[telegramId]);
  await ctx.reply(
    'O que deseja fazer?',
    {
      reply_markup: {
        inline_keyboard: [
          [{ text: '👁️ Ver follow-ups', callback_data: 'followup_ver' }],
          [{ text: '📝 Registrar novo', callback_data: 'followup_novo' }],
        ],
      },
    }
  );
});

// Callbacks para /lembrete
bot.action('lembrete_ver', async (ctx) => {
  await ctx.answerCbQuery();
  const telegramId = ctx.from.id;
  try {
    const lembretes = await dbService.listarLembretes(telegramId);
    if (!lembretes.length) {
      await ctx.reply('Você não tem lembretes agendados.');
      return;
    }
    let mensagem = `📅 *Seus Lembretes Futuros:*\n\n`;
    lembretes.forEach((lembrete, index) => {
      const dataFormatada = lembrete.data.split('-').reverse().join('/');
      mensagem += `*${index + 1}. ${dataFormatada} - ${lembrete.horario}*\n📝 ${lembrete.texto}\n`;
      if (lembrete.cliente_id && lembrete.clientes) {
        mensagem += `🏢 Cliente: ${lembrete.clientes.nome_empresa}\n`;
      }
      mensagem += '\n';
    });
    await ctx.reply(mensagem, { parse_mode: 'Markdown' });
  } catch (error) {
    console.error('Erro ao listar lembretes:', error);
    await ctx.reply('Erro ao buscar lembretes.');
  }
});

bot.action('lembrete_novo', async (ctx) => {
  await ctx.answerCbQuery();
  const telegramId = ctx.from.id;
  userStates[telegramId] = { currentCommand: 'lembrete', subcommand: 'novo', step: 'data', lembreteData: {} };
  await dbService.saveUserState(telegramId, userStates[telegramId]);
  await ctx.reply('Digite a data do lembrete (formato DD/MM/AAAA):');
});

bot.action('lembrete_vincular_sim', async (ctx) => {
  await ctx.answerCbQuery();
  const telegramId = ctx.from.id;
  const state = userStates[telegramId];
  if (!state || state.currentCommand !== 'lembrete') {
    await ctx.reply('Sessão expirada. Use /lembrete para continuar.');
    return;
  }
  try {
    const clientes = await dbService.listarClientes(telegramId);
    if (!clientes.length) {
      await ctx.reply('Sem clientes cadastrados. Criando lembrete sem vínculo.');
      state.step = 'confirmar';
      await confirmarLembrete(ctx, telegramId, state);
      return;
    }
    state.step = 'selecionar_cliente';
    state.clientesList = clientes;
    await dbService.saveUserState(telegramId, state);
    const clienteButtons = clientes.map(cliente => [{ text: cliente.nome_empresa, callback_data: `lembrete_cliente_${cliente.id}` }]);
    clienteButtons.push([{ text: '↩️ Voltar', callback_data: 'lembrete_vincular_nao' }]);
    await ctx.reply('Selecione o cliente para vincular:', { reply_markup: { inline_keyboard: clienteButtons } });
  } catch (error) {
    console.error('Erro ao vincular cliente:', error);
    await ctx.reply('Erro ao buscar clientes. Criando sem vínculo.');
    state.step = 'confirmar';
    await confirmarLembrete(ctx, telegramId, state);
  }
});

bot.action('lembrete_vincular_nao', async (ctx) => {
  await ctx.answerCbQuery();
  const telegramId = ctx.from.id;
  const state = userStates[telegramId];
  if (!state || state.currentCommand !== 'lembrete') {
    await ctx.reply('Sessão expirada. Use /lembrete para continuar.');
    return;
  }
  state.step = 'confirmar';
  await dbService.saveUserState(telegramId, state);
  await confirmarLembrete(ctx, telegramId, state);
});

bot.action(/lembrete_cliente_(.+)/, async (ctx) => {
  await ctx.answerCbQuery();
  const clienteId = ctx.match[1];
  const telegramId = ctx.from.id;
  const state = userStates[telegramId];
  if (!state || state.currentCommand !== 'lembrete') {
    await ctx.reply('Sessão expirada. Use /lembrete para continuar.');
    return;
  }
  const cliente = state.clientesList.find(c => c.id === clienteId);
  if (!cliente) {
    await ctx.reply('Cliente não encontrado.');
    return;
  }
  state.lembreteData.clienteId = cliente.id;
  state.lembreteData.clienteNome = cliente.nome_empresa;
  state.step = 'confirmar';
  await dbService.saveUserState(telegramId, state);
  await confirmarLembrete(ctx, telegramId, state);
});

bot.action('lembrete_confirmar', async (ctx) => {
  await ctx.answerCbQuery('Processando...');
  const telegramId = ctx.from.id;
  const state = userStates[telegramId];
  if (!state || !state.lembreteData) {
    await ctx.reply('Erro: Dados do lembrete não encontrados.');
    return;
  }
  try {
    await dbService.adicionarLembrete(telegramId, state.lembreteData);
    await ctx.reply(
      `✅ Lembrete agendado para ${state.lembreteData.data.split('-').reverse().join('/')} às ${state.lembreteData.horario}!`
    );
    await resetUserState(ctx, telegramId);
  } catch (error) {
    console.error('Erro ao salvar lembrete:', error);
    await ctx.reply('Erro ao salvar lembrete.');
  }
});

bot.action('lembrete_cancelar', async (ctx) => {
  await ctx.answerCbQuery('Cancelado');
  await resetUserState(ctx, ctx.from.id);
  await ctx.reply('❌ Criação de lembrete cancelada.');
});

// Callbacks para /criarrota
bot.action('rota_pronto', async (ctx) => {
  await ctx.answerCbQuery();
  const telegramId = ctx.from.id;
  const state = userStates[telegramId];
  if (!state || state.currentCommand !== 'criarrota') {
    await ctx.reply('Sessão expirada. Use /criarrota para continuar.');
    return;
  }
  await gerarRota(ctx, telegramId, state);
});

bot.action('rota_cancelar', async (ctx) => {
  await ctx.answerCbQuery();
  await resetUserState(ctx, ctx.from.id);
  await ctx.reply('✅ Operação de criação de rota cancelada.');
});

// 5. Handler de Texto
bot.on('text', async (ctx) => {
  const telegramId = ctx.from.id;
  const messageText = ctx.message.text.toLowerCase();
  if (!userStates[telegramId]) return;

  const state = userStates[telegramId];

  if (messageText === 'cancelar') {
    await resetUserState(ctx, telegramId);
    return;
  }

  switch (state.currentCommand) {
    case 'clientes':
      await handleClientesText(ctx, telegramId, state, ctx.message.text);
      break;
    case 'agenda':
      await handleAgendaText(ctx, telegramId, state, ctx.message.text);
      break;
    case 'followup':
      await handleFollowupText(ctx, telegramId, state, ctx.message.text);
      break;
    case 'lembrete':
      await handleLembreteText(ctx, telegramId, state, ctx.message.text);
      break;
    case 'visita':
      await handleVisitaText(ctx, telegramId, state, ctx.message.text);
      break;
    case 'buscapotencial':
      await handleBuscaPotencialText(ctx, telegramId, state, ctx.message.text);
      break;
    case 'criarrota':
      await handleRotaText(ctx, telegramId, state, ctx.message.text);
      break;
    default:
      await ctx.reply('Use /help para ver os comandos disponíveis.');
  }
});

// 6. Funções Auxiliares
// Reseta o estado do usuário
async function resetUserState(ctx, telegramId) {
  userStates[telegramId] = { currentCommand: null };
  await dbService.saveUserState(telegramId, userStates[telegramId]);
  await ctx.reply(
    `✖️ Operação cancelada!\n\nUse /help para ver os comandos disponíveis.`,
    {
      reply_markup: {
        keyboard: [['/help', '/start']],
        resize_keyboard: true,
        one_time_keyboard: true,
      },
    }
  );
}

// Processa texto para /clientes
async function handleClientesText(ctx, telegramId, state, messageText) {
  if (state.subcommand === 'adicionar') {
    switch (state.step) {
      case 'nome_empresa':
        state.clienteData.nomeEmpresa = messageText;
        state.step = 'cnpj';
        await ctx.reply('Digite o CNPJ da empresa (apenas números):');
        break;
      case 'cnpj':
        state.clienteData.cnpj = messageText;
        state.step = 'nome_contato';
        await ctx.reply('Digite o nome do contato:');
        break;
      case 'nome_contato':
        state.clienteData.nomeContato = messageText;
        state.step = 'telefone_contato';
        await ctx.reply('Digite o telefone do contato:');
        break;
      case 'telefone_contato':
        state.clienteData.telefoneContato = messageText;
        state.step = 'email_contato';
        await ctx.reply('Digite o email do contato:');
        break;
      case 'email_contato':
        state.clienteData.emailContato = messageText;
        state.step = 'confirmar';
        await ctx.reply(
          `*Confirme os dados:*\n\n` +
          `*Empresa:* ${state.clienteData.nomeEmpresa}\n` +
          `*CNPJ:* ${state.clienteData.cnpj}\n` +
          `*Contato:* ${state.clienteData.nomeContato}\n` +
          `*Telefone:* ${state.clienteData.telefoneContato}\n` +
          `*Email:* ${state.clienteData.emailContato}\n\nEstá correto?`,
          {
            parse_mode: 'Markdown',
            reply_markup: {
              inline_keyboard: [
                [
                  { text: '✅ Confirmar', callback_data: 'cliente_confirmar' },
                  { text: '❌ Cancelar', callback_data: 'cliente_cancelar' },
                ],
              ],
            },
          }
        );
        break;
    }
    await dbService.saveUserState(telegramId, state);
  } else if (state.subcommand === 'buscar' && state.step === 'termo_busca') {
    try {
      const clientes = await dbService.buscarCliente(telegramId, messageText);
      if (!clientes.length) {
        await ctx.reply(`Nenhum cliente encontrado com "${messageText}".`);
        return;
      }
      const clienteButtons = clientes.map(cliente => [{ text: cliente.nome_empresa, callback_data: `cliente_ver_${cliente.id}` }]);
      await ctx.reply(`Encontrados ${clientes.length} clientes com "${messageText}":`, {
        reply_markup: { inline_keyboard: clienteButtons },
      });
    } catch (error) {
      console.error('Erro ao buscar clientes:', error);
      await ctx.reply('Erro ao buscar clientes.');
    }
  } else if (state.subcommand === 'editar' && state.step === 'editar_campo') {
    try {
      const propriedade = campoParaProperty(state.campoAtual);
      state.clienteData[propriedade] = messageText;
      await dbService.atualizarCliente(telegramId, state.clienteId, state.clienteData);
      await ctx.reply(`✅ Campo atualizado com sucesso!`);
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
              { text: '🗑️ Excluir', callback_data: `cliente_excluir_${cliente.id}` },
            ],
            [{ text: '↩️ Voltar', callback_data: 'cliente_voltar' }],
          ],
        },
      });
    } catch (error) {
      console.error('Erro ao atualizar cliente:', error);
      await ctx.reply('Erro ao atualizar cliente.');
    }
  }
}

// Processa texto para /agenda
async function handleAgendaText(ctx, telegramId, state, messageText) {
  if (state.subcommand === 'novo') {
    switch (state.step) {
      case 'data':
        if (!/^\d{2}\/\d{2}\/\d{4}$/.test(messageText)) {
          await ctx.reply('Use o formato DD/MM/AAAA. Exemplo: 25/12/2023');
          return;
        }
        const partes = messageText.split('/');
        state.compromissoData.data = `${partes[2]}-${partes[1]}-${partes[0]}`;
        state.step = 'horario';
        await ctx.reply('Digite o horário (HH:MM):');
        break;
      case 'horario':
        if (!/^\d{2}:\d{2}$/.test(messageText)) {
          await ctx.reply('Use o formato HH:MM. Exemplo: 14:30');
          return;
        }
        state.compromissoData.horario = messageText;
        state.step = 'descricao';
        await ctx.reply('Digite a descrição ou assunto:');
        break;
      case 'descricao':
        state.compromissoData.descricao = messageText;
        state.step = 'vincular_cliente';
        await ctx.reply('Vincular a um cliente?', {
          reply_markup: {
            inline_keyboard: [
              [
                { text: '✅ Sim', callback_data: 'agenda_vincular_sim' },
                { text: '❌ Não', callback_data: 'agenda_vincular_nao' },
              ],
            ],
          },
        });
        break;
    }
    await dbService.saveUserState(telegramId, state);
  } else if (state.subcommand === 'ver' && state.step === 'informar_data') {
    if (!/^\d{2}\/\d{2}\/\d{4}$/.test(messageText)) {
      await ctx.reply('Use o formato DD/MM/AAAA. Exemplo: 25/12/2023');
      return;
    }
    const partes = messageText.split('/');
    const dataSql = `${partes[2]}-${partes[1]}-${partes[0]}`;
    await mostrarCompromissosData(ctx, telegramId, dataSql);
  }
}

// Processa texto para /followup
async function handleFollowupText(ctx, telegramId, state, messageText) {
  if (state.subcommand === 'novo') {
    switch (state.step) {
      case 'data':
        if (!/^\d{2}\/\d{2}\/\d{4}$/.test(messageText)) {
          await ctx.reply('Use o formato DD/MM/AAAA. Exemplo: 25/12/2023');
          return;
        }
        const partes = messageText.split('/');
        state.followUpData.data = `${partes[2]}-${partes[1]}-${partes[0]}`;
        state.step = 'horario';
        await ctx.reply('Digite o horário (HH:MM):');
        break;
      case 'horario':
        if (!/^\d{2}:\d{2}$/.test(messageText)) {
          await ctx.reply('Use o formato HH:MM. Exemplo: 14:30');
          return;
        }
        state.followUpData.horario = messageText;
        state.step = 'motivo';
        await ctx.reply('Digite o motivo ou descrição:');
        break;
      case 'motivo':
        state.followUpData.motivo = messageText;
        state.step = 'observacao';
        await ctx.reply('Adicionar observação? Digite ou envie "pular" para continuar.');
        break;
      case 'observacao':
        state.followUpData.observacao = messageText.toLowerCase() === 'pular' ? null : messageText;
        state.step = 'confirmar';
        let mensagem =
          `*Confirme os dados do Follow-up:*\n\n` +
          `*Cliente:* ${state.followUpData.clienteNome || 'Sem Empresa'}\n` +
          `*Data:* ${state.followUpData.data.split('-').reverse().join('/')}\n` +
          `*Horário:* ${state.followUpData.horario}\n` +
          `*Motivo:* ${state.followUpData.motivo}\n`;
        if (state.followUpData.observacao) mensagem += `*Observação:* ${state.followUpData.observacao}\n`;
        mensagem += `\nEstá correto?`;
        await ctx.reply(mensagem, {
          parse_mode: 'Markdown',
          reply_markup: {
            inline_keyboard: [
              [
                { text: '✅ Confirmar', callback_data: 'followup_confirmar' },
                { text: '❌ Cancelar', callback_data: 'followup_cancelar' },
              ],
            ],
          },
        });
        break;
    }
    await dbService.saveUserState(telegramId, state);
  }
}

// Processa texto para /lembrete
async function handleLembreteText(ctx, telegramId, state, messageText) {
  if (state.subcommand === 'novo') {
    switch (state.step) {
      case 'data':
        if (!/^\d{2}\/\d{2}\/\d{4}$/.test(messageText)) {
          await ctx.reply('Use o formato DD/MM/AAAA. Exemplo: 25/12/2023');
          return;
        }
        const partes = messageText.split('/');
        state.lembreteData.data = `${partes[2]}-${partes[1]}-${partes[0]}`;
        state.step = 'horario';
        await ctx.reply('Digite o horário (HH:MM):');
        break;
      case 'horario':
        if (!/^\d{2}:\d{2}$/.test(messageText)) {
          await ctx.reply('Use o formato HH:MM. Exemplo: 14:30');
          return;
        }
        state.lembreteData.horario = messageText;
        state.step = 'texto';
        await ctx.reply('Digite o texto do lembrete:');
        break;
      case 'texto':
        state.lembreteData.texto = messageText;
        state.step = 'vincular_cliente';
        await ctx.reply('Vincular a um cliente?', {
          reply_markup: {
            inline_keyboard: [
              [
                { text: '✅ Sim', callback_data: 'lembrete_vincular_sim' },
                { text: '❌ Não', callback_data: 'lembrete_vincular_nao' },
              ],
            ],
          },
        });
        break;
    }
    await dbService.saveUserState(telegramId, state);
  }
}

// Processa texto para /visita (a ser implementado)
async function handleVisitaText(ctx, telegramId, state, messageText) {
  await ctx.reply('Funcionalidade de registrar visitas em desenvolvimento.');
}

// Processa texto para /buscapotencial
async function handleBuscaPotencialText(ctx, telegramId, state, messageText) {
  switch (state.step) {
    case 'tipo_empresa':
      state.buscaData = { tipo: messageText };
      state.step = 'localizacao';
      await ctx.reply('Qual a localização? (cidade, bairro ou endereço)');
      break;
    case 'localizacao':
      state.buscaData.localizacao = messageText;
      state.step = 'quantidade';
      await ctx.reply('Quantos resultados deseja receber? (1 a 10)');
      break;
    case 'quantidade':
      const quantidade = parseInt(messageText);
      if (isNaN(quantidade) || quantidade < 1 || quantidade > 10) {
        await ctx.reply('Digite um número entre 1 e 10.');
        return;
      }
      state.buscaData.quantidade = quantidade;
      state.step = 'processando';
      await ctx.reply('🔍 Buscando potenciais clientes...');
      try {
        const query = encodeURIComponent(`${state.buscaData.tipo} em ${state.buscaData.localizacao}`);
        const url = `https://maps.googleapis.com/maps/api/place/textsearch/json?query=${query}&key=${process.env.GOOGLE_PLACES_API_KEY}&language=pt-BR`;
        const response = await axios.get(url);
        if (response.data.status !== 'OK') throw new Error(response.data.error_message || 'Erro na API');
        const results = response.data.results.slice(0, quantidade);
        if (!results.length) {
          await ctx.reply(`Nenhum resultado para "${state.buscaData.tipo}" em "${state.buscaData.localizacao}".`);
          await resetUserState(ctx, telegramId);
          return;
        }
        let message = `🏢 *Potenciais clientes encontrados:*\n\n`;
        results.forEach((place, index) => {
          message += `*${index + 1}. ${place.name}*\n📍 ${place.formatted_address || 'Sem endereço'}\n`;
          if (place.rating) message += `⭐ ${place.rating}/5 (${place.user_ratings_total || 0} avaliações)\n`;
          message += '\n';
        });
        await ctx.reply(message, { parse_mode: 'Markdown' });
        const buttons = results.map((place, index) => [
          { text: `Salvar: ${place.name.substring(0, 30)}`, callback_data: `potential_save_${index}` },
        ]);
        state.potentialResults = results;
        await dbService.saveUserState(telegramId, state);
        await ctx.reply('Salvar algum como cliente?', { reply_markup: { inline_keyboard: buttons } });
      } catch (error) {
        console.error('Erro na busca de potenciais:', error);
        await ctx.reply('Erro ao buscar potenciais clientes.');
        await resetUserState(ctx, telegramId);
      }
      break;
  }
  await dbService.saveUserState(telegramId, state);
}

// Processa texto para /criarrota
async function handleRotaText(ctx, telegramId, state, messageText) {
  if (messageText.toUpperCase() === 'CANCELAR') {
    await resetUserState(ctx, telegramId);
    return;
  }
  switch (state.step) {
    case 'definir_ponto_partida':
      const [nomePartida, ...enderecoPartida] = messageText.split(',');
      if (!nomePartida || !enderecoPartida.length) {
        await ctx.reply('Use: *Nome, Endereço*. Exemplo: *Escritório, Av. Principal, 100*', { parse_mode: 'Markdown' });
        return;
      }
      state.rotaData.partida = { nome: nomePartida.trim(), endereco: enderecoPartida.join(',').trim() };
      state.step = 'definir_ponto_final';
      await ctx.reply(
        `✅ Ponto de partida: *${nomePartida.trim()}*\n\nDigite o ponto final (Nome, Endereço):`,
        { parse_mode: 'Markdown' }
      );
      break;
    case 'definir_ponto_final':
      const [nomeDestino, ...enderecoDestino] = messageText.split(',');
      if (!nomeDestino || !enderecoDestino.length) {
        await ctx.reply('Use: *Nome, Endereço*. Exemplo: *Cliente, Rua Secundária, 200*', { parse_mode: 'Markdown' });
        return;
      }
      state.rotaData.destino = { nome: nomeDestino.trim(), endereco: enderecoDestino.join(',').trim() };
      state.rotaData.paradas = [
        { nome: state.rotaData.partida.nome, endereco: state.rotaData.partida.endereco, tipo: 'partida' },
        { nome: state.rotaData.destino.nome, endereco: state.rotaData.destino.endereco, tipo: 'destino' },
      ];
      state.step = 'adicionar_paradas';
      await ctx.reply(
        `✅ Ponto final: *${nomeDestino.trim()}*\n\nAdicione paradas intermediárias (Nome, Endereço), uma por linha.\n` +
        `Exemplo:\n*Cliente XYZ, Rua Exemplo, 123*\n\nDigite *PRONTO* quando terminar.`,
        {
          parse_mode: 'Markdown',
          reply_markup: {
            inline_keyboard: [
              [{ text: '✅ PRONTO', callback_data: 'rota_pronto' }],
              [{ text: '❌ CANCELAR', callback_data: 'rota_cancelar' }],
            ],
          },
        }
      );
      break;
    case 'adicionar_paradas':
      if (messageText.toUpperCase() === 'PRONTO') {
        await gerarRota(ctx, telegramId, state);
        return;
      }
      const linhas = messageText.split('\n').filter(linha => linha.trim());
      for (const linha of linhas) {
        const [nome, ...endereco] = linha.split(',');
        if (!nome || !endereco.length) {
          await ctx.reply(`Erro na linha: "${linha}"\nUse: *Nome, Endereço*`, { parse_mode: 'Markdown' });
          continue;
        }
        state.rotaData.paradas.push({ nome: nome.trim(), endereco: endereco.join(',').trim(), tipo: 'intermediaria' });
        await ctx.reply(`✅ Adicionada parada: *${nome.trim()}*`, {
          parse_mode: 'Markdown',
          reply_markup: {
            inline_keyboard: [
              [{ text: '✅ PRONTO', callback_data: 'rota_pronto' }],
              [{ text: '❌ CANCELAR', callback_data: 'rota_cancelar' }],
            ],
          },
        });
      }
      break;
  }
  await dbService.saveUserState(telegramId, state);
}

// Gera a rota otimizada
async function gerarRota(ctx, telegramId, state) {
  try {
    if (!state.rotaData.partida || !state.rotaData.destino) {
      await ctx.reply('Erro: Pontos de partida ou destino não definidos.');
      return;
    }
    await ctx.reply('🔄 Gerando rota otimizada...');
    const origem = encodeURIComponent(state.rotaData.partida.endereco);
    const destino = encodeURIComponent(state.rotaData.destino.endereco);
    const waypoints = state.rotaData.paradas
      .filter(parada => parada.tipo === 'intermediaria')
      .map(parada => encodeURIComponent(parada.endereco));
    let mapsUrl = `https://www.google.com/maps/dir/?api=1&origin=${origem}&destination=${destino}`;
    if (waypoints.length) mapsUrl += `&waypoints=${waypoints.join('|')}`;
    mapsUrl += '&travelmode=driving&dir_action=navigate&optimize=true';
    const totalParadas = waypoints.length + 2;
    await ctx.reply(
      `🗺️ *Rota Pronta!*\n\n` +
      `*Partida:* ${state.rotaData.partida.nome}\n` +
      `*Destino:* ${state.rotaData.destino.nome}\n` +
      `*Paradas intermediárias:* ${waypoints.length}\n` +
      `*Total de pontos:* ${totalParadas}\n\nClique no link para abrir no Google Maps:`,
      { parse_mode: 'Markdown' }
    );
    await ctx.reply(mapsUrl);
    await resetUserState(ctx, telegramId);
  } catch (error) {
    console.error('Erro ao gerar rota:', error);
    await ctx.reply('Erro ao gerar rota. Verifique os endereços.');
  }
}

// Confirma compromisso
async function confirmarCompromisso(ctx, telegramId, state) {
  const dataFormatada = state.compromissoData.data.split('-').reverse().join('/');
  let mensagem =
    `*Confirme os dados:*\n\n` +
    `*Data:* ${dataFormatada}\n` +
    `*Horário:* ${state.compromissoData.horario}\n` +
    `*Descrição:* ${state.compromissoData.descricao}\n` +
    `*Cliente:* ${state.compromissoData.clienteNome || 'Não vinculado'}\n\nEstá correto?`;
  await ctx.reply(mensagem, {
    parse_mode: 'Markdown',
    reply_markup: {
      inline_keyboard: [
        [
          { text: '✅ Confirmar', callback_data: 'agenda_confirmar' },
          { text: '❌ Cancelar', callback_data: 'agenda_cancelar' },
        ],
      ],
    },
  });
}

// Confirma lembrete
async function confirmarLembrete(ctx, telegramId, state) {
  const dataFormatada = state.lembreteData.data.split('-').reverse().join('/');
  let mensagem =
    `*Confirme os dados:*\n\n` +
    `*Data:* ${dataFormatada}\n` +
    `*Horário:* ${state.lembreteData.horario}\n` +
    `*Texto:* ${state.lembreteData.texto}\n` +
    `*Cliente:* ${state.lembreteData.clienteNome || 'Não vinculado'}\n\nEstá correto?`;
  await ctx.reply(mensagem, {
    parse_mode: 'Markdown',
    reply_markup: {
      inline_keyboard: [
        [
          { text: '✅ Confirmar', callback_data: 'lembrete_confirmar' },
          { text: '❌ Cancelar', callback_data: 'lembrete_cancelar' },
        ],
      ],
    },
  });
}

// Mostra compromissos de uma data
async function mostrarCompromissosData(ctx, telegramId, data) {
  try {
    const compromissos = await dbService.listarCompromissos(telegramId, data);
    if (!compromissos.length) {
      const dataFormatada = data.split('-').reverse().join('/');
      await ctx.reply(`Sem compromissos para ${dataFormatada}.`);
      await resetUserState(ctx, telegramId);
      return;
    }
    const dataFormatada = data.split('-').reverse().join('/');
    let mensagem = `📅 *Compromissos para ${dataFormatada}:*\n\n`;
    compromissos.sort((a, b) => a.horario.localeCompare(b.horario));
    compromissos.forEach((compromisso, index) => {
      mensagem += `⏰ *${compromisso.horario}* - ${compromisso.descricao}\n`;
      if (compromisso.cliente_id && compromisso.clientes) mensagem += `🏢 Cliente: ${compromisso.clientes.nome_empresa}\n`;
      if (index < compromissos.length - 1) mensagem += `\n------------------\n\n`;
    });
    await ctx.reply(mensagem, { parse_mode: 'Markdown' });
    await resetUserState(ctx, telegramId);
  } catch (error) {
    console.error('Erro ao listar compromissos:', error);
    await ctx.reply('Erro ao buscar compromissos.');
  }
}

// Mapeia campos para propriedades
function campoParaProperty(campo) {
  const mapeamento = {
    nome_empresa: 'nomeEmpresa',
    cnpj: 'cnpj',
    nome_contato: 'nomeContato',
    telefone_contato: 'telefoneContato',
    email_contato: 'emailContato',
  };
  return mapeamento[campo] || campo;
}

// Exporta o bot
export default bot;