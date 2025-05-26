module.exports = (req, res) => {
  // Verificação de Google Fonts deve ser incluída na tag head
  const googleFonts = '<link href="https://fonts.googleapis.com/css2?family=Montserrat:wght@400;600;700&family=Open+Sans:wght@400;600&display=swap" rel="stylesheet">';
  
  // Ícones Font Awesome para ícones vetoriais
  const fontAwesome = '<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">';

  // CSS incorporado
  const styles = `<style>
    /* Aqui colamos todo o CSS do arquivo main.css */
    :root {
      --primary-color: #1E4E8C;
      --secondary-color: #FF6B35;
      --dark-blue: #0D2744;
      --light-blue: #7DB0D7;
      --light-gray: #F5F5F5;
      --text-color: #252525;
      --background-color: #FFFFFF;
      --font-primary: 'Montserrat', sans-serif;
      --font-secondary: 'Open Sans', sans-serif;
    }

    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }

    body {
      font-family: var(--font-secondary);
      color: var(--text-color);
      background-color: var(--background-color);
      line-height: 1.6;
    }

    h1, h2, h3, h4, h5, h6 {
      font-family: var(--font-primary);
      font-weight: 600;
      margin-bottom: 1rem;
      color: var(--primary-color);
    }

    h1 {
      font-size: 2.5rem;
    }

    h2 {
      font-size: 2rem;
    }

    h3 {
      font-size: 1.5rem;
    }

    p {
      margin-bottom: 1.5rem;
    }

    a {
      color: var(--primary-color);
      text-decoration: none;
      transition: color 0.3s ease;
    }

    a:hover {
      color: var(--secondary-color);
    }

    .container {
      width: 100%;
      max-width: 1200px;
      margin: 0 auto;
      padding: 0 20px;
    }

    /* Header */
    header {
      background-color: var(--primary-color);
      color: white;
      padding: 20px 0;
      box-shadow: 0 2px 10px rgba(0, 0, 0, 0.1);
    }

    header .container {
      display: flex;
      justify-content: space-between;
      align-items: center;
    }

    .logo {
      display: flex;
      align-items: center;
    }

    .logo img {
      height: 50px;
      margin-right: 10px;
    }

    .logo-text {
      font-family: var(--font-primary);
      font-weight: 700;
      font-size: 1.8rem;
      color: white;
    }

    nav ul {
      display: flex;
      list-style: none;
    }

    nav li {
      margin-left: 30px;
    }

    nav a {
      color: white;
      font-weight: 600;
      font-size: 1rem;
      transition: color 0.3s ease;
    }

    nav a:hover {
      color: var(--secondary-color);
    }

    /* Hero Section */
    .hero {
      background: linear-gradient(135deg, var(--primary-color) 0%, var(--dark-blue) 100%);
      color: white;
      padding: 100px 0;
      text-align: center;
    }

    .hero h1 {
      font-size: 3rem;
      margin-bottom: 20px;
      color: white;
    }

    .hero p {
      font-size: 1.2rem;
      max-width: 800px;
      margin: 0 auto 30px;
    }

    .btn {
      display: inline-block;
      background-color: var(--secondary-color);
      color: white;
      padding: 12px 30px;
      border-radius: 30px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 1px;
      transition: all 0.3s ease;
    }

    .btn:hover {
      background-color: white;
      color: var(--secondary-color);
      transform: translateY(-3px);
      box-shadow: 0 10px 20px rgba(0, 0, 0, 0.1);
    }

    /* Features */
    .features {
      padding: 80px 0;
      background-color: white;
      text-align: center;
    }

    .features h2 {
      margin-bottom: 50px;
    }

    .features-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
      gap: 30px;
      margin-top: 50px;
    }

    .feature-card {
      background-color: var(--light-gray);
      border-radius: 10px;
      padding: 30px;
      text-align: center;
      transition: transform 0.3s ease, box-shadow 0.3s ease;
    }

    .feature-card:hover {
      transform: translateY(-10px);
      box-shadow: 0 15px 30px rgba(0, 0, 0, 0.1);
    }

    .feature-icon {
      background-color: var(--primary-color);
      width: 80px;
      height: 80px;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      margin: 0 auto 20px;
      font-size: 2rem;
      color: white;
    }

    /* Footer */
    footer {
      background-color: var(--dark-blue);
      color: white;
      padding: 50px 0 20px;
    }

    .footer-content {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: 30px;
      margin-bottom: 40px;
    }

    .footer-links h3 {
      color: white;
      margin-bottom: 20px;
    }

    .footer-links ul {
      list-style: none;
    }

    .footer-links li {
      margin-bottom: 10px;
    }

    .footer-links a {
      color: var(--light-blue);
    }

    .footer-links a:hover {
      color: var(--secondary-color);
    }

    .footer-bottom {
      text-align: center;
      padding-top: 20px;
      border-top: 1px solid rgba(255, 255, 255, 0.1);
    }

    /* Media Queries */
    @media screen and (max-width: 768px) {
      .features-grid {
        grid-template-columns: 1fr;
      }
      
      .hero h1 {
        font-size: 2.5rem;
      }
      
      nav ul {
        flex-direction: column;
      }
      
      nav li {
        margin-left: 0;
        margin-bottom: 10px;
      }
    }
  </style>`;

  res.send(`
    <!DOCTYPE html>
    <html lang="pt-BR">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>ZettiBot - Seu Assistente de Vendas</title>
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