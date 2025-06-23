import { Context } from 'telegraf';
import { supabase } from '@/lib/supabase';

export async function handleStart(ctx: Context) {
  const telegramId = ctx.from?.id;
  const username = ctx.from?.username || '';
  const firstName = ctx.from?.first_name || '';
  
  if (!telegramId) {
    return ctx.reply('Erro ao identificar usuário. Por favor, tente novamente.');
  }
  
  try {
    console.log(`Processing /start command for telegramId: ${telegramId}`);
    
    // Verificar se usuário já existe
    const { data: existingUser, error } = await supabase
      .from('users')
      .select('*')
      .eq('telegram_id', telegramId)
      .single();
    
    // PGRST116 significa "nenhuma linha retornada" - é esperado para novos usuários
    const userNotFound = error && error.code === 'PGRST116';
    
    if (error && !userNotFound) {
      console.error('Database error:', error);
      return ctx.reply('Ocorreu um erro ao verificar seu cadastro. Por favor, tente novamente.');
    }
    
    if (existingUser) {
      console.log(`User found: ${existingUser.id}, updating last_active`);
      
      // Atualizar last_active
      await supabase
        .from('users')
        .update({ last_active: new Date().toISOString() })
        .eq('id', existingUser.id);
      
      return ctx.reply(`
Olá novamente! Sou o ZettiBot 🚀, seu assistente digital de vendas.

Estou pronto para ajudar a transformar seu dia comercial em resultados incríveis!

👉 Digite /ajuda para ver todos os comandos disponíveis
      `);
    } else {
      // Usuário não encontrado, criar novo
      console.log(`Creating new user for telegramId: ${telegramId}`);
      
      const { data: newUser, error: createError } = await supabase
        .from('users')
        .insert([
          { 
            telegram_id: telegramId,
            username: username,
            full_name: firstName,
            last_active: new Date().toISOString()
          }
        ])
        .select();
      
      if (createError) {
        console.error('Error creating user:', createError);
        return ctx.reply('Erro ao criar seu perfil. Por favor, tente novamente.');
      }
      
      console.log(`New user created: ${JSON.stringify(newUser)}`);
      
      return ctx.reply(`
Olá, ${firstName}! Sou o ZettiBot 🚀, seu assistente digital de vendas.

Bem-vindo à sua jornada para transformar caos em estratégia e potencializar seus resultados comerciais!

Para começar, precisarei do seu email para configurar seu perfil.

Por favor, responda com seu email profissional.
      `);
      
      // Configurar estado para continuar conversa - será implementado no futuro
    }
  } catch (error) {
    console.error('Unexpected error:', error);
    return ctx.reply('Ocorreu um erro inesperado. Por favor, tente novamente.');
  }
}