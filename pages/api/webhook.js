export default function handler(req, res) {
  // Apenas para teste, sem funcionalidade
  console.log('Webhook chamado', req.method)
  
  res.status(200).json({ 
    success: true, 
    message: 'Webhook endpoint funcionando',
    time: new Date().toISOString(),
    method: req.method
  })
}