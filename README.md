# Kahal

Software de gestión para iglesias. Multi-iglesia (multi-tenant): una sola instalación atiende a muchas iglesias, cada una con sus datos aislados.

## Subir Kahal a Portainer (paso a paso)

**Necesitás:** un VPS con Docker y Portainer instalados (mínimo **4 GB de RAM**) y este repositorio en GitHub. Nada más: Portainer construye y levanta todo solo.

### Paso 1 · Abrir los puertos del servidor

Por SSH en el VPS:

```bash
sudo ufw allow 80/tcp && sudo ufw allow 443/tcp && sudo ufw allow 443/udp
```

> Si otro programa ya usa el puerto 80 o 443 (Nginx, Apache, otro proxy), hay que detenerlo antes, o el stack no va a arrancar.

### Paso 2 · Preparar las variables

Copiá este bloque en un bloc de notas y reemplazá lo que está en `MAYÚSCULAS`:

```env
SITE_ADDRESS=IP-CON-GUIONES.sslip.io
POSTGRES_PASSWORD=CLAVE-LARGA-1
JWT_SECRET=CLAVE-LARGA-2
SUPERADMIN_EMAIL=TU-EMAIL
SUPERADMIN_PASSWORD=TU-CONTRASEÑA
SEED_DEMO=false
```

- **`SITE_ADDRESS`**: la dirección con la que se va a entrar a la app.
  - **Sin dominio:** tu IP con guiones + `.sslip.io`. Por ejemplo, si la IP es `203.0.113.10`, poné `203-0-113-10.sslip.io`. Tenés HTTPS gratis y automático.
  - **Con dominio propio:** el dominio, por ejemplo `app.midominio.com`. Antes creá un registro **A** que apunte a la IP del VPS.
- **`POSTGRES_PASSWORD`** y **`JWT_SECRET`**: dos claves distintas, largas y al azar. Podés generarlas con `openssl rand -hex 32` (cada vez da una nueva). **No cambies `POSTGRES_PASSWORD` después del primer despliegue**, porque la base ya queda creada con esa clave.
- **`SUPERADMIN_EMAIL` / `SUPERADMIN_PASSWORD`**: con estos datos vas a entrar como administrador de la plataforma.
- **`SEED_DEMO`**: `true` carga 3 iglesias de ejemplo (sirve para mostrar la app); `false` arranca vacía, para usarla de verdad.

### Paso 3 · Crear el stack en Portainer

1. Entrá a Portainer → **Stacks** → **+ Add stack**.
2. **Name**: `kahal`.
3. **Build method**: **Repository**.
4. **Repository URL**: la URL del repo en GitHub. Si es privado, activá **Authentication** y poné tu usuario y un *token* de GitHub (Settings → Developer settings → Personal access tokens, con permiso de lectura del repo).
5. **Repository reference**: `refs/heads/main`.
6. **Compose path**: `docker-compose.yml`.
7. En **Environment variables** tocá **Advanced mode** y pegá el bloque del paso 2.
8. Tocá **Deploy the stack**.

La primera vez tarda varios minutos (entre 5 y 15, según el servidor) porque construye la app. No cierres la página hasta que termine.

### Paso 4 · Entrar

1. Abrí `https://` + tu `SITE_ADDRESS` (por ejemplo `https://203-0-113-10.sslip.io`).
2. Ingresá con `SUPERADMIN_EMAIL` y `SUPERADMIN_PASSWORD`.
3. En **Plataforma → Iglesias** creá la primera iglesia y su pastor. Desde ahí mismo descargás o imprimís el **código QR** para que los miembros se registren.

¡Listo!

### Actualizar a una nueva versión

1. Subí los cambios a GitHub (rama `main`).
2. En Portainer → **Stacks** → `kahal` → **Pull and redeploy**, y confirmá.

La base de datos se actualiza sola al reiniciar; no se pierde nada. Si después de unos minutos no ves los cambios, repetí el redeploy activando la opción de volver a construir las imágenes (*Re-pull image and redeploy* / *rebuild*, según la versión de Portainer).

### Si algo no anda

| Qué pasa | Qué hacer |
|---|---|
| El deploy falla con `Definí POSTGRES_PASSWORD` (o otra variable) | Falta esa variable: revisá el paso 2 y que esté en *Environment variables* del stack. |
| `port is already allocated` | Otro programa usa el puerto 80 o 443. Detenelo, o agregá `HTTP_PORT=8080` y `HTTPS_PORT=8443` (y entrá con ese puerto). |
| La página no abre o da error de certificado | Revisá que los puertos 80 y 443 estén abiertos (paso 1) y, con dominio propio, que el registro A apunte a la IP. Esperá un par de minutos: el certificado se pide solo. |
| La página abre pero dice que no se pudo conectar con el servidor | La API todavía está arrancando. En Portainer → **Containers** → `kahal-api-1` → **Logs** tiene que aparecer `Iniciando API`. Si muestra un error, ese mensaje dice qué falta. |
| El deploy se corta construyendo la web | Falta memoria: el servidor necesita al menos 4 GB de RAM (o agregá swap). |

### Opcional

Se agregan en *Environment variables* del stack y se aplican con **Update the stack**.

| Variable | Para qué |
|---|---|
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`, `SMTP_SECURE` | Enviar emails (recordatorios de citas, etc.). Sin esto, los emails solo quedan en el log de la API. |
| `STORAGE_DRIVER=s3` + `S3_ENDPOINT`, `S3_REGION`, `S3_BUCKET`, `S3_ACCESS_KEY`, `S3_SECRET_KEY` | Guardar archivos en AWS S3 / Cloudflare R2 / Backblaze en vez del disco del servidor. |
| `DEMO_STREAM_URL` | Link de YouTube/Facebook/Twitch para las transmisiones de la demo. |
| `HTTP_PORT` / `HTTPS_PORT` | Cambiar los puertos 80 / 443. |

### Usuarios de la demo (`SEED_DEMO=true`)

Con `SEED_DEMO=true` se crean 3 iglesias (`monte-sion`, `nueva-vida`, `emanuel`) con ~1 año de movimientos, miembros, eventos, transmisiones y citas. Contraseña de todos: **`kahal1234`**.

| Rol | Email |
|---|---|
| Pastor | `pastor@monte-sion.demo` |
| Equipo pastoral | `equipo@monte-sion.demo` |
| Líder | `lider@monte-sion.demo` |
| Tesorería | `tesoreria@monte-sion.demo` |
| Secretaría | `secretaria@monte-sion.demo` |
| Miembro | `miembro@monte-sion.demo` |

(Igual para `nueva-vida` y `emanuel`.) El super admin es el definido en `SUPERADMIN_EMAIL`: desde **Plataforma → Iglesias** crea iglesias nuevas y puede operar sobre cualquiera.

> Para pasar de la demo a datos reales: eliminá el stack **y el volumen `kahal_pgdata`** (Portainer → **Volumes**) y volvé a desplegar con `SEED_DEMO=false`.

### Backups

Se hacen solos todos los días en el volumen `kahal_backups` (se guardan 7 diarios, 4 semanales y 6 mensuales). Conviene copiar ese volumen fuera del servidor cada tanto. Para restaurar el último, por SSH:

```bash
docker exec -i $(docker ps -qf name=kahal-backup) sh -c 'zcat /backups/last/kahal-latest.sql.gz' \
  | docker exec -i $(docker ps -qf name=kahal-postgres) psql -U kahal -d kahal
```

---

## Qué incluye

- **Finanzas**: registro de ingresos y egresos, cuentas (ARS/USD), categorías de ingreso/egreso, diezmos asociados a miembros, comprobantes adjuntos, resumen con gráficos y **exportación a Excel** (resumen, movimientos, por categoría, por mes y diezmos por miembro).
- **Membresía**: padrón con estados (visitante → asistente → miembro → bautizado), familias, ministerios y export a Excel.
- **Registro de miembros** libre (sin aprobación) en dos pasos —cuenta (email y contraseña) y luego datos personales (nombre completo, carnet, nacimiento, si está bautizado/a, teléfono y domicilio)— con consentimiento de datos personales, que deja la sesión iniciada. La ficha del padrón se crea con esos datos y queda sincronizada con la cuenta: lo que la persona edita en *Mi perfil* y lo que la iglesia edita en la ficha es lo mismo; el padrón permite filtrar por origen (registrados en la app / cargados por la iglesia). Cada iglesia tiene un **código QR fijo** (`/r/<slug>`) que lleva al registro con la iglesia ya elegida; se descarga (PNG/SVG) o se imprime como cartel A4 desde *Configuración → Iglesia* o desde el panel de Iglesias del super admin.
- **Sesión persistente**: la sesión se renueva sola mientras se usa la app y solo vence tras 180 días sin abrirla (o al cambiar la contraseña / deshabilitar la cuenta).
- **Novedades y agenda** de actividades.
- **Artículos de interés**: la iglesia redacta artículos en un editor o los genera desde un `.docx` o PDF; se exportan a PDF con marca de agua con el nombre de la iglesia.
- **Registro** (con permiso de registro de actividad): quién creó, modificó o eliminó novedades, artículos, eventos y transmisiones, y las citas de cada persona.
- **En vivo**: transmisiones de YouTube, Facebook y Twitch embebidas en la app. Cada iglesia configura sus canales (*Configuración → Iglesia*), que se muestran en la página pública y se pueden elegir al crear una transmisión. Twitch solo se embebe sobre HTTPS.
- **Citas** con el pastor, el equipo pastoral y los líderes: disponibilidad semanal, reserva de turnos, confirmación y recordatorios por email.
- **PWA**: se instala en el celular como una app.

**Roles y permisos configurables**: cada iglesia arma sus propios roles desde *Configuración → Roles y permisos* y elige qué puede hacer cada uno (ver/editar miembros, finanzas, contenido, artículos, recibir citas, gestionar usuarios y roles, datos de la iglesia, registro de actividad). Un usuario puede tener varios roles y sus permisos son la suma de todos; sin roles accede a novedades, eventos, artículos, en vivo y citas. Nadie puede otorgar permisos que no tiene, y siempre debe quedar al menos un usuario activo con el rol de administración. El Super admin es un rol de plataforma aparte.

**Estados de miembros configurables**: cada iglesia define sus estados (nombre, color y descripción) desde *Miembros → Estados*, y cada persona puede tener varios a la vez (por ejemplo, Miembro y Bautizado). Un estado puede marcarse para asignarse automáticamente a quienes crean su cuenta, o para que quienes lo tengan no cuenten como miembros activos. Gestionarlos requiere el permiso *Gestionar estados*. Cada iglesia nueva arranca con Visitante, Asistente (se asigna al crear cuenta), Miembro, Bautizado e Inactivo.

Cada iglesia nueva arranca con estos roles, que se pueden editar o eliminar:

| Rol | Permisos iniciales |
|---|---|
| Pastor | Acceso total (rol de administración, no se puede eliminar) |
| Equipo pastoral | Miembros, usuarios (ver), contenido, artículos; recibe citas |
| Líder | Miembros, contenido y artículos; recibe citas |
| Tesorería | Finanzas |
| Secretaría | Miembros, usuarios (ver), contenido y artículos |

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
