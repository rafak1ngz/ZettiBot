module.exports = (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html lang="pt-BR">
    <head>
      <meta charset="UTF-8">
      <title>Sobre o ZettiBot</title>
      <link rel="stylesheet" href="/styles/main.css">
    </head>
    <body>
      <header>
        <img src="/images/logo.png" alt="ZettiBot Logo">
        <nav>
          <a href="/">Início</a>
          <a href="/about">Sobre</a>
          <a href="/login">Login Admin</a>
        </nav>
      </header>
      
      <main>
        <section class="about">
          <h1>Sobre o ZettiBot</h1>
          <p>ZettiBot é um assistente de vendas inteligente projetado para automatizar e otimizar sua jornada comercial.</p>
          
          <h2>Recursos Principais</h2>
          <ul>
            <li>Gerenciamento de Agenda</li>
            <li>Controle de Clientes</li>
            <li>Follow-up Automático</li>
            <li>Integração com Telegram</li>
          </ul>
        </section>
      </main>

      <footer>
        <p>© 2024 ZettiBot - Todos os direitos reservados</p>
      </footer>
    </body>
    </html>
  `);
};