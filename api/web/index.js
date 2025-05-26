const { getCommonHeadContent } = require('./utils');

module.exports = (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html lang="pt-BR">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>ZettiBot - Seu Assistente de Vendas</title>
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
      
      <section class="hero">
        <div class="container">
          <h1>ZettiBot: Seu Parceiro em Vendas</h1>
          <p>Gerencie leads, compromissos e clientes pelo Telegram. Aumente sua produtividade e vendas.</p>
          <a href="/about" class="btn">Saiba Mais</a>
        </div>
      </section>

      <section class="features">
        <div class="container">
          <h2>Recursos Principais</h2>
          <div class="features-grid">
            <div class="feature-card">
              <div class="feature-icon">
                <i class="fas fa-calendar-check"></i>
              </div>
              <h3>Agenda Inteligente</h3>
              <p>Organize seus compromissos de forma simples e eficiente</p>
            </div>
            
            <div class="feature-card">
              <div class="feature-icon">
                <i class="fas fa-users"></i>
              </div>
              <h3>Gestão de Clientes</h3>
              <p>Mantenha seus contatos sempre atualizados</p>
            </div>
            
            <div class="feature-card">
              <div class="feature-icon">
                <i class="fas fa-sync-alt"></i>
              </div>
              <h3>Follow-up Automático</h3>
              <p>Nunca perca uma oportunidade de negócio</p>
            </div>
          </div>
        </div>
      </section>

      <footer>
        <div class="container">
          <div class="footer-content">
            <div class="footer-links">
              <h3>Atalhos</h3>
              <ul>
                <li><a href="/">Início</a></li>
                <li><a href="/about">Sobre</a></li>
                <li><a href="/login">Admin</a></li>
              </ul>
            </div>
            
            <div class="footer-links">
              <h3>Suporte</h3>
              <ul>
                <li><a href="#">Contato</a></li>
                <li><a href="#">Documentação</a></li>
                <li><a href="#">FAQ</a></li>
              </ul>
            </div>
          </div>
          
          <div class="footer-bottom">
            <p>© 2024 ZettiBot - Todos os direitos reservados</p>
          </div>
        </div>
      </footer>
    </body>
    </html>
  `);
};