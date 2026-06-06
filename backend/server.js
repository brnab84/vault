require('dotenv').config();

// Polyfill WebCrypto for Node < 19 (Railway compatibility)
if (!globalThis.crypto) {
  const { webcrypto } = require('crypto');
  globalThis.crypto = webcrypto;
}

const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');

const app = express();
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
