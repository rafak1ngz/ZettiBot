import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// Funções de cliente
export async function adicionarCliente(telegramId, clienteData) {
  const { data, error } = await supabase
    .from('clientes')
    .insert([{
      telegram_id: telegramId,
      nome_empresa: clienteData.nomeEmpresa,
      cnpj: clienteData.cnpj,
      nome_contato: clienteData.nomeContato,
      telefone_contato: clienteData.telefoneContato,
      email_contato: clienteData.emailContato,
      created_at: new Date()
    }]);

  if (error) throw error;
  return data;
}

export async function buscarCliente(telegramId, termoBusca) {
  const { data, error } = await supabase
    .from('clientes')
    .select('*')
    .eq('telegram_id', telegramId)
    .ilike('nome_empresa', `%${termoBusca}%`);

  if (error) throw error;
  return data;
}

export async function listarClientes(telegramId) {
  const { data, error } = await supabase
    .from('clientes')
    .select('*')
    .eq('telegram_id', telegramId)
    .order('nome_empresa', { ascending: true });

  if (error) throw error;
  return data;
}

// Funções de agenda
export async function agendarCompromisso(telegramId, compromissoData) {
  const { data, error } = await supabase
    .from('agenda')
    .insert([{
      telegram_id: telegramId,
      data: compromissoData.data,
      horario: compromissoData.horario,
      cliente_id: compromissoData.clienteId || null,
      descricao: compromissoData.descricao,
      created_at: new Date()
    }]);

  if (error) throw error;
  return data;
}

export async function listarCompromissos(telegramId, data) {
  const { data: compromissos, error } = await supabase
    .from('agenda')
    .select('*, clientes(nome_empresa)')
    .eq('telegram_id', telegramId)
    .eq('data', data);

  if (error) throw error;
  return compromissos;
}

// Funções de follow-up
export async function adicionarFollowUp(telegramId, followUpData) {
  const { data, error } = await supabase
    .from('followups')
    .insert([{
      telegram_id: telegramId,
      cliente_id: followUpData.clienteId,
      data: followUpData.data,
      motivo: followUpData.motivo,
      status: 'A Realizar',
      created_at: new Date()
    }]);

  if (error) throw error;
  return data;
}

export async function listarFollowUpsPorStatus(telegramId, status) {
  const { data, error } = await supabase
    .from('followups')
    .select('*, clientes(nome_empresa)')
    .eq('telegram_id', telegramId)
    .eq('status', status);

  if (error) throw error;
  return data;
}

export async function listarFollowUpsPorData(telegramId, data) {
  const { data: followups, error } = await supabase
    .from('followups')
    .select('*, clientes(nome_empresa)')
    .eq('telegram_id', telegramId)
    .eq('data', data);

  if (error) throw error;
  return followups;
}

export async function atualizarStatusFollowUp(followUpId, status) {
  const { data, error } = await supabase
    .from('followups')
    .update({ status: status })
    .eq('id', followUpId);

  if (error) throw error;
  return data;
}

// Funções de lembrete
export async function adicionarLembrete(telegramId, lembreteData) {
  const { data, error } = await supabase
    .from('lembretes')
    .insert([{
      telegram_id: telegramId,
      data: lembreteData.data,
      horario: lembreteData.horario,
      cliente_id: lembreteData.clienteId || null,
      texto: lembreteData.texto,
      created_at: new Date()
    }]);

  if (error) throw error;
  return data;
}

export async function listarLembretes(telegramId) {
  const { data, error } = await supabase
    .from('lembretes')
    .select('*, clientes(nome_empresa)')
    .eq('telegram_id', telegramId)
    .gte('data', new Date().toISOString().split('T')[0])
    .order('data', { ascending: true });

  if (error) throw error;
  return data;
}

// Funções de visita
export async function registrarVisita(telegramId, visitaData) {
  const { data, error } = await supabase
    .from('visitas')
    .insert([{
      telegram_id: telegramId,
      cliente_id: visitaData.clienteId,
      data: visitaData.data,
      horario: visitaData.horario,
      motivo: visitaData.motivo,
      created_at: new Date()
    }]);

  if (error) throw error;
  return data;
}

// Salvar estado do usuário
export async function saveUserState(telegramId, state) {
  const { data, error } = await supabase
    .from('user_states')
    .upsert([{
      telegram_id: telegramId,
      state_data: state,
      updated_at: new Date()
    }], { onConflict: 'telegram_id' });

  if (error) console.error('Error saving state:', error);
  return data;
}

// Carregar estado do usuário
export async function loadUserState(telegramId) {
  const { data, error } = await supabase
    .from('user_states')
    .select('state_data')
    .eq('telegram_id', telegramId)
    .single();

  if (error && error.code !== 'PGRST116') {
    // PGRST116 é o código para "não encontrado", que é esperado para novos usuários
    console.error('Error loading state:', error);
  }
  
  return data?.state_data || null;
}