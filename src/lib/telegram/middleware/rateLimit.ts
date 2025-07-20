const requestCount = new Map<number, { count: number; resetTime: number }>();

export const rateLimitMiddleware = (ctx: any, next: any) => {
  const telegramId = ctx.from?.id;
  if (!telegramId) return next();

  const now = Date.now();
  const userRequests = requestCount.get(telegramId);

  if (!userRequests || now > userRequests.resetTime) {
    // Reset counter every minute
    requestCount.set(telegramId, { count: 1, resetTime: now + 60000 });
    return next();
  }

  if (userRequests.count >= 30) { // Max 30 requests per minute
    return ctx.reply('🚫 Você está enviando muitas mensagens. Aguarde um momento.');
  }

  userRequests.count++;
  return next();
};