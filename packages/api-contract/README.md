# @wems/api-contract

**Generated — do not edit by hand.** `openapi.json` comes from the NestJS DTOs/controllers and
`src/schema.d.ts` from `openapi-typescript` (ADR-0002).

```bash
pnpm api:contract     # rebuild api → openapi.json → TS types
```

The web app uses these types with `openapi-fetch`; the mobile app generates its Dart client from
`openapi.json` with `swagger_parser`. CI fails when the committed files are out of date.
