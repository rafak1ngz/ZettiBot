import { Context } from 'telegraf';

// Função para ajuda específica
export function getSpecificHelp(command: string): string {
  switch (command) {
    case 'clientes':
      return `
📊 Ajuda: Gerenciamento de Clientes

O comando /clientes permite gerenciar sua base de contatos comerciais.

Opções disponíveis:
• /clientes_adicionar - Cadastrar novo cliente
• /clientes_buscar - Encontrar clientes
• /clientes_listar - Ver todos os clientes
• /clientes_editar - Modificar informações

Exemplo de uso:
Digite /clientes para ver o menu principal
ou use diretamente /clientes_adicionar para novo cadastro.
      `;
      
    case 'agenda':
      return `
📅 Ajuda: Gestão de Agenda

O comando /agenda permite organizar seus compromissos comerciais.

Opções disponíveis:
• /agenda_registrar - Novo compromisso
• /agenda_visualizar - Ver compromissos
• /agenda_editar - Alterar detalhes 
• /agenda_excluir - Remover compromisso

Exemplo de uso:
Digite /agenda para acessar o menu principal
ou use /agenda_visualizar para ver compromissos do dia.
      `;
      
    default:
      return `Desculpe, não tenho ajuda específica para o comando ${command}.`;
  }
}

// Manipulador principal sem parâmetro opcional
export async function handleAjuda(ctx: Context) {
  // Verificar se há texto após o comando /ajuda
  const message = ctx.message && 'text' in ctx.message ? ctx.message.text : '';
  const parts = message.split(' ');
  
  // Se houver um comando específico após /ajuda (exemplo: /ajuda clientes)
  if (parts.length > 1) {
    const specificCommand = parts[1].toLowerCase();
    return ctx.reply(getSpecificHelp(specificCommand));
  }
  
  // Ajuda geral
  return ctx.reply(`
Olá, vendedor! 📊 Aqui estão todos os comandos do ZettiBot para turbinar sua performance:

🔹 /clientes - Gerencie seus contatos comerciais
🔹 /agenda - Organize seus compromissos
🔹 /lembrete - Crie alertas estratégicos
🔹 /followup - Acompanhe seus leads
🔹 /visita - Registre seus encontros comerciais
🔹 /buscapotencial - Encontre novos clientes
🔹 /criarrota - Planeje suas rotas de visita

Precisa de ajuda específica sobre algum comando? 
Digite o nome do comando após /ajuda, exemplo:
/ajuda clientes

Vamos conquistar mais resultados juntos! 💪🚀
  `);
}