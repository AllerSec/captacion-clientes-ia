# Centro de Mando (panel v3) — Design

**Fecha:** 2026-05-30
**Estado:** Aprobado, en implementación

## Objetivo

Convertir el panel en un **centro de mando centralizado**: todo el estado + créditos
de cada servicio + botones a sitios específicos + acciones del sistema, en una página.

## 3 zonas

**Zona 1 — Estado en vivo** (ya existe): semáforo global, envíos, próximo email,
gráfica 7d, embudo, Instantly, sistema, respuestas.

**Zona 2 — Créditos centralizados** (tarjeta por servicio, cada una con botón directo):
| Servicio | Dato | Botón → |
|---|---|---|
| Apify | $usado/$límite en vivo + barra | console.apify.com/billing |
| Serper | "saldo en su panel" | serper.dev/dashboard |
| Instantly | métricas campaña (las que da la API) | app.instantly.ai |
| Railway | "uso en su panel" | railway.app (project usage) |
| Supabase | nº filas leads | supabase dashboard |

Serper/Railway no exponen saldo por API (confirmado probando) → botón a su panel.

**Zona 3 — Acciones del sistema** (botones que ejecutan o llevan):
- **Forzar scrape ahora** → POST `/panel/action/scrape` (ejecuta `runScraperAuto`).
- Ver leads en cola / Ver últimos enviados → enlaces a Supabase table editor filtrado.

## Seguridad de las acciones (crítico — panel es público)

`/panel/action/scrape` se blinda con 3 capas:
1. **Token obligatorio SIEMPRE** (mismo `PANEL_TOKEN`, header Authorization). Sin token
   válido → 401, aunque el panel base sea accesible sin token. La acción NUNCA es abierta.
2. **Solo POST** (no GET). Evita disparo accidental por prefetch/crawler.
3. **Candado anti-repetición** en memoria: si ya hay un scrape en curso, devuelve 409
   "ya en marcha". El scrape corre en segundo plano (no bloquea la respuesta HTTP) y se
   registra en logs. La respuesta es inmediata: `{ ok:true, started:true }`.

El cliente: botón con `confirm()` antes de disparar; manda el token por header.

Riesgo aceptado por el usuario: un token filtrado permitiría lanzar scrapes (gasta
créditos Apify, no destructivo). Documentado.

## Arquitectura / archivos

- `src/core/scrape-lock.ts` (nuevo, puro): candado `isScrapeRunning()` / `tryAcquire()` /
  `release()`. Testeable.
- `src/index.ts`: ruta POST `/panel/action/scrape` → valida token → si candado libre,
  lanza `runScraperAuto()` en background (`.then/.catch` + release) y responde 200.
- `src/services/dashboard-data.ts`: añade `dbRows` (count total leads) para la tarjeta
  Supabase. Apify/Instantly ya están.
- `src/web/panel-html.ts`: añade Zona 2 (tarjetas de créditos con botones) y Zona 3
  (botón Forzar scrape + enlaces). Mantiene Dark OLED de ui-ux-pro-max.
- Los enlaces externos se definen como constantes en el HTML (no datos sensibles).

## Testing

- `tests/core/scrape-lock.test.ts`: adquirir/soltar, no doble adquisición.
- Lógica de estado ya cubierta por dashboard-status.test.ts.

## Fuera de alcance (YAGNI)

- Sin saldo de Serper/Railway en vivo (sus APIs no lo dan).
- Sin más acciones que ejecuten (solo scrape); el resto son enlaces/lectura.
- Sin histórico de acciones; solo logs.
