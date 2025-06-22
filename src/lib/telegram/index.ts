import { Telegraf, session } from 'telegraf';
import { BotContext } from './middleware/session';
import { userMiddleware } from './middleware/user';
import { registerCommands } from './commands';

// Initialize bot with token
const token = process.env.TELEGRAM_BOT_TOKEN;
if (!token) {
  throw new Error('TELEGRAM_BOT_TOKEN must be provided');
}

// Create bot instance with proper typing
const bot = new Telegraf<BotContext>(token);

// Define session
bot.use(session());

// Add user middleware to attach user to context
bot.use(userMiddleware);

// Register all commands
registerCommands(bot);

export default bot;