export default function Home() {
  return (
    <div style={{ 
      fontFamily: 'Arial', 
      maxWidth: '800px', 
      margin: '0 auto', 
      padding: '20px',
      textAlign: 'center'
    }}>
      <h1>ZettiBot - Assistente de Vendas</h1>
      <p>Este é o servidor do ZettiBot, um assistente digital para vendedores externos.</p>
      
      <div style={{
        margin: '20px 0',
        padding: '15px',
        backgroundColor: '#e6f7ff',
        borderRadius: '5px'
      }}>
        <h2>Status: Online 🟢</h2>
      </div>
      
      <p>
        <a 
          href="https://t.me/AgenteZettiBot"
          style={{
            display: 'inline-block',
            background: '#1E4E8C',
            color: 'white',
            padding: '10px 20px',
            borderRadius: '5px',
            textDecoration: 'none',
            margin: '10px 0'
          }}
        >
          Acessar no Telegram
        </a>
      </p>
      
      <div style={{
        marginTop: '40px',
        fontSize: '14px',
        color: '#666'
      }}>
        &copy; 2023 ZettiBot - Todos os direitos reservados
      </div>
    </div>
  );
}