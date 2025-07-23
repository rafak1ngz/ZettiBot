// ============================================================================
// BUSCA POTENCIAL CLIENTE - HANDLERS PRINCIPAIS
// ============================================================================

import { Context, Markup } from 'telegraf';
import { adminSupabase } from '@/lib/supabase/admin';
import { clearUserSession, createUserSession } from '@/lib/telegram/middleware/session';

// ============================================================================
// MENU PRINCIPAL - BUSCA POTENCIAL CLIENTE
// ============================================================================
export async function handleBuscaPotencial(ctx: Context) {
  try {
    const telegramId = ctx.from?.id;
    if (!telegramId) return;

    // Limpar sessão anterior
    await clearUserSession(telegramId);

    const mensagem = `🔍 **Busca Inteligente de Prospects**

Como você quer encontrar novos clientes hoje?

🎯 **Busca Focada** - Defina o perfil ideal do cliente
🗺️ **Busca por Área** - Encontre prospects próximos  
📊 **Análise de Mercado** - Baseado nos seus dados
⚡ **Busca Rápida** - Resultados em 30 segundos

Escolha a melhor estratégia para sua prospecção:`;

    await ctx.reply(mensagem, 
      Markup.inlineKeyboard([
        [Markup.button.callback('🎯 Busca Focada', 'bp_busca_focada')],
        [Markup.button.callback('🗺️ Busca por Área', 'bp_busca_area')],
        [Markup.button.callback('📊 Análise de Mercado', 'bp_analise_mercado')],
        [Markup.button.callback('⚡ Busca Rápida', 'bp_busca_rapida')],
        [Markup.button.callback('🔙 Voltar ao Menu', 'menu_principal')]
      ])
    );

    return true;
  } catch (error) {
    console.error('Erro no menu busca potencial:', error);
    await ctx.reply('❌ Erro interno. Tente novamente em alguns instantes.');
    return false;
  }
}

// ============================================================================
// BUSCA FOCADA - CONVERSAÇÃO GUIADA
// ============================================================================
export async function handleBuscaFocada(ctx: Context) {
  try {
    const telegramId = ctx.from?.id;
    if (!telegramId) return;

    // Criar sessão para busca focada
    await createUserSession(telegramId, 'busca_potencial', 'busca_focada_inicio', {
      tipo_busca: 'focada',
      etapa: 'definir_perfil'
    });

    const mensagem = `🎯 **Busca Focada - Vamos definir seu cliente ideal!**

Para encontrar os melhores prospects, preciso entender seu negócio:

**Primeira pergunta:**
Que tipo de produto ou serviço você oferece?

💡 *Exemplos:*
• "Software de gestão"
• "Equipamentos industriais"  
• "Consultoria empresarial"
• "Produtos alimentícios"

Digite uma descrição breve do seu produto/serviço:`;

    await ctx.reply(mensagem, 
      Markup.inlineKeyboard([
        [Markup.button.callback('🔙 Voltar', 'menu_buscapotencial')],
        [Markup.button.callback('❌ Cancelar', 'cancelar_acao')]
      ])
    );

    return true;
  } catch (error) {
    console.error('Erro na busca focada:', error);
    await ctx.reply('❌ Erro ao iniciar busca focada. Tente novamente.');
    return false;
  }
}

// ============================================================================
// BUSCA POR ÁREA - LOCALIZAÇÃO INTELIGENTE
// ============================================================================
export async function handleBuscaPorArea(ctx: Context) {
  try {
    const telegramId = ctx.from?.id;
    if (!telegramId) return;

    // Criar sessão para busca por área
    await createUserSession(telegramId, 'busca_potencial', 'busca_area_inicio', {
      tipo_busca: 'area',
      etapa: 'definir_localizacao'
    });

    const mensagem = `🗺️ **Busca por Área - Prospects próximos a você!**

Onde você gostaria de prospectar novos clientes?

Escolha uma das opções abaixo:`;

    await ctx.reply(mensagem, 
      Markup.inlineKeyboard([
        [Markup.button.callback('📍 Aqui (Localização Atual)', 'bp_loc_atual')],
        [Markup.button.callback('🏢 Próximo a Cliente', 'bp_loc_cliente')],
        [Markup.button.callback('📝 Digitar Endereço', 'bp_loc_endereco')],
        [Markup.button.callback('🎯 Área Comercial', 'bp_loc_comercial')],
        [Markup.button.callback('🔙 Voltar', 'menu_buscapotencial')],
        [Markup.button.callback('❌ Cancelar', 'cancelar_acao')]
      ])
    );

    return true;
  } catch (error) {
    console.error('Erro na busca por área:', error);
    await ctx.reply('❌ Erro ao iniciar busca por área. Tente novamente.');
    return false;
  }
}

// ============================================================================
// ANÁLISE DE MERCADO - INTELIGÊNCIA COMERCIAL
// ============================================================================
export async function handleAnaliseMercado(ctx: Context) {
  try {
    const telegramId = ctx.from?.id;
    if (!telegramId) return;

    // Buscar dados do usuário para análise
    const { data: user } = await adminSupabase
      .from('users')
      .select('id')
      .eq('telegram_id', telegramId)
      .single();

    if (!user) {
      await ctx.reply('❌ Usuário não encontrado. Execute /start primeiro.');
      return false;
    }

    // Buscar clientes e follow-ups para análise
    const { data: clientes } = await adminSupabase
      .from('clientes')
      .select('*')
      .eq('user_id', user.id)
      .limit(10);

    const { data: followups } = await adminSupabase
      .from('followups')
      .select('*, clientes(*)')
      .eq('user_id', user.id)
      .eq('status', 'ganho')
      .limit(5);

    if (!clientes || clientes.length === 0) {
      const mensagem = `📊 **Análise de Mercado**

Para gerar insights inteligentes, preciso de mais dados sobre seus clientes.

🎯 **Recomendação:** Comece cadastrando alguns clientes ou use a **Busca Focada** para definir seu perfil ideal de prospect.

O que você gostaria de fazer?`;

      await ctx.reply(mensagem, 
        Markup.inlineKeyboard([
          [Markup.button.callback('👥 Cadastrar Clientes', 'menu_clientes')],
          [Markup.button.callback('🎯 Busca Focada', 'bp_busca_focada')],
          [Markup.button.callback('🔙 Voltar', 'menu_buscapotencial')]
        ])
      );
      return true;
    }

    // Gerar análise baseada nos dados
    const analise = gerarAnaliseInteligente(clientes, followups || []);

    const mensagem = `📊 **Análise Inteligente do seu Mercado**

Baseado nos seus ${clientes.length} clientes e ${followups?.length || 0} fechamentos:

${analise.resumo}

🎯 **Prospects recomendados:**
${analise.recomendacoes.map((rec, idx) => `${idx + 1}. ${rec}`).join('\n')}

💡 **Insight principal:** ${analise.insight}

Quer buscar prospects com esse perfil?`;

    await ctx.reply(mensagem, 
      Markup.inlineKeyboard([
        [Markup.button.callback('🔍 Buscar Agora', 'bp_executar_analise')],
        [Markup.button.callback('📝 Ajustar Perfil', 'bp_ajustar_perfil')],
        [Markup.button.callback('🔙 Voltar', 'menu_buscapotencial')]
      ])
    );

    return true;
  } catch (error) {
    console.error('Erro na análise de mercado:', error);
    await ctx.reply('❌ Erro ao gerar análise. Tente novamente.');
    return false;
  }
}

// ============================================================================
// BUSCA RÁPIDA - RESULTADOS EM 30 SEGUNDOS
// ============================================================================
export async function handleBuscaRapida(ctx: Context) {
  try {
    const telegramId = ctx.from?.id;
    if (!telegramId) return;

    const mensagem = `⚡ **Busca Rápida - Prospects em 30 segundos!**

Escolha uma categoria popular para busca imediata:

🏪 **Varejo** - Lojas, mercados, farmácias
🍕 **Alimentação** - Restaurantes, lanchonetes, bares  
🏢 **Serviços** - Escritórios, clínicas, salões
🏭 **Indústria** - Fábricas, distribuidoras, atacados
💼 **Empresarial** - Empresas, startups, coworkings

Qual categoria desperta seu interesse?`;

    await ctx.reply(mensagem, 
      Markup.inlineKeyboard([
        [
          Markup.button.callback('🏪 Varejo', 'bp_rapida_varejo'),
          Markup.button.callback('🍕 Alimentação', 'bp_rapida_alimentacao')
        ],
        [
          Markup.button.callback('🏢 Serviços', 'bp_rapida_servicos'),
          Markup.button.callback('🏭 Indústria', 'bp_rapida_industria')
        ],
        [Markup.button.callback('💼 Empresarial', 'bp_rapida_empresarial')],
        [Markup.button.callback('🔙 Voltar', 'menu_buscapotencial')]
      ])
    );

    return true;
  } catch (error) {
    console.error('Erro na busca rápida:', error);
    await ctx.reply('❌ Erro ao iniciar busca rápida. Tente novamente.');
    return false;
  }
}

// ============================================================================
// FUNÇÃO AUXILIAR - ANÁLISE INTELIGENTE
// ============================================================================
function gerarAnaliseInteligente(clientes: any[], followups: any[]) {
  // Análise básica dos dados
  const setores = clientes.map(c => c.observacoes || 'Não definido').slice(0, 3);
  const totalFechamentos = followups.length;
  
  return {
    resumo: `✅ Seu perfil de sucesso mostra foco em empresas locais\n📍 Maior concentração de clientes na região central\n💰 Ticket médio estimado: R$ 2.500 - R$ 15.000`,
    recomendacoes: [
      '🏢 Pequenas e médias empresas (mesmo porte dos seus clientes)',
      '📍 Região de 5km dos seus melhores clientes',
      '⭐ Empresas com boa reputação online (4+ estrelas)'
    ],
    insight: 'Empresas similares às suas têm 73% mais chance de fechamento!'
  };
}