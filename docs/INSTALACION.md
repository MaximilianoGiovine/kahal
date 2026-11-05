# Guía de instalación de Kahal

[← Volver a la presentación](../README.md)

- [Subir Kahal a Portainer](#subir-kahal-a-portainer-paso-a-paso)
- [Actualizar a una nueva versión](#actualizar-a-una-nueva-versión)
- [Si algo no anda](#si-algo-no-anda)
- [Variables opcionales](#opcional)
- [Detrás de Nginx Proxy Manager](#detrás-de-nginx-proxy-manager-opcional)
- [Ingresar con Google y Apple](#ingresar-con-google-y-apple-opcional)
- [Usuarios de la demo](#usuarios-de-la-demo-seed_demotrue)
- [Backups](#backups)
- [Desarrollo local](#desarrollo-local)

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
  - **Con dominio propio y `www`:** creá un registro **A** para `@` y otro para `www`, y escribí `midominio.com, www.midominio.com`, con un espacio después de la coma. Quien entre por `www` va a la dirección sin `www`.
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

Las imágenes de Kahal se construyen de nuevo en cada despliegue, sin descargarse de ningún registro. La base de datos se actualiza sola al reiniciar; no se pierde nada.

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
| `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` | Notificaciones push en Android y iPhone. Generalas una sola vez con `npx web-push generate-vapid-keys`; si las cambiás, cada dispositivo tiene que volver a activarlas. Requieren HTTPS. Opcional: `VAPID_SUBJECT` (por defecto, `mailto:` + `SUPERADMIN_EMAIL`). |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | Ingresar con Google (ver abajo). |
| `APPLE_CLIENT_ID`, `APPLE_TEAM_ID`, `APPLE_KEY_ID`, `APPLE_PRIVATE_KEY` | Ingresar con Apple (ver abajo). |
| `STORAGE_DRIVER=s3` + `S3_ENDPOINT`, `S3_REGION`, `S3_BUCKET`, `S3_ACCESS_KEY`, `S3_SECRET_KEY` | Guardar archivos en AWS S3 / Cloudflare R2 / Backblaze en vez del disco del servidor. |
| `DEMO_STREAM_URL` | Link de YouTube/Facebook/Twitch para las transmisiones de la demo. |
| `HTTP_PORT` / `HTTPS_PORT` | Cambiar los puertos 80 / 443. |

### Detrás de Nginx Proxy Manager (opcional)

Si los puertos 80 y 443 ya los usa Nginx Proxy Manager (NPM), Caddy queda detrás de él y NPM se encarga del HTTPS.

1. Por SSH, averiguá la IP de Docker en el servidor. Suele ser `172.17.0.1`:

   ```bash
   ip -4 addr show docker0
   ```

2. Usá estas variables en el stack, en lugar de la `SITE_ADDRESS` del paso 2. Ligar los puertos a esa IP evita que Caddy quede expuesto a internet sin HTTPS:

   ```env
   SITE_ADDRESS=:80
   TRUSTED_PROXIES=private_ranges
   HTTP_PORT=172.17.0.1:8080
   HTTPS_PORT=172.17.0.1:8443
   ```

3. En NPM, creá un **Proxy Host**:
   - **Domain Names:** `midominio.com` y `www.midominio.com`.
   - **Scheme / Forward Hostname / Forward Port:** `http`, `172.17.0.1`, `8080`.
   - **Pestaña SSL:** pedí un certificado de Let's Encrypt y activá **Force SSL**.

Quien entre por `www` va a la dirección sin `www`.

### Ingresar con Google y Apple (opcional)

Cada botón aparece solo cuando sus variables están definidas. Sin ellas la app funciona igual, con email y contraseña. Los dos proveedores exigen HTTPS y rechazan direcciones IP; se recomienda un **dominio propio**, porque pueden no aceptar una dirección `sslip.io`. En lo que sigue, `TU-DIRECCION` es el valor de `SITE_ADDRESS`.

**Google** (gratis):

1. En [Google Cloud Console](https://console.cloud.google.com/) creá un proyecto.
2. En **Google Auth Platform** completá la pantalla de consentimiento (tipo *Externo*, permisos `openid`, `email` y `profile`) y publicala: mientras esté en modo de prueba, solo entran los usuarios de prueba que cargues.
3. En **Clientes**, creá un cliente de tipo *Aplicación web* con este URI de redirección: `https://TU-DIRECCION/api/auth/oauth/google/callback`
4. Copiá el ID y el secreto en `GOOGLE_CLIENT_ID` y `GOOGLE_CLIENT_SECRET`.

**Apple** (requiere el [Apple Developer Program](https://developer.apple.com/programs/), pago anual):

1. En **Certificates, Identifiers & Profiles → Identifiers**, creá un *App ID* con **Sign in with Apple** activado.
2. Creá un *Services ID* (por ejemplo `com.tuiglesia.kahal.web`): ese es `APPLE_CLIENT_ID`. Activá **Sign in with Apple** y configurá el dominio y esta Return URL: `https://TU-DIRECCION/api/auth/oauth/apple/callback`
3. En **Keys**, creá una clave con **Sign in with Apple** y descargá el `.p8` (se descarga una sola vez). Su ID es `APPLE_KEY_ID`, y tu Team ID (arriba a la derecha) es `APPLE_TEAM_ID`.
4. Convertí el `.p8` a una sola línea y pegala en `APPLE_PRIVATE_KEY`:

   ```bash
   awk 'NF {printf "%s\\n", $0}' AuthKey_XXXX.p8
   ```

5. Quien elija ocultar su email en Apple se registra con una dirección `@privaterelay.appleid.com`. Para que le lleguen los emails de Kahal, registrá tu dominio o remitente en **Sign in with Apple for Email Communication**.

**Cuentas que ya existen:** si alguien entra con Google o Apple usando un email que ya tiene cuenta, Kahal le pide que ingrese con su contraseña y conecte la cuenta desde *Mi perfil*. No se conectan solas porque el registro no verifica el email: alguien pudo haber creado la cuenta con la dirección de otra persona y conservaría el acceso.

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

(Igual para `nueva-vida` y `emanuel`.) El super admin es el definido en `SUPERADMIN_EMAIL`: desde **Plataforma → Iglesias** crea iglesias nuevas, aprueba o rechaza las solicitudes que llegan desde `/solicitar-iglesia` y puede operar sobre cualquiera. El aviso por email de cada solicitud requiere SMTP configurado; sin SMTP, las solicitudes igual aparecen en el panel.

> Para pasar de la demo a datos reales: eliminá el stack **y el volumen `kahal_pgdata`** (Portainer → **Volumes**) y volvé a desplegar con `SEED_DEMO=false`.

### Backups

Se hacen solos todos los días en el volumen `kahal_backups` (se guardan 7 diarios, 4 semanales y 6 mensuales). Conviene copiar ese volumen fuera del servidor cada tanto. Para restaurar el último, por SSH:

```bash
docker exec -i $(docker ps -qf name=kahal-backup) sh -c 'zcat /backups/last/kahal-latest.sql.gz' \
  | docker exec -i $(docker ps -qf name=kahal-postgres) psql -U kahal -d kahal
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
