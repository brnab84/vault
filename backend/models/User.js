const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const passkeySchema = new mongoose.Schema({
  credentialID:        { type: String, required: true },
  credentialPublicKey: { type: String, required: true }, // base64
  counter:             { type: Number, default: 0 },
  deviceType:          { type: String, default: 'singleDevice' },
  backedUp:            { type: Boolean, default: false },
  transports:          [String],
  createdAt:           { type: Date, default: Date.now },
  name:                { type: String, default: 'Mi dispositivo' }
}, { _id: true });

const userSchema = new mongoose.Schema({
  username:  { type: String, required: true, unique: true, trim: true, lowercase: true },
  password:  { type: String, required: true },
  passwordChangedAt:  { type: Date },                                 // ausente = cuenta previa a la política (debe cambiar)
  passwordMaxAgeDays: { type: Number, default: 30, min: 1, max: 60 }, // rotación: forzar cambio cada N días
  passkeys:  { type: [passkeySchema], default: [] },
  webauthnChallenge: { type: String, default: null }, // temp challenge storage
  createdAt: { type: Date, default: Date.now }
});

userSchema.pre('save', async function(next) {
  if (!this.isModified('password')) return next();
  this.password = await bcrypt.hash(this.password, 12);
  next();
});

userSchema.methods.comparePassword = function(pw) {
  return bcrypt.compare(pw, this.password);
};

module.exports = mongoose.model('User', userSchema);
