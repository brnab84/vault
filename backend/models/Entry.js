const mongoose = require('mongoose');

const entrySchema = new mongoose.Schema({
  userId:        { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  name:          { type: String, required: true },
  cat:           { type: String, default: 'other' },
  group:         String,
  ip:            String,
  port:          String,
  user:          String,
  passEncrypted: String,
  url:           String,
  tags:          [String],
  notes:         String,
  // custom fields per entry: [{key, valueEncrypted}]
  customFields:  [{
    key:            { type: String, required: true },
    label:          String,
    valueEncrypted: String,
    isPassword:     { type: Boolean, default: false }
  }]
}, { timestamps: true });

module.exports = mongoose.model('Entry', entrySchema);
