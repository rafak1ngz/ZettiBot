export default function Home() {
  return (
    <div style={{ padding: '40px', textAlign: 'center', fontFamily: 'Arial' }}>
      <h1>ZettiBot</h1>
      <p>Bot do Telegram para vendedores externos</p>
      <p>
        <a 
          href="https://t.me/AgenteZettiBot" 
          style={{
            display: 'inline-block',
            background: '#1E4E8C',
            color: 'white',
            padding: '10px 20px',
            textDecoration: 'none',
            borderRadius: '5px'
          }}
        >
          Acessar no Telegram
        </a>
      </p>
    </div>
  )
}