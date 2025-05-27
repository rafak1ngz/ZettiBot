const winston = require('winston');

// Armazenamento em memória dos estados
const userStates = new Map();

// Tempo máximo de estado (15 minutos)
const MAX_STATE_AGE = 15 * 60 * 1000;

// Estrutura de estado com timestamp
function createStateEntry(state, data = {}) {
  return {
    state,
    data,
    createdAt: Date.now()
  };
}

function setUserState(userId, state, data = {}) {
  try {
    // Converte userId para string para garantir consistência
    const userIdStr = String(userId);
    
    // Cria entrada de estado
    const stateEntry = createStateEntry(state, data);
    
    userStates.set(userIdStr, stateEntry);
    
    // Log de mudança de estado
    winston.info(`Estado definido para usuário ${userIdStr}: ${state}`);
  } catch (error) {
    winston.error(`Erro ao definir estado para usuário: ${error.message}`);
  }
}

function getUserState(userId) {
  try {
    const userIdStr = String(userId);
    const stateEntry = userStates.get(userIdStr);
    
    // Verifica se o estado existe e não expirou
    if (stateEntry) {
      // Se o estado estiver muito antigo, limpa
      if (Date.now() - stateEntry.createdAt > MAX_STATE_AGE) {
        clearUserState(userId);
        return { state: null, data: {} };
      }
      
      return {
        state: stateEntry.state,
        data: stateEntry.data
      };
    }
    
    return { state: null, data: {} };
  } catch (error) {
    winston.error(`Erro ao buscar estado do usuário: ${error.message}`);
    return { state: null, data: {} };
  }
}

function updateUserStateData(userId, newData) {
  try {
    const userIdStr = String(userId);
    const currentState = userStates.get(userIdStr);
    
    if (currentState) {
      // Atualiza apenas os dados, mantendo o estado atual
      currentState.data = { ...currentState.data, ...newData };
      userStates.set(userIdStr, currentState);
      
      winston.info(`Dados do estado atualizados para usuário ${userIdStr}`);
      return true;
    }
    
    return false;
  } catch (error) {
    winston.error(`Erro ao atualizar dados do estado: ${error.message}`);
    return false;
  }
}

function clearUserState(userId) {
  try {
    const userIdStr = String(userId);
    
    if (userStates.has(userIdStr)) {
      userStates.delete(userIdStr);
      winston.info(`Estado limpo para usuário ${userIdStr}`);
    }
  } catch (error) {
    winston.error(`Erro ao limpar estado do usuário: ${error.message}`);
  }
}

// Limpeza periódica de estados expirados
function cleanExpiredStates() {
  const now = Date.now();
  
  for (const [userId, stateEntry] of userStates.entries()) {
    if (now - stateEntry.createdAt > MAX_STATE_AGE) {
      userStates.delete(userId);
    }
  }
}

// Executa limpeza a cada 10 minutos
setInterval(cleanExpiredStates, 10 * 60 * 1000);

module.exports = {
  setUserState,
  getUserState,
  updateUserStateData,
  clearUserState
};