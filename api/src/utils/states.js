// Armazenamento de estados em memória
const userStates = {};

// Função para definir estado do usuário
function setUserState(userId, state, data = {}) {
  userStates[userId] = { state, data };
}

// Função para obter estado do usuário
function getUserState(userId) {
  return userStates[userId] || { state: null, data: {} };
}

// Função para limpar estado do usuário
function clearUserState(userId) {
  delete userStates[userId];
}

module.exports = {
  setUserState,
  getUserState,
  clearUserState
};