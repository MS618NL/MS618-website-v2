# Onderhoud & dependency-policy

Bron-van-waarheid voor hoe we deze site (Astro) up-to-date houden. Tracking en
prioritering staan in Todoist: **MS618 > 🚀 Projecten > 🔧 Web-platform onderhoud (Astro/deps)**.

## Versiebeleid (semver)

| Type | Voorbeeld | Risico | Actie |
|---|---|---|---|
| PATCH | 5.18.0 -> 5.18.1 | ~nul | meenemen |
| MINOR | 5.17 -> 5.18 | laag | per kwartaal meenemen |
| MAJOR | 5 -> 6 | reeel | aparte geplande taak (zie onder) |

- `package.json` houdt een **caret-range** (`^5.x`), zodat minors/patches automatisch
  meekomen bij `npm install` en een major-sprong nooit per ongeluk gebeurt.
- Ondergrens staat op `^5.18.1` (weerspiegelt de werkelijk geinstalleerde versie).
- `package-lock.json` pint de exacte versies; `npm ci` reproduceert ze.

## Terugkerende check (per kwartaal)

Geautomatiseerd via een scheduled agent (zie Todoist-taak). Handmatig equivalent:

```bash
npm outdated   # toont current / wanted (binnen range) / latest per package
npm audit      # security-advisories
```

- Minors/patches binnen 5.x: meenemen.
- **Security-advisories: direct oppakken**, niet wachten op het kwartaal.

## Major-upgrade (naar 6.x) = aparte taak

Niet bundelen met inhoudelijke of SEO-changes. Volgorde:

1. Branch (nooit direct op `main`).
2. `npx @astrojs/upgrade` -- Astro's officiele tool; bumpt `astro` + first-party
   integraties (`@astrojs/sitemap`, `@astrojs/rss`) samen naar compatibele versies.
3. Migratiegids op docs.astro.build ("Upgrade to v6") doorlopen.
4. Integratie-compat checken, ook `@tailwindcss/vite` / `tailwindcss`.
5. `npm run build` + Vercel preview-deploy + visuele regressiecheck.
6. Pas dan mergen.

Geen acute noodzaak zolang we op een ondersteunde 5.x zitten; doen voordat 5.x uit
support loopt (zodra 6 de actieve major is, krijgt 5 alleen nog beperkte fixes).

## Tools

- `npm outdated`, `npm audit` -- snelle status.
- `npx @astrojs/upgrade` -- voor majors (coordineert astro + integraties).
- GitHub `withastro/astro` Releases / CHANGELOG -- de details per versie.
