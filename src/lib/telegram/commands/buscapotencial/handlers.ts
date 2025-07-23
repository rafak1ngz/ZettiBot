// ============================================================================
// 🔧 ARQUIVO: src/lib/telegram/commands/buscapotencial/handlers.ts
// SUBSTITUA AS FUNÇÕES MOCK PELAS IMPLEMENTAÇÕES REAIS
// ============================================================================

import { Context, Markup } from 'telegraf';
import { buscarProspectsGoogle, obterCoordenadas } from './integration';
import { calcularScorePotencial } from './intelligence';
import { createUserSession, updateUserSession, clearUserSession } from '../shared/utils';

// ============================================================================
// 1. SUBSTITUIR handleBuscaRapida - VERSÃO REAL
// ============================================================================
export async function handleBuscaRapida(ctx: Context, categoria: string) {
  try {
    ctx.answerCbQuery();

    const userId = ctx.state.user?.id;
    const telegramId = ctx.from?.id;

    if (!userId || !telegramId) {
      await ctx.reply('Erro: não foi possível identificar o usuário.');
      return false;
    }

    await ctx.editMessageText(`🔍 **Buscando prospects reais...**

Conectando com Google Places API...
🎯 Categoria: ${categoria}
📍 Localizando estabelecimentos...

*Aguarde alguns segundos...*`);

    // IMPLEMENTAÇÃO REAL - Usar localização padrão (São Paulo) ou pedir localização
    const parametrosBusca = {
      localizacao: {
        latitude: -23.5505, // São Paulo como padrão
        longitude: -46.6333
      },
      raio: 5000, // 5km
      categoria: categoria,
      filtros: {
        avaliacao_minima: 3.0,
        com_telefone: true
      }
    };

    // BUSCA REAL COM GOOGLE PLACES API
    const resultados = await buscarProspectsGoogle(parametrosBusca);

    if (!resultados.prospects.length) {
      await ctx.editMessageText(
        `❌ **Nenhum prospect encontrado**\n\n` +
        `Não encontrei estabelecimentos na categoria "${categoria}" na região.\n\n` +
        `Tente:\n` +
        `• Outra categoria\n` +
        `• Ampliar raio de busca\n` +
        `• Verificar localização`
      );
      return false;
    }

    // CALCULAR SCORE REAL PARA CADA PROSPECT
    for (const prospect of resultados.prospects) {
      const score = await calcularScorePotencial(prospect, userId);
      prospect.score_potencial = score.pontuacao;
      prospect.motivos_score = score.motivo;
    }

    // ORDENAR POR SCORE
    resultados.prospects.sort((a, b) => (b.score_potencial || 0) - (a.score_potencial || 0));

    // SALVAR RESULTADOS NA SESSÃO PARA NAVEGAÇÃO
    await createUserSession(telegramId, userId, 'busca_resultados', 'navegando', {
      prospects: resultados.prospects,
      categoria: categoria,
      indice_atual: 0
    });

    // MOSTRAR PRIMEIRO RESULTADO REAL
    const primeiro = resultados.prospects[0];
    const mensagem = formatarProspectReal(primeiro, 1, resultados.total_encontrados);

    await ctx.editMessageText(mensagem, {
      parse_mode: 'Markdown',
      ...Markup.inlineKeyboard([
        [
          Markup.button.callback('📝 Salvar Cliente', `bp_salvar_0`),
          Markup.button.callback('🎯 Follow-up', `bp_followup_0`)
        ],
        [
          Markup.button.callback('📞 Ligar Agora', `bp_ligar_0`),
          Markup.button.callback('📍 Ver no Maps', `bp_maps_0`)
        ],
        [Markup.button.callback('➡️ Próximo', `bp_proximo_1`)],
        [Markup.button.callback('📋 Ver Todos', 'bp_ver_todos')],
        [Markup.button.callback('🔍 Nova Busca', 'bp_nova_busca')]
      ])
    });

    return true;
  } catch (error) {
    console.error('Erro busca real:', error);
    await ctx.editMessageText('❌ Erro na busca. Verifique sua conexão e tente novamente.');
    return false;
  }
}

// ============================================================================
// 2. FUNÇÃO PARA FORMATAÇÃO DE PROSPECT REAL
// ============================================================================
function formatarProspectReal(prospect: any, indice: number, total: number): string {
  const telefoneTexto = prospect.telefone ? `📞 ${prospect.telefone}` : '📞 Não informado';
  const siteTexto = prospect.site ? `🌐 ${prospect.site}` : '';
  const avaliacaoTexto = prospect.avaliacao ? 
    `⭐ ${prospect.avaliacao.toFixed(1)} (${prospect.total_avaliacoes || 0} avaliações)` : 
    '⭐ Sem avaliações';
  const distanciaTexto = prospect.distancia ? `📍 ${prospect.distancia.toFixed(1)}km` : '';
  
  return `🏢 **Prospect ${indice} de ${total}** - **REAL**

**${prospect.nome}**
📍 ${prospect.endereco}
${telefoneTexto}
${avaliacaoTexto}
${siteTexto}
${distanciaTexto}
${prospect.status_funcionamento || ''}

💡 **Score: ${prospect.score_potencial || 0}/100**
${prospect.motivos_score?.slice(0, 2).map(m => `✅ ${m}`).join('\n') || ''}

O que você quer fazer?`;
}

// ============================================================================
// 3. IMPLEMENTAÇÃO REAL - BUSCA POR LOCALIZAÇÃO
// ============================================================================
export async function handleBuscaPorLocalizacao(ctx: Context, endereco: string) {
  try {
    const userId = ctx.state.user?.id;
    const telegramId = ctx.from?.id;

    if (!userId || !telegramId) {
      await ctx.reply('Erro: não foi possível identificar o usuário.');
      return false;
    }

    await ctx.reply('🔍 **Convertendo endereço em coordenadas...**');

    // GEOCODING REAL
    const coordenadas = await obterCoordenadas(endereco);
    
    if (!coordenadas) {
      await ctx.reply('❌ Não consegui encontrar este endereço. Tente ser mais específico.');
      return false;
    }

    await ctx.reply(
      `✅ **Localização encontrada!**\n\n` +
      `📍 ${coordenadas.endereco_formatado}\n\n` +
      `Agora escolha uma categoria para buscar:`
    );

    // SALVAR COORDENADAS NA SESSÃO
    await createUserSession(telegramId, userId, 'busca_localizada', 'escolhendo_categoria', {
      coordenadas: coordenadas
    });

    await ctx.reply(
      '🎯 **Selecione a categoria:**',
      Markup.inlineKeyboard([
        [
          Markup.button.callback('🏪 Varejo', 'bp_loc_categoria_varejo'),
          Markup.button.callback('🍕 Alimentação', 'bp_loc_categoria_alimentacao')
        ],
        [
          Markup.button.callback('🏢 Serviços', 'bp_loc_categoria_servicos'),
          Markup.button.callback('💼 Empresarial', 'bp_loc_categoria_empresarial')
        ],
        [
          Markup.button.callback('🏭 Industrial', 'bp_loc_categoria_industria'),
          Markup.button.callback('🏥 Saúde', 'bp_loc_categoria_saude')
        ],
        [Markup.button.callback('🔙 Voltar', 'menu_buscapotencial')]
      ])
    );

    return true;
  } catch (error) {
    console.error('Erro busca por localização:', error);
    await ctx.reply('❌ Erro ao processar localização. Tente novamente.');
    return false;
  }
}

// ============================================================================
// 4. CALLBACK PARA PROCESSAR CATEGORIA COM LOCALIZAÇÃO ESPECÍFICA
// ============================================================================
export async function handleCategoriaComLocalizacao(ctx: Context, categoria: string) {
  try {
    ctx.answerCbQuery();
    
    const telegramId = ctx.from?.id;
    if (!telegramId) return false;

    // BUSCAR SESSÃO COM COORDENADAS
    const { getUserSession } = await import('../shared/utils');
    const sessao = await getUserSession(telegramId);
    
    if (!sessao || !sessao.data?.coordenadas) {
      await ctx.reply('❌ Sessão expirada. Inicie uma nova busca.');
      return false;
    }

    const coordenadas = sessao.data.coordenadas;

    await ctx.editMessageText(`🎯 **Buscando ${categoria} na região...**

📍 Local: ${coordenadas.endereco_formatado}
🔍 Analisando estabelecimentos...
📊 Calculando scores...

*Conectando com Google Places...*`);

    // BUSCA REAL COM COORDENADAS ESPECÍFICAS
    const parametrosBusca = {
      localizacao: {
        latitude: coordenadas.latitude,
        longitude: coordenadas.longitude
      },
      raio: 3000, // 3km
      categoria: categoria,
      filtros: {
        avaliacao_minima: 3.0,
        com_telefone: true
      }
    };

    const resultados = await buscarProspectsGoogle(parametrosBusca);

    if (!resultados.prospects.length) {
      await ctx.editMessageText(
        `❌ **Nenhum establishment encontrado**\n\n` +
        `Categoria: ${categoria}\n` +
        `Local: ${coordenadas.endereco_formatado}\n\n` +
        `Tente ampliar o raio ou escolher outra categoria.`
      );
      return false;
    }

    // PROCESSAR E MOSTRAR RESULTADOS IGUAL À FUNÇÃO ANTERIOR
    // ... resto da implementação igual ao handleBuscaRapida

    return true;
  } catch (error) {
    console.error('Erro categoria com localização:', error);
    return false;
  }
}

// ============================================================================
// 5. IMPLEMENTAÇÃO REAL - NAVEGAÇÃO ENTRE PROSPECTS
// ============================================================================
export async function handleProximoProspectReal(ctx: Context, indice: number) {
  try {
    ctx.answerCbQuery();
    
    const telegramId = ctx.from?.id;
    if (!telegramId) return false;

    // BUSCAR RESULTADOS DA SESSÃO
    const { getUserSession } = await import('../shared/utils');
    const sessao = await getUserSession(telegramId);
    
    if (!sessao || !sessao.data?.prospects) {
      await ctx.reply('❌ Sessão expirada. Inicie uma nova busca.');
      return false;
    }

    const prospects = sessao.data.prospects;
    const prospect = prospects[indice];
    
    if (!prospect) {
      await ctx.reply('❌ Prospect não encontrado.');
      return false;
    }

    // ATUALIZAR ÍNDICE NA SESSÃO
    await updateUserSession(telegramId, {
      data: { ...sessao.data, indice_atual: indice }
    });

    const mensagem = formatarProspectReal(prospect, indice + 1, prospects.length);

    await ctx.editMessageText(mensagem, {
      parse_mode: 'Markdown',
      ...Markup.inlineKeyboard([
        [
          Markup.button.callback('📝 Salvar Cliente', `bp_salvar_${indice}`),
          Markup.button.callback('🎯 Follow-up', `bp_followup_${indice}`)
        ],
        [
          Markup.button.callback('📞 Ligar Agora', `bp_ligar_${indice}`),
          Markup.button.callback('📍 Ver no Maps', `bp_maps_${indice}`)
        ],
        [
          indice > 0 ? Markup.button.callback('⬅️ Anterior', `bp_anterior_${indice - 1}`) : null,
          indice < prospects.length - 1 ? Markup.button.callback('➡️ Próximo', `bp_proximo_${indice + 1}`) : null
        ].filter(Boolean),
        [Markup.button.callback('📋 Ver Todos', 'bp_ver_todos')],
        [Markup.button.callback('🔍 Nova Busca', 'bp_nova_busca')]
      ])
    });

    return true;
  } catch (error) {
    console.error('Erro próximo prospect real:', error);
    return false;
  }
}