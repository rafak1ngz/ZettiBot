import { Telegraf } from 'telegraf';
import { userMiddleware } from './middleware/user';
import { conversationMiddleware } from './middleware/conversation';
import { registerCommands } from './commands';

// Initialize bot with token
const token = process.env.TELEGRAM_BOT_TOKEN;
if (!token) {
  throw new Error('TELEGRAM_BOT_TOKEN must be provided');
}

// Create bot instance
const bot = new Telegraf(token);

// Add user middleware to attach user to context
bot.use(userMiddleware);

// Add conversation middleware to handle ongoing conversations
bot.use(conversationMiddleware);

// Register all commands
registerCommands(bot);

export default bot;