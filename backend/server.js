require('dotenv').config();
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
app.get('*', (req, res) => res.sendFile(path.join(__dirname, '../frontend/index.html')));

mongoose.connect(process.env.MONGO_URI)
  .then(() => {
    console.log('MongoDB connected');
    const PORT = process.env.PORT || 3000;
    app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
  })
  .catch(err => { console.error('MongoDB error:', err); process.exit(1); });
