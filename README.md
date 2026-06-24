# WhatsApp Calendar Management

MVP backend para un asistente de agenda por WhatsApp. El servicio escucha mensajes de WhatsApp Business Cloud API, transcribe audios con OpenAI, extrae intención de agenda con salida JSON validada por Zod y crea eventos en Google Calendar solo cuando hay datos suficientes y confirmación clara.

No incluye n8n en esta versión. Incluye un frontend de administración mínimo en [`frontend/`](frontend) (React + Vite + TypeScript) para ver el estado de los servicios y aprobar/rechazar conversaciones pendientes.

### Frontend de administración

```
cd frontend
npm install
cp .env.example .env   # ajustar VITE_API_BASE_URL si el backend no corre en localhost:3000
npm run dev
```

Abre `http://localhost:5173`. Para registrar usuarios siempre se requiere `REGISTRATION_CODE`: el primer usuario queda como **admin** y los siguientes quedan como **viewer** (pueden ver todo pero no aprobar/rechazar agendas). El login devuelve un JWT (vence a las 12h) que se guarda en el navegador (localStorage) y se envía como `Authorization: Bearer` en cada request; al expirar, el frontend cierra la sesión automáticamente. El backend debe permitir ese origen vía `ADMIN_FRONTEND_ORIGIN` (por defecto `http://localhost:5173`).

El panel de "Últimas agendas" muestra las 10 reservas más recientes (cliente, fecha/hora de la clase, estado, tema) con un link directo al evento de Google Calendar. El panel de conversaciones muestra quién aprobó o rechazó cada una. Los usuarios `admin` además ven un panel de "Usuarios" para cambiar roles y revocar sesiones.

## Arquitectura

- HTTP: Express + TypeScript.
- Validación: Zod.
- Persistencia: PostgreSQL + Prisma.
- IA: OpenAI para transcripción y extracción estructurada.
- Calendario: Google Calendar API.
- WhatsApp: `WhatsAppProvider` con implementación Cloud API y stub `EvolutionApiProvider`.
- Alertas: WhatsApp al admin con fallback a logs.
- Health: `/health`, `/ready`, preflight y healthcheck programado.

## Estructura

```text
src/
  app.ts
  server.ts
  config/env.ts
  modules/
    whatsapp/
    openai/
    calendar/
    conversations/
    messages/
    health/
    alerts/
    admin/
  db/prisma.ts
  utils/
tests/
prisma/
```

## Configuracion del `.env`

El archivo `.env` contiene credenciales reales y configuracion local, por eso no se commitea. Para preparar el entorno desde cero:

```bash
cp .env.example .env
```

En Windows PowerShell:

```powershell
Copy-Item .env.example .env
```

Despues abrir `.env` con cualquier editor y reemplazar los valores `change-me`.

### Configuracion minima para desarrollo local

Usar esta base si la app corre con `npm run dev` en la maquina y PostgreSQL corre con Docker:

```env
NODE_ENV=development
PORT=3000
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/whatsapp_calendar

ADMIN_API_KEY=replace-with-a-long-random-secret
ADMIN_PHONE=5491111111111
ADMIN_FRONTEND_ORIGIN=http://localhost:5173,http://127.0.0.1:5173
JWT_SECRET=replace-with-a-long-random-secret
REGISTRATION_CODE=replace-with-a-private-registration-code
ALERTS_ENABLED=false
AUTO_REPLY=false
STRICT_PREFLIGHT=false
HEALTHCHECK_INTERVAL_MINUTES=5

WHATSAPP_PROVIDER=cloud
WHATSAPP_VERIFY_TOKEN=replace-with-your-meta-webhook-token
WHATSAPP_ACCESS_TOKEN=replace-with-your-meta-access-token
WHATSAPP_PHONE_NUMBER_ID=replace-with-your-phone-number-id
WHATSAPP_BUSINESS_ACCOUNT_ID=replace-with-your-business-account-id

OPENAI_API_KEY=replace-with-your-openai-key
OPENAI_TRANSCRIPTION_MODEL=gpt-4o-mini-transcribe
OPENAI_EXTRACTION_MODEL=gpt-4.1-mini

GOOGLE_CLIENT_EMAIL=calendar-service-account@example.iam.gserviceaccount.com
GOOGLE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nreplace-with-private-key\n-----END PRIVATE KEY-----\n"
GOOGLE_CALENDAR_ID=primary
DEFAULT_TIMEZONE=America/Argentina/Buenos_Aires
DEFAULT_DURATION_MINUTES=60

AUDIO_STORAGE_ENABLED=false
```

Para correr app y base de datos dentro de `docker compose`, cambiar solamente `DATABASE_URL` para que apunte al servicio `postgres`:

```env
DATABASE_URL=postgresql://postgres:postgres@postgres:5432/whatsapp_calendar
```

### Como completar cada valor

- `DATABASE_URL`: conexion de PostgreSQL. Usar `localhost` si la app corre fuera de Docker; usar `postgres` si corre dentro de `docker compose`.
- `ADMIN_API_KEY`: secreto largo para proteger endpoints `/admin`. Enviar en el header `x-admin-api-key`.
- `ADMIN_PHONE`: telefono WhatsApp del administrador, con codigo de pais, sin `+`. Es obligatorio si `ALERTS_ENABLED=true`.
- `ADMIN_FRONTEND_ORIGIN`: origen permitido por CORS para el frontend admin (ver [`frontend/`](frontend)). Puede aceptar varios origenes separados por coma; no usar `*`.
- `JWT_SECRET`: secreto largo y aleatorio para firmar los tokens de login del dashboard. Obligatorio.
- `REGISTRATION_CODE`: código de invitación obligatorio para registrar cualquier usuario. El primer usuario queda como `admin`; los siguientes quedan como `viewer`.
- `ALERTS_ENABLED`: `true` envia alertas; `false` solo deja logs.
- `AUTO_REPLY`: `true` permite responder al cliente por WhatsApp; `false` no envia mensajes automaticos al cliente.
- `STRICT_PREFLIGHT`: `true` bloquea el inicio si una dependencia falla; `false` permite iniciar en modo degraded. Para primera configuracion conviene `false`.
- `WHATSAPP_VERIFY_TOKEN`: token propio que tambien se configura en Meta para validar el webhook.
- `WHATSAPP_ACCESS_TOKEN`: token de WhatsApp Business Cloud API.
- `WHATSAPP_PHONE_NUMBER_ID`: id del numero de telefono de WhatsApp Cloud API.
- `WHATSAPP_BUSINESS_ACCOUNT_ID`: id del WhatsApp Business Account.
- `OPENAI_API_KEY`: API key de OpenAI.
- `OPENAI_TRANSCRIPTION_MODEL`: modelo usado para transcribir audios.
- `OPENAI_EXTRACTION_MODEL`: modelo usado para extraer datos estructurados de agenda.
- `GOOGLE_CLIENT_EMAIL`: email de la service account de Google Cloud.
- `GOOGLE_PRIVATE_KEY`: private key de la service account. Debe ir entre comillas y con saltos de linea como `\n`.
- `GOOGLE_CALENDAR_ID`: id del calendario. Puede ser `primary` o el id real del calendario compartido con la service account.
- `DEFAULT_TIMEZONE`: zona horaria usada para resolver fechas relativas.
- `DEFAULT_DURATION_MINUTES`: duracion default de la clase/reunion.
- `AUDIO_STORAGE_ENABLED`: `false` evita guardar audios permanentemente; `true` habilita almacenamiento local.

### Validar que quedo bien

Para desarrollo local:

```bash
docker compose up -d postgres
npm run prisma:migrate
npm run dev
```

Luego probar:

```bash
curl http://localhost:3000/health
curl http://localhost:3000/ready
```

`/health` debe responder `ok` sin consultar servicios externos. `/ready` puede responder `degraded` mientras falten credenciales reales de OpenAI, Google Calendar o WhatsApp.

## Local

```bash
npm install
npm run prisma:generate
npm run prisma:migrate
npm run dev
```

Con Docker:

```bash
docker compose up --build
```

## Tests

```bash
npm test
npm run build
```

Los tests usan mocks para WhatsApp, OpenAI, Calendar y PostgreSQL. No llaman APIs reales.

## Endpoints

### `GET /health`

Liveness local. No consulta servicios externos.

```json
{
  "status": "ok",
  "uptime": "123",
  "timestamp": "2026-06-19T13:00:00.000Z"
}
```

### `GET /ready`

Consulta PostgreSQL, OpenAI, Google Calendar y WhatsApp.

```json
{
  "status": "ok",
  "services": {
    "database": "ok",
    "openai": "ok",
    "googleCalendar": "ok",
    "whatsapp": "ok"
  }
}
```

### `GET /webhooks/whatsapp`

Webhook verification de WhatsApp Cloud API. Valida:

- `hub.mode`
- `hub.verify_token`
- `hub.challenge`

### `POST /webhooks/whatsapp`

Procesa mensajes de texto, audio, status events y payloads desconocidos. Los desconocidos se ignoran sin romper.

### Auth

Públicos (no requieren credenciales). Devuelven `{ token, username }`.

- `POST /auth/register` — body `{ username, password, code }`. Requiere `REGISTRATION_CODE`; el primer usuario queda con rol `admin` y los siguientes quedan con rol `viewer`.
- `POST /auth/login` — body `{ username, password }`. Ambos devuelven `{ token, userId, username, role }`. El token vence a las 12 horas.

Ambos endpoints están protegidos por un rate limit persistente (20 intentos/minuto por IP, contador guardado en Postgres — sobrevive reinicios y se comparte entre instancias).

### Admin

Requieren autenticación, aceptando **cualquiera** de estas dos credenciales (la API key siempre actúa con rol `admin`):

```http
Authorization: Bearer <JWT del login>
```

```http
x-admin-api-key: <ADMIN_API_KEY>
```

- `POST /admin/healthcheck/run` — rol `admin`.
- `GET /admin/conversations?status=<estado>&skip=<n>&take=<n>` — listado paginado, incluye `approvedByUserId`/`rejectedByUserId` (y los objetos `approvedBy`/`rejectedBy` con el username) para saber quién gestionó cada conversación. Cualquier rol.
- `GET /admin/calendar-events?limit=<n>` — últimas agendas con datos del cliente y link a Google Calendar. Cualquier rol.
- `POST /admin/conversations/:id/approve` — rol `admin`. Registra qué usuario aprobó.
- `POST /admin/conversations/:id/reject` — rol `admin`. Registra qué usuario rechazó.
- `GET /admin/users` — rol `admin`. Lista usuarios con su rol y fecha de creación.
- `PATCH /admin/users/:id/role` — rol `admin`, body `{ role: "admin" | "viewer" }`. Cambia el rol e invalida cualquier sesión existente de ese usuario (el rol viaja en el JWT, así que un token viejo no debe seguir actuando con el rol anterior). Devuelve `409` si se intenta quitarle `admin` al único administrador restante.
- `POST /admin/users/:id/revoke` — rol `admin`. Invalida todas las sesiones activas de ese usuario (debe volver a iniciar sesión).

Todos los endpoints `/admin/*` comparten el mismo rate limit persistente (60 req/min por IP).

Los usuarios `viewer` pueden ver el dashboard pero reciben `403` si intentan aprobar/rechazar o disparar el healthcheck manual.

## WhatsApp Cloud API

Configurar el webhook en Meta con:

- Callback URL: `https://<host>/webhooks/whatsapp`
- Verify token: valor de `WHATSAPP_VERIFY_TOKEN`

Payload texto de ejemplo:

```json
{
  "entry": [
    {
      "changes": [
        {
          "value": {
            "contacts": [{ "wa_id": "5491111111111", "profile": { "name": "Cliente" } }],
            "messages": [
              {
                "id": "wamid.1",
                "from": "5491111111111",
                "timestamp": "1781892000",
                "type": "text",
                "text": { "body": "Si, confirmado. Quiero ver Playwright e IA aplicada a QA." }
              }
            ]
          }
        }
      ]
    }
  ]
}
```

Payload audio de ejemplo:

```json
{
  "entry": [
    {
      "changes": [
        {
          "value": {
            "messages": [
              {
                "id": "wamid.2",
                "from": "5491111111111",
                "timestamp": "1781892000",
                "type": "audio",
                "audio": { "id": "media-id", "mime_type": "audio/ogg" }
              }
            ]
          }
        }
      ]
    }
  ]
}
```

## Google Calendar

Crear una service account, compartir el calendario con el email de la service account y configurar:

- `GOOGLE_CLIENT_EMAIL`
- `GOOGLE_PRIVATE_KEY`
- `GOOGLE_CALENDAR_ID`

Antes de crear un evento el backend usa FreeBusy. Si el calendario esta ocupado, no crea evento y deja la conversacion pendiente.

## Reglas de agenda

El sistema no agenda ante mensajes ambiguos como:

- `vemos`
- `capaz`
- `te aviso`
- `despues coordinamos`
- `puede ser`
- `tipo 7`
- `creo que el viernes`

Solo crea evento si:

- hay fecha;
- hay hora;
- hay cliente o telefono;
- `confirmedByClient=true`;
- `isAmbiguous=false`;
- Google Calendar esta libre.

## Healthcheck y preflight

Al iniciar, el preflight:

- valida variables obligatorias;
- prueba PostgreSQL;
- prueba OpenAI;
- prueba Google Calendar;
- prueba WhatsApp;
- verifica `ADMIN_PHONE` si hay alertas.

Si `STRICT_PREFLIGHT=true`, una falla bloquea startup. Si `false`, levanta en modo degraded y manda alerta.

Tambien corre un healthcheck programado cada `HEALTHCHECK_INTERVAL_MINUTES`.

## Limitaciones del MVP

- No hay frontend.
- No hay n8n.
- Evolution API esta preparado como stub.
- El almacenamiento permanente de audio queda deshabilitado por defecto.
- La inferencia de fechas/horarios depende de la salida estructurada del modelo y de las reglas del prompt.
