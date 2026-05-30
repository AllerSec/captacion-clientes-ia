# Panel de estado (dashboard) — Design

**Fecha:** 2026-05-30
**Autor:** Unax + Claude
**Estado:** Aprobado, pendiente de plan de implementación

## Problema

Unax quiere "tener el control de todo": ver de un vistazo si el sistema de captación
está funcionando (enviando emails, con créditos, Railway vivo, respuestas sin perder).
Hoy solo hay alertas por email (`health-monitor`) y consultas manuales a la DB.

## Objetivo

Un panel web **en una sola pantalla, sin scroll, simple e intuitivo** (un "hero"),
con semáforo verde/rojo por bloque, que se autorefresca. Público (sin login, decisión
explícita del usuario). Cero despliegues nuevos, cero coste.

## Arquitectura

Cuelga del **servidor HTTP que ya existe** en `src/index.ts` (hoy solo sirve
`/health` en el puerto `PORT`). Se añaden 2 rutas:

- `GET /panel` → HTML estático del dashboard (una página, CSS inline, sin librerías
  ni build). Hace fetch a `/panel/data` cada 30s y repinta.
- `GET /panel/data` → JSON con el estado calculado.

La lógica "¿esto está bien o mal?" vive en un módulo **puro** `src/core/dashboard-status.ts`
(sin red, testeable en frío), siguiendo la convención `core/` MUST NOT import `services/`.
El cálculo de estado recibe datos ya leídos (inyectados) y devuelve el objeto de estado.
La lectura de DB (services) y el ensamblado van en `src/services/dashboard-data.ts`.

### Componentes

1. **`src/core/dashboard-status.ts`** (puro)
   - `buildDashboardStatus(input): DashboardStatus` — recibe contadores/timestamps y
     decide los 4 semáforos + el global. Sin efectos.
   - Umbrales (alineados con los watchdogs de `index.ts`):
     - Envíos 🔴 si 0 emails en >24h; 🟢 si hay actividad.
     - Sistema 🔴 si `now - lastSenderRun > 24h` o `now - lastWatcherRun > 1h`.
     - Créditos 🔴 si hay leads recientes (<24h) con `notes` que contengan
       `serper_quota_exhausted`, `serper_no_api_key` o `Insufficient credits`.
     - Respuestas 🟡 si hay `RESPONDED` reciente sin marcar visto (informativo).
     - Global 🟢 solo si ninguno está 🔴.

2. **`src/services/dashboard-data.ts`**
   - `getDashboardData(): Promise<DashboardStatus>` — consulta Supabase (envíos hoy,
     cola, RESPONDED, notes de error recientes), lee el estado in-process
     (`lastSenderRun`/`lastWatcherRun`) y el commit desplegado (env
     `RAILWAY_GIT_COMMIT_SHA` si existe), llama a `buildDashboardStatus`.

3. **`src/web/panel-html.ts`**
   - `PANEL_HTML: string` — el HTML/CSS/JS inline de la página. 4 bloques en grid 2x2
     + cabecera con semáforo global y hora de actualización. Responsive (móvil: 1
     columna, sigue sin scroll en pantallas normales).
   - **El diseño visual sigue las guías de la skill `ui-ux-pro-max`**: estilo limpio
     y moderno (dark mode por defecto, buen contraste para los semáforos, jerarquía
     tipográfica clara, espaciado generoso, estados de color accesibles). Sigue siendo
     HTML/CSS plano inline (sin framework), pero con criterio de diseño profesional.

4. **`src/index.ts`** (modificado)
   - El handler HTTP añade `/panel` (sirve `PANEL_HTML`) y `/panel/data` (sirve
     `await getDashboardData()`). `lastSenderRun`/`lastWatcherRun` se exponen al
     módulo de datos (vía closure o un pequeño módulo de estado compartido).

### Datos mostrados

| Bloque | Fuente | Verde/Rojo |
|---|---|---|
| 📧 Envíos | `emails_sent` hoy + leads QUEUED/READY_TO_SEND | 🔴 si 0 en >24h |
| 🔑 Créditos | `leads.notes` recientes con marcadores de quota | 🔴 si aparecen |
| ⚙️ Sistema | `lastSenderRun`/`lastWatcherRun` + commit | 🔴 si sender>24h o watcher>1h |
| 💬 Respuestas | leads `RESPONDED` | 🟡 si hay reciente |

Apify (warmup/billing) e Instantly no exponen API útil aquí → se ponen como enlaces
directos a sus paneles, no como datos en vivo.

## Manejo de errores

- Si `/panel/data` falla al consultar Supabase, devuelve `{ ok:false, error }` y el
  HTML muestra el global en 🔴 con "no se pudo leer el estado". Nunca rompe el server
  (los cron jobs siguen).
- El panel es read-only: no muta nada.

## Testing

- `tests/core/dashboard-status.test.ts` — vitest, casos de cada semáforo y del global
  (todo verde, sender caído, quota agotada, etc.). Es lógica pura → fácil de cubrir.
- `dashboard-data.ts` se prueba con mock de supabase a nivel de módulo.

## Fuera de alcance (YAGNI)

- Sin login/clave (público, decisión del usuario).
- Sin gráficas ni históricos; solo estado actual.
- Sin integración API con Apify/Instantly (solo enlaces).
- Sin framework ni build; HTML/CSS/JS inline.

## Requiere del usuario

- La **URL pública del servicio en Railway** (Settings → Networking → Public Domain)
  para saber dónde se abre el panel. Si no hay dominio público aún, se genera con un
  click en esa pantalla.
