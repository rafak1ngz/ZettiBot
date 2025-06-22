import { Context } from 'telegraf';

// Define session interface
export interface SessionData {
  step: string;
  data: Record<string, any>;
}

// Extend Context type to include session data
export interface BotContext extends Context {
  session?: SessionData;
  state: {
    user?: any;
  }
}