// ============================================================================
// BUSCA POTENCIAL CLIENTE - CALLBACKS DOS BOTÕES
// ============================================================================

import { Context, Markup, Telegraf } from 'telegraf';
import { adminSupabase } from '@/lib/supabase/admin';
import { updateUserSession, createUserSession } from '@/lib/telegram/middleware/session';
import { 
  handleBuscaFocada, 
  handleBuscaPorArea, 
  handleAnaliseMercado, 
  handleBuscaRapida 
} from './handlers';

// ============================================================================
// REGISTRO DE TODOS OS CALLBACKS
// ============================================================================
export const registerBuscaPotencialCallbacks = (bot: Telegraf) => {
  
  // Navegação principal
  bot.action('bp_busca_focada', handleCallbackBuscaFocada);
  bot.action('bp_busca_area', handleCallbackBuscaArea);
  bot.action('bp_analise_mercado', handleCallbackAnaliseMercado);
  bot.action('bp_busca_rapida', handleCallbackBuscaRapida);
  
  // Busca por área - opções de localização
  bot.action('bp_loc_atual', handleLocalizacaoAtual);
  bot.action('bp_loc_cliente', handleLocalizacaoCliente);
  bot.action('bp_loc_endereco', handleLocalizacaoEndereco);
  bot.action('bp_loc_comercial', handleLocalizacaoComercial);
  
  // Busca rápida - categorias
  bot.action('bp_rapida_varejo', handleBuscaRapidaVarejo);
  bot.action('bp_rapida_alimentacao', handleBuscaRapidaAlimentacao);
  bot.action('bp_rapida_servicos', handleBuscaRapidaServicos);
  bot.action('bp_rapida_industria', handleBuscaRapidaIndustria);
  bot.action('bp_rapida_empresarial', handleBuscaRapidaEmpresarial);
  
  // Análise de mercado
  bot.action('bp_executar_analise', handleExecutarAnalise);
  bot.action('bp_ajustar_perfil', handleAjustarPerfil);
  
  // Ações com prospects
  bot.action(/^bp_salvar_(\d+)$/, handleSalvarProspect);
  bot.action(/^bp_followup_(\d+)$/, handleCriarFollowupProspect);
  bot.action(/^bp_detalhes_(\d+)$/, handleVerDetalhesProspect);
  bot.action(/^bp_ligar_(\d+)$/, handleLigarProspect);
  
  // Navegação entre resultados
  bot.action(/^bp_proximo_(\d+)$/, handleProximoProspect);
  bot.action(/^bp_anterior_(\d+)$/, handleAnteriorProspect);
  bot.action('bp_ver_todos', handleVerTodosProspects);
  bot.action('bp_nova_busca', handleNovaBusca);
  
  // Voltar ao menu
  bot.action('menu_buscapotencial', async (ctx) => {
    ctx.answerCbQuery();
    const { handleBuscaPotencial } = await import('./handlers');
    return handleBuscaPotencial(ctx);
  });
};

// ============================================================================
// CALLBACKS PRINCIPAIS
// ============================================================================

async function handleCallbackBuscaFocada(ctx: Context) {
  try {
    ctx.answerCbQuery();
    return await handleBuscaFocada(ctx);
  } catch (error) {
    console.error('Erro callback busca focada:', error);
    return false;
  }
}

async function handleCallbackBuscaArea(ctx: Context) {
  try {
    ctx.answerCbQuery();
    return await handleBuscaPorArea(ctx);
  } catch (error) {
    console.error('Erro callback busca por área:', error);
    return false;
  }
}

async function handleCallbackAnaliseMercado(ctx: Context) {
  try {
    ctx.answerCbQuery();
    return await handleAnaliseMercado(ctx);
  } catch (error) {
    console.error('Erro callback análise mercado:', error);
    return false;
  }
}

async function handleCallbackBuscaRapida(ctx: Context) {
  try {
    ctx.answerCbQuery();
    return await handleBuscaRapida(ctx);
  } catch (error) {
    console.error('Erro callback busca rápida:', error);
    return false;
  }
}

// ============================================================================
// CALLBACKS - LOCALIZAÇÃO
// ============================================================================

async function handleLocalizacaoAtual(ctx: Context) {
  try {
    ctx.answerCbQuery();
    
    const mensagem = `📍 **Localização Atual**

Para buscar prospects próximos a você, preciso da sua localização.

Você pode:
• Usar o botão abaixo para compartilhar localização
• Ou digitar seu CEP/endereço atual

Como prefere prosseguir?`;

    await ctx.editMessageText(mensagem, 
      Markup.inlineKeyboard([
        [Markup.button.callback('📱 Compartilhar Localização', 'bp_compartilhar_loc')],
        [Markup.button.callback('📝 Digitar CEP/Endereço', 'bp_digitar_endereco')],
        [Markup.button.callback('🔙 Voltar', 'bp_busca_area')]
      ])
    );

    return true;
  } catch (error) {
    console.error('Erro localização atual:', error);
    return false;
  }
}

async function handleLocalizacaoCliente(ctx: Context) {
  try {
    ctx.answerCbQuery();
    const telegramId = ctx.from?.id;
    if (!telegramId) return false;

    // Buscar clientes do usuário
    const { data: user } = await adminSupabase
      .from('users')
      .select('id')
      .eq('telegram_id', telegramId)
      .single();

    if (!user) return false;

    const { data: clientes } = await adminSupabase
      .from('clientes')
      .select('id, nome_empresa')
      .eq('user_id', user.id)
      .limit(10);

    if (!clientes || clientes.length === 0) {
      await ctx.editMessageText(`🏢 **Próximo a Cliente**

Você ainda não tem clientes cadastrados.

Escolha uma das opções:`, 
        Markup.inlineKeyboard([
          [Markup.button.callback('👥 Cadastrar Cliente', 'menu_clientes')],
          [Markup.button.callback('📍 Usar Localização Atual', 'bp_loc_atual')],
          [Markup.button.callback('🔙 Voltar', 'bp_busca_area')]
        ])
      );
      return true;
    }

    // Mostrar lista de clientes
    const mensagem = `🏢 **Buscar próximo a qual cliente?**

Selecione um dos seus clientes abaixo:`;

    const botoes = clientes.slice(0, 8).map(cliente => 
      [Markup.button.callback(
        `${cliente.nome_empresa}`, 
        `bp_cliente_${cliente.id}`
      )]
    );

    botoes.push([Markup.button.callback('🔙 Voltar', 'bp_busca_area')]);

    await ctx.editMessageText(mensagem, Markup.inlineKeyboard(botoes));
    return true;

  } catch (error) {
    console.error('Erro localização cliente:', error);
    return false;
  }
}

async function handleLocalizacaoEndereco(ctx: Context) {
  try {
    ctx.answerCbQuery();
    const telegramId = ctx.from?.id;
    if (!telegramId) return false;

    // Atualizar sessão
    await updateUserSession(telegramId, 'busca_area_endereco', {
      etapa: 'aguardando_endereco'
    });

    const mensagem = `📝 **Digitar Endereço**

Digite o endereço ou CEP onde você quer prospectar:

💡 *Exemplos:*
• "Rua Augusta, 123 - São Paulo"
• "01310-100"
• "Centro, Campinas"
• "Av. Paulista, São Paulo"

Digite o local onde quer buscar prospects:`;

    await ctx.editMessageText(mensagem, 
      Markup.inlineKeyboard([
        [Markup.button.callback('🔙 Voltar', 'bp_busca_area')],
        [Markup.button.callback('❌ Cancelar', 'cancelar_acao')]
      ])
    );

    return true;
  } catch (error) {
    console.error('Erro localização endereço:', error);
    return false;
  }
}

async function handleLocalizacaoComercial(ctx: Context) {
  try {
    ctx.answerCbQuery();

    const mensagem = `🎯 **Áreas Comerciais Populares**

Escolha uma região comercial conhecida:

🏙️ **Centros Urbanos** - Downtown, centro histórico
🛍️ **Shoppings** - Proximidade a grandes centros comerciais  
🏢 **Distritos Empresariais** - Zona empresarial, business center
🏭 **Zonas Industriais** - Distritos industriais, galpões
🎓 **Universitárias** - Próximo a universidades e faculdades

Qual tipo de área comercial te interessa?`;

    await ctx.editMessageText(mensagem, 
      Markup.inlineKeyboard([
        [Markup.button.callback('🏙️ Centro Urbano', 'bp_comercial_centro')],
        [Markup.button.callback('🛍️ Shopping/Varejo', 'bp_comercial_shopping')],
        [Markup.button.callback('🏢 Empresarial', 'bp_comercial_empresarial')],
        [Markup.button.callback('🏭 Industrial', 'bp_comercial_industrial')],
        [Markup.button.callback('🎓 Universitária', 'bp_comercial_universitaria')],
        [Markup.button.callback('🔙 Voltar', 'bp_busca_area')]
      ])
    );

    return true;
  } catch (error) {
    console.error('Erro localização comercial:', error);
    return false;
  }
}

// ============================================================================
// CALLBACKS - BUSCA RÁPIDA POR CATEGORIA
// ============================================================================

async function handleBuscaRapidaVarejo(ctx: Context) {
  return executarBuscaRapida(ctx, 'varejo', '🏪', [
    'store', 'supermarket', 'pharmacy', 'clothing_store', 'electronics_store'
  ]);
}

async function handleBuscaRapidaAlimentacao(ctx: Context) {
  return executarBuscaRapida(ctx, 'alimentacao', '🍕', [
    'restaurant', 'meal_takeaway', 'cafe', 'bakery', 'bar'
  ]);
}

async function handleBuscaRapidaServicos(ctx: Context) {
  return executarBuscaRapida(ctx, 'servicos', '🏢', [
    'dentist', 'beauty_salon', 'lawyer', 'accounting', 'real_estate_agency'
  ]);
}

async function handleBuscaRapidaIndustria(ctx: Context) {
  return executarBuscaRapida(ctx, 'industria', '🏭', [
    'storage', 'moving_company', 'car_repair', 'plumber', 'electrician'
  ]);
}

async function handleBuscaRapidaEmpresarial(ctx: Context) {
  return executarBuscaRapida(ctx, 'empresarial', '💼', [
    'establishment', 'point_of_interest', 'finance', 'insurance_agency'
  ]);
}

// ============================================================================
// FUNÇÃO AUXILIAR - EXECUTAR BUSCA RÁPIDA
// ============================================================================
async function executarBuscaRapida(ctx: Context, categoria: string, emoji: string, tipos: string[]) {
  try {
    ctx.answerCbQuery();

    await ctx.editMessageText(`${emoji} **Buscando prospects em ${categoria}...**

🔍 Analisando estabelecimentos na sua região...
📊 Aplicando filtros de qualidade...
⭐ Calculando score de potencial...

*Aguarde alguns segundos...*`);

    // Simular busca (será implementada com Google Places API)
    await new Promise(resolve => setTimeout(resolve, 3000));

    // Mock de resultados para demonstração
    const prospects = gerarMockProspects(categoria, emoji);

    const mensagem = `${emoji} **${prospects.length} prospects encontrados em ${categoria}!**

Aqui está o primeiro resultado:

${formatarProspectParaDisplay(prospects[0])}

O que você gostaria de fazer?`;

    await ctx.editMessageText(mensagem, 
      Markup.inlineKeyboard([
        [
          Markup.button.callback('📝 Salvar Cliente', `bp_salvar_0`),
          Markup.button.callback('🎯 Follow-up', `bp_followup_0`)
        ],
        [
          Markup.button.callback('📞 Ligar Agora', `bp_ligar_0`),
          Markup.button.callback('📍 Ver no Maps', `bp_maps_0`)
        ],
        [Markup.button.callback('➡️ Próximo Prospect', `bp_proximo_1`)],
        [Markup.button.callback('📋 Ver Todos', 'bp_ver_todos')],
        [Markup.button.callback('🔍 Nova Busca', 'bp_nova_busca')]
      ])
    );

    return true;
  } catch (error) {
    console.error('Erro busca rápida:', error);
    await ctx.editMessageText('❌ Erro na busca. Tente novamente.');
    return false;
  }
}

// ============================================================================
// FUNÇÕES AUXILIARES - MOCK DATA
// ============================================================================
function gerarMockProspects(categoria: string, emoji: string) {
  const prospects = [
    {
      nome: `Empresa Exemplo ${categoria}`,
      endereco: 'Rua das Flores, 123 - Centro',
      telefone: '(11) 98765-4321',
      avaliacao: 4.5,
      total_avaliacoes: 127,
      distancia: '1.2km',
      horario: 'Aberto até 18h',
      site: 'www.empresa.com.br',
      score: 94,
      motivos: ['Mesmo segmento dos seus tops', 'Localização estratégica', 'Boa reputação']
    }
  ];
  return prospects;
}

function formatarProspectParaDisplay(prospect: any) {
  return `🏢 **${prospect.nome}**
📍 ${prospect.endereco} (${prospect.distancia})
📞 ${prospect.telefone}
⭐ ${prospect.avaliacao} estrelas (${prospect.total_avaliacoes} avaliações)
🌐 ${prospect.site}
⏰ ${prospect.horario}

💡 **Score: ${prospect.score}/100** - ${prospect.motivos[0]}`;
}

// Callbacks placeholder (serão implementados posteriormente)
async function handleExecutarAnalise(ctx: Context) { ctx.answerCbQuery(); }
async function handleAjustarPerfil(ctx: Context) { ctx.answerCbQuery(); }
async function handleSalvarProspect(ctx: Context) { ctx.answerCbQuery(); }
async function handleCriarFollowupProspect(ctx: Context) { ctx.answerCbQuery(); }
async function handleVerDetalhesProspect(ctx: Context) { ctx.answerCbQuery(); }
async function handleLigarProspect(ctx: Context) { ctx.answerCbQuery(); }
async function handleProximoProspect(ctx: Context) { ctx.answerCbQuery(); }
async function handleAnteriorProspect(ctx: Context) { ctx.answerCbQuery(); }
async function handleVerTodosProspects(ctx: Context) { ctx.answerCbQuery(); }
async function handleNovaBusca(ctx: Context) { ctx.answerCbQuery(); }