const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('ERRO: Variáveis de ambiente SUPABASE_URL e SUPABASE_KEY não definidas.');
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function registerUser(userId, name, username) {
  try {
    const { error } = await supabase
      .from('users')
      .upsert({
        telegram_id: userId,
        name: name,
        username: username,
        created_at: new Date().toISOString()
      });
    if (error) throw error;
    console.log(`Usuário ${userId} registrado/atualizado`);
    return true;
  } catch (error) {
    console.error('Erro ao registrar usuário:', error);
    return false;
  }
}

async function getClientesForUser(userId) {
  try {
    const { data, error } = await supabase
      .from('clients')
      .select('*')
      .eq('user_id', userId);
    if (error) throw error;
    return data || [];
  } catch (error) {
    console.error('Erro ao buscar clientes:', error);
    return [];
  }
}

async function addClient(userId, clientData) {
  try {
    const { data: userData, error: userError } = await supabase
      .from('users')
      .select('id')
      .eq('telegram_id', userId)
      .single();
    if (userError) {
      console.error('Usuário não encontrado ao adicionar cliente:', userError);
      return false;
    }
    const { error } = await supabase
      .from('clients')
      .insert({
        user_id: userData.id,
        name: clientData.name,
        company: clientData.company,
        phone: clientData.phone,
        email: clientData.email || null,
        last_contact: new Date().toISOString(),
        created_at: new Date().toISOString()
      });
    if (error) throw error;
    return true;
  } catch (error) {
    console.error('Erro ao adicionar cliente:', error);
    return false;
  }
}

async function updateClient(userId, clientId, updateData) {
  try {
    const { error } = await supabase
      .from('clients')
      .update({
        ...updateData,
        last_contact: new Date().toISOString()
      })
      .eq('id', clientId)
      .eq('user_id', userId);
    if (error) throw error;
    return true;
  } catch (error) {
    console.error('Erro ao atualizar cliente:', error);
    return false;
  }
}

async function deleteClient(userId, clientId) {
  try {
    const { error } = await supabase
      .from('clients')
      .delete()
      .eq('id', clientId)
      .eq('user_id', userId);
    if (error) throw error;
    return true;
  } catch (error) {
    console.error('Erro ao excluir cliente:', error);
    return false;
  }
}

async function getFollowupsForUser(userId, status = 'pendente') {
  try {
    const { data, error } = await supabase
      .from('followups')
      .select('*')
      .eq('user_id', userId)
      .eq('status', status);
    if (error) throw error;
    return data || [];
  } catch (error) {
    console.error('Erro ao buscar follow-ups:', error);
    return [];
  }
}

async function addFollowup(userId, followupData) {
  try {
    const { error } = await supabase
      .from('followups')
      .insert({
        user_id: userId,
        client_id: followupData.clientId,
        date: followupData.date,
        type: followupData.type,
        notes: followupData.notes,
        status: 'pendente',
        created_at: new Date().toISOString()
      });
    if (error) throw error;
    return true;
  } catch (error) {
    console.error('Erro ao adicionar follow-up:', error);
    return false;
  }
}

async function getAgendaForUser(userId, date) {
  try {
    const { data, error } = await supabase
      .from('appointments')
      .select('*, clients(*)')
      .eq('user_id', userId)
      .eq('date', date);
    if (error) throw error;
    return data || [];
  } catch (error) {
    console.error('Erro ao buscar agenda:', error);
    return [];
  }
}

async function addAppointment(userId, appointmentData) {
  try {
    const { error } = await supabase
      .from('appointments')
      .insert({
        user_id: userId,
        client_id: appointmentData.clientId,
        date: appointmentData.date,
        time: appointmentData.time,
        type: appointmentData.type,
        notes: appointmentData.notes,
        status: 'agendado',
        created_at: new Date().toISOString()
      });
    if (error) throw error;
    return true;
  } catch (error) {
    console.error('Erro ao adicionar compromisso:', error);
    return false;
  }
}

module.exports = {
  registerUser,
  getClientesForUser,
  addClient,
  updateClient,
  deleteClient,
  getFollowupsForUser,
  addFollowup,
  getAgendaForUser,
  addAppointment
};