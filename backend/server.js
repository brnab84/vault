require('dotenv').config();

// Polyfill WebCrypto for Node < 19 (Railway compatibility)
if (!globalThis.crypto) {
  const { webcrypto } = require('crypto');
  globalThis.crypto = webcrypto;
}

// ── Chequeo de JWT_SECRET ──
// Falta el secreto -> no se puede firmar/verificar nada, mejor no arrancar.
// Es el valor que se filtró en el repo -> advertencia fuerte (NO se sale para no
// tumbar producción; rotar en Railway y luego se puede endurecer a process.exit).
const LEAKED_JWT_SECRET = 'VaultApp2024_SuperSecretKey_MinLength32chars';
if (!process.env.JWT_SECRET) {
  console.error('FATAL: falta JWT_SECRET en las variables de entorno.');
  process.exit(1);
}
if (process.env.JWT_SECRET === LEAKED_JWT_SECRET) {
  console.warn('==================== ADVERTENCIA DE SEGURIDAD ====================');
  console.warn(' JWT_SECRET es el valor que quedó filtrado en el repositorio.');
  console.warn(' Cualquiera con acceso al repo puede forjar sesiones de usuarios.');
  console.warn(' ROTALO YA en las variables de entorno de Railway.');
  console.warn('==================================================================');
}

const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');

const app = express();
app.set('trust proxy', 1); // Railway corre detrás de un proxy — IP real del cliente para rate-limit

// ── Cabeceras de seguridad ──
// CSP verificada contra los recursos reales: todo es inline o same-origin salvo
// Google Fonts (googleapis para el CSS + gstatic para las fuentes).
const CSP = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com",
  "img-src 'self' data:",
  "connect-src 'self'",
  "manifest-src 'self'",
  "worker-src 'self'",
  "object-src 'none'",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'"
].join('; ');
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  res.setHeader('Content-Security-Policy', CSP);
  next();
});

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '../frontend')));

app.use('/api/auth',     require('./routes/auth'));
app.use('/api/entries',  require('./routes/entries'));
app.use('/api/settings', require('./routes/settings'));

app.get('/api/health', (req, res) => res.json({ status: 'ok', time: new Date() }));
app.get('/version.json', (req, res) => {
  res.sendFile(require('path').join(__dirname, '../version.json'));
});

// Serve sw.js with version injected — cache busting on every deploy
app.get('/sw.js', (req, res) => {
  const fs = require('fs');
  const swPath = require('path').join(__dirname, '../frontend/sw.js');
  const versionPath = require('path').join(__dirname, '../version.json');
  try {
    let sw = fs.readFileSync(swPath, 'utf8');
    const version = JSON.parse(fs.readFileSync(versionPath, 'utf8'));
    // Replace placeholder with actual version + timestamp for uniqueness
    sw = sw.replace('__CACHE_VERSION__', version.version + '-' + version.build);
    res.setHeader('Content-Type', 'application/javascript');
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.send(sw);
  } catch(e) {
    res.status(500).send('// SW error: ' + e.message);
  }
});
app.get('*', (req, res) => res.sendFile(path.join(__dirname, '../frontend/index.html')));

mongoose.connect(process.env.MONGO_URI)
  .then(() => {
    console.log('MongoDB connected');
    const PORT = process.env.PORT || 3000;
    app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
  })
  .catch(err => { console.error('MongoDB error:', err); process.exit(1); });
