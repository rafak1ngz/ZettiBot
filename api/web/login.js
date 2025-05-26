module.exports = (req, res) => {
  // Se já estiver logado, redirecionar para admin
  if (req.cookies && req.cookies.adminToken) {
    return res.redirect('/admin');
  }

  res.send(`
    <!DOCTYPE html>
    <html lang="pt-BR">
    <head>
      <meta charset="UTF-8">
      <title>Login Admin - ZettiBot</title>
      <link rel="stylesheet" href="/styles/main.css">
    </head>
    <body>
      <div class="login-container">
        <form id="loginForm" action="/api/login" method="POST">
          <h2>Acesso Administrativo</h2>
          <input 
            type="password" 
            name="password" 
            placeholder="Senha de Administrador" 
            required
          >
          <button type="submit">Entrar</button>
        </form>
      </div>
    </body>
    </html>
  `);
};