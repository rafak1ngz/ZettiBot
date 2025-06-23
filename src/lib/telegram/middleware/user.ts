import { MiddlewareFn } from 'telegraf';
import { supabase } from '../../supabase';
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
    const { data: users, error } = await supabase
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