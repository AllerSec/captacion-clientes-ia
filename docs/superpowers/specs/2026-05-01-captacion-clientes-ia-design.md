# Sistema de captación automática de clientes por email — Diseño

**Fecha:** 2026-05-01
**Autor:** Unax Aller (`unaxaller.com`)
**Estado:** Diseño aprobado, pendiente de plan de implementación

---

## 1. Objetivo

Construir un sistema automatizado que genere leads cualificados para servicios
de desarrollo web freelance (clínicas y negocios con capacidad de pago en
España, especialmente País Vasco), enviando emails personalizados desde la
dirección profesional propia. La IA gestiona únicamente el primer contacto;
cuando un lead responde, el control pasa al humano.

### Criterios de éxito

- Sistema funcionando 24/7 sin intervención manual diaria.
- Emails que parecen escritos a mano por una persona, en español de España.
- Tasa de respuesta ≥ 2% (objetivo razonable para cold email bien hecho).
- Cero envíos duplicados al mismo negocio.
- Detección automática de respuestas y parada inmediata de cualquier
  automatización sobre ese contacto.
- Mantenible y editable desde Claude Code por el propio Unax.
- Coste operativo ≤ 30 €/mes.

### Fuera del alcance

- Respuestas automáticas a leads (la IA NUNCA contesta).
- Cierre de venta automatizado.
- Followups automáticos (un único email por lead).
- Importación de leads desde fuentes que no sean Apify.
- CRM completo (Supabase basta como almacén; el CRM real es Gmail + Unax).

---

## 2. Stack técnico

| Capa | Tecnología | Motivo |
|---|---|---|
| Lenguaje | Node.js + TypeScript | Clientes oficiales para todas las APIs. |
| Base de datos | Supabase (Postgres) | Free tier suficiente, dashboard web, SQL nativo. |
| Fuente de leads | Apify Compass Google Maps Scraper | Devuelve negocios + email + reseñas + web en una sola llamada. |
| Análisis de web | Código local (fetch + parseo HTML) | Gratis, sin dependencias, suficiente. |
| Redacción | Anthropic Claude API (Sonnet 4.6) con prompt caching | Mejor calidad en español de España; con caching el coste es bajo. |
| Envío | Gmail API sobre Google Workspace de Unax | Máxima entregabilidad; emails aparecen en su buzón. |
| Detección de respuestas | Polling Gmail API cada 5 min | Simple y fiable; latencia aceptable. |
| Hosting | Railway | Deploy con un click, 24/7, logs y métricas integradas. |
| Programación de tareas | `node-cron` dentro del proceso | Sin infraestructura extra. |

**Coste mensual estimado:** Railway ≈ 5 €, Supabase ≈ 0 €, Apify ≈ 10-15 €,
Claude API ≈ 5-10 €, Gmail incluido en Workspace existente. **Total ≈ 20-30 €/mes.**

---

## 3. Arquitectura

```
                          ┌──────────────────────────┐
                          │      RAILWAY 24/7        │
                          │   (proceso Node.js)      │
                          └────────────┬─────────────┘
                                       │
        ┌──────────────────────────────┼──────────────────────────────┐
        │                              │                              │
        ▼                              ▼                              ▼
┌───────────────┐           ┌───────────────────┐           ┌──────────────────┐
│   SCRAPER     │           │      SENDER       │           │     WATCHER      │
│ cron diario   │           │ cron 2-5 min      │           │ cron 5 min 24/7  │
│ 07:00 ES      │           │ horario laboral   │           │                  │
└───────┬───────┘           └─────────┬─────────┘           └────────┬─────────┘
        │                             │                              │
        ▼                             ▼                              ▼
┌──────────────────────────────────────────────────────────────────────────┐
│                       SUPABASE (Postgres)                                │
│   leads | emails_sent | variants | metrics                               │
└──────────────────────────────────────────────────────────────────────────┘

APIs externas que usa cada job:
  SCRAPER  → Apify Compass + fetch directo a webs (heurísticas)
  SENDER   → Claude API (redacción) + Gmail API (envío)
  WATCHER  → Gmail API (lectura de hilos)

Flujo de un lead:
NEW → ANALYZED → READY_TO_SEND → CONTACTED → RESPONDED ✋
        │           │                            │
        │           └─ pasa filtro              └─ humano toma el control
        │
        └─ scraper analiza web y guarda señales
```

### 3.1 Job: SCRAPER (1 vez al día)

1. Lee `config/queries.ts` para obtener la query del día (rotación lun-vie).
2. Llama a Apify Compass con la query (ej: `clínicas dentales Bilbao`).
3. Por cada negocio devuelto:
   - Si `place_id` ya existe en `leads`, lo salta.
   - Inserta como `NEW`.
4. Para cada lead `NEW`:
   - Si tiene `website`: corre `web-analyzer` y rellena `web_score` y `web_issues`.
   - Si no tiene web: `web_score = 100`.
   - Marca como `ANALYZED`.
5. Aplica `lead-filter` y promociona a `READY_TO_SEND` los cualificados;
   resto a `SKIPPED`.

### 3.2 Job: SENDER (cada 2-5 min en horario laboral)

1. Comprueba `send-policy`: ¿es horario laboral? ¿queda cuota? ¿pasó el
   tiempo mínimo desde el último envío?
2. Si todo OK, coge UN lead `READY_TO_SEND` ordenado por `created_at`.
3. Llama a `email-composer`:
   - Construye user prompt con datos del lead.
   - Selecciona variante A/B activa (al inicio solo hay una).
   - Llama a Claude API con system prompt cacheado.
   - Recibe `{ subject, body }` en JSON.
4. Envía vía Gmail API en HTML mínimo (`<b>` y saltos de línea) con versión
   texto plano alternativa.
5. Guarda registro en `emails_sent` con `gmail_message_id` y `gmail_thread_id`.
6. Marca lead como `CONTACTED`, registra evento `sent` en `metrics`.

### 3.3 Job: WATCHER (cada 5 min, 24/7)

1. Lista todos los leads en estado `CONTACTED`.
2. Para cada uno, llama a `gmail.users.threads.get(thread_id)`.
3. Si el hilo tiene > 1 mensaje:
   - Pasa el contenido del último mensaje a `response-detector`.
   - Si el detector dice que es respuesta humana real: marca `RESPONDED`,
     registra evento `replied`, incrementa contador de la variante usada.
   - Si el detector identifica auto-responder ("estoy de vacaciones"): marca
     `AUTO_REPLY` (no se reintenta — sería un followup, fuera de alcance).
4. Si Gmail devuelve "bounce" en algún mensaje: marca `BOUNCED`.

---

## 4. Esquema de la base de datos

### 4.1 Tabla `leads`

```sql
create table leads (
  id              uuid primary key default gen_random_uuid(),
  created_at      timestamptz default now(),

  -- Identificación (Apify)
  place_id        text unique not null,
  business_name   text not null,
  category        text,
  address         text,
  city            text,
  province        text,
  phone           text,
  website         text,
  email           text,

  -- Reputación (Apify)
  rating          numeric(2,1),
  review_count    integer,

  -- Análisis de web
  web_score       integer,         -- 0-100, más alto = más mejorable
  web_issues      jsonb,           -- ["no_https","not_responsive",...]
  web_analyzed_at timestamptz,

  -- Estado
  status          text not null default 'NEW',
  -- NEW → ANALYZED → READY_TO_SEND → CONTACTED → RESPONDED
  --                                                ↘ AUTO_REPLY
  --                                ↘ SKIPPED
  --                                ↘ BOUNCED

  notes           text,
  contacted_at    timestamptz,
  responded_at    timestamptz
);

create index idx_leads_status on leads(status);
create index idx_leads_email  on leads(email) where email is not null;
```

`place_id unique` es la garantía anti-duplicados.

### 4.2 Tabla `emails_sent`

```sql
create table emails_sent (
  id               uuid primary key default gen_random_uuid(),
  lead_id          uuid not null references leads(id) on delete cascade,
  subject          text not null,
  body             text not null,
  variant_id       uuid references variants(id),
  gmail_message_id text not null,
  gmail_thread_id  text not null,
  sent_at          timestamptz default now()
);

create index idx_emails_thread on emails_sent(gmail_thread_id);
create index idx_emails_lead   on emails_sent(lead_id);
```

### 4.3 Tabla `variants`

```sql
create table variants (
  id             uuid primary key default gen_random_uuid(),
  name           text not null,         -- "v1_directo"
  prompt_snippet text not null,         -- añadido al system prompt
  active         boolean default true,
  weight         integer default 1,
  sent_count     integer default 0,
  reply_count    integer default 0,
  created_at     timestamptz default now()
);
```

Contadores actualizados vía trigger SQL al insertar en `metrics`.

### 4.4 Tabla `metrics`

```sql
create table metrics (
  id          uuid primary key default gen_random_uuid(),
  ts          timestamptz default now(),
  event       text not null,    -- 'sent','replied','auto_reply','bounced'
  lead_id     uuid references leads(id),
  variant_id  uuid references variants(id),
  metadata    jsonb
);
```

---

## 5. Estructura del repositorio

```
captacion-clientes-ia/
├── src/
│   ├── index.ts                 # arranca crons + servidor health
│   ├── jobs/
│   │   ├── scraper.ts
│   │   ├── sender.ts
│   │   └── watcher.ts
│   ├── services/
│   │   ├── apify.ts
│   │   ├── claude.ts
│   │   ├── gmail.ts
│   │   └── supabase.ts
│   ├── core/
│   │   ├── web-analyzer.ts
│   │   ├── lead-filter.ts
│   │   ├── email-composer.ts
│   │   ├── response-detector.ts
│   │   ├── send-policy.ts
│   │   └── health-monitor.ts
│   ├── prompts/
│   │   ├── system.ts            # system prompt principal (cacheado)
│   │   └── auto-reply-detector.ts
│   ├── config/
│   │   ├── env.ts               # validación zod
│   │   └── queries.ts           # queries diarias del scraper
│   └── lib/
│       ├── logger.ts            # pino
│       └── retry.ts             # backoff exponencial
├── sql/
│   ├── 001_init.sql
│   └── 002_triggers.sql
├── scripts/
│   ├── seed-variants.ts
│   ├── gmail-auth.ts
│   ├── test-pipeline.ts         # dry-run, no envía
│   ├── stats.ts                 # imprime métricas
│   └── health-check.ts          # verifica todas las APIs
├── .env.example
├── railway.toml
├── Dockerfile
├── package.json
├── tsconfig.json
├── CLAUDE.md                    # contexto para Claude Code
└── README.md                    # paso a paso para Unax
```

**`core/` es lógica pura sin dependencias de red** → testeable en frío y
predecible. `services/` son los adaptadores. `jobs/` orquesta.

---

## 6. Filtros y heurísticas

### 6.1 Criterios de lead cualificado (`lead-filter.ts`)

Un lead pasa de `ANALYZED` a `READY_TO_SEND` si:

```
✅ email válido (no genérico, no @google.com)
✅ rating >= 4.0
✅ review_count >= 20
✅ NO en blacklist (cadenas, franquicias, ya contactado)
✅ Y una de estas:
     ◦ no tiene website
     ◦ web_score >= 50
```

Blacklist por defecto incluye: `Sanitas`, `Quirónsalud`, `Vital Dent`,
`Dentix`, `Adeslas`, `Caser`, `Mapfre`. Editable desde código.

### 6.2 Web analyzer (`web-analyzer.ts`)

Score 0-100 (mayor = más mejorable):

| Señal | Puntos | Detección |
|---|---|---|
| No carga / 404 / timeout | +100 | fetch falla o status ≥ 400 |
| Sin HTTPS | +25 | URL `http://` o cert inválido |
| Sin meta viewport | +25 | parseo HTML |
| Carga > 4s | +15 | tiempo del fetch |
| HTML > 500 KB | +10 | response body size |
| Tecnología obsoleta | +20 | meta generator: FrontPage, Wix viejo, Joomla < 3 |
| Copyright < 2020 | +15 | regex en footer |
| Sin Open Graph | +5 | sin `<meta property="og:*">` |
| Sin favicon | +5 | sin `<link rel="icon">` |

Umbral cualificación: `web_score >= 50`.

### 6.3 Política de envío humano (`send-policy.ts`)

Antes de cada envío, comprueba:

- Día laborable (lun-jue).
- Horario: 09:00-13:30 y 16:00-18:30 hora España.
- Tiempo desde último envío ≥ jitter aleatorio 2-5 min.
- Cuota diaria no agotada.

Cuota con escalado automático para proteger reputación del dominio:

| Días desde primer envío | Cuota diaria |
|---|---|
| 1-7 | 10 |
| 8-14 | 20 |
| 15-21 | 35 |
| 22+ | 50 |

---

## 7. Redacción de emails

### 7.1 System prompt (cacheado, en `prompts/system.ts`)

Reglas duras:

- Español de España, tuteo natural.
- Máx 110 palabras.
- Cero adjetivos vacíos ("increíble", "potente", "innovador").
- Cero emojis y exclamaciones múltiples.
- Cero promesas vagas.
- Sin "te escribo porque" — entrar directo.
- Firma: `Unax — unaxaller.com — Irún`.

Estructura:

1. Frase con detalle concreto del negocio (nombre, ciudad, reseñas).
2. Observación específica sobre la web (citar problema técnico real si lo hay).
3. Oferta concreta de propuesta visual gratis sin compromiso.
4. Cierre pidiendo respuesta corta.

Negritas (HTML `<b>`):

- Máx 2-3 por email.
- Una sobre el problema técnico concreto.
- Una sobre la oferta gratis sin compromiso.
- Nunca en saludo, despedida, ni nombre del negocio.

Oferta siempre presente: el email **siempre** ofrece preparar una
propuesta visual de cómo podría quedar la web, sin coste y sin
compromiso. Framing exacto: "propuesta visual" / "boceto" / "maqueta",
NUNCA "web entera gratis" (suena absurdo).

### 7.2 Ejemplo de output

> **Asunto:** una idea para la web de la Clínica Dental García
>
> Hola,
>
> Vi que la Clínica Dental García en Bilbao tiene 4,8 con 130 reseñas — se nota que tenéis pacientes contentos. Le eché un vistazo a la web y vi que **no se ve bien en el móvil y tarda bastante en cargar**, cosas que hoy día penalizan en Google y hacen que muchos pacientes nuevos se vayan antes de llamar.
>
> Si os interesa, **puedo prepararos una propuesta visual de cómo podría quedar la web, sin coste y sin compromiso**. Si os gusta lo que veis, ya hablamos; si no, no os molesto más.
>
> ¿Os interesa que os la mande?
>
> Unax — unaxaller.com — Irún

### 7.3 Detector de auto-respuestas (`response-detector.ts`)

Cuando el watcher detecta nuevo mensaje en hilo, pasa el cuerpo a Claude
con prompt corto que clasifica en `human_reply` / `auto_reply` / `bounce`.
Solo `human_reply` activa el cambio a `RESPONDED`.

---

## 8. A/B testing

- Tabla `variants` soporta múltiples variantes activas con pesos.
- Sender selecciona variante aleatoria ponderada por `weight`.
- Trigger SQL actualiza `sent_count` y `reply_count` automáticamente.
- Métrica única: tasa de respuesta = `reply_count / sent_count`.
- **Arranca con UNA sola variante.** Cuando haya volumen suficiente
  (≥ 100 envíos por variante candidata), Unax decide cuándo añadir
  variantes nuevas vía script `npm run variant:new`.
- Sistema preparado para promover/descartar variantes manualmente; no
  hay autoselección automática (sería sobreingeniería en la fase
  inicial).

---

## 9. Auto-monitorización (`health-monitor.ts`)

Único método público: `notifyError(severity, title, detail)`. Envía
email vía Gmail API desde Unax hacia Unax con asunto formateado
`[CAPTACION-IA] ⚠️ <título>`.

### 9.1 Disparadores

| Trigger | Mecanismo |
|---|---|
| Apify error / sin créditos | catch en `services/apify.ts` |
| Claude API error / 429 | catch en `services/claude.ts` |
| Gmail token caducado | catch en `services/gmail.ts` |
| Supabase no responde | catch en `services/supabase.ts` |
| Sender > 24h sin enviar | watchdog en `index.ts` |
| Watcher > 1h sin correr | watchdog en `index.ts` |
| Email rebotado | webhook bounce de Gmail |
| Tasa de respuesta < 1% en últimos 100 envíos | check semanal |

### 9.2 Anti-spam de errores

Si el mismo `(severity, title)` ya se notificó en las últimas 6h, se
suprime. Implementado con tabla en memoria + persistencia opcional en
`metrics` para no perder estado tras reinicio.

---

## 10. Mantenibilidad desde Claude Code

### 10.1 `CLAUDE.md` en la raíz

Contendrá:

- Arquitectura resumida (los 3 jobs).
- Mapa "si quieres cambiar X, edita Y":
  - Tono del email → `prompts/system.ts`
  - Queries del scraper → `config/queries.ts`
  - Filtros → `core/lead-filter.ts`
  - Heurísticas web → `core/web-analyzer.ts`
  - Política de envío → `core/send-policy.ts`
- Comandos útiles (sección 10.2).
- Convenciones (cómo añadir variantes A/B, cómo añadir queries).
- "No tocar sin pensarlo": `send-policy` puede romper deliverability.

### 10.2 Scripts npm

```
npm run dev               # local
npm run test:pipeline     # dry-run completo, no envía
npm run gmail:auth        # OAuth Gmail (una vez)
npm run db:migrate        # aplica SQL a Supabase
npm run variant:new       # crea variante A/B nueva
npm run stats             # tasa respuesta, envíos, etc
npm run health:check      # verifica todas las APIs
```

---

## 11. Configuración manual requerida

Lo que Unax tiene que hacer una sola vez (~1-2 horas en total):

### Bloque A — cuentas y APIs

1. Proyecto Supabase + ejecutar SQLs de `sql/`.
2. Cuenta Apify + token + activar actor Compass.
3. Cuenta Anthropic + cargar saldo + API key.
4. Google Cloud → habilitar Gmail API → OAuth client desktop →
   descargar `gmail-credentials.json`.

### Bloque B — DNS

5. Verificar SPF/DKIM (ya configurados por Workspace) y añadir DMARC:
   ```
   v=DMARC1; p=none; rua=mailto:unax@unaxaller.com
   ```

### Bloque C — autenticación local

6. Correr `npm run gmail:auth` una vez para generar refresh token.

### Bloque D — deploy

7. Push a GitHub privado.
8. Railway → New Project → Deploy from GitHub.
9. Pegar variables de entorno listadas en `.env.example`.

### Bloque E — pruebas

10. `npm run test:pipeline` para validar dry-run.
11. Primer envío manual a sí mismo.
12. Activar producción ajustando `config/queries.ts`.

---

## 12. Riesgos y mitigaciones

| Riesgo | Mitigación |
|---|---|
| Dominio marcado como spam | Escalado de cuota 10→50/día, ritmo humano, sin tracking pixels, SPF/DKIM/DMARC |
| Apify bloquea / cambia API | Watchdog avisa; código aislado en `services/apify.ts` para reemplazar fácil |
| Gmail token caduca | Watchdog detecta y avisa; refresh tokens duran indefinidamente salvo revocación |
| Falsos positivos en "web mejorable" | Score con múltiples señales y umbral conservador (50); revisable en BD |
| LSSI-CE / RGPD: cold email B2B | España permite B2B con base legítima a direcciones de empresa; incluir línea "si no quieres más, dímelo" |
| Coste se dispara | Apify free tier + cap de 50 envíos/día limita exposure naturalmente |
| El sistema se cae sin avisar | health-monitor con emails de alerta y watchdogs |

---

## 13. Plan de despliegue por fases

**Fase 1 — Validación (semana 1)**
- Construcción del repo.
- `test:pipeline` con 5-10 negocios reales.
- Revisión manual de los emails generados; iteración del prompt.

**Fase 2 — Soft launch (semanas 2-3)**
- Deploy a Railway.
- Cuota máxima 10/día.
- 1 query/día.
- Revisar diariamente respuestas y bounces.

**Fase 3 — Escalado (semanas 4+)**
- Cuota crece automáticamente hasta 50/día.
- 2-3 queries rotativas por semana.
- Activar A/B testing si tasa de respuesta < 2%.

---

## 14. Decisiones cerradas y descartadas

**Cerradas:**

- Stack: código (no n8n, no Make).
- Fuente: Apify Compass (no Google Places API, no Outscraper).
- Análisis web: solo heurísticas locales (no PageSpeed, no Claude visual).
- Hosting: Railway (no VPS, no Supabase Edge).
- Detección reply: polling (no Pub/Sub).
- Followups: ninguno.
- Notificaciones de respuesta: solo Gmail nativo (no Telegram).
- Firma: `Unax — unaxaller.com — Irún`.
- Email autenticado para envío Y para alertas: el mismo de Unax.

**Descartadas con razón:**

- **Servicios transaccionales (Resend, Postmark):** rompen el aspecto humano.
- **Plataformas cold-outreach (Instantly):** sobreingeniería para volumen
  inicial; reconsiderar a >1000 emails/día.
- **Plan Claude Max para automatización:** viola ToS y no expone API.
- **Modelos no-Anthropic:** calidad notablemente inferior en español de España.
- **Followups automáticos:** contradice el requisito explícito de "el sistema
  solo gestiona el primer contacto".
- **Auto-promoción de variantes A/B:** fase inicial con datos insuficientes;
  manual hasta que haya volumen.

---

## 15. Próximo paso

Crear plan de implementación detallado vía skill `writing-plans` que
descomponga este diseño en tareas ejecutables paso a paso para que
Claude Code (sesión actual o futura) pueda construir el sistema.
