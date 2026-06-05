# Vault — Gestor de Credenciales

Gestor de contraseñas con encriptación AES-256-GCM, backend Node/Express y MongoDB Atlas.

## Stack
- **Frontend**: HTML/CSS/JS vanilla (sin frameworks)
- **Backend**: Node.js + Express
- **DB**: MongoDB Atlas
- **Deploy**: Railway
- **Crypto**: AES-256-GCM + PBKDF2 (200k iteraciones) — encriptación client-side

## Seguridad
- Las contraseñas se encriptan en el browser antes de enviarse al servidor
- El servidor **nunca** ve las contraseñas en texto plano
- JWT para autenticación de sesiones
- bcrypt para hasheo de contraseñas de usuario

## Estructura
```
vault/
├── backend/
│   ├── server.js
│   ├── models/
│   │   ├── User.js
│   │   └── Entry.js
│   ├── routes/
│   │   ├── auth.js
│   │   └── entries.js
│   ├── middleware/
│   │   └── auth.js
│   ├── .env.example
│   └── package.json
├── frontend/
│   └── index.html
├── railway.json
└── package.json
```

## Setup local

```bash
# 1. Instalar dependencias
npm install

# 2. Crear backend/.env
cp backend/.env.example backend/.env
# Editar con tu MONGO_URI y JWT_SECRET

# 3. Iniciar
npm run dev
```

## Deploy Railway

1. Push al repo GitHub
2. Crear proyecto en railway.app → Deploy from GitHub
3. Agregar variables de entorno:
   - `MONGO_URI` = tu connection string de Atlas
   - `JWT_SECRET` = string aleatorio largo (mín 32 chars)
4. Railway detecta automáticamente y deploya

## Variables de entorno

| Variable | Descripción |
|----------|-------------|
| `MONGO_URI` | Connection string MongoDB Atlas |
| `JWT_SECRET` | Secret para firmar JWT tokens |
| `PORT` | Puerto (Railway lo asigna automáticamente) |
