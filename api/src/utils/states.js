// Armazenamento em memória dos estados
const userStates = {};

function setUserState(userId, state, data = {}) {
  userStates[userId] = { state, data };
}

function getUserState(userId) {
  return userStates[userId] || { state: null, data: {} };
}

function clearUserState(userId) {
  delete userStates[userId];
}

module.exports = {
  setUserState,
  getUserState,
  clearUserState
};