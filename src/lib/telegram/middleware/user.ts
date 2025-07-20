import { MiddlewareFn } from 'telegraf';
import { supabase, adminSupabase } from '@/lib/supabase';
import { User } from '@/types/database';
import { BotContext } from './session';

// Middleware to check if user exists and attach to context
export const userMiddleware: MiddlewareFn<BotContext> = async (ctx, next) => {
  const telegramId = ctx.from?.id;
  
  if (!telegramId) {
    return next();
  }

  try {
    // Check if user exists with array result instead of single
    const { data: users, error } = await adminSupabase
      .from('users')
      .select('*')
      .eq('telegram_id', telegramId);

    if (error) {
      console.error('Error fetching user in middleware:', error);
    }

    // Attach user to context if found
    if (users && users.length > 0) {
      ctx.state.user = users[0] as User;
    }

    return next();
  } catch (error) {
    console.error('Middleware error:', error);
    return next();
  }
};

// ✅ ADICIONAR: Cache simples em memória
const userCache = new Map<number, any>();

export const userMiddleware: MiddlewareFn<BotContext> = async (ctx, next) => {
  const telegramId = ctx.from?.id;
  if (!telegramId) return next();

  try {
    // ✅ Verificar cache primeiro
    if (userCache.has(telegramId)) {
      ctx.state.user = userCache.get(telegramId);
      return next();
    }

    // Buscar no banco...
    const { data: users } = await adminSupabase
      .from('users')
      .select('*')
      .eq('telegram_id', telegramId);

    if (users && users.length > 0) {
      ctx.state.user = users[0];
      // ✅ Salvar no cache por 5 minutos
      userCache.set(telegramId, users[0]);
      setTimeout(() => userCache.delete(telegramId), 5 * 60 * 1000);
    }

    return next();
  } catch (error) {
    console.error('Middleware error:', error);
    return next();
  }
};