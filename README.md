# Kahal

Software de gestión para iglesias. Multi-iglesia (multi-tenant): una sola instalación atiende a muchas iglesias, cada una con sus datos aislados.

**Funcionalidades**

- **Finanzas**: cuentas (ARS/USD), categorías de ingreso/egreso, diezmos asociados a miembros, comprobantes adjuntos, resumen con gráficos y **exportación a Excel** (resumen, movimientos, por categoría, por mes y diezmos por miembro).
- **Membresía**: padrón con estados (visitante → asistente → miembro → bautizado), familias, ministerios y export a Excel.
- **Registro de miembros** con aprobación de la iglesia y consentimiento de datos personales.
- **Novedades y agenda** de actividades.
- **En vivo**: transmisiones de YouTube/Facebook embebidas en la app.
- **Citas** con pastores/líderes: disponibilidad semanal, reserva de turnos, confirmación y recordatorios por email.
- **PWA**: se instala en el celular como una app.

Roles: Super admin (plataforma), Administrador, Pastor/Líder, Tesorería, Secretaría y Miembro.

## Stack

| Capa | Tecnología |
|---|---|
| Frontend | Next.js 15 (React 19), Tailwind CSS 4, TanStack Query |
| API | NestJS 11, Prisma 6, PostgreSQL 17 |
| Colas / tareas | Redis 7 + BullMQ (emails), cron de recordatorios |
| Proxy | Caddy 2 (HTTPS automático) |
| Backups | `postgres-backup-local` (diarios, semanales y mensuales) |

```
apps/api      API NestJS (+ prisma/ con schema, migraciones y seed)
apps/web      Frontend Next.js
docker/caddy  Imagen de Caddy con su configuración
docker-compose.yml
```

---

## Despliegue en Portainer (VPS Ubuntu)

### 1. Preparar el servidor

Abrí los puertos 80 y 443 (y cerrá el resto salvo SSH y el puerto de Portainer):

```bash
sudo ufw allow 80/tcp && sudo ufw allow 443/tcp && sudo ufw allow 443/udp
```

### 2. Elegir la dirección pública (`SITE_ADDRESS`)

| Caso | Valor | Resultado |
|---|---|---|
| **Sin dominio (recomendado para la demo)** | `203-0-113-10.sslip.io` (tu IP con guiones) | HTTPS automático y gratuito |
| Con dominio propio | `app.midominio.com` (registro A apuntando al VPS) | HTTPS automático |
| Prueba rápida | `:80` | Solo HTTP por IP |

> `sslip.io` resuelve `203-0-113-10.sslip.io` a `203.0.113.10`, así Caddy obtiene un certificado real de Let's Encrypt sin comprar un dominio. **Usá HTTPS para la demo**: la instalación como app (PWA) y las cookies seguras lo necesitan.

### 3. Crear el stack

1. Portainer → **Stacks** → **Add stack** → **Repository**.
2. **Repository URL**: la URL del repo en GitHub (si es privado, activá *Authentication* con un token de GitHub).
3. **Compose path**: `docker-compose.yml`.
4. En **Environment variables** cargá (o subí `.env.example` completado con *Load variables from .env file*):

| Variable | Obligatoria | Descripción |
|---|---|---|
| `SITE_ADDRESS` | sí | Ver tabla anterior |
| `POSTGRES_PASSWORD` | sí | Contraseña de la base (`openssl rand -hex 24`) |
| `JWT_SECRET` | sí | Cadena aleatoria larga (`openssl rand -hex 32`) |
| `SUPERADMIN_EMAIL` | sí | Email del super administrador de la plataforma |
| `SUPERADMIN_PASSWORD` | sí | Su contraseña inicial |
| `SEED_DEMO` | no | `true` carga 3 iglesias de demostración (solo si la base está vacía) |
| `DEMO_STREAM_URL` | no | Link de YouTube/Facebook para las transmisiones de demo |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`, `SMTP_SECURE` | no | Envío de emails. Sin SMTP los emails se registran en el log de la API |
| `STORAGE_DRIVER` + `S3_*` | no | `s3` para guardar archivos en AWS S3 / Cloudflare R2 / Backblaze. Por defecto, volumen local |
| `HTTP_PORT` / `HTTPS_PORT` | no | Por defecto 80 / 443 |

5. **Deploy the stack**. La primera vez tarda unos minutos porque construye las imágenes. Al arrancar, la API aplica las migraciones y crea el super admin (y la demo si `SEED_DEMO=true`).

### 4. Actualizar

Subí los cambios a GitHub y en Portainer, dentro del stack: **Pull and redeploy**. Las migraciones de base de datos se aplican solas al reiniciar la API. Si los cambios no se reflejan, verificá que el redeploy haya reconstruido las imágenes (opción de *re-pull/rebuild* según tu versión de Portainer).

### Usuarios de la demo

Con `SEED_DEMO=true` se crean 3 iglesias (`monte-sion`, `nueva-vida`, `emanuel`) con ~1 año de movimientos, miembros, eventos, transmisiones y citas. Contraseña de todos: **`kahal1234`**.

| Rol | Email |
|---|---|
| Administrador | `admin@monte-sion.demo` |
| Pastor | `pastor@monte-sion.demo` |
| Líder | `lider@monte-sion.demo` |
| Tesorería | `tesoreria@monte-sion.demo` |
| Secretaría | `secretaria@monte-sion.demo` |
| Miembro | `miembro@monte-sion.demo` |

(Igual para `nueva-vida` y `emanuel`.) El super admin es el definido en `SUPERADMIN_EMAIL`: desde **Plataforma → Iglesias** crea iglesias nuevas y puede operar sobre cualquiera.

> Antes de usarlo con datos reales, desplegá con `SEED_DEMO=false` en una base limpia (o borrá el volumen `pgdata`).

### Backups

El servicio `backup` hace un dump diario en el volumen `backups` (conserva 7 diarios, 4 semanales y 6 mensuales). Para restaurar el último:

```bash
docker exec -i $(docker ps -qf name=kahal-backup) sh -c 'zcat /backups/last/kahal-latest.sql.gz' \
  | docker exec -i $(docker ps -qf name=kahal-postgres) psql -U kahal -d kahal
```

Recomendado: copiar periódicamente el volumen `backups` fuera del servidor.

---

## Desarrollo local

Requisitos: Node 22+, Docker.

```bash
# Servicios
docker run -d --name kahal-dev-pg -e POSTGRES_USER=kahal -e POSTGRES_PASSWORD=kahal -e POSTGRES_DB=kahal -p 5433:5432 postgres:17-alpine
docker run -d --name kahal-dev-redis -p 6380:6379 redis:7-alpine

# API (http://localhost:4000)
cd apps/api
cp .env.example .env            # o creá .env con DATABASE_URL, REDIS_URL, JWT_SECRET
npm install
npx prisma migrate dev
SEED_DEMO=true SUPERADMIN_EMAIL=super@kahal.app SUPERADMIN_PASSWORD=superkahal123 npm run seed
npm run start:dev

# Web (http://localhost:3000, redirige /api a la API)
cd apps/web
npm install
npm run dev
```

Probar el stack de producción completo en local:

```bash
cp .env.example .env   # completar secretos; HTTP_PORT=8080 si el 80 está ocupado
docker compose up -d --build
```

Para cambios en el modelo de datos: editar `apps/api/prisma/schema.prisma` y correr `npx prisma migrate dev --name <cambio>`; la migración generada se aplica sola en producción.
