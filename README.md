# WhatsApp Calendar Management

MVP backend para un asistente de agenda por WhatsApp. El servicio escucha mensajes de WhatsApp Business Cloud API, transcribe audios con OpenAI, extrae intención de agenda con salida JSON validada por Zod y crea eventos en Google Calendar solo cuando hay datos suficientes y confirmación clara.

No incluye frontend ni n8n en esta versión.

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

## Configuracion

Copiar `.env.example` a `.env` y completar:

```bash
cp .env.example .env
```

Variables principales:

- `DATABASE_URL`: PostgreSQL.
- `ADMIN_API_KEY`: requerido para endpoints `/admin`.
- `ADMIN_PHONE`: requerido si `ALERTS_ENABLED=true`.
- `WHATSAPP_VERIFY_TOKEN`, `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`.
- `OPENAI_API_KEY`.
- `GOOGLE_CLIENT_EMAIL`, `GOOGLE_PRIVATE_KEY`, `GOOGLE_CALENDAR_ID`.
- `STRICT_PREFLIGHT`: si es `true`, el servidor no levanta con dependencias rotas.
- `AUTO_REPLY`: si es `true`, responde al cliente por WhatsApp; si es `false`, guarda respuesta sugerida y alerta al admin.

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

### Admin

Todos requieren header:

```http
x-admin-api-key: <ADMIN_API_KEY>
```

- `POST /admin/healthcheck/run`
- `POST /admin/conversations/:id/approve`
- `POST /admin/conversations/:id/reject`

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
