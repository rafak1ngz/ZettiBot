import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
);

export async function upsertUserState(telegramId, stateData) {
  const { data, error } = await supabase
    .from('user_states')
    .upsert({ telegram_id: telegramId, state_data: stateData, updated_at: new Date() })
    .select();

  if (error) throw error;
  return data;
}