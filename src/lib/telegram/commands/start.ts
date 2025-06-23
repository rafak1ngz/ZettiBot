import { Context } from 'telegraf';
import { adminSupabase } from '@/lib/supabase';

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
    const { data: existingUsers, error: queryError } = await adminSupabase
      .from('users')
      .select('*')
      .eq('telegram_id', telegramId);
    
    // Verificar se há erro na consulta
    if (queryError) {
      console.error('Database query error:', queryError);
      return ctx.reply('Ocorreu um erro ao verificar seu cadastro. Por favor, tente novamente.');
    }
    
    let userId;
    
    // Verificar se encontramos o usuário
    if (existingUsers && existingUsers.length > 0) {
      const existingUser = existingUsers[0];
      userId = existingUser.id;
      console.log(`User found: ${userId}, updating last_active`);
      
      // Atualizar last_active
      await adminSupabase
        .from('users')
        .update({ last_active: new Date().toISOString() })
        .eq('id', userId);
      
      // Verificar se o email já está registrado
      if (!existingUser.email) {
        // Limpar sessões existentes
        await adminSupabase
          .from('sessions')
          .delete()
          .eq('telegram_id', telegramId);
          
        // Criar nova sessão para capturar email
        await adminSupabase
          .from('sessions')
          .insert([
            {
              telegram_id: telegramId,
              user_id: userId,
              command: 'start',
              step: 'email',
              data: {},
              updated_at: new Date().toISOString()
            }
          ]);

        return ctx.reply(`
Olá, ${firstName}! Percebo que ainda não temos seu email registrado.

Para uma experiência completa com o ZettiBot, por favor, me informe seu email profissional:
        `);
      }
      
      return ctx.reply(`
Olá novamente! Sou o ZettiBot 🚀, seu assistente digital de vendas.

Estou pronto para ajudar a transformar seu dia comercial em resultados incríveis!

👉 Digite /ajuda para ver todos os comandos disponíveis
      `);
    } else {
      // Usuário não encontrado, criar novo
      console.log(`Creating new user for telegramId: ${telegramId}`);
      
      // Usar client com service role para bypass de RLS
      const { data: newUsers, error: createError } = await adminSupabase
        .from('users')
        .insert([
          { 
            telegram_id: telegramId,
            username: username,
            full_name: firstName,
            last_active: new Date().toISOString()
          }
        ])
        .select('*');
      
      if (createError) {
        console.error('Error details on creating user:', createError);
        return ctx.reply('Erro ao criar seu perfil. Por favor, tente novamente mais tarde.');
      }
      
      console.log('Insert attempt result:', newUsers);
      
      if (!newUsers || newUsers.length === 0) {
        return ctx.reply('Erro ao criar seu perfil. Por favor, tente novamente mais tarde.');
      }
      
      userId = newUsers[0].id;
      
      // Limpar sessões existentes
      await adminSupabase
        .from('sessions')
        .delete()
        .eq('telegram_id', telegramId);
        
      // Criar nova sessão para capturar email
      await adminSupabase
        .from('sessions')
        .insert([
          {
            telegram_id: telegramId,
            user_id: userId,
            command: 'start',
            step: 'email',
            data: {},
            updated_at: new Date().toISOString()
          }
        ]);
      
      return ctx.reply(`
Olá, ${firstName}! Sou o ZettiBot 🚀, seu assistente digital de vendas.

Bem-vindo à sua jornada para transformar caos em estratégia e potencializar seus resultados comerciais!

Para começar, precisarei do seu email para configurar seu perfil.

Por favor, responda com seu email profissional.
      `);
    }
  } catch (error) {
    console.error('Unexpected error in start command:', error);
    return ctx.reply('Ocorreu um erro inesperado. Por favor, tente novamente.');
  }
}