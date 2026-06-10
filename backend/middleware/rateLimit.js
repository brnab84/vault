// Limitador de tasa en memoria — sin dependencias externas.
// Adecuado para una sola instancia (Railway). Protege endpoints de auth
// contra fuerza bruta. Se reinicia con el proceso (protección básica, no
// una barrera dura). Si en el futuro hay múltiples instancias, migrar a
// un store compartido (Redis).

const buckets = new Map(); // key -> { count, resetAt }

// Limpieza periódica para evitar crecimiento ilimitado de memoria.
const cleanup = setInterval(() => {
  const now = Date.now();
  for (const [k, v] of buckets) if (now > v.resetAt) buckets.delete(k);
}, 5 * 60 * 1000);
if (cleanup.unref) cleanup.unref();

// IP real del cliente (requiere app.set('trust proxy', ...) detrás de un proxy).
function ipOf(req) {
  return (req.ip || req.headers['x-forwarded-for'] || 'unknown').toString();
}

// Crea un middleware Express que limita a `max` peticiones por `windowMs`
// para la clave devuelta por `keyFn`.
function rateLimit({ windowMs, max, keyFn }) {
  return (req, res, next) => {
    const key = keyFn(req);
    const now = Date.now();
    let b = buckets.get(key);
    if (!b || now > b.resetAt) {
      b = { count: 0, resetAt: now + windowMs };
      buckets.set(key, b);
    }
    b.count++;
    if (b.count > max) {
      const retry = Math.ceil((b.resetAt - now) / 1000);
      res.set('Retry-After', String(retry));
      return res.status(429).json({ error: `Demasiados intentos. Intenta de nuevo en ${retry}s.` });
    }
    next();
  };
}

module.exports = { rateLimit, ipOf, _buckets: buckets };
