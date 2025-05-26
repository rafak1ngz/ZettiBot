module.exports = (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html lang="pt-BR">
    <head>
      <meta charset="UTF-8">
      <title>ZettiBot - Seu Assistente de Vendas</title>
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
        <section class="hero">
          <h1>ZettiBot: Seu Parceiro em Vendas</h1>
          <p>Gerencie leads, compromissos e clientes com facilidade</p>
          <a href="/about" class="cta-button">Saiba Mais</a>
        </section>

        <section class="features">
          <div class="feature">
            <h3>Agenda Inteligente</h3>
            <p>Organize seus compromissos de forma simples e eficiente</p>
          </div>
          <div class="feature">
            <h3>Gestão de Clientes</h3>
            <p>Mantenha seus contatos sempre atualizados</p>
          </div>
          <div class="feature">
            <h3>Follow-up Automático</h3>
            <p>Nunca perca uma oportunidade de negócio</p>
          </div>
        </section>
      </main>

      <footer>
        <p>© 2024 ZettiBot - Todos os direitos reservados</p>
      </footer>
    </body>
    </html>
  `);
};