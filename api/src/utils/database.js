// Adicione esta função antes do module.exports
async function getClientesForUser(userId) {
  try {
    const userUUID = await getUserUUID(userId);
    if (!userUUID) {
      throw new Error('Usuário não encontrado');
    }

    const { data, error } = await supabase
      .from('clients')
      .select('*')
      .eq('user_id', userUUID);

    if (error) throw error;
    
    return data || [];
  } catch (error) {
    logger.error(`Erro ao buscar clientes: ${error.message}`);
    return [];
  }
}

// Da mesma forma, adicione as outras funções que está exportando
async function addClient(userId, clientData) {
  try {
    const userUUID = await getUserUUID(userId);
    if (!userUUID) {
      throw new Error('Usuário não encontrado');
    }

    const { error } = await supabase
      .from('clients')
      .insert({
        user_id: userUUID,
        name: clientData.name,
        company: clientData.company,
        phone: clientData.phone,
        email: clientData.email || null,
        last_contact: new Date().toISOString(),
        created_at: new Date().toISOString()
      });

    if (error) throw error;
    
    logger.info(`Cliente ${clientData.name} adicionado para usuário ${userId}`);
    return true;
  } catch (error) {
    logger.error(`Erro ao adicionar cliente: ${error.message}`);
    return false;
  }
}

async function updateClient(userId, clientId, updateData) {
  try {
    const userUUID = await getUserUUID(userId);
    if (!userUUID) {
      throw new Error('Usuário não encontrado');
    }

    const { error } = await supabase
      .from('clients')
      .update({
        ...updateData,
        last_contact: new Date().toISOString()
      })
      .eq('id', clientId)
      .eq('user_id', userUUID);

    if (error) throw error;
    
    logger.info(`Cliente ${clientId} atualizado para usuário ${userId}`);
    return true;
  } catch (error) {
    logger.error(`Erro ao atualizar cliente: ${error.message}`);
    return false;
  }
}

async function deleteClient(userId, clientId) {
  try {
    const userUUID = await getUserUUID(userId);
    if (!userUUID) {
      throw new Error('Usuário não encontrado');
    }

    const { error } = await supabase
      .from('clients')
      .delete()
      .eq('id', clientId)
      .eq('user_id', userUUID);

    if (error) throw error;
    
    logger.info(`Cliente ${clientId} removido para usuário ${userId}`);
    return true;
  } catch (error) {
    logger.error(`Erro ao remover cliente: ${error.message}`);
    return false;
  }
}

// Adicione funções similares para:
async function getFollowupsForUser(userId, status = 'pendente') {
  try {
    const userUUID = await getUserUUID(userId);
    if (!userUUID) {
      throw new Error('Usuário não encontrado');
    }

    const { data, error } = await supabase
      .from('followups')
      .select('*')
      .eq('user_id', userUUID)
      .eq('status', status);

    if (error) throw error;
    
    return data || [];
  } catch (error) {
    logger.error(`Erro ao buscar follow-ups: ${error.message}`);
    return [];
  }
}

async function addFollowup(userId, followupData) {
  try {
    const userUUID = await getUserUUID(userId);
    if (!userUUID) {
      throw new Error('Usuário não encontrado');
    }

    const { error } = await supabase
      .from('followups')
      .insert({
        user_id: userUUID,
        client_id: followupData.clientId,
        date: followupData.date,
        type: followupData.type,
        notes: followupData.notes,
        status: 'pendente',
        created_at: new Date().toISOString()
      });

    if (error) throw error;
    
    logger.info(`Follow-up adicionado para usuário ${userId}`);
    return true;
  } catch (error) {
    logger.error(`Erro ao adicionar follow-up: ${error.message}`);
    return false;
  }
}

async function getAgendaForUser(userId, date) {
  try {
    const userUUID = await getUserUUID(userId);
    if (!userUUID) {
      throw new Error('Usuário não encontrado');
    }

    const { data, error } = await supabase
      .from('appointments')
      .select('*, clients(*)')
      .eq('user_id', userUUID)
      .eq('date', date);

    if (error) throw error;
    
    return data || [];
  } catch (error) {
    logger.error(`Erro ao buscar agenda: ${error.message}`);
    return [];
  }
}

async function addAppointment(userId, appointmentData) {
  try {
    const userUUID = await getUserUUID(userId);
    if (!userUUID) {
      throw new Error('Usuário não encontrado');
    }

    const { error } = await supabase
      .from('appointments')
      .insert({
        user_id: userUUID,
        client_id: appointmentData.clientId,
        date: appointmentData.date,
        time: appointmentData.time,
        type: appointmentData.type,
        notes: appointmentData.notes,
        status: 'agendado',
        created_at: new Date().toISOString()
      });

    if (error) throw error;
    
    logger.info(`Compromisso adicionado para usuário ${userId}`);
    return true;
  } catch (error) {
    logger.error(`Erro ao adicionar compromisso: ${error.message}`);
    return false;
  }
}