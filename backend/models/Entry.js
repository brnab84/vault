const mongoose = require('mongoose');

const entrySchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  name:   { type: String, required: true },
  cat:    { type: String, enum: ['server','web','db','vpn','other'], default: 'other' },
  ip:     String,
  port:   String,
  user:   String,
  // password stored AES-256 encrypted (encrypted client-side before sending)
  passEncrypted: String,
  url:    String,
  tags:   [String],
  notes:  String,
}, { timestamps: true });

module.exports = mongoose.model('Entry', entrySchema);
