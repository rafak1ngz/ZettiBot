import { Context } from 'telegraf';

export async function handleAgenda(ctx: Context) {
  return ctx.reply(`
Gestão de Agenda ZettiBot 📅

O que deseja fazer?

1️⃣ Registrar novo compromisso
2️⃣ Visualizar compromissos
3️⃣ Editar compromisso
4️⃣ Excluir compromisso

Escolha uma opção digitando:
- /agenda_registrar
- /agenda_visualizar
- /agenda_editar
- /agenda_excluir
  `);
}