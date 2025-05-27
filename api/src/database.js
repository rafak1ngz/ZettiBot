const { createClient } = require('@supabase/supabase-js');
const winston = require('winston'); // Adicionamos log estruturado

// Configuração de log
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    new winston.transports.Console(),
    new winston.transports.File({ filename: 'error.log', level: 'error' })
  ]
});

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  logger.error('Variáveis de ambiente SUPABASE_URL e SUPABASE_KEY não definidas');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// Função para validar dados
function validateData(data, requiredFields) {
  for (let field of requiredFields) {
    if (!data[field]) {
      return false;
    }
  }
  return true;
}

// Função para obter UUID do usuário
async function getUserUUID(telegramId) {
  try {
    const { data, error } = await supabase
      .from('users')
      .select('id')
      .eq('telegram_id', telegramId)
      .single();
    
    if (error) {
      logger.error(`Erro ao buscar UUID do usuário: ${error.message}`);
      return null;
    }
    
    return data ? data.id : null;
  } catch (error) {
    logger.error(`Exceção ao buscar UUID do usuário: ${error.message}`);
    return null;
  }
}

// Funções existentes com melhorias...

async function registerUser(userId, name, username) {
  try {
    if (!validateData({ userId, name }, ['userId', 'name'])) {
      throw new Error('Dados de usuário inválidos');
    }

    const { error } = await supabase
      .from('users')
      .upsert({
        telegram_id: userId,
        name: name,
        username: username,
        created_at: new Date().toISOString()
      });
    
    if (error) throw error;
    
    logger.info(`Usuário ${userId} registrado/atualizado`);
    return true;
  } catch (error) {
    logger.error(`Erro ao registrar usuário: ${error.message}`);
    return false;
  }
}

// Funções adicionais para comissões
async function addCommission(userId, commissionData) {
  try {
    const userUUID = await getUserUUID(userId);
    if (!userUUID) {
      throw new Error('Usuário não encontrado');
    }

    const requiredFields = ['clientId', 'contractValue', 'commissionRate', 'expectedDate'];
    if (!validateData(commissionData, requiredFields)) {
      throw new Error('Dados de comissão incompletos');
    }

    const { error } = await supabase
      .from('commissions')
      .insert({
        user_id: userUUID,
        client_id: commissionData.clientId,
        contract_value: commissionData.contractValue,
        commission_rate: commissionData.commissionRate,
        commission_value: commissionData.contractValue * (commissionData.commissionRate / 100),
        expected_date: commissionData.expectedDate,
        status: 'pendente',
        created_at: new Date().toISOString()
      });

    if (error) throw error;
    
    logger.info(`Comissão adicionada para usuário ${userId}`);
    return true;
  } catch (error) {
    logger.error(`Erro ao adicionar comissão: ${error.message}`);
    return false;
  }
}

async function getCommissionsForUser(userId, status = 'pendente') {
  try {
    const userUUID = await getUserUUID(userId);
    if (!userUUID) {
      throw new Error('Usuário não encontrado');
    }

    const { data, error } = await supabase
      .from('commissions')
      .select('*, clients(*)')
      .eq('user_id', userUUID)
      .eq('status', status);

    if (error) throw error;
    
    return data || [];
  } catch (error) {
    logger.error(`Erro ao buscar comissões: ${error.message}`);
    return [];
  }
}

// Função para busca avançada de clientes
async function searchClients(userId, searchTerm) {
  try {
    const userUUID = await getUserUUID(userId);
    if (!userUUID) {
      throw new Error('Usuário não encontrado');
    }

    const { data, error } = await supabase
      .from('clients')
      .select('*')
      .eq('user_id', userUUID)
      .or(`name.ilike.%${searchTerm}%,company.ilike.%${searchTerm}%`);

    if (error) throw error;
    
    return data || [];
  } catch (error) {
    logger.error(`Erro na busca de clientes: ${error.message}`);
    return [];
  }
}

module.exports = {
  registerUser,
  getUserUUID,
  getClientesForUser,
  addClient,
  updateClient,
  deleteClient,
  getFollowupsForUser,
  addFollowup,
  getAgendaForUser,
  addAppointment,
  addCommission,
  getCommissionsForUser,
  searchClients
};