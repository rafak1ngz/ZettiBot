const { getCommonHeadContent } = require('./utils');

module.exports = (req, res) => {
  // Verificação se já está logado
  if (req.cookies && req.cookies.adminToken) {
    res.statusCode = 302;
    res.setHeader('Location', '/admin');
    return res.end();
  }


  // Verifica se tem erro
  const hasError = req.query && req.query.error;
  let errorMessage = '';
  
  if (hasError === '1') {
    errorMessage = 'Senha incorreta. Tente novamente.';
  } else if (hasError === '2') {
    errorMessage = 'Erro ao processar login. Tente novamente.';
  }
  
  res.send(`
    <!DOCTYPE html>
    <html lang="pt-BR">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Login Admin - ZettiBot</title>
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
              <li><a href="/login">Login Admin</a></li>
            </ul>
          </nav>
        </div>
      </header>
      
      <div class="login-page">
        <div class="login-container">
          <h2><i class="fas fa-lock"></i> Acesso Administrativo</h2>
          
          ${hasError ? `<p class="error-message">${errorMessage}</p>` : ''}
          
          <form id="loginForm" action="/api/login" method="POST" enctype="application/x-www-form-urlencoded">
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
      
      <script>
        // Script para garantir envio correto do formulário
        document.getElementById('loginForm').addEventListener('submit', function(event) {
          console.log('Formulário enviado');
        });
      </script>
    </body>
    </html>
  `);
};