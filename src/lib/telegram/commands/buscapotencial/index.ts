// ============================================================================
// EXPORTS BÁSICOS - APENAS O QUE REALMENTE EXISTE
// ============================================================================

export { 
  registerBuscaPotencialCallbacks
} from './callbacks';

export {
  buscarProspectsGoogle,
  obterDetalhesLocal,
  type ProspectData,
  type ParametrosBusca,
  type ResultadoBusca
} from './integration';

// ============================================================================
// COMANDO PRINCIPAL SIMPLES
// ============================================================================
export async function handleBuscaPotencial(ctx: any) {
  try {
    const mensagem = `🚀 **Como você quer encontrar novos clientes hoje?**

Escolha o método de busca mais adequado para suas necessidades:

🎯 **Busca Focada** - Conversação guiada para encontrar prospects ideais
🗺️ **Busca por Área** - Localização específica + categoria  
📊 **Análise de Mercado** - IA analisa seus padrões de sucesso
⚡ **Busca Rápida** - Categorias predefinidas na sua região`;

    const keyboard = {
      inline_keyboard: [
        [
          { text: '🎯 Busca Focada', callback_data: 'bp_busca_focada' },
          { text: '🗺️ Busca por Área', callback_data: 'bp_busca_area' }
        ],
        [
          { text: '📊 Análise Mercado', callback_data: 'bp_analise_mercado' },
          { text: '⚡ Busca Rápida', callback_data: 'bp_busca_rapida' }
        ],
        [{ text: '🏠 Menu Principal', callback_data: 'menu_principal' }]
      ]
    };

    if (ctx.callbackQuery) {
      await ctx.editMessageText(mensagem, {
        parse_mode: 'Markdown',
        reply_markup: keyboard
      });
    } else {
      await ctx.reply(mensagem, {
        parse_mode: 'Markdown',
        reply_markup: keyboard
      });
    }

    return true;
  } catch (error) {
    console.error('Erro menu busca potencial:', error);
    await ctx.reply('❌ Erro ao carregar menu. Tente novamente.');
    return false;
  }
}

// ============================================================================
// COMANDO PARA REGISTRO NO BOT
// ============================================================================
export const handleBuscaPotencialComando = handleBuscaPotencial;