import { sendMessage } from '../services/telegram';
import { handleInicioCommand } from '../commands/inicio';
import { handleAjudaCommand } from '../commands/ajuda';
// Importe outros comandos conforme necessário

export async function handleCommand(text: string, message: any) {
  const command = text.split(' ')[0].toLowerCase();
  const chatId = message.chat.id;

  try {
    switch (command) {
      case '/inicio':
        await handleInicioCommand(message);
        break;
      case '/ajuda':
        await handleAjudaCommand(message);
        break;
      // Adicione outros comandos conforme necessário
      default:
        if (text.startsWith('/')) {
          await sendMessage(chatId, 'Comando não reconhecido. Digite /ajuda para ver a lista de comandos disponíveis.');
        }
    }
  } catch (error) {
    console.error(`Erro ao processar comando ${command}:`, error);
    await sendMessage(chatId, 'Ops! Ocorreu um erro ao processar seu comando. Tente novamente mais tarde.');
  }
}