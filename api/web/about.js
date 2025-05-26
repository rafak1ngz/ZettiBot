module.exports = (req, res) => {
  // CSS e bibliotecas idênticos ao index.js
  const googleFonts = '<link href="https://fonts.googleapis.com/css2?family=Montserrat:wght@400;600;700&family=Open+Sans:wght@400;600&display=swap" rel="stylesheet">';
  const fontAwesome = '<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">';
  
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
      <title>Sobre o ZettiBot</title>
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
      
      <section class="hero" style="padding: 60px 0;">
        <div class="container">
          <h1>Sobre o ZettiBot</h1>
          <p>Conheça mais sobre nosso assistente de vendas por Telegram</p>
        </div>
      </section>

      <section class="about">
        <div class="container">
          <div class="about-content">
            <div class="about-text">
              <h2>Nossa História</h2>
              <p>ZettiBot nasceu para resolver o caos das vendas externas. Com a missão de lembrar, organizar, sugerir e acompanhar, ele virou seu parceiro de jornada comercial. Leal, rápido, direto — Zetti não deixa lead esfriar.</p>
              
              <h3>Por que "Zetti"?</h3>
              <p>O nome vem de "Zet" (de "Zeta", última letra do alfabeto grego) simbolizando o que fecha vendas. É um robô com personalidade que entende as dores de vendedores externos.</p>
              
              <h3>Principais recursos</h3>
              <ul>
                <li><strong>Gestão de Clientes:</strong> Cadastre e organize todos os seus contatos</li>
                <li><strong>Agenda Inteligente:</strong> Nunca perca um compromisso</li>
                <li><strong>Follow-up Automático:</strong> Sistema inteligente de lembretes</li>
                <li><strong>Comissões:</strong> Controle de vendas e ganhos</li>
              </ul>
            </div>
            <div>
              <div style="background-color: var(--light-gray); border-radius: 10px; padding: 20px; text-align: center;">
                <div style="font-size: 100px; color: var(--primary-color);">
                  <i class="fas fa-robot"></i>
                </div>
                <h3>ZettiBot</h3>
                <p>Seu parceiro de vendas no bolso</p>
                <a href="https://t.me/ZettiBot" class="btn" style="margin-top: 20px;">
                  <i class="fab fa-telegram"></i> Abrir no Telegram
                </a>
              </div>
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