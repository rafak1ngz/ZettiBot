import { Context } from 'telegraf';

// Define session interface
export interface SessionData {
  // Definir os possíveis estados de conversa
  conversationState?: {
    active: boolean;          // Se há uma conversa ativa
    command: string;          // Comando que iniciou a conversa
    step: string;             // Etapa atual da conversa
    data: Record<string, any>; // Dados temporários da conversa
  };
}

// Extend Context type to include session data
export interface BotContext extends Context {
  session?: SessionData;
  state: {
    user?: any;
  };
}