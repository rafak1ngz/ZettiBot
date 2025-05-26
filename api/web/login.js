module.exports = (req, res) => {
  // Verificação se já está logado
  if (req.cookies && req.cookies.adminToken) {
    return res.redirect('/admin');
  }
  
  // CSS e bibliotecas
  const googleFonts = '<link href="https://fonts.googleapis.com/css2?family=Montserrat:wght@400;600;700&family=Open+Sans:wght@400;600&display=swap" rel="stylesheet">';
  const fontAwesome = '<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">';
  
  // Verifica se tem erro
  const hasError = req.query && req.query.error;
  
  // CSS incorporado - mesmo conteúdo que index.js
  // Para brevidade, estou omitindo aqui, mas você deve incluir o mesmo CSS
  const styles = `<style>
    /* Aqui colamos todo o CSS do arquivo main.css */
    /* ... */
  </style>`;

  res.send(`
    <!DOCTYPE html>
    <html lang="pt-BR">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Login Admin - ZettiBot</title>
      ${googleFonts}
      ${fontAwesome}
      ${styles}
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
              <li><a href="/login">Login Admin</a></li>
            </ul>
          </nav>
        </div>
      </header>
      
      <div class="login-page">
        <div class="login-container">
          <h2><i class="fas fa-lock"></i> Acesso Administrativo</h2>
          
          ${hasError ? '<p class="error-message">Senha incorreta. Tente novamente.</p>' : ''}
          
          <form id="loginForm" action="/api/login" method="POST">
            <div class="form-group">
              <label for="password">Senha de Administrador</label>
              <input 
                type="password" 
                id="password"
                name="password" 
                placeholder="Digite a senha de administrador" 
                required
              >
            </div>
            
            <button type="submit" class="btn-login">
              <i class="fas fa-sign-in-alt"></i> Entrar
            </button>
            
            <div style="text-align: center; margin-top: 20px;">
              <a href="/">Voltar à página inicial</a>
            </div>
          </form>
        </div>
      </div>

      <footer>
        <div class="container">
          <div class="footer-bottom">
            <p>© 2024 ZettiBot - Todos os direitos reservados</p>
          </div>
        </div>
      </footer>
    </body>
    </html>
  `);
};