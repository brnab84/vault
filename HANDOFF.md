# Handoff — Vault App

## Lo que construimos
Gestor de contraseñas full-stack con encriptación AES-256-GCM client-side.

**Stack:**
- Frontend: HTML/CSS/JS vanilla (sin frameworks)
- Backend: Node.js + Express
- DB: MongoDB Atlas (cluster FREE en AWS Sao Paulo)
- Deploy: Railway (auto-deploy desde GitHub main)
- Crypto: AES-256-GCM + PBKDF2 200k iteraciones — las contraseñas **nunca** viajan en texto plano

**URL producción:** `https://vault-production-8d8b.up.railway.app`  
**Repo:** `https://github.com/brnab84/vault`

---

## Estructura del repo
```
vault/
├── backend/
│   ├── server.js              ← Express + MongoDB connect
│   ├── models/
│   │   ├── User.js            ← bcrypt hash de passwords
│   │   ├── Entry.js           ← entradas con customFields[]
│   │   └── UserSettings.js    ← categorías + campos por usuario
│   ├── routes/
│   │   ├── auth.js            ← POST /register, POST /login, GET /me
│   │   ├── entries.js         ← CRUD /entries
│   │   └── settings.js        ← GET/PUT /settings/categories|fields
│   ├── middleware/
│   │   └── auth.js            ← JWT verify middleware
│   └── .env.example
├── frontend/
│   └── index.html             ← toda la app en un solo archivo
├── railway.json               ← config deploy Railway
├── package.json               ← root para Railway
└── README.md
```

---

## Variables de entorno en Railway
```
MONGO_URI  = mongodb+srv://vaultapp:PASSWORD@cluster0.anapkyj.mongodb.net/vault?appName=Cluster0
JWT_SECRET = VaultApp2024_SuperSecretKey_MinLength32chars
```

> ⚠️ Cambiar password en Atlas → Security → Database Access

---

## Conexión Claude → GitHub (API directa)

Claude escribe código directo en el repo sin copiar/pegar usando la GitHub REST API desde bash.

### Autenticación
```
Token:  Personal Access Token de GitHub
Scope:  repo (acceso completo)
Crear:  github.com/settings/tokens/new
```

### Operaciones clave

**Leer SHA del último commit:**
```bash
curl -s -H "Authorization: token TOKEN" \
  "https://api.github.com/repos/USER/REPO/git/refs/heads/main" \
  | python3 -c "import sys,json; print(json.load(sys.stdin)['object']['sha'])"
```

**Crear rama:**
```bash
curl -s -X POST -H "Authorization: token TOKEN" \
  -H "Content-Type: application/json" \
  "https://api.github.com/repos/USER/REPO/git/refs" \
  -d '{"ref":"refs/heads/feature/nueva","sha":"SHA_AQUI"}'
```

**Subir / actualizar archivo:**
```bash
# 1. Obtener SHA del archivo existente
FILE_SHA=$(curl -s -H "Authorization: token TOKEN" \
  "https://api.github.com/repos/USER/REPO/contents/path/archivo.js?ref=BRANCH" \
  | python3 -c "import sys,json; print(json.load(sys.stdin).get('sha',''))")

# 2. Subir (content en base64)
CONTENT=$(base64 -w 0 /ruta/local/archivo.js)

curl -s -X PUT -H "Authorization: token TOKEN" \
  -H "Content-Type: application/json" \
  "https://api.github.com/repos/USER/REPO/contents/path/archivo.js" \
  -d "{\"message\":\"commit msg\",\"content\":\"$CONTENT\",\"sha\":\"$FILE_SHA\",\"branch\":\"BRANCH\"}"
```

**Eliminar archivo:**
```bash
curl -s -X DELETE -H "Authorization: token TOKEN" \
  "https://api.github.com/repos/USER/REPO/contents/path/archivo.js" \
  -d '{"message":"remove file","sha":"FILE_SHA"}'
```

**Mergear ramas:**
```bash
curl -s -X POST -H "Authorization: token TOKEN" \
  "https://api.github.com/repos/USER/REPO/merges" \
  -d '{"base":"main","head":"feature/algo","commit_message":"merge msg"}'
```

### Flujo de trabajo
```
Claude crea archivos en /home/claude/ (sandbox local)
        ↓
Sube a rama feature/* en GitHub vía API
        ↓
Mergea feature → develop → main
        ↓
Railway detecta cambio en main → autodeploy automático
```

### Para retomar en próximas sesiones
Darle a Claude:
```
Token: ghp_xxxxxxxxxxxx   ← crear uno nuevo cada sesión
Repo:  brnab84/vault
```

> ⚠️ Revocar el token al terminar cada sesión: github.com/settings/tokens

---

## Control de versiones
```
main              → producción (Railway autodeploy)
develop           → integración
feature/settings  → ya mergeada (categorías + campos custom + copy buttons)
```

---

## Features implementadas

### v1.0
- Auth con JWT + bcrypt
- CRUD de entradas (IP, host, usuario, password, URL, notas, tags)
- Encriptación AES-256-GCM client-side antes de enviar al servidor
- Generador de contraseñas con medidor de fortaleza
- Categorías predefinidas: Servidor, Web/App, DB, VPN/Red, Otro
- Sync con MongoDB Atlas

### v2.0
- Categorías personalizadas por usuario (las predefinidas no se pueden borrar)
- Campos personalizados por usuario (texto, password, URL, número, textarea)
- Copy con un click desde las cards (IP, usuario, contraseña)
- Módulo de Parametrización en sidebar
- Control de versiones: main / develop / feature/*

---

## Pendiente — Fase 2
- Envío de credenciales por email encriptado (SendGrid o Resend)
  - El receptor necesita la clave maestra para descifrar
  - Requiere cuenta en SendGrid/Resend y agregar variable `EMAIL_API_KEY` en Railway
