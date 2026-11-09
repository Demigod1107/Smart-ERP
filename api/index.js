let app;
let initError = null;

try {
  const s = require('../server/server');
  app = s.app;
} catch (err) {
  initError = err;
  console.error('Server initialization error on Vercel:', err);
}

module.exports = (req, res) => {
  if (initError) {
    return res.status(500).json({
      error: 'Backend Initialization Error on Vercel',
      message: initError.message,
      stack: initError.stack
    });
  }
  return app(req, res);
};
