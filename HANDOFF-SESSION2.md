# Handoff — Vault App · Sesión 2

## Conexión Claude → GitHub (método establecido)

Durante esta sesión Bernardo proveyó tokens de GitHub directamente en el chat
y Claude se conectó a la API REST de GitHub para leer y escribir código sin
intermediarios — sin copiar/pegar, sin pull requests manuales.

### Tokens utilizados en esta sesión

| Token (primeros 8 chars) | Usado para |
|--------------------------|-----------|
| `ghp_UBuYX...` | Primeras subidas — estructura backend + frontend |
| `ghp_W2c5h...` | Features responsive, PWA, versioning, landing |
| `ghp_ZtPMH...` | Hotfixes sync modal, cache busting |
| `ghp_SJ0un...` | Face ID / WebAuthn |

> ⚠️ Todos estos tokens deben estar **revocados** en `github.com/settings/tokens`

### Cómo Claude se conecta a GitHub

Claude usa `bash_tool` para ejecutar llamadas directas a la GitHub REST API:

```bash
# 1. Leer SHA del último commit
curl -s -H "Authorization: token TOKEN" \
  "https://api.github.com/repos/brnab84/vault/git/refs/heads/main" \
  | python3 -c "import sys,json; print(json.load(sys.stdin)['object']['sha'])"

# 2. Crear rama
curl -s -X POST -H "Authorization: token TOKEN" \
  -H "Content-Type: application/json" \
  "https://api.github.com/repos/brnab84/vault/git/refs" \
  -d '{"ref":"refs/heads/feature/nueva","sha":"SHA_AQUI"}'

# 3. Subir archivo (base64 encoded)
CONTENT=$(base64 -w 0 /ruta/archivo.js)
FILE_SHA=$(curl -s -H "Authorization: token TOKEN" \
  "https://api.github.com/repos/brnab84/vault/contents/path/archivo.js?ref=BRANCH" \
  | python3 -c "import sys,json; print(json.load(sys.stdin).get('sha',''))")

curl -s -X PUT -H "Authorization: token TOKEN" \
  -H "Content-Type: application/json" \
  "https://api.github.com/repos/brnab84/vault/contents/path/archivo.js" \
  -d "{\"message\":\"feat: cambio\",\"content\":\"$CONTENT\",\"sha\":\"$FILE_SHA\",\"branch\":\"BRANCH\"}"

# 4. Mergear ramas
curl -s -X POST -H "Authorization: token TOKEN" \
  "https://api.github.com/repos/brnab84/vault/merges" \
  -d '{"base":"main","head":"feature/algo","commit_message":"feat: descripcion"}'

# 5. Crear tag de versión
curl -s -X POST -H "Authorization: token TOKEN" \
  "https://api.github.com/repos/brnab84/vault/git/refs" \
  -d '{"ref":"refs/tags/v2.6.0","sha":"SHA_MAIN"}'
```

Para archivos grandes (>100KB) Claude usa Python requests en lugar de curl:

```python
import requests, base64

headers = {"Authorization": f"token {TOKEN}", "Content-Type": "application/json"}

with open('/ruta/archivo', 'rb') as f:
    content = base64.b64encode(f.read()).decode()

r = requests.get(f"https://api.github.com/repos/{REPO}/contents/{path}", headers=headers)
sha = r.json().get('sha', '')

payload = {"message": "feat: cambio", "content": content, "branch": "main"}
if sha: payload["sha"] = sha

requests.put(f"https://api.github.com/repos/{REPO}/contents/{path}",
    headers=headers, json=payload)
```

### Flujo estándar por cada cambio

```
Claude escribe código en /home/claude/ (sandbox local)
        ↓
Crea rama feature/* o hotfix/*
        ↓
Sube archivos modificados vía API
        ↓
Mergea feature → develop → staging → main
        ↓
Crea tag vX.X.X en GitHub
        ↓
Railway detecta push a main → autodeploy automático
        ↓
version.json se actualiza con el número de versión
```

---

## Repositorio y producción

| Item | Valor |
|------|-------|
| Repo | `github.com/brnab84/vault` |
| Producción | `https://vault-production-8d8b.up.railway.app` |
| App | `https://vault-production-8d8b.up.railway.app/app` |
| Landing | `https://vault-production-8d8b.up.railway.app/` |

### Variables de entorno en Railway

```
MONGO_URI  = mongodb+srv://vaultapp:PASSWORD@cluster0.anapkyj.mongodb.net/vault
JWT_SECRET = VaultApp2024_SuperSecretKey_MinLength32chars
NODE_VERSION = 18
```

---

## Stack

```
Frontend  : HTML/CSS/JS vanilla · PWA (manifest + service worker)
Backend   : Node.js 18 + Express
DB        : MongoDB Atlas (cluster FREE · AWS Sao Paulo)
Deploy    : Railway (autodeploy desde main)
Crypto    : AES-256-GCM + PBKDF2 200k iteraciones (client-side)
Auth      : JWT 7d + bcrypt 12 rounds
BiometríA : WebAuthn / Passkeys (Face ID, Touch ID, Android biometrics)
```

---

## Estructura del repositorio

```
vault/
├── frontend/
│   ├── index.html       ← app completa (auth + vault + settings)
│   ├── landing.html     ← página de ventas para nuevos usuarios
│   ├── manifest.json    ← PWA manifest
│   ├── sw.js            ← service worker (cache busting por versión)
│   ├── icon-192.png
│   └── icon-512.png
├── backend/
│   ├── server.js        ← Express + rutas + no-cache headers
│   ├── models/
│   │   ├── User.js          ← bcrypt + passkeys (WebAuthn)
│   │   ├── Entry.js         ← entradas con customFields[]
│   │   └── UserSettings.js  ← categorías + campos + fieldOrder por usuario
│   ├── routes/
│   │   ├── auth.js          ← login/register + WebAuthn passkeys
│   │   ├── entries.js       ← CRUD entradas
│   │   └── settings.js      ← categorías custom + campos + fieldOrder
│   └── middleware/
│       └── auth.js          ← JWT verify
├── version.json         ← fuente de verdad de versión + changelog
├── .node-version        ← fuerza Node 18 en Railway
├── railway.json         ← config deploy
├── package.json
├── HANDOFF.md
└── README.md
```

---

## Routing

| URL | Sirve |
|-----|-------|
| `/` | `landing.html` (nuevos visitantes) |
| `/app` | `index.html` (usuarios existentes) |
| `/api/*` | Backend API |
| `/version.json` | Versión actual (sin cache) |
| `/sw.js` | Service worker con versión inyectada |

**Usuarios existentes** con bookmark o PWA a `/app` no ven la landing — entran directo al vault.

---

## Versiones en esta sesión

| Tag | Descripción |
|-----|------------|
| `v2.6.2` | Hotfix Face ID: fuerza autenticador nativo, no apps externas |
| `v2.6.1` | Hotfix WebCrypto polyfill para Node < 19 en Railway |
| `v2.6.0` | Face ID / Touch ID / Biometría via WebAuthn |
| `v2.5.7` | No-cache headers — HTML nunca se cachea |
| `v2.5.6` | Sync modal funcional móvil + escritorio |
| `v2.5.5` | Hotfix sync modal z-index |
| `v2.5.4` | Popup sync con progreso y estados |
| `v2.5.3` | Sync button visible en topbar |
| `v2.5.2` | Sync feedback detallado + offline detection |
| `v2.5.1` | Update banner respeta safe-area iPhone |
| `v2.5.0` | Landing page SaaS + routing / vs /app |
| `v2.4.1` | Cache busting + auto update banner |
| `v2.4.0` | PWA + version display + responsive 5yr devices |
| `v2.3.0` | Defensive rendering + migration safety |
| `v2.2.0` | Drag & drop field order por usuario |
| `v2.1.0` | Responsive mobile + hamburger menu |
| `v2.0.0` | Categorías custom + campos personalizados + copy |
| `v1.0.0` | Launch |

Todos los tags visibles en `github.com/brnab84/vault/tags`

---

## Features implementadas

### Seguridad
- AES-256-GCM + PBKDF2 200k iteraciones — encriptación 100% client-side
- JWT 7 días + bcrypt 12 rounds
- Zero knowledge — el servidor nunca ve contraseñas en texto plano
- Face ID / Touch ID / WebAuthn (v2.6.0) — passkeys por dispositivo
- No-cache headers en HTML — siempre sirve versión fresca

### Vault (core)
- CRUD completo de entradas (IP, host, usuario, contraseña, URL, notas, tags)
- Categorías predefinidas + personalizadas por usuario (con color)
- Campos personalizados por usuario (texto, password, URL, número, textarea)
- Orden y visibilidad de campos con drag & drop (touch + mouse)
- Copiar IP / usuario / contraseña con un toque desde las cards
- Búsqueda en tiempo real

### UX / PWA
- PWA instalable en iOS y Android (sin App Store)
- Responsive para iOS 14+ / Android 8+ / browsers 5 años atrás
- Sidebar en desktop, hamburger en móvil
- Sync modal con progreso, estados y detección offline
- Auto-update banner cuando hay nueva versión
- Version display en sidebar con changelog completo
- Generador de contraseñas con medidor de fortaleza

### SaaS
- Landing page pública en `/` (nuevos visitantes)
- App en `/app` (usuarios existentes — no ven la landing)
- Pricing Free / Pro / Enterprise en la landing
- Control de versiones con tags en GitHub
- `version.json` como fuente única de verdad

---

## Pendiente (próximas fases)

**Fase 2 — Monetización**
- Stripe billing (Free/Pro/Enterprise)
- Límite de entradas en plan Free (50)
- Dashboard admin SaaS

**Fase 3 — Equipos**
- Organizaciones + roles (Admin/Editor/Viewer)
- Invitar usuarios por email
- Auditoría de accesos

**Fase 4 — Funcionalidades**
- Envío de credenciales por email encriptado (SendGrid/Resend)
- Historial de contraseñas por entrada
- Export CSV/Excel encriptado
- 2FA TOTP (Google Authenticator)

---

## Para retomar en próximas sesiones

Darle a Claude:
```
Token: ghp_xxxxxxxxxxxx   ← crear uno nuevo en github.com/settings/tokens/new (scope: repo)
Repo:  brnab84/vault
```

> ⚠️ Crear token nuevo por sesión y revocar al terminar en `github.com/settings/tokens`
