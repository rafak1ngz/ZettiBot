const { createClient } = require('@supabase/supabase-js');

// Configuração Supabase via variáveis de ambiente
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;

// Verificar se as configurações estão definidas
if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('ERRO: Variáveis de ambiente SUPABASE_URL e/ou SUPABASE_KEY não definidas');
}

// Inicializa Supabase
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// Funções para usuários
async function registerUser(userId, name, username) {
  try {
    const { data, error } = await supabase
      .from('users')
      .upsert({ 
        telegram_id: userId, 
        name, 
        username, 
        created_at: new Date()
      });
    
    if (error) throw error;
    console.log(`Usuário ${userId} registrado/atualizado`);
    return true;
  } catch (err) {
    console.error(`Erro ao registrar usuário ${userId}:`, err);
    return false;
  }
}

// Funções para clientes
async function getClientesForUser(userId) {
  try {
    const { data, error } = await supabase
      .from('clients')
      .select('*')
      .eq('user_id', userId);
      
    if (error) throw error;
    return data || [];
  } catch (err) {
    console.error(`Erro ao buscar clientes para ${userId}:`, err);
    return [];
  }
}

async function addClient(userId, clientData) {
  try {
    const { data, error } = await supabase
      .from('clients')
      .insert({
        user_id: userId,
        name: clientData.name,
        company: clientData.company,
        phone: clientData.phone,
        email: clientData.email,
        created_at: new Date()
      });
    
    if (error) throw error;
    return true;
  } catch (err) {
    console.error('Erro ao adicionar cliente:', err);
    return false;
  }
}

// Funções para follow-ups
async function getFollowupsForUser(userId, status = 'pendente') {
  try {
    const { data, error } = await supabase
      .from('followups')
      .select('*')
      .eq('user_id', userId)
      .eq('status', status);
      
    if (error) throw error;
    return data || [];
  } catch (err) {
    console.error(`Erro ao buscar follow-ups para ${userId}:`, err);
    return [];
  }
}

async function addFollowup(userId, followupData) {
  try {
    const { data, error } = await supabase
      .from('followups')
      .insert({
        user_id: userId,
        client_id: followupData.clientId,
        date: followupData.date,
        type: followupData.type,
        notes: followupData.notes,
        status: 'pendente',
        created_at: new Date()
      });
    
    if (error) throw error;
    return true;
  } catch (err) {
    console.error('Erro ao adicionar follow-up:', err);
    return false;
  }
}

// Funções para compromissos
async function getAgendaForUser(userId, date) {
  try {
    const { data, error } = await supabase
      .from('appointments')
      .select('*, clients(*)')
      .eq('user_id', userId)
      .eq('date', date);
      
    if (error) throw error;
    return data || [];
  } catch (err) {
    console.error(`Erro ao buscar agenda para ${userId}:`, err);
    return [];
  }
}

async function addAppointment(userId, appointmentData) {
  try {
    const { data, error } = await supabase
      .from('appointments')
      .insert({
        user_id: userId,
        client_id: appointmentData.clientId,
        date: appointmentData.date,
        time: appointmentData.time,
        type: appointmentData.type,
        notes: appointmentData.notes,
        status: 'agendado',
        created_at: new Date()
      });
    
    if (error) throw error;
    return true;
  } catch (err) {
    console.error('Erro ao adicionar compromisso:', err);
    return false;
  }
}

module.exports = {
  registerUser,
  getClientesForUser,
  addClient,
  getFollowupsForUser,
  addFollowup,
  getAgendaForUser,
  addAppointment
};