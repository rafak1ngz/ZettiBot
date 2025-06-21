import { sendMessage } from '../services/telegram';

export async function handleInicioCommand(message: any) {
  const chatId = message.chat.id;
  
  const welcomeMessage = `
Olá! Sou o ZettiBot 🚀, seu assistente digital de vendas.

Estou aqui para transformar seu dia a dia comercial em uma jornada de resultados incríveis! 

Sou especialista em ajudar vendedores externos a conquistarem mais, organizarem melhor e fecharem deals com inteligência.

Quer saber o que posso fazer por você? 
👉 Digite /ajuda para ver todos os comandos disponíveis
`;
  
  await sendMessage(chatId, welcomeMessage);
}