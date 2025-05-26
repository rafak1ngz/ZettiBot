module.exports = (req, res) => {
  // Verificar autenticação
  if (!req.cookies || req.cookies.adminToken !== process.env.SETUP_KEY) {
    return res.redirect('/login');
  }

  res.send(`
    <!DOCTYPE html>
    <html lang="pt-BR">
    <head>
      <meta charset="UTF-8">
      <title>Dashboard Admin - ZettiBot</title>
      <link rel="stylesheet" href="/styles/main.css">
    </head>
    <body>
      <header>
        <h1>ZettiBot - Painel Administrativo</h1>
        <a href="/logout" class="logout-btn">Sair</a>
      </header>
      
      <main class="admin-dashboard">
        <section class="telegram-users">
          <h2>Usuários Telegram</h2>
          <div id="userList">
            <!-- Usuários serão carregados via JavaScript/API -->
          </div>
          <button id="addUserBtn">Adicionar Usuário</button>
        </section>

        <section class="bot-config">
          <h2>Configurações do Bot</h2>
          <!-- Campos de configuração -->
        </section>
      </main>
    </body>
    </html>
  `);
};