const router  = require('express').Router();
const jwt     = require('jsonwebtoken');
const User    = require('../models/User');
const authMw  = require('../middleware/auth');
const bcrypt  = require('bcryptjs');
const crypto  = require('crypto');

const {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse
} = require('@simplewebauthn/server');

const { rateLimit, ipOf } = require('../middleware/rateLimit');

// ── Rate limiters (anti fuerza-bruta) ──
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, max: 10,
  keyFn: (req) => 'login:' + ipOf(req) + ':' + (req.body?.username || '').toLowerCase()
});
const registerLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, max: 10,
  keyFn: (req) => 'register:' + ipOf(req)
});
const passkeyLoginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, max: 20,
  keyFn: (req) => 'pklogin:' + ipOf(req) + ':' + (req.body?.username || '').toLowerCase()
});
const verifierLoginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, max: 10,
  keyFn: (req) => 'vlogin:' + ipOf(req) + ':' + (req.body?.username || '').toLowerCase()
});

const sign = (user) =>
  jwt.sign({ id: user._id, username: user.username }, process.env.JWT_SECRET, { expiresIn: '7d' });

// Salt determinista para usuarios sin verificador aún (evita revelar si el usuario existe).
const pseudoSalt = (username) =>
  crypto.createHmac('sha256', process.env.JWT_SECRET || 'fallback').update('authsalt:' + username).digest('base64').slice(0, 24);

const RP_NAME = 'Vault';
// Origen FIJO para WebAuthn — no confiar en req.headers.origin (lo controla el cliente
// y debilitaría la resistencia a phishing). Si usas un dominio propio, define
// WEBAUTHN_ORIGIN en las variables de entorno de Railway.
const RP_ORIGIN = process.env.WEBAUTHN_ORIGIN || 'https://vault-production-8d8b.up.railway.app';
const getOrigin = () => RP_ORIGIN;
const getRpId = () => {
  try {
    return new URL(RP_ORIGIN).hostname;
  } catch {
    return 'vault-production-8d8b.up.railway.app';
  }
};

// ── Política de contraseñas ──
// Robusta = mínimo 12 caracteres y al menos 3 de: minúscula, mayúscula, número, símbolo.
function isRobustPassword(p) {
  if (typeof p !== 'string' || p.length < 12) return false;
  let classes = 0;
  if (/[a-z]/.test(p)) classes++;
  if (/[A-Z]/.test(p)) classes++;
  if (/[0-9]/.test(p)) classes++;
  if (/[^A-Za-z0-9]/.test(p)) classes++;
  return classes >= 3;
}
const ROBUST_MSG = 'La contraseña debe tener mínimo 12 caracteres e incluir al menos 3 de: mayúscula, minúscula, número, símbolo';
// ¿Venció la contraseña (o la cuenta es previa a la política)? -> debe cambiarla.
function passwordExpired(user) {
  if (!user.passwordChangedAt) return true;
  const ageDays = (Date.now() - new Date(user.passwordChangedAt).getTime()) / 86400000;
  return ageDays >= (user.passwordMaxAgeDays || 30);
}

// ── Standard Auth ──────────────────────────────────────────
router.post('/register', registerLimiter, async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) return res.status(400).json({ error: 'Faltan campos' });
    if (!isRobustPassword(password)) return res.status(400).json({ error: ROBUST_MSG });
    const exists = await User.findOne({ username: username.toLowerCase() });
    if (exists) return res.status(400).json({ error: 'Usuario ya existe' });
    const user = await User.create({ username, password, passwordChangedAt: new Date() });
    res.json({ token: sign(user), username: user.username, mustChangePassword: false, passwordMaxAgeDays: user.passwordMaxAgeDays });
  } catch (e) { console.error(e); res.status(500).json({ error: 'Error del servidor' }); }
});

router.post('/login', loginLimiter, async (req, res) => {
  try {
    const { username, password } = req.body;
    const user = await User.findOne({ username: username?.toLowerCase() });
    if (!user || !(await user.comparePassword(password)))
      return res.status(401).json({ error: 'Credenciales incorrectas' });
    res.json({ token: sign(user), username: user.username, mustChangePassword: passwordExpired(user), passwordMaxAgeDays: user.passwordMaxAgeDays || 30, passwordChangedAt: user.passwordChangedAt || null });
  } catch (e) { console.error(e); res.status(500).json({ error: 'Error del servidor' }); }
});

router.get('/me', authMw, async (req, res) => {
  const user = await User.findById(req.user.id).select('username passkeys passwordChangedAt passwordMaxAgeDays');
  res.json({ username: user.username, hasPasskeys: user.passkeys.length > 0, passkeys: user.passkeys.map(p => ({ id: p._id, name: p.name, createdAt: p.createdAt })), mustChangePassword: passwordExpired(user), passwordMaxAgeDays: user.passwordMaxAgeDays || 30, passwordChangedAt: user.passwordChangedAt || null });
});

// ── WebAuthn Registration ──────────────────────────────────
router.post('/passkey/register/start', authMw, async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    const options = await generateRegistrationOptions({
      rpName: RP_NAME,
      rpID: getRpId(req),
      userID: new TextEncoder().encode(user._id.toString()),
      userName: user.username,
      userDisplayName: user.username,
      attestationType: 'none',
      excludeCredentials: user.passkeys.map(pk => ({
        id: pk.credentialID,
        type: 'public-key',
        transports: pk.transports
      })),
      authenticatorSelection: {
        residentKey: 'discouraged',
        userVerification: 'required',
        authenticatorAttachment: 'platform' // strictly platform only — no external apps
      }
    });
    // Store challenge temporarily
    user.webauthnChallenge = options.challenge;
    await user.save();
    res.json(options);
  } catch (e) { console.error(e); res.status(500).json({ error: 'Error del servidor' }); }
});

router.post('/passkey/register/finish', authMw, async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    const { body, name } = req.body;
    const verification = await verifyRegistrationResponse({
      response: body,
      expectedChallenge: user.webauthnChallenge,
      expectedOrigin: getOrigin(req),
      expectedRPID: getRpId(req),
      requireUserVerification: true
    });
    if (!verification.verified) return res.status(400).json({ error: 'Verificación fallida' });
    const { credentialID, credentialPublicKey, counter, credentialDeviceType, credentialBackedUp } = verification.registrationInfo;
    user.passkeys.push({
      credentialID: Buffer.from(credentialID).toString('base64url'),
      credentialPublicKey: Buffer.from(credentialPublicKey).toString('base64'),
      counter,
      deviceType: credentialDeviceType,
      backedUp: credentialBackedUp,
      transports: body.response.transports || [],
      name: name || 'Mi dispositivo'
    });
    user.webauthnChallenge = null;
    await user.save();
    res.json({ ok: true, passkeyId: user.passkeys[user.passkeys.length - 1]._id });
  } catch (e) { console.error(e); res.status(500).json({ error: 'Error del servidor' }); }
});

// ── WebAuthn Authentication ────────────────────────────────
router.post('/passkey/login/start', passkeyLoginLimiter, async (req, res) => {
  try {
    const { username } = req.body;
    const user = await User.findOne({ username: username?.toLowerCase() });
    if (!user || !user.passkeys.length) return res.status(400).json({ error: 'Sin passkeys registradas' });
    const options = await generateAuthenticationOptions({
      rpID: getRpId(req),
      userVerification: 'preferred',
      allowCredentials: user.passkeys.map(pk => ({
        id: pk.credentialID,
        type: 'public-key',
        transports: pk.transports
      }))
    });
    user.webauthnChallenge = options.challenge;
    await user.save();
    res.json(options);
  } catch (e) { console.error(e); res.status(500).json({ error: 'Error del servidor' }); }
});

router.post('/passkey/login/finish', passkeyLoginLimiter, async (req, res) => {
  try {
    const { username, body } = req.body;
    const user = await User.findOne({ username: username?.toLowerCase() });
    if (!user) return res.status(400).json({ error: 'Usuario no encontrado' });
    const passkey = user.passkeys.find(pk => pk.credentialID === body.id);
    if (!passkey) return res.status(400).json({ error: 'Passkey no encontrada' });
    const verification = await verifyAuthenticationResponse({
      response: body,
      expectedChallenge: user.webauthnChallenge,
      expectedOrigin: getOrigin(req),
      expectedRPID: getRpId(req),
      requireUserVerification: true,
      credential: {
        id: passkey.credentialID,
        publicKey: Buffer.from(passkey.credentialPublicKey, 'base64'),
        counter: passkey.counter,
        transports: passkey.transports
      }
    });
    if (!verification.verified) return res.status(401).json({ error: 'Autenticación fallida' });
    passkey.counter = verification.authenticationInfo.newCounter;
    user.webauthnChallenge = null;
    await user.save();
    res.json({ token: sign(user), username: user.username });
  } catch (e) { console.error(e); res.status(500).json({ error: 'Error del servidor' }); }
});

// ── Delete passkey ──────────────────────────────────────────
router.delete('/passkey/:id', authMw, async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    user.passkeys = user.passkeys.filter(p => p._id.toString() !== req.params.id);
    await user.save();
    res.json({ ok: true });
  } catch (e) { console.error(e); res.status(500).json({ error: 'Error del servidor' }); }
});

// ── Cambiar contraseña ──
router.post('/change-password', authMw, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ error: 'Usuario no encontrado' });
    if (!currentPassword || !(await user.comparePassword(currentPassword)))
      return res.status(401).json({ error: 'La contraseña actual no es correcta' });
    if (!isRobustPassword(newPassword)) return res.status(400).json({ error: ROBUST_MSG });
    if (await user.comparePassword(newPassword))
      return res.status(400).json({ error: 'La nueva contraseña debe ser distinta de la actual' });
    user.password = newPassword;              // el hook pre-save la hashea
    user.passwordChangedAt = new Date();
    await user.save();
    res.json({ ok: true, passwordChangedAt: user.passwordChangedAt, passwordMaxAgeDays: user.passwordMaxAgeDays || 30 });
  } catch (e) { console.error(e); res.status(500).json({ error: 'Error del servidor' }); }
});

// ── Política de rotación (cada cuántos días: 1–60) ──
router.post('/password-policy', authMw, async (req, res) => {
  try {
    const maxAgeDays = parseInt(req.body.maxAgeDays, 10);
    if (!Number.isInteger(maxAgeDays) || maxAgeDays < 1 || maxAgeDays > 60)
      return res.status(400).json({ error: 'El intervalo debe estar entre 1 y 60 días' });
    const user = await User.findByIdAndUpdate(req.user.id, { passwordMaxAgeDays: maxAgeDays }, { new: true });
    res.json({ ok: true, passwordMaxAgeDays: user.passwordMaxAgeDays, mustChangePassword: passwordExpired(user) });
  } catch (e) { console.error(e); res.status(500).json({ error: 'Error del servidor' }); }
});

// ── Login con una sola contraseña (verificador derivado de la maestra) ──
// El cliente deriva authVerifier = PBKDF2(maestra, authSalt) con un salt DISTINTO al
// de cifrado, así el server verifica sin poder descifrar nada. Endpoints NUEVOS: el
// login clásico (/login con contraseña) sigue intacto hasta que el frontend migre.

// Devuelve el salt para derivar el verificador (sin revelar si el usuario existe).
router.post('/salt', async (req, res) => {
  try {
    const username = (req.body.username || '').toLowerCase().trim();
    const user = username ? await User.findOne({ username }) : null;
    res.json({ authSalt: (user && user.authSalt) || pseudoSalt(username), hasVerifier: !!(user && user.authVerifierHash) });
  } catch (e) { console.error(e); res.status(500).json({ error: 'Error del servidor' }); }
});

// Establece el verificador (se llama tras un login normal, con sesión válida).
router.post('/setup-verifier', authMw, async (req, res) => {
  try {
    const { authSalt, authVerifier } = req.body;
    if (!authSalt || !authVerifier) return res.status(400).json({ error: 'Faltan datos' });
    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ error: 'Usuario no encontrado' });
    user.authSalt = String(authSalt);
    user.authVerifierHash = await bcrypt.hash(String(authVerifier), 12);
    await user.save();
    res.json({ ok: true });
  } catch (e) { console.error(e); res.status(500).json({ error: 'Error del servidor' }); }
});

// Login con el verificador (en vez de la contraseña clásica).
router.post('/login-verifier', verifierLoginLimiter, async (req, res) => {
  try {
    const { username, authVerifier } = req.body;
    const user = await User.findOne({ username: username?.toLowerCase() });
    if (!user || !user.authVerifierHash || !authVerifier || !(await bcrypt.compare(String(authVerifier), user.authVerifierHash)))
      return res.status(401).json({ error: 'Credenciales incorrectas' });
    res.json({ token: sign(user), username: user.username, mustChangePassword: passwordExpired(user), passwordMaxAgeDays: user.passwordMaxAgeDays || 30, passwordChangedAt: user.passwordChangedAt || null });
  } catch (e) { console.error(e); res.status(500).json({ error: 'Error del servidor' }); }
});

module.exports = router;
