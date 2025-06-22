import { Context, MiddlewareFn } from 'telegraf';
import { supabase } from '../../supabase';
import { User } from '@/types/database';

// Middleware to check if user exists and attach to context
export const userMiddleware: MiddlewareFn<Context> = async (ctx, next) => {
  const telegramId = ctx.from?.id;
  
  if (!telegramId) {
    return next();
  }

  try {
    // Check if user exists
    const { data: user, error } = await supabase
      .from('users')
      .select('*')
      .eq('telegram_id', telegramId)
      .single();

    if (error) {
      console.error('Error fetching user:', error);
    }

    // Attach user to context if found
    if (user) {
      ctx.state.user = user as User;
    }

    return next();
  } catch (error) {
    console.error('Middleware error:', error);
    return next();
  }
};