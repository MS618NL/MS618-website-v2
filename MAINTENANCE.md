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

## Beeld in Google

Op 10-11-2026 toonde Google bij "ms618" het logo van klant Hout Met Historie als beeld bij de
homepage, en de colofon als sitelink. De home had alleen het algemene tekstbeeld
`/og/default.png`; dat slaat Google over, en dan kiest het zelf een beeld van de pagina. Daar
stond de rij met 15 klantlogo's. Opgelost in PR #55; deze regels houden het zo.

- **Eigen foto op de home.** `/` en `/en/` geven `/og/home.jpg` (kantoor FJ08, 1200x630) door als
  og:image én als `primaryImageOfPage` (`withPrimaryImage` in `src/utils/schema.ts`). Geen logo
  en geen beeld met tekst. Houd dat aan als je de home herbouwt.
- **Logo's van anderen uit Google.** Klantlogo's staan in `public/images/clients/`; `vercel.json`
  geeft die map `X-Robots-Tag: noindex`. Nieuwe logo's van klanten of partners horen daar ook.
  Het eigen logo nooit.
- **Colofon niet in Google.** `/colofon/` staat op noindex en buiten de sitemap (filter in
  `astro.config.mjs`), zodat hij niet als sitelink verschijnt.
- **Controle bij elke build.** `scripts/zoekresultaat-check.mjs` draait in de postbuild, ook op
  Vercel, vóór de IndexNow-ping. Een productiebuild (een merge naar `main`) stopt op FOUT; een
  preview meldt het en gaat door. Los draaien: `npm run check:zoekbeeld`. Het script is een kopie
  uit de website-skill (`gtm-factory/_skills/website/scripts/`); vervang het daar en kopieer het
  hierheen, nooit hier los aanpassen.

## Taal

Op 11-11-2026 lekten 9 van de 23 Engelse pagina's naar het Nederlands: de Engelse home toonde
Nederlandse blogposts ("Lees:", links naar `/blog/`), en Engelse pagina's hadden Nederlandse datums
omdat `formatDate` zonder taal werd aangeroepen. Google zette bij Engelse instellingen Nederlandse en
Engelse sitelinks door elkaar. Opgelost in PR #57; deze regels houden het zo.

- **Lijsten uit de eigen taal.** Een Engelse pagina haalt posts uit `blog-en` en geeft `BlogCard`
  `basePath="/en/blog"` mee.
- **Datums in de taal van de pagina.** `formatDate(datum, 'en-GB')` op Engelse pagina's; `BlogCard`
  kiest de taal zelf uit `basePath`. Datums staan in `<time>`.
- **Links in de eigen taal.** Een link in de inhoud naar de andere taal mag alleen als taalknop naar
  de eigen vertaling, of met `hreflang` op de link.
- **Controle bij elke build.** `scripts/taallek-check.mjs` draait in de postbuild, na de
  zoekbeeldcontrole en vóór de IndexNow-ping. Een productiebuild stopt op FOUT. Los:
  `npm run check:taal`. Kopie uit de website-skill, net als `zoekresultaat-check.mjs`.

## Cookiemelding

Sinds 11-11-2026 vraagt de site toestemming met de MS618-standaard: CookieConsent v3 (MIT), zelf
gehost, opbouw v2 zoals op de klantsites (eerste laag Accepteren + Instellingen, weigeren via
Instellingen > Alles weigeren). Alleen de categorieën noodzakelijk en analytisch: GTM-K3PJBX8 bevat
alleen Google Analytics en de site adverteert niet. Komt er Google Ads bij, voeg dan de categorie
advertisement toe (zie de klantsites, bijvoorbeeld Distinkt) en zet `ad_storage` en `ad_user_data`
mee in de update.

- **Consent Mode-standaard:** `src/components/ConsentDefaults.astro`, in de head vóór GTM. Alles
  denied; een eerdere keuze uit de cookie `cc_cookie` gaat direct als update mee.
- **Melding:** `public/cookieconsent-start.js` (teksten NL en EN, start, update na een keuze), geladen
  door `src/components/CookieBanner.astro`. Bibliotheek in `public/vendor/cookieconsent/3.1.0/`.
- **Opmaak:** blok `#cc-main` onderaan `src/styles/global.css`. Knop Cookie-instellingen in de footer
  en in de privacyverklaring (sectie 5, `#cookies`) met `data-cc="show-preferencesModal"`.
- **CSP, let op.** De CSP (`astro.config.mjs`) werkt met hashes en `'strict-dynamic'`. Astro hasht alleen
  scripts die het inline zet; een groter `<script>` wordt een los bestand in `/_astro/` zonder hash,
  en dat blokkeert de browser stil. Daarom staat de melding in `public/` en laadt een klein inline
  script haar, net zoals de GTM-bootstrap gtm.js laadt. Zet dus geen grote scripts in componenten, en
  controleer na elke wijziging in de browser dat er geen CSP-melding in de console staat.
- **Controle:** `cookiebanner-check.mjs <app>` uit de website-skill (lettertypen, Googlebot) en na
  livegang `--live https://www.ms618.nl/`. `CONSENT_REVISION` in beide bestanden gelijk houden; ophogen
  laat iedereen opnieuw kiezen.

## Tools

- `npm outdated`, `npm audit` -- snelle status.
- `npx @astrojs/upgrade` -- voor majors (coordineert astro + integraties).
- GitHub `withastro/astro` Releases / CHANGELOG -- de details per versie.
