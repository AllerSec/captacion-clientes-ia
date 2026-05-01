# Captación Clientes IA

Sistema automatizado de captación de clientes por email para Unax.

> Nota: la mayoría del mantenimiento se hace abriendo Claude Code en este repo y pidiéndole cambios. Ver `CLAUDE.md`.

## Setup (~1-2 horas, una sola vez)

### 1. Cuentas y APIs

#### Supabase
1. `supabase.com` → New project (free tier).
2. SQL Editor → pega `sql/001_init.sql` → Run.
3. SQL Editor → pega `sql/002_triggers.sql` → Run.
4. Settings → API → copia `URL` y `service_role key`.

#### Apify
1. `apify.com` → Sign up.
2. Visita `apify.com/compass/crawler-google-places` → "Try for free" una vez.
3. Settings → API tokens → copia el token.

#### Anthropic
1. `console.anthropic.com` → Sign up.
2. Billing → tarjeta + 10€ saldo.
3. API Keys → crear y copiar.

#### Google Cloud + Gmail API
1. `console.cloud.google.com` → New project.
2. APIs & Services → enable **Gmail API**.
3. OAuth consent screen → External → completa nombre app, tu email, scopes
   `gmail.send`, `gmail.readonly`, `gmail.modify`. Añade tu propio email
   como "test user".
4. Credentials → Create OAuth client ID → Desktop app → guarda Client ID y Secret.

### 2. DNS de tu dominio (unaxaller.com)

Verifica con `mxtoolbox.com`:
- SPF: `v=spf1 include:_spf.google.com ~all` (lo pone Workspace).
- DKIM: ya configurado por Workspace (Admin Console > Apps > Gmail > Authenticate email).
- DMARC: añade `_dmarc.unaxaller.com` TXT con `v=DMARC1; p=none; rua=mailto:tu@unaxaller.com`.

### 3. Configuración local

```
git clone <repo>
cd captacion-clientes-ia
npm install
cp .env.example .env
# rellena .env con todas las claves
npm run gmail:auth     # abre browser, da consentimiento, copia GMAIL_REFRESH_TOKEN al .env
npm run seed:variants
npm run health:check   # debe imprimir "All healthy"
```

### 4. Pruebas en dry-run

```
DRY_RUN=true npm run test:pipeline
```

Lee los emails generados en consola. Si el tono no te convence, edita
`src/prompts/system.ts` y vuelve a probar.

### 5. Primer envío real (a ti mismo)

Edita temporalmente `src/config/queries.ts` para que el lead seas tú o
inserta un lead manual en Supabase. Quita `DRY_RUN`. Comprueba que el
email te llega bien.

### 6. Despliegue a Railway

1. Push a GitHub privado.
2. Railway → New Project → Deploy from GitHub.
3. Variables: pega todas las de `.env` (sin `DRY_RUN` o `DRY_RUN=false`).
4. Generate domain (opcional, sólo para `/health`).
5. El sistema arranca solo. Logs en Railway dashboard.

## Comandos diarios

| Quiero...                   | Comando                       |
|-----------------------------|-------------------------------|
| Ver stats                   | `npm run stats`               |
| Comprobar que todo va       | `npm run health:check`        |
| Probar emails sin enviar    | `npm run test:pipeline`       |
| Añadir variante A/B         | `npm run variant:new`         |

## Costes mensuales aprox

- Railway: 5 €
- Supabase: 0 €
- Apify: 10-15 €
- Anthropic: 5-10 €
- **Total: ~20-30 €/mes**
