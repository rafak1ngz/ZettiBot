import { Context } from 'telegraf';

export async function handleClientes(ctx: Context) {
  return ctx.reply(`
Gerenciamento de Clientes ZettiBot 📇

O que deseja fazer?

1️⃣ Adicionar novo cliente
2️⃣ Buscar cliente existente
3️⃣ Listar todos os clientes
4️⃣ Editar informações de cliente

Escolha uma das opções digitando o número correspondente ou o comando específico:
- /clientes_adicionar
- /clientes_buscar
- /clientes_listar
- /clientes_editar
  `);
}