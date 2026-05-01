# Captación Clientes IA — context for Claude Code

This repo runs a cold-email lead-gen system for Unax (web freelance, Irún).
Three node-cron jobs share a Supabase Postgres DB; emails go via Gmail API
on Unax's Workspace; redaction uses Claude Sonnet 4.6 with prompt caching.

## Architecture in 30 seconds

- `src/jobs/scraper.ts` — daily 07:00 ES, finds businesses via Apify, analyzes
  their websites, qualifies leads.
- `src/jobs/sender.ts` — every 3 min, sends ONE personalized email if policy
  allows (workday, hours, quota, pacing). Generates email with Claude.
- `src/jobs/watcher.ts` — every 5 min, polls Gmail threads of CONTACTED leads,
  marks RESPONDED on human reply, AUTO_REPLY for OOO, BOUNCED on bounces.
- `src/core/health-monitor.ts` — sends alert emails to Unax when anything
  breaks. 6h dedup.

Pure logic in `src/core/` (testable in cold). External adapters in
`src/services/`. Jobs orchestrate.

## "If you want to change X, edit Y"

| Want to change                       | Edit                                              |
|--------------------------------------|---------------------------------------------------|
| Email tone, structure, bold rules    | `src/prompts/system.ts`                           |
| Daily search queries (rotation)      | `src/config/queries.ts`                           |
| Lead qualification rules / blacklist | `src/core/lead-filter.ts`                         |
| Web "mejorable" heuristics           | `src/core/web-analyzer.ts`                        |
| Send pacing / quota / hours          | `src/core/send-policy.ts`                         |
| Variant A/B prompts                  | DB table `variants` (use `npm run variant:new`)   |
| Reply auto-detection patterns        | `src/core/response-detector.ts`                   |

## Useful commands

```
npm test                  # unit tests
npm run test:pipeline     # dry-run, prints generated emails, no send
npm run gmail:auth        # one-shot OAuth (run once)
npm run health:check      # ping every external service
npm run stats             # variant rates and lead status counts
npm run variant:new       # add a new A/B variant interactively
npm run seed:variants     # seed initial v1 variant
npm run dev               # local development with watch
```

## Conventions

- All env loading goes through `loadEnv()` in `src/config/env.ts`.
- `core/` modules MUST NOT import from `services/` (keep them pure).
- New external API? Add an adapter in `services/` and mock it in tests.
- Tests use vitest. Mock external SDKs at module level with `vi.mock`.
- `DRY_RUN=true` makes the sender log emails without sending.

## Don't touch without thinking

- `src/core/send-policy.ts` — getting this wrong (e.g., disabling jitter,
  raising quota too fast) burns the domain's reputation. Read the spec
  before changing.
- The system prompt's "OFERTA SIEMPRE PRESENTE" rule — removing the
  free-no-strings offer changes the value prop entirely.
- `place_id unique` constraint in `leads` — this is the only thing
  preventing duplicate sends to the same business.

## Spec & plan

- Design: `docs/superpowers/specs/2026-05-01-captacion-clientes-ia-design.md`
- Implementation plan: `docs/superpowers/plans/2026-05-01-captacion-clientes-ia.md`
