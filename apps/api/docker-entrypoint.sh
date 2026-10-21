#!/bin/sh
set -e

# Arma DATABASE_URL a partir de las variables de Postgres si no viene definida
# (encodea la contraseña para que admita cualquier carácter).
if [ -z "$DATABASE_URL" ]; then
  DATABASE_URL=$(node -e '
    const e = process.env;
    const u = encodeURIComponent(e.POSTGRES_USER || "kahal");
    const p = encodeURIComponent(e.POSTGRES_PASSWORD || "");
    const h = e.POSTGRES_HOST || "postgres";
    const d = e.POSTGRES_DB || "kahal";
    process.stdout.write(`postgresql://${u}:${p}@${h}:5432/${d}?connection_limit=${e.DB_POOL || 20}`);
  ')
  export DATABASE_URL
fi

echo "[kahal] Aplicando migraciones..."
./node_modules/.bin/prisma migrate deploy

echo "[kahal] Inicializando datos..."
node dist/prisma/seed.js

echo "[kahal] Iniciando API"
exec node dist/src/main.js
