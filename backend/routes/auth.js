const router  = require('express').Router();
const jwt     = require('jsonwebtoken');
const User    = require('../models/User');
const authMw  = require('../middleware/auth');

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

const sign = (user) =>
  jwt.sign({ id: user._id, username: user.username }, process.env.JWT_SECRET, { expiresIn: '7d' });

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

// ── Standard Auth ──────────────────────────────────────────
router.post('/register', registerLimiter, async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) return res.status(400).json({ error: 'Faltan campos' });
    if (password.length < 8) return res.status(400).json({ error: 'Contraseña mínimo 8 caracteres' });
    const exists = await User.findOne({ username: username.toLowerCase() });
    if (exists) return res.status(400).json({ error: 'Usuario ya existe' });
    const user = await User.create({ username, password });
    res.json({ token: sign(user), username: user.username });
  } catch (e) { console.error(e); res.status(500).json({ error: 'Error del servidor' }); }
});

router.post('/login', loginLimiter, async (req, res) => {
  try {
    const { username, password } = req.body;
    const user = await User.findOne({ username: username?.toLowerCase() });
    if (!user || !(await user.comparePassword(password)))
      return res.status(401).json({ error: 'Credenciales incorrectas' });
    res.json({ token: sign(user), username: user.username });
  } catch (e) { console.error(e); res.status(500).json({ error: 'Error del servidor' }); }
});

router.get('/me', authMw, async (req, res) => {
  const user = await User.findById(req.user.id).select('username passkeys');
  res.json({ username: user.username, hasPasskeys: user.passkeys.length > 0, passkeys: user.passkeys.map(p => ({ id: p._id, name: p.name, createdAt: p.createdAt })) });
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

module.exports = router;
