const { getCommonHeadContent } = require('./utils');

module.exports = (req, res) => {
  // Verificar autenticação
  if (!req.cookies || req.cookies.adminToken !== process.env.SETUP_KEY) {
    return res.redirect('/login');
  }
  
  // Script para gerenciamento de usuários
  const scripts = `
  <script>
    // Carregar usuários do Telegram
    async function loadTelegramUsers() {
      try {
        const response = await fetch('/api/admin/telegram-users');
        const data = await response.json();
        
        const userListElement = document.getElementById('userList');
        userListElement.innerHTML = '';
        
        if (data.users && data.users.length > 0) {
          data.users.forEach(user => {
            const userElement = document.createElement('div');
            userElement.className = 'user-item';
            userElement.innerHTML = \`
              <div class="user-info">
                <div class="user-avatar">\${user.name.charAt(0)}</div>
                <div>
                  <div class="user-name">\${user.name}</div>
                  <div class="user-id">ID: \${user.telegram_id}</div>
                </div>
              </div>
              <div class="user-actions">
                <button onclick="deleteUser('\${user.telegram_id}')" title="Excluir"><i class="fas fa-trash"></i></button>
              </div>
            \`;
            userListElement.appendChild(userElement);
          });
        } else {
          userListElement.innerHTML = '<p>Nenhum usuário encontrado</p>';
        }
      } catch (error) {
        console.error('Erro ao carregar usuários:', error);
        document.getElementById('userList').innerHTML = 
          '<p style="color: red">Erro ao carregar usuários. Tente novamente.</p>';
      }
    }
    
    // Modal para adicionar usuário
    function showAddUserModal() {
      const modal = document.getElementById('addUserModal');
      modal.style.display = 'flex';
    }
    
    function closeAddUserModal() {
      const modal = document.getElementById('addUserModal');
      modal.style.display = 'none';
    }
    
    // Adicionar novo usuário
    async function addUser(event) {
      event.preventDefault();
      
      const telegramId = document.getElementById('telegramId').value;
      const userName = document.getElementById('userName').value;
      
      try {
        const response = await fetch('/api/admin/telegram-users/add', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            telegram_id: telegramId,
            name: userName
          })
        });
        
        const result = await response.json();
        
        if (result.success) {
          closeAddUserModal();
          loadTelegramUsers();
          alert('Usuário adicionado com sucesso!');
        } else {
          alert('Erro ao adicionar usuário: ' + result.error);
        }
      } catch (error) {
        console.error('Erro ao adicionar usuário:', error);
        alert('Erro ao adicionar usuário. Verifique o console para mais detalhes.');
      }
    }
    
    // Excluir usuário
    async function deleteUser(telegramId) {
      if (!confirm('Tem certeza que deseja excluir este usuário?')) {
        return;
      }
      
      try {
        const response = await fetch('/api/admin/telegram-users/delete', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            telegram_id: telegramId
          })
        });
        
        const result = await response.json();
        
        if (result.success) {
          loadTelegramUsers();
          alert('Usuário excluído com sucesso!');
        } else {
          alert('Erro ao excluir usuário: ' + result.error);
        }
      } catch (error) {
        console.error('Erro ao excluir usuário:', error);
        alert('Erro ao excluir usuário. Verifique o console para mais detalhes.');
      }
    }
    
    // Carregar usuários ao iniciar a página
    document.addEventListener('DOMContentLoaded', () => {
      loadTelegramUsers();
    });
  </script>
  `;

  res.send(`
    <!DOCTYPE html>
    <html lang="pt-BR">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Dashboard Admin - ZettiBot</title>
      ${getCommonHeadContent()}
    </head>
    <body>
      <header>
        <div class="container">
          <div class="logo">
            <div class="logo-text">ZettiBot</div>
          </div>
          <nav>
            <ul>
              <li><a href="/">Início</a></li>
              <li><a href="/about">Sobre</a></li>
              <li><a href="/logout">Sair</a></li>
            </ul>
          </nav>
        </div>
      </header>
      
      <section class="dashboard">
        <div class="container">
          <div class="dashboard-header">
            <h1>Painel Administrativo</h1>
          </div>
          
          <div class="dashboard-grid">
            <!-- Card de Usuários Telegram -->
            <div class="dashboard-card">
              <h2><i class="fab fa-telegram"></i> Usuários do Telegram</h2>
              <p>Gerencie os usuários autorizados a usar o bot.</p>
              
              <div id="userList" class="user-list">
                <p>Carregando usuários...</p>
              </div>
              
              <button onclick="showAddUserModal()" class="btn-add">
                <i class="fas fa-plus"></i> Adicionar Usuário
              </button>
            </div>
            
            <!-- Card de Status do Bot -->
            <div class="dashboard-card">
              <h2><i class="fas fa-robot"></i> Status do Bot</h2>
              
              <div style="margin: 20px 0; padding: 15px; background-color: #e8f5e9; border-radius: 5px; border-left: 5px solid #4CAF50;">
                <p><strong>Status:</strong> Online</p>
                <p><strong>Webhook:</strong> Configurado</p>
                <p><strong>Última atualização:</strong> ${new Date().toLocaleString()}</p>
              </div>
              
              <a href="/set-webhook" class="btn-add">
                <i class="fas fa-sync"></i> Atualizar Webhook
              </a>
            </div>
          </div>
        </div>
      </section>
      
      <!-- Modal para adicionar usuário -->
      <div id="addUserModal" class="modal">
        <div class="modal-content">
          <div class="modal-header">
            <h2>Adicionar Usuário</h2>
            <button class="modal-close" onclick="closeAddUserModal()">×</button>
          </div>
          
          <form id="addUserForm" onsubmit="addUser(event)">
            <div class="form-row">
              <label for="telegramId">ID do Telegram</label>
              <input type="text" id="telegramId" required placeholder="Ex: 123456789">
            </div>
            
            <div class="form-row">
              <label for="userName">Nome do Usuário</label>
              <input type="text" id="userName" required placeholder="Ex: João Silva">
            </div>
            
            <button type="submit" class="btn-add" style="width: 100%">
              Adicionar Usuário
            </button>
          </form>
        </div>
      </div>

      <footer>
        <div class="container">
          <div class="footer-bottom">
            <p>© 2024 ZettiBot - Painel Administrativo</p>
          </div>
        </div>
      </footer>
      
      ${scripts}
    </body>
    </html>
  `);
};