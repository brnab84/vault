const mongoose = require('mongoose');

const customFieldSchema = new mongoose.Schema({
  key:      { type: String, required: true },
  label:    { type: String, required: true },
  type:     { type: String, enum: ['text','password','url','number','textarea'], default: 'text' },
  required: { type: Boolean, default: false },
  order:    { type: Number, default: 0 }
}, { _id: true });

const categorySchema = new mongoose.Schema({
  id:       { type: String, required: true },
  label:    { type: String, required: true },
  icon:     { type: String, default: 'other' },
  color:    { type: String, default: '#888888' },
  builtIn:  { type: Boolean, default: false }
}, { _id: false });

const userSettingsSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
  categories: {
    type: [categorySchema],
    default: [
      { id: 'server', label: 'Servidor',      icon: 'server',  color: '#4f8fff', builtIn: true },
      { id: 'web',    label: 'Web / App',      icon: 'web',     color: '#3ecf8e', builtIn: true },
      { id: 'db',     label: 'Base de Datos',  icon: 'db',      color: '#fbbf24', builtIn: true },
      { id: 'vpn',    label: 'VPN / Red',      icon: 'vpn',     color: '#2dd4bf', builtIn: true },
      { id: 'other',  label: 'Otro',           icon: 'other',   color: '#888888', builtIn: true }
    ]
  },
  customFields: { type: [customFieldSchema], default: [] }
}, { timestamps: true });

module.exports = mongoose.model('UserSettings', userSettingsSchema);
