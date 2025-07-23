// ============================================================================
// BUSCA POTENCIAL CLIENTE - SISTEMA DE CONVERSAÇÃO - CORRIGIDO
// ============================================================================

import { Context, Markup } from 'telegraf';
import { adminSupabase } from '@/lib/supabase';
import { updateUserSession, createUserSession, clearUserSession } from '@/lib/telegram/commands/shared/utils';
import { 
  validarLocalizacao, 
  validarRaio, 
  validarProdutoServico, 
  validarTicketMedio,
  formatarErroValidacao 
} from '../../commands/buscapotencial/validation';

// ============================================================================
// PROCESSOR PRINCIPAL
// ============================================================================
export async function processBuscaPotencialConversation(
  ctx: Context, 
  session: any
): Promise<boolean> {
  try {
    const step = session.step;
    const data = session.data || {};

    switch (step) {
      // ========================================================================
      // BUSCA FOCADA - FLUXO
      // ========================================================================
      case 'busca_focada_inicio':
        return await processBuscaFocadaProduto(ctx, session);
      
      case 'busca_focada_ticket':
        return await processBuscaFocadaTicket(ctx, session);
      
      case 'busca_focada_tipo_negocio':
        return await processBuscaFocadaTipoNegocio(ctx, session);
      
      case 'busca_focada_regiao':
        return await processBuscaFocadaRegiao(ctx, session);
      
      case 'busca_focada_quantidade':
        return await processBuscaFocadaQuantidade(ctx, session);

      // ========================================================================
      // BUSCA POR ÁREA - FLUXO
      // ========================================================================
      case 'busca_area_endereco':
        return await processBuscaAreaEndereco(ctx, session);
      
      case 'busca_area_raio':
        return await processBuscaAreaRaio(ctx, session);
      
      case 'busca_area_categoria':
        return await processBuscaAreaCategoria(ctx, session);
      
      case 'busca_area_filtros':
        return await processBuscaAreaFiltros(ctx, session);

      // ========================================================================
      // FLUXOS DIVERSOS
      // ========================================================================
      case 'aguardando_endereco':
        return await processEnderecoDigitado(ctx, session);

      default:
        console.log(`Step não reconhecido: ${step}`);
        return false;
    }
  } catch (error) {
    console.error('Erro no processor busca potencial:', error);
    await ctx.reply('❌ Erro interno. Tente novamente.');
    return false;
  }
}

// ============================================================================
// BUSCA FOCADA - PROCESSORS
// ============================================================================

async function processBuscaFocadaProduto(ctx: Context, session: any): Promise<boolean> {
  try {
    if (!ctx.message || !('text' in ctx.message)) return false;
    
    const texto = ctx.message.text;
    const validacao = validarProdutoServico(texto);

    if (!validacao.valido) {
      await ctx.reply(formatarErroValidacao('Produto/Serviço', validacao.erro!));
      return true;
    }

    // Atualizar sessão com produto
    const telegramId = ctx.from?.id;
    if (!telegramId) return false;

    await updateUserSession(telegramId, {
      step: 'busca_focada_ticket',
      data: {
        ...session.data,
        produto_servico: validacao.produto_limpo,
        categoria_sugerida: validacao.categoria_sugerida
      }
    });

    const mensagem = `✅ **Produto/Serviço:** ${validacao.produto_limpo}
${validacao.categoria_sugerida ? `💡 **Categoria sugerida:** ${validacao.categoria_sugerida}` : ''}

**Segunda pergunta:**
Qual é o ticket médio (valor) das suas vendas?

💡 *Isso me ajuda a encontrar prospects com perfil econômico similar*

*Exemplos:*
• "R$ 500"
• "1.200"  
• "Entre 2 mil e 5 mil"

Digite o valor médio das suas vendas:`;

    await ctx.reply(mensagem, 
      Markup.inlineKeyboard([
        [
          Markup.button.callback('💰 Até R$ 500', 'bp_ticket_baixo'),
          Markup.button.callback('💰 R$ 500-2K', 'bp_ticket_medio')
        ],
        [
          Markup.button.callback('💰 R$ 2K-10K', 'bp_ticket_alto'),
          Markup.button.callback('💰 +R$ 10K', 'bp_ticket_premium')
        ],
        [Markup.button.callback('🔙 Voltar', 'menu_buscapotencial')]
      ])
    );

    return true;
  } catch (error) {
    console.error('Erro processar produto busca focada:', error);
    return false;
  }
}

async function processBuscaFocadaTicket(ctx: Context, session: any): Promise<boolean> {
  try {
    if (!ctx.message || !('text' in ctx.message)) return false;
    
    const texto = ctx.message.text;
    const validacao = validarTicketMedio(texto);

    if (!validacao.valido) {
      await ctx.reply(formatarErroValidacao('Ticket Médio', validacao.erro!));
      return true;
    }

    const telegramId = ctx.from?.id;
    if (!telegramId) return false;

    await updateUserSession(telegramId, {
      step: 'busca_focada_tipo_negocio',
      data: {
        ...session.data,
        ticket_medio: validacao.valor,
        faixa_ticket: validacao.faixa
      }
    });

    const mensagem = `✅ **Ticket médio:** R$ ${validacao.valor?.toLocaleString('pt-BR')}
💡 **Faixa:** ${validacao.faixa}

**Terceira pergunta:**
Você trabalha com B2B (vendas para empresas) ou B2C (vendas para consumidores)?

🏢 **B2B** - Vendo para outras empresas
👤 **B2C** - Vendo para pessoas físicas
🔄 **Ambos** - Trabalho com os dois públicos

Escolha seu tipo de negócio:`;

    await ctx.reply(mensagem, 
      Markup.inlineKeyboard([
        [Markup.button.callback('🏢 B2B (Empresas)', 'bp_tipo_b2b')],
        [Markup.button.callback('👤 B2C (Consumidores)', 'bp_tipo_b2c')],
        [Markup.button.callback('🔄 Ambos', 'bp_tipo_ambos')],
        [Markup.button.callback('🔙 Voltar', 'menu_buscapotencial')]
      ])
    );

    return true;
  } catch (error) {
    console.error('Erro processar ticket busca focada:', error);
    return false;
  }
}

async function processBuscaFocadaTipoNegocio(ctx: Context, session: any): Promise<boolean> {
  // Este será processado via callback, não via texto
  return true;
}

async function processBuscaFocadaRegiao(ctx: Context, session: any): Promise<boolean> {
  try {
    if (!ctx.message || !('text' in ctx.message)) return false;
    
    const texto = ctx.message.text;
    const validacao = validarLocalizacao(texto);

    if (!validacao.valido) {
      await ctx.reply(formatarErroValidacao('Região', validacao.erro!));
      return true;
    }

    const telegramId = ctx.from?.id;
    if (!telegramId) return false;

    await updateUserSession(telegramId, {
      step: 'busca_focada_quantidade',
      data: {
        ...session.data,
        regiao: validacao.endereco,
        cep: validacao.cep
      }
    });

    const mensagem = `✅ **Região:** ${validacao.endereco}

**Última pergunta:**
Quantos prospects você quer ver?

🔥 **Top 10** - Os mais promissores (análise rápida)
📋 **Lista 25** - Boa variedade para escolher  
📊 **Relatório 50+** - Estudo completo do mercado

Qual quantidade prefere?`;

    await ctx.reply(mensagem, 
      Markup.inlineKeyboard([
        [Markup.button.callback('🔥 Top 10', 'bp_qtd_10')],
        [Markup.button.callback('📋 Lista 25', 'bp_qtd_25')],
        [Markup.button.callback('📊 Relatório 50+', 'bp_qtd_50')],
        [Markup.button.callback('🔙 Voltar', 'menu_buscapotencial')]
      ])
    );

    return true;
  } catch (error) {
    console.error('Erro processar região busca focada:', error);
    return false;
  }
}

async function processBuscaFocadaQuantidade(ctx: Context, session: any): Promise<boolean> {
  // Este será processado via callback
  return true;
}

// ============================================================================
// BUSCA POR ÁREA - PROCESSORS
// ============================================================================

async function processBuscaAreaEndereco(ctx: Context, session: any): Promise<boolean> {
  try {
    if (!ctx.message || !('text' in ctx.message)) return false;
    
    const texto = ctx.message.text;
    const validacao = validarLocalizacao(texto);

    if (!validacao.valido) {
      await ctx.reply(formatarErroValidacao('Endereço', validacao.erro!));
      return true;
    }

    const telegramId = ctx.from?.id;
    if (!telegramId) return false;

    await updateUserSession(telegramId, {
      step: 'busca_area_raio',
      data: {
        ...session.data,
        endereco: validacao.endereco,
        cep: validacao.cep
      }
    });

    const mensagem = `✅ **Local definido:** ${validacao.endereco}

Agora, qual o raio de busca?

🎯 **500m** - Vizinhança imediata
🎯 **1km** - Caminhada de 10 minutos  
🎯 **3km** - Distância de bicicleta
🎯 **5km** - Região próxima de carro
🎯 **10km** - Área metropolitana

Ou digite um valor personalizado (ex: "2km", "7000m"):`;

    await ctx.reply(mensagem, 
      Markup.inlineKeyboard([
        [
          Markup.button.callback('📍 500m', 'bp_raio_500'),
          Markup.button.callback('📍 1km', 'bp_raio_1000')
        ],
        [
          Markup.button.callback('📍 3km', 'bp_raio_3000'),
          Markup.button.callback('📍 5km', 'bp_raio_5000')
        ],
        [Markup.button.callback('📍 10km', 'bp_raio_10000')],
        [Markup.button.callback('🔙 Voltar', 'menu_buscapotencial')]
      ])
    );

    return true;
  } catch (error) {
    console.error('Erro processar endereço busca área:', error);
    return false;
  }
}

async function processBuscaAreaRaio(ctx: Context, session: any): Promise<boolean> {
  try {
    if (!ctx.message || !('text' in ctx.message)) return false;
    
    const texto = ctx.message.text;
    const validacao = validarRaio(texto);

    if (!validacao.valido) {
      await ctx.reply(formatarErroValidacao('Raio', validacao.erro!));
      return true;
    }

    const telegramId = ctx.from?.id;
    if (!telegramId) return false;

    await updateUserSession(telegramId, {
      step: 'busca_area_categoria',
      data: {
        ...session.data,
        raio: validacao.raio
      }
    });

    const raioKm = validacao.raio! >= 1000 ? 
      `${(validacao.raio! / 1000).toFixed(1)}km` : 
      `${validacao.raio}m`;

    const mensagem = `✅ **Raio definido:** ${raioKm}

Que tipo de estabelecimento você quer encontrar?

🏪 **Varejo** - Lojas, mercados, farmácias
🍕 **Alimentação** - Restaurantes, bares, cafeterias
🏢 **Serviços** - Escritórios, clínicas, salões
🏭 **Indústria** - Fábricas, distribuidores
💼 **Empresarial** - Empresas, startups
🏥 **Saúde** - Clínicas, consultórios
🎓 **Educação** - Escolas, cursos

Escolha uma categoria:`;

    await ctx.reply(mensagem, 
      Markup.inlineKeyboard([
        [
          Markup.button.callback('🏪 Varejo', 'bp_cat_varejo'),
          Markup.button.callback('🍕 Alimentação', 'bp_cat_alimentacao')
        ],
        [
          Markup.button.callback('🏢 Serviços', 'bp_cat_servicos'),
          Markup.button.callback('🏭 Indústria', 'bp_cat_industria')
        ],
        [
          Markup.button.callback('💼 Empresarial', 'bp_cat_empresarial'),
          Markup.button.callback('🏥 Saúde', 'bp_cat_saude')
        ],
        [Markup.button.callback('🎓 Educação', 'bp_cat_educacao')],
        [Markup.button.callback('🔙 Voltar', 'menu_buscapotencial')]
      ])
    );

    return true;
  } catch (error) {
    console.error('Erro processar raio busca área:', error);
    return false;
  }
}

async function processBuscaAreaCategoria(ctx: Context, session: any): Promise<boolean> {
  // Este será processado via callback
  return true;
}

async function processBuscaAreaFiltros(ctx: Context, session: any): Promise<boolean> {
  // Este será processado via callback
  return true;
}

// ============================================================================
// PROCESSORS GERAIS
// ============================================================================

async function processEnderecoDigitado(ctx: Context, session: any): Promise<boolean> {
  try {
    if (!ctx.message || !('text' in ctx.message)) return false;
    
    const texto = ctx.message.text;
    const validacao = validarLocalizacao(texto);

    if (!validacao.valido) {
      await ctx.reply(formatarErroValidacao('Endereço', validacao.erro!));
      return true;
    }

    // Continuar fluxo baseado no contexto
    const telegramId = ctx.from?.id;
    if (!telegramId) return false;

    await updateUserSession(telegramId, {
      step: 'busca_area_raio',
      data: {
        ...session.data,
        endereco: validacao.endereco,
        cep: validacao.cep,
        origem: 'endereco_digitado'
      }
    });

    // Redirecionar para próximo step
    return await processBuscaAreaEndereco(ctx, {
      ...session,
      data: {
        ...session.data,
        endereco: validacao.endereco
      }
    });

  } catch (error) {
    console.error('Erro processar endereço digitado:', error);
    return false;
  }
}

// ============================================================================
// FUNÇÃO AUXILIAR - FINALIZAR BUSCA
// ============================================================================
export async function executarBuscaFinal(
  ctx: Context, 
  parametros: any
): Promise<boolean> {
  try {
    const telegramId = ctx.from?.id;
    if (!telegramId) return false;

    // Simular busca (será implementada integração real)
    await ctx.reply(`🔍 **Executando busca inteligente...**

📊 Analisando ${parametros.tipo_busca} na região...
🎯 Aplicando seus critérios personalizados...
⭐ Calculando score de potencial...

*Aguarde alguns segundos...*`);

    // Limpar sessão
    await clearUserSession(telegramId);

    // Simular tempo de busca
    await new Promise(resolve => setTimeout(resolve, 3000));

    // Mock de resultados
    const resultados = gerarResultadosMock(parametros);

    const mensagem = `🎉 **${resultados.total} prospects encontrados!**

Aqui está o primeiro resultado:

${formatarPrimeiroResultado(resultados.prospects[0])}

O que você gostaria de fazer?`;

    await ctx.reply(mensagem, 
      Markup.inlineKeyboard([
        [
          Markup.button.callback('📝 Salvar Cliente', 'bp_salvar_0'),
          Markup.button.callback('🎯 Follow-up', 'bp_followup_0')
        ],
        [
          Markup.button.callback('📞 Ligar Agora', 'bp_ligar_0'),
          Markup.button.callback('📍 Ver no Maps', 'bp_maps_0')
        ],
        [Markup.button.callback('➡️ Próximo', 'bp_proximo_1')],
        [Markup.button.callback('📋 Ver Todos', 'bp_ver_todos')],
        [Markup.button.callback('🔍 Nova Busca', 'bp_nova_busca')]
      ])
    );

    return true;
  } catch (error) {
    console.error('Erro executar busca final:', error);
    return false;
  }
}

// ============================================================================
// FUNÇÕES AUXILIARES - MOCK
// ============================================================================
function gerarResultadosMock(parametros: any) {
  return {
    total: 15,
    prospects: [
      {
        nome: 'Empresa Exemplo Ltda',
        endereco: 'Rua das Flores, 123 - Centro',
        telefone: '(11) 98765-4321',
        avaliacao: 4.5,
        total_avaliacoes: 127,
        distancia: '1.2km',
        score: 94,
        motivos: ['Mesmo segmento', 'Localização ótima', 'Boa reputação']
      }
    ]
  };
}

function formatarPrimeiroResultado(prospect: any): string {
  return `🏢 **${prospect.nome}**
📍 ${prospect.endereco} (${prospect.distancia})
📞 ${prospect.telefone}
⭐ ${prospect.avaliacao} estrelas (${prospect.total_avaliacoes} avaliações)

💡 **Score: ${prospect.score}/100**
✅ ${prospect.motivos[0]}`;
}