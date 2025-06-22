import { Context } from 'telegraf';

export async function handleAjuda(ctx: Context, command?: string) {
  if (command) {
    // Ajuda específica para cada comando
    switch (command) {
      case 'clientes':
        return ctx.reply(`
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
        `);
        
      case 'agenda':
        return ctx.reply(`
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
        `);
        
      default:
        return ctx.reply(`Desculpe, não tenho ajuda específica para o comando ${command}.`);
    }
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