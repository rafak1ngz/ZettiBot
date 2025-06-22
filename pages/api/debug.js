export default function handler(req, res) {
  res.status(200).json({ 
    status: 'ok', 
    message: 'Debug endpoint working',
    query: req.query
  });
}