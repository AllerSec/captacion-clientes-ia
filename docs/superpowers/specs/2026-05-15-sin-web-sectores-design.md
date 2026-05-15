# Diseño: captación de negocios sin web en sectores específicos

**Fecha:** 2026-05-15  
**Estado:** aprobado

## Contexto

El sistema anterior contactaba negocios con web antigua (footer ≤2018) para ofrecerles renovarla. El nuevo enfoque cambia completamente: buscamos negocios **sin web en absoluto** en tres sectores concretos (ópticas, talleres mecánicos, farmacias), y el email muestra un ejemplo real ya hecho del mismo sector.

El insight detrás del cambio: una empresa sin web no puede rebatir nada, no puede comparar, y el problema es autoevidente. No hay que convencer de que su web es mala, porque no tienen ninguna.

## Sectores objetivo

| Sector | Queries base | Ejemplo que se muestra |
|--------|-------------|----------------------|
| Taller mecánico | `taller mecánico`, `taller coches`, `mecánico` | `motosarretxe.com` |
| Óptica | `óptica`, `optica`, `ópticas` | `anakaoptica.com` |
| Farmacia | `farmacia` | `farmaciafernandezbera.com` |

La detección de sector se hace desde la query que encontró el lead (campo `query_used` en DB). Nunca desde el nombre del negocio (demasiado ambiguo).

## Cambios por archivo

### `src/config/queries.ts`

Reemplazar todas las queries actuales. Mismo sistema de tiers geográficos (1-8), mismas ciudades, pero únicamente los tres sectores nuevos.

Ejemplo Tier 1:
```
'óptica Irún', 'taller mecánico Irún', 'farmacia Irún',
'óptica Hondarribia', 'taller mecánico Hondarribia', 'farmacia Hondarribia'
```

Cada ciudad del tier actual recibe exactamente 3 queries (una por sector).

### `src/core/lead-filter.ts`

Lógica nueva, más simple:

1. Sin email → SKIPPED (`no_email`)
2. Email inválido → SKIPPED (`invalid_email`)
3. Rating < 4.0 → SKIPPED (`low_rating`)
4. Reviews < 15 → SKIPPED (`few_reviews`)
5. En blacklist → SKIPPED (`blacklisted`)
6. **Tiene web → SKIPPED (`has_website`)** ← regla nueva central
7. Sin web → READY_TO_SEND

Se eliminan por completo: `footer_year`, `web_too_recent`, `no_year_proof`, `has_online_shop`, `web_score`. El análisis visual tampoco se ejecuta.

### `src/jobs/scraper.ts`

En `analyzeOneLead`: si el lead tiene website, se salta todo el análisis (Firecrawl, screenshot, visual) y marca SKIPPED directamente. Si no tiene website, marca ANALYZED sin análisis y pasa al filtro que lo convierte en READY_TO_SEND.

Esto elimina el gasto de créditos Firecrawl en leads que no cualifican.

### `src/core/sector-detector.ts` (nuevo archivo)

Función pura que mapea una query a un sector y a la URL de ejemplo:

```ts
type Sector = 'taller' | 'optica' | 'farmacia' | 'unknown';

interface SectorInfo {
  sector: Sector;
  exampleUrl: string | null;
  clientWord: string; // "clientes" en todos los casos actuales
}

function detectSector(query: string): SectorInfo
```

Lógica: regex sobre la query. Si no encaja → `unknown`, `exampleUrl: null`. El email en ese caso se genera sin mencionar ejemplo (fallback seguro).

### `src/services/supabase.ts`

El campo `query_used` ya existe en la tabla `leads`. Hay que asegurarse de que se pasa al sender para que pueda detectar el sector.

### `src/prompts/system.ts`

Nuevo prompt, un solo caso posible (sin web). El template recibe:
- `SECTOR`: taller / óptica / farmacia
- `EXAMPLE_URL`: la URL del ejemplo del sector
- `CLIENT_WORD`: clientes (igual para todos por ahora)

**Psicología aplicada (Carnegie + marketing psychology):**

El email aplica tres principios de Carnegie de forma concreta:
- **Habla en términos de los intereses del otro:** todo habla de sus llamadas y clientes perdidos, nunca de lo que Unax gana.
- **Despierta un deseo ardiente:** la URL del ejemplo es tangible — pueden abrirla ahora mismo y ver cómo quedaría algo así para ellos.
- **Sé sincero, sin presión:** "gratis y sin compromiso" elimina el riesgo percibido; "un minuto" elimina la fricción de tiempo.

Además: **reciprocidad** (el ejemplo ya hecho es un regalo antes de pedir nada) y **loss aversion** (el foco es en llamadas que ya se están perdiendo, no en beneficios futuros).

**Estructura del email:**

1. Apertura directa: "Vi que no tenéis web."
2. Consecuencia concreta en términos del sector: alguien busca [sector] en Google, no os encuentra, llama al siguiente. Sin más.
3. Frase corta de golpe: "Sin más." o equivalente que cierre el párrafo con impacto.
4. Ejemplo ya hecho: "Ya hice una para un [sector] de la zona: [URL]" — sin hipervínculo, texto plano.
5. Oferta: "Os preparo una web de prueba **gratis y sin compromiso** para que veáis cómo quedaría la vuestra."
6. CTA mínimo: "¿Os la paso? Un minuto y la veis."
7. Firma: igual que ahora.

**Reglas que se mantienen igual:**
- Máximo 110 palabras en el body
- Cero exclamaciones, emojis, adjetivos vacíos
- Cero guiones largos
- Tuteo plural ("os", "vosotros")
- Una sola negrita: exactamente "gratis y sin compromiso"
- Subject: 2-4 palabras, minúsculas, sin nombre del negocio

**Reglas nuevas:**
- La URL va en texto plano dentro de un `<p>`, sin hipervínculo (evita filtros de spam)
- "Ya hice una" — no "ya tengo una plantilla". Es un trabajo real, no una demo genérica.
- Si `EXAMPLE_URL` es null (sector unknown): se omite el párrafo del ejemplo sin mencionarlo.
- Varía el CTA entre los tres modelos para que no suenen idénticos si alguien recibe más de uno.

**Emails aprobados por sector:**

Voz de referencia: coloquial, cercana, honesta. Estructura de Tomás Santoro (Efficy):
1. Respeta el tiempo ("muy rápido que sé que estáis...")
2. Quién eres + por qué escribes (dato específico de búsqueda real)
3. El caso + ejemplo concreto + "puede que sí, puede que no jeje" (sin presión)
4. Oferta gratis y sin compromiso
5. Pregunta fácil de responder

Taller mecánico — subject: `Pregunta muy rápida`
```
Hola,

Te lo cuento muy rápido que sé que estáis liados.

Soy Unax, desarrollador web de Irún. Estaba buscando talleres en Google Maps por la zona y no os encontré web, así que os escribo.

El caso es que hice la web de un taller hace poco (motosarretxe.com, por si le echáis un vistazo) y sé que a muchos mecánicos sin web se les escapan llamadas solo porque no aparecen cuando alguien busca en Google. Puede que a vosotros os pase lo mismo, puede que no jeje.

Os preparo una web de prueba <b>gratis y sin compromiso</b> para que veáis cómo quedaría la vuestra.

¿Os apetece echarle un vistazo?

¡Un saludo! Unax
unaxaller.com · Irún
```

Óptica — subject: `Pregunta muy rápida`
```
Hola,

Te lo cuento muy rápido que sé que estáis con el negocio a tope.

Soy Unax, desarrollador web de Irún. Busqué ópticas en Google Maps por la zona y no os encontré web, así que os escribo.

Hice la web de una óptica hace poco (anakaoptica.com) y lo que me cuentan es que mucha gente elige a qué óptica ir mirando en Google antes de salir de casa. Sin web, esa decisión la toma otra. Puede que ya lo sabéis, puede que no os había parado a pensarlo jeje.

Os preparo una web de prueba <b>gratis y sin compromiso</b> para que veáis cómo quedaría la vuestra.

¿Os la paso?

¡Un saludo! Unax
unaxaller.com · Irún
```

Farmacia — subject: `Pregunta muy rápida`
```
Hola,

Muy rápido que sé que estáis siempre con la farmacia a tope.

Soy Unax, desarrollador web de Irún. Busqué farmacias en Google Maps por la zona y no os encontré web, así que os escribo.

El caso es que hice la web de una farmacia hace poco (farmaciafernandezbera.com, por si le echáis un vistazo) y sé que a muchas farmacias sin web se les escapan clientes solo porque no aparecen cuando alguien busca en Google. Puede que a vosotros os pase lo mismo, puede que no jeje.

Os preparo una web de prueba <b>gratis y sin compromiso</b> para que veáis cómo quedaría la vuestra.

¿Os la paso? Es un minuto verla.

¡Un saludo! Unax
unaxaller.com · Irún
```

### `src/jobs/sender.ts`

Al generar el email, recuperar el `query_used` del lead, llamar a `detectSector(query_used)` y pasar `SECTOR`, `EXAMPLE_URL` y `CLIENT_WORD` al prompt.

## Archivos que NO cambian

- `src/core/send-policy.ts` — pacing, quota, jitter: sin tocar
- `src/jobs/watcher.ts` — detección de respuestas: sin tocar
- `src/core/health-monitor.ts` — alertas: sin tocar
- `src/core/response-detector.ts` — sin tocar
- `src/core/query-rotator.ts` — sin tocar (funciona igual con las nuevas queries)
- DB schema — sin cambios (los campos de footer_year, web_score etc. quedan en la tabla pero no se usan)

## Qué se elimina

- Todo el análisis visual de webs (Firecrawl, screenshot, web-analyzer) para leads que tienen web → se saltan directamente
- La lógica de `footer_year` y `web_too_recent` en lead-filter
- Las queries de clínicas dentales, asesorías, inmobiliarias, etc.

El código de Firecrawl y screenshot permanece en el repo para leads que tengan web (aunque en la práctica ya no habrá ninguno que cualifique con web). Se puede eliminar en una segunda fase.

## Riesgos

- **Tasa de "tiene web" alta:** muchas farmacias y ópticas sí tienen web. El sistema las descarta, lo cual es correcto, pero puede reducir el volumen de leads cualificados. Solución: ampliar el número de ciudades por tier si el pipeline se queda corto.
- **Falso negativo en website:** Apify a veces no detecta la web del negocio aunque exista. Un negocio con web puede colarse como "sin web". El email seguiría siendo coherente (decimos que no vemos web, y es verdad desde Google Maps), así que el riesgo de reputación es bajo.
- **Sector unknown:** si la query no encaja con ningún sector (raro con las queries nuevas), el email se genera sin URL de ejemplo. Funciona igualmente.
