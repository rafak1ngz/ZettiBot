export default async function handler(req, res) {
  try {
    // Hora do servidor
    const agora = new Date();
    
    // Formato para o Brasil (GMT-3)
    const horaUTC = agora.getUTCHours();
    const horaBrasil = (horaUTC - 3 + 24) % 24;
    
    const resposta = {
      hora_servidor: {
        iso: agora.toISOString(),
        local: agora.toString(),
        hora_utc: horaUTC,
        hora_brasil_calculada: horaBrasil
      },
      ambiente: {
        node_env: process.env.NODE_ENV,
        tz: process.env.TZ || 'não definido'
      },
      timestamp: Date.now()
    };
    
    res.status(200).json(resposta);
  } catch (error) {
    res.status(500).json({ error: 'Erro ao gerar informações de debug' });
  }
}