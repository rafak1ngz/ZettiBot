module.exports = (req, res) => {
  const botToken = process.env.BOT_TOKEN;
  const webhookUrl = "https://zettibot.vercel.app/api/webhook";
  
  // Mostrar informações de diagnóstico
  res.status(200).json({
    botToken: botToken ? `${botToken.substring(0, 5)}...` : 'Não configurado',
    webhookUrl,
    timestamp: new Date().toISOString(),
    message: "Endpoint de teste para o ZettiBot"
  });
};