import { sendMessage } from '../services/telegram';
import { handleInicioCommand } from '../commands/inicio';

export async function handleCommand(text: string, message: any) {
  const command = text.split(' ')[0].toLowerCase();
  const chatId = message.chat.id;

  try {
    switch (command) {
      case '/inicio':
        await handleInicioCommand(message);
        break;
      default:
        // Fallback para comandos não reconhecidos
        if (text.startsWith('/')) {
          await sendMessage(chatId, 'Comando não reconhecido. Digite /ajuda para ver os comandos disponíveis. 🤖');
        } else {
          // Resposta para mensagens normais
          await sendMessage(chatId, 'Olá! Digite /inicio para começar ou /ajuda para ver os comandos disponíveis. 🚀');
        }
        break;
    }
  } catch (error) {
    console.error(`Erro ao processar comando ${command}:`, error);
    await sendMessage(chatId, 'Ops! Ocorreu um erro ao processar seu comando. Tente novamente mais tarde. 🛠️');
  }
}