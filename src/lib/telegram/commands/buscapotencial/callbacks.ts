// ============================================================================
// BUSCA POTENCIAL CLIENTE - CALLBACKS DOS BOTÕES - VERSÃO FINAL CORRIGIDA
// ============================================================================

import { Context, Markup, Telegraf } from 'telegraf';
import { adminSupabase } from '@/lib/supabase';
import { updateUserSession, createUserSession, clearUserSession } from '@/lib/telegram/commands/shared/utils';
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
    await updateUserSession(telegramId, {
      step: 'busca_area_endereco',
      data: {
        etapa: 'aguardando_endereco'
      }
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

// ============================================================================
// CALLBACKS IMPLEMENTADOS - BÁSICOS
// ============================================================================

async function handleExecutarAnalise(ctx: Context) {
  try {
    ctx.answerCbQuery();
    
    await ctx.editMessageText(`📊 **Executando análise inteligente...**

🔍 Buscando prospects baseado no seu perfil...
🎯 Aplicando inteligência de padrões...
📈 Calculando scores de potencial...

*Aguarde alguns segundos...*`);

    // Simular busca baseada em análise
    await new Promise(resolve => setTimeout(resolve, 4000));

    // Mock de resultados analíticos
    const mensagem = `🎉 **15 prospects analíticos encontrados!**

**Baseado na sua análise:**
• 8 prospects **ALTA compatibilidade** (85%+ match)
• 5 prospects **MÉDIA compatibilidade** (70%+ match)  
• 2 prospects **oportunidades especiais** (novos na região)

**Primeiro resultado - Score 94/100:**

🏢 **TechSolutions Ltda**
📍 Rua da Consolação, 1245 - Centro (2.3km)
📞 (11) 3456-7890
⭐ 4.7 estrelas (89 avaliações)
🌐 www.techsolutions.com.br

💡 **Por que é ideal:**
✅ Mesmo segmento dos seus 3 melhores clientes
✅ Ticket estimado: R$ 8.500 (dentro do seu perfil)
✅ Região com 90% de taxa de fechamento

O que você quer fazer?`;

    await ctx.editMessageText(mensagem, 
      Markup.inlineKeyboard([
        [
          Markup.button.callback('📝 Salvar Cliente', 'bp_salvar_0'),
          Markup.button.callback('🎯 Criar Follow-up', 'bp_followup_0')
        ],
        [
          Markup.button.callback('📞 Ligar Agora', 'bp_ligar_0'),
          Markup.button.callback('📍 Ver Localização', 'bp_maps_0')
        ],
        [Markup.button.callback('➡️ Ver Próximo', 'bp_proximo_1')],
        [Markup.button.callback('📊 Relatório Completo', 'bp_relatorio_analise')],
        [Markup.button.callback('🔍 Nova Busca', 'bp_nova_busca')]
      ])
    );

    return true;
  } catch (error) {
    console.error('Erro executar análise:', error);
    return false;
  }
}

async function handleAjustarPerfil(ctx: Context) {
  try {
    ctx.answerCbQuery();
    
    const mensagem = `🎯 **Ajustar Perfil de Busca**

Quer refinar os parâmetros da análise?

📊 **Seus dados atuais:**
• Categoria principal: Empresarial (70% dos clientes)
• Ticket médio: R$ 6.800
• Região preferida: Centro/Vila Nova
• Taxa de sucesso: 68%

**O que você quer ajustar?**`;

    await ctx.editMessageText(mensagem, 
      Markup.inlineKeyboard([
        [Markup.button.callback('🎯 Mudar Categoria', 'bp_ajustar_categoria')],
        [Markup.button.callback('💰 Ajustar Ticket', 'bp_ajustar_ticket')],
        [Markup.button.callback('📍 Mudar Região', 'bp_ajustar_regiao')],
        [Markup.button.callback('🔄 Recalcular Tudo', 'bp_recalcular_perfil')],
        [Markup.button.callback('🚀 Usar Perfil Atual', 'bp_executar_analise')],
        [Markup.button.callback('🔙 Voltar', 'menu_buscapotencial')]
      ])
    );

    return true;
  } catch (error) {
    console.error('Erro ajustar perfil:', error);
    return false;
  }
}

// ============================================================================
// CALLBACKS CORRIGIDOS - AÇÕES COM PROSPECTS
// ============================================================================

async function handleSalvarProspect(ctx: Context) {
  try {
    ctx.answerCbQuery();
    
    // CORREÇÃO: Extrair ID do prospect do callback data
    const callbackData = ctx.callbackQuery && 'data' in ctx.callbackQuery ? ctx.callbackQuery.data : '';
    const match = callbackData.match(/^bp_salvar_(\d+)$/);
    const prospectId = match ? parseInt(match[1]) : 0;

    const telegramId = ctx.from?.id;
    const userId = ctx.state.user?.id;

    if (!telegramId || !userId) {
      await ctx.reply('Erro: não foi possível identificar o usuário.');
      return false;
    }

    const mensagem = `📝 **Salvar como Cliente**

Vou salvar este prospect na sua base de clientes:

**TechSolutions Ltda**
📞 (11) 3456-7890
📍 Rua da Consolação, 1245 - Centro

**Informações para completar o cadastro:**
Digite o nome do contato principal da empresa:

💡 *Exemplo: "João Silva" ou "Maria Santos"*`;

    // CORREÇÃO: Criar sessão para cadastro de cliente com userId
    await createUserSession(telegramId, userId, 'salvar_prospect', 'aguardando_nome_contato', {
      prospect_id: prospectId,
      nome_empresa: 'TechSolutions Ltda',
      telefone: '(11) 3456-7890',
      endereco: 'Rua da Consolação, 1245 - Centro'
    });

    await ctx.editMessageText(mensagem, 
      Markup.inlineKeyboard([
        [Markup.button.callback('🔙 Voltar ao Prospect', 'bp_voltar_prospect_0')],
        [Markup.button.callback('❌ Cancelar', 'cancelar_acao')]
      ])
    );

    return true;
  } catch (error) {
    console.error('Erro salvar prospect:', error);
    return false;
  }
}

async function handleCriarFollowupProspect(ctx: Context) {
  try {
    ctx.answerCbQuery();
    
    // CORREÇÃO: Extrair ID do prospect do callback data
    const callbackData = ctx.callbackQuery && 'data' in ctx.callbackQuery ? ctx.callbackQuery.data : '';
    const match = callbackData.match(/^bp_followup_(\d+)$/);
    const prospectId = match ? parseInt(match[1]) : 0;

    const mensagem = `🎯 **Criar Follow-up Direto**

Vou criar um follow-up para este prospect:

**TechSolutions Ltda**
Score: 94/100 - ALTA prioridade

**Configuração automática:**
• **Estágio:** 🔍 Prospecção  
• **Valor estimado:** R$ 8.500 (baseado no seu perfil)
• **Data prevista:** ${new Date(Date.now() + 30*24*60*60*1000).toLocaleDateString('pt-BR')}
• **Primeira ação:** Contato inicial por telefone

Confirma a criação do follow-up?`;

    await ctx.editMessageText(mensagem, 
      Markup.inlineKeyboard([
        [Markup.button.callback('✅ Criar Follow-up', 'bp_confirmar_followup_0')],
        [Markup.button.callback('✏️ Personalizar', 'bp_personalizar_followup_0')],
        [Markup.button.callback('🔙 Voltar ao Prospect', 'bp_voltar_prospect_0')]
      ])
    );

    return true;
  } catch (error) {
    console.error('Erro criar follow-up prospect:', error);
    return false;
  }
}

async function handleLigarProspect(ctx: Context) {
  try {
    ctx.answerCbQuery();
    
    // CORREÇÃO: Extrair ID do prospect do callback data
    const callbackData = ctx.callbackQuery && 'data' in ctx.callbackQuery ? ctx.callbackQuery.data : '';
    const match = callbackData.match(/^bp_ligar_(\d+)$/);
    const prospectId = match ? parseInt(match[1]) : 0;

    const mensagem = `📞 **Ligar para Prospect**

**TechSolutions Ltda**
📞 **(11) 3456-7890**

🕐 **Melhor horário:** 14h às 17h (baseado no perfil)
💡 **Dica:** Mencione que encontrou a empresa pela excelente reputação online

**Roteiro sugerido:**
"Olá, sou [seu nome] da [sua empresa]. Vi que vocês têm ótima reputação na região e gostaria de apresentar uma solução que pode interessar..."

**Após a ligação, registre o resultado:**`;

    await ctx.editMessageText(mensagem, 
      Markup.inlineKeyboard([
        [
          Markup.button.callback('✅ Atendeu - Interessado', 'bp_resultado_interessado_0'),
          Markup.button.callback('📋 Atendeu - Não interessado', 'bp_resultado_nao_interessado_0')
        ],
        [
          Markup.button.callback('📞 Não atendeu', 'bp_resultado_nao_atendeu_0'),
          Markup.button.callback('⏰ Agendar retorno', 'bp_agendar_retorno_0')
        ],
        [Markup.button.callback('🔙 Voltar ao Prospect', 'bp_voltar_prospect_0')]
      ])
    );

    return true;
  } catch (error) {
    console.error('Erro ligar prospect:', error);
    return false;
  }
}

async function handleProximoProspect(ctx: Context) {
  try {
    ctx.answerCbQuery();
    
    // CORREÇÃO: Extrair ID do prospect do callback data
    const callbackData = ctx.callbackQuery && 'data' in ctx.callbackQuery ? ctx.callbackQuery.data : '';
    const match = callbackData.match(/^bp_proximo_(\d+)$/);
    const proximoId = match ? parseInt(match[1]) : 1;

    // Mock do próximo prospect
    const prospects = [
      {
        nome: 'Inovação Digital LTDA',
        endereco: 'Av. Paulista, 987 - Bela Vista',
        telefone: '(11) 2345-6789',
        score: 87,
        motivo: 'Localização premium'
      },
      {
        nome: 'Consultoria Estratégica Plus',
        endereco: 'Rua Augusta, 456 - Consolação',
        telefone: '(11) 8765-4321',
        score: 82,
        motivo: 'Perfil compatível'
      }
    ];

    const prospect = prospects[proximoId % prospects.length];

    const mensagem = `🏢 **Prospect ${proximoId + 1} de 15**

**${prospect.nome}**
📍 ${prospect.endereco} (1.8km)
📞 ${prospect.telefone}
⭐ 4.3 estrelas (67 avaliações)
🌐 www.empresa${proximoId}.com.br

💡 **Score: ${prospect.score}/100** - ${prospect.motivo}

O que você quer fazer com este prospect?`;

    await ctx.editMessageText(mensagem, 
      Markup.inlineKeyboard([
        [
          Markup.button.callback('📝 Salvar Cliente', `bp_salvar_${proximoId}`),
          Markup.button.callback('🎯 Follow-up', `bp_followup_${proximoId}`)
        ],
        [
          Markup.button.callback('📞 Ligar Agora', `bp_ligar_${proximoId}`),
          Markup.button.callback('📍 Ver no Maps', `bp_maps_${proximoId}`)
        ],
        [
          Markup.button.callback('⬅️ Anterior', `bp_anterior_${proximoId - 1}`),
          Markup.button.callback('➡️ Próximo', `bp_proximo_${proximoId + 1}`)
        ],
        [Markup.button.callback('📋 Ver Todos', 'bp_ver_todos')],
        [Markup.button.callback('🔍 Nova Busca', 'bp_nova_busca')]
      ])
    );

    return true;
  } catch (error) {
    console.error('Erro próximo prospect:', error);
    return false;
  }
}

async function handleAnteriorProspect(ctx: Context) {
  try {
    ctx.answerCbQuery();
    
    // CORREÇÃO: Extrair ID do prospect do callback data
    const callbackData = ctx.callbackQuery && 'data' in ctx.callbackQuery ? ctx.callbackQuery.data : '';
    const match = callbackData.match(/^bp_anterior_(\d+)$/);
    const anteriorId = match ? Math.max(0, parseInt(match[1])) : 0;

    // Reutilizar lógica do próximo prospect
    return await handleProximoProspect({
      ...ctx,
      callbackQuery: {
        ...ctx.callbackQuery,
        data: `bp_proximo_${anteriorId}`
      }
    });
  } catch (error) {
    console.error('Erro prospect anterior:', error);
    return false;
  }
}

async function handleVerTodosProspects(ctx: Context) {
  try {
    ctx.answerCbQuery();

    const mensagem = `📋 **Lista Completa - 15 Prospects**

**🔥 Alta Prioridade (Score 80+)**
1. TechSolutions Ltda - 94 pts
2. Inovação Digital - 87 pts  
3. Consultoria Plus - 82 pts

**⭐ Média Prioridade (Score 60-79)**
4. Empresa ABC - 78 pts
5. Negócios XYZ - 74 pts
6. Soluções Tech - 71 pts
...

**📊 Estatísticas:**
• Média de score: 76/100
• 8 com telefone público
• 12 com website próprio
• 10 abertos agora

**Ações em lote:**`;

    await ctx.editMessageText(mensagem, 
      Markup.inlineKeyboard([
        [
          Markup.button.callback('📞 Ligar para os Top 5', 'bp_ligar_lote_top5'),
          Markup.button.callback('📝 Salvar os Top 10', 'bp_salvar_lote_top10')
        ],
        [
          Markup.button.callback('🎯 Follow-up em Lote', 'bp_followup_lote'),
          Markup.button.callback('📊 Exportar Lista', 'bp_exportar_lista')
        ],
        [
          Markup.button.callback('🗺️ Criar Rota de Visitas', 'bp_criar_rota'),
          Markup.button.callback('📈 Análise Detalhada', 'bp_analise_detalhada')
        ],
        [Markup.button.callback('🔙 Voltar', 'bp_proximo_0')],
        [Markup.button.callback('🔍 Nova Busca', 'bp_nova_busca')]
      ])
    );

    return true;
  } catch (error) {
    console.error('Erro ver todos prospects:', error);
    return false;
  }
}

async function handleNovaBusca(ctx: Context) {
  try {
    ctx.answerCbQuery();
    
    // Limpar sessão e voltar ao menu principal
    const telegramId = ctx.from?.id;
    if (telegramId) {
      await clearUserSession(telegramId);
    }

    const { handleBuscaPotencial } = await import('./handlers');
    return await handleBuscaPotencial(ctx);
  } catch (error) {
    console.error('Erro nova busca:', error);
    return false;
  }
}

// ============================================================================
// CALLBACKS PLACEHOLDER (implementar posteriormente)
// ============================================================================
async function handleVerDetalhesProspect(ctx: Context) { 
  ctx.answerCbQuery();
  await ctx.reply('🔧 Funcionalidade em desenvolvimento!');
}

// Callbacks básicos que só respondem
async function handleCompartilharLocalizacao(ctx: Context) { ctx.answerCbQuery(); }
async function handleDigitarEndereco(ctx: Context) { ctx.answerCbQuery(); }
async function handleComercialCentro(ctx: Context) { ctx.answerCbQuery(); }
async function handleComercialShopping(ctx: Context) { ctx.answerCbQuery(); }
async function handleComercialEmpresarial(ctx: Context) { ctx.answerCbQuery(); }
async function handleComercialIndustrial(ctx: Context) { ctx.answerCbQuery(); }
async function handleComercialUniversitaria(ctx: Context) { ctx.answerCbQuery(); }