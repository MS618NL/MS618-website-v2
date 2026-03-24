# Buildplan v1 — MS618 Agency Website

## Project Overview

Personal/agency website built with Astro, managed entirely via GTM Factory (Claude Code + GitHub). No CMS — content lives as markdown/MDX in the repo. Optimized for SEO performance and ranking.

**Reference approach:** Joost de Valk (Yoast SEO founder) moved his own site from WordPress to Astro on Cloudflare Pages. His rationale: everything Yoast SEO does on WordPress can be done in Astro — cleaner, faster, with zero overhead. SEO features aren't magic — they're HTML output. Any static site generator can produce that same HTML, often cleaner.

---

## Stack

| Layer | Choice | Why |
|-------|--------|-----|
| Framework | **Astro** | Zero JS default, static HTML, best Core Web Vitals, full HTML control |
| Content | **Markdown / MDX** in repo | No CMS needed, Claude writes + commits directly |
| Hosting | **Cloudflare Pages** (Joost's choice) or **Vercel** | Free tier, global CDN, auto-deploy on push |
| Repo | **GTM Factory GitHub** | Single source of truth, Claude Code access |
| Design | **Figma** (Peter) → Astro components | Figma MCP for design handoff |
| Content management | **Claude Code via GTM Factory** | Write, edit, publish via CLI — the CMS is conversation |

---

## Why No CMS (Joost's Argument)

People never wanted a CMS. They want a website. For a site that is essentially "some pages and maybe a blog," a CMS solves problems you don't have while creating problems you do:

- Database overhead, security surface, plugin conflicts, update fatigue
- Theme/plugin conflicts messing with head tags and render-blocking resources
- Hosting complexity and cost

What you keep with static Astro: full-text search, structured data, RSS, auto-generated OG images, XML sitemaps, meta tags, canonical URLs. What you drop: the overhead.

The editing argument ("clients can't commit to Git") is solved by Claude Code. "Update the opening hours on my contact page" → Claude edits the file, commits, deploys. The CMS's visual editing interface was a solution to a human limitation. AI removes that limitation.

---

## Workflow

```
Claude Code → writes markdown + components → pushes to GitHub → auto-deploy
Peter → designs in Figma → Figma MCP → design tokens exported → Astro components updated
```

### Content Publishing Flow
1. Claude Code creates/edits `.md` file in `src/content/`
2. Frontmatter includes all SEO fields
3. Push to `main` branch
4. Auto-build and deploy
5. Sitemap + RSS auto-regenerated

---

## Site Structure

```
/                       → Homepage (hero + positioning + services overview)
/services/              → Services overview (optimized category landing page)
/services/[slug]/       → Individual service pages
/cases/                 → Case studies overview (optimized category landing page)
/cases/[slug]/          → Individual case study
/blog/                  → Blog listing (optimized category landing page)
/blog/[slug]/           → Blog posts
/about/                 → About / team
/contact/               → Contact + CTA
```

### Site Structure Principles (Joost's Philosophy)

Joost describes SEO as three layers: technical foundation, site structure, and content quality. Site structure is critical because Google is "a slightly dumb, blind visitor" — it has to figure out how your site is structured from what you give it.

**Rules:**
- Every page must be reachable within 3 clicks from homepage
- Category/listing pages (`/services/`, `/blog/`, `/cases/`) are optimized landing pages, not just auto-generated lists
- Use a small number of well-defined categories, not a sprawl of tags
- Internal linking is deliberate: every blog post links to its parent category and 2-3 related posts
- Navigation menu is simple and flat — no mega menus with 30 items
- Breadcrumbs on every subpage for both UX and structured data

---

## SEO Architecture

### The Core Principle

Everything Yoast SEO does is HTML output: meta tags, Open Graph tags, canonical URLs, JSON-LD structured data, XML sitemaps. In Astro, you control the entire HTML output directly. No theme or plugin conflict messing with head tags. No render-blocking resources injected by forgotten plugins. What you build is what gets served.

### Per-page SEO (via markdown frontmatter)

```yaml
---
title: "Page Title"
seoTitle: "Page Title — Brand" # Can override title for SERP display
description: "Meta description, max 155 chars, written as compelling copy"
canonical: "https://domain.com/page/"
ogImage: "/og/page-name.png"
ogType: "website" # or "article" for blog posts
schemaType: "Service" # Organization, Article, Service, etc.
noindex: false
publishDate: 2026-03-23
updatedDate: 2026-03-23
author: "MS618"
category: "digital-marketing" # Maps to site structure
relatedPosts: ["post-slug-1", "post-slug-2"] # Internal linking
---
```

### SEO Component: `<SEO>` (renders in `<head>`)

This single component replaces everything Yoast SEO's meta output does:

```
- <title> tag (with seoTitle override option)
- <meta name="description">
- <link rel="canonical">
- <meta name="robots"> (index/noindex, follow/nofollow)
- Open Graph tags (og:title, og:description, og:image, og:type, og:url, og:site_name, og:locale)
- Twitter Card tags (twitter:card, twitter:title, twitter:description, twitter:image)
- <link rel="alternate" type="application/rss+xml"> for RSS discovery
- <link rel="sitemap"> for sitemap discovery
- Preconnect/preload hints for critical resources
- Hreflang tags (if multilingual later)
```

### SEO Component: `<Schema>` (JSON-LD Structured Data)

This is the most important SEO component. Joost's key insight with Yoast SEO 11.0: don't output separate disconnected schema blocks per page. Instead, build a **connected schema graph** where entities reference each other via `@id`. This creates a knowledge graph for your site that search engines and AI systems can fully understand.

#### The Schema Graph Approach

Every page outputs a single `<script type="application/ld+json">` containing a `@graph` array. Entities within the graph reference each other using `@id` anchors. This is how Yoast SEO works internally — we replicate the same pattern in Astro.

```json
{
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Organization",
      "@id": "https://domain.com/#organization",
      "name": "MS618",
      "url": "https://domain.com",
      "logo": {
        "@type": "ImageObject",
        "@id": "https://domain.com/#logo",
        "url": "https://domain.com/logo.png"
      },
      "sameAs": ["https://linkedin.com/...", "https://twitter.com/..."]
    },
    {
      "@type": "WebSite",
      "@id": "https://domain.com/#website",
      "url": "https://domain.com",
      "name": "MS618",
      "publisher": { "@id": "https://domain.com/#organization" },
      "potentialAction": {
        "@type": "SearchAction",
        "target": "https://domain.com/search?q={search_term_string}",
        "query-input": "required name=search_term_string"
      }
    },
    {
      "@type": "WebPage",
      "@id": "https://domain.com/page/#webpage",
      "url": "https://domain.com/page/",
      "name": "Page Title",
      "isPartOf": { "@id": "https://domain.com/#website" },
      "breadcrumb": { "@id": "https://domain.com/page/#breadcrumb" }
    },
    {
      "@type": "BreadcrumbList",
      "@id": "https://domain.com/page/#breadcrumb",
      "itemListElement": [
        { "@type": "ListItem", "position": 1, "name": "Home", "item": "https://domain.com/" },
        { "@type": "ListItem", "position": 2, "name": "Page Title" }
      ]
    }
  ]
}
```

#### Schema Per Page Type

**Every page includes these base pieces:**
- `Organization` (or `Person`) — the site owner entity
- `WebSite` — with SearchAction if search exists
- `WebPage` — the current page
- `BreadcrumbList` — breadcrumb path

**Homepage adds:**
- `Organization` with full business details (address, contact, social profiles)
- `WebSite` with `SearchAction`

**Blog posts add:**
- `Article` or `BlogPosting` with headline, author, datePublished, dateModified, image, description
- `Person` (author) linked via `@id`
- `ImageObject` for the primary image

**Service pages add:**
- `Service` with name, description, provider (linked to Organization via `@id`)
- `Offer` if pricing is shown

**Case studies add:**
- `Article` with `about` referencing the relevant `Service`

**Contact page adds:**
- `ContactPoint` with contactType, telephone, email, areaServed

#### Implementation

Use `astro-seo-schema` package (TypeScript-typed schema.org definitions) or build raw JSON-LD in Astro components. The schema must be generated dynamically per page using frontmatter data — not hardcoded.

```astro
---
// Schema.astro — simplified example
const { type, data } = Astro.props;

// Base graph pieces present on every page
const baseGraph = [
  organizationPiece,  // Always present, uses @id anchors
  websitePiece,       // Always present, references organization
  webPagePiece,       // Dynamic per page, references website
  breadcrumbPiece,    // Dynamic per page
];

// Add type-specific pieces
if (type === 'article') baseGraph.push(articlePiece);
if (type === 'service') baseGraph.push(servicePiece);

const schema = { "@context": "https://schema.org", "@graph": baseGraph };
---
<script type="application/ld+json" set:html={JSON.stringify(schema)} />
```

### XML Sitemap

Use `@astrojs/sitemap` — auto-generates from all pages. Configure:
- Include all public pages
- Exclude noindex pages
- Set `lastmod` from frontmatter `updatedDate`
- Set `changefreq` based on page type (blog = weekly, services = monthly, homepage = weekly)
- Set `priority` (homepage = 1.0, services = 0.8, blog = 0.6)
- Reference sitemap in `robots.txt`

### RSS Feed

Use `@astrojs/rss` — auto-generates from blog collection. Include:
- Full content or excerpt
- Proper dates
- Author information
- Categories

### robots.txt

```
User-agent: *
Allow: /

Sitemap: https://domain.com/sitemap-index.xml
```

Keep it simple. Don't overblock. Joost's advice: if pages shouldn't be indexed, use `noindex` meta tag, not robots.txt blocks.

### Heading Hierarchy

Joost's clear stance: proper heading hierarchy (H1-H6) matters for accessibility, not directly for SEO ranking. But accessibility and good structure correlate with SEO success.

**Rules:**
- Exactly one `<h1>` per page (the page title)
- Logical nesting: H2 for sections, H3 for subsections
- If you extract just the headings, they should form a proper outline
- Never skip levels (no H1 → H3)

### Category & Tag Strategy (Joost's Key Insight)

Joost has seen sites with 200 posts and 4,000 tags where Google spent all its crawl budget on useless tag pages. His advice:

- Use a small number of well-structured categories (5-8 max)
- Categories have parent-child relationships — use them
- Category pages are optimized landing pages with unique intro text, not just post lists
- Tags: use sparingly or noindex them. If they're messy, noindex all tag pages
- Long term: clean up taxonomy rather than hiding it with noindex

### Internal Linking Strategy

- Every blog post links to its category landing page
- Every blog post links to 2-3 related posts (via `relatedPosts` frontmatter)
- Service pages link to relevant case studies
- Case studies link back to the service they demonstrate
- Homepage links to all top-level category pages
- Breadcrumbs create automatic hierarchical links

### Open Graph Images

Auto-generate OG images per page (like Joost's site does). Options:
- `astro-og-image` or `satori` for programmatic image generation
- Template: brand color background, page title in large text, logo
- Stored as static assets, referenced in frontmatter

### Core Web Vitals Targets

Astro's static HTML gives you a massive head start. Targets:

| Metric | Target | How |
|--------|--------|-----|
| LCP | < 2.5s | Static HTML, optimized images, preload hero image |
| CLS | < 0.1 | Explicit image dimensions, no layout shift from fonts |
| INP | < 200ms | Zero JS by default, Astro islands only where needed |

### AI Crawlability (Future-Proofing)

Joost notes on his blog: clean HTML that every crawler can read, including AI systems that don't execute JavaScript at all. Static HTML is inherently AI-crawlable. This matters as AI-powered search (Google SGE, Perplexity, ChatGPT search) grows.

- Static HTML = fully readable by all crawlers
- Structured data = machine-readable context for AI systems
- Clean semantic markup = better understanding of content hierarchy

### Content Quality (Joost's "90% of SEO")

Joost repeatedly states: 90% of ranking is content quality, not technical SEO. The technical foundation just ensures search engines can find and understand your content.

**Content rules for Claude Code to follow when generating content:**
- Write for the reader first, search engines second
- Answer the user's actual question in the first paragraph
- Use clear, structured prose with proper heading hierarchy
- Include relevant internal links naturally
- Keep sentences readable (aim for Flesch reading ease > 60)
- No keyword stuffing — use natural language and semantic variations
- Every page needs unique, substantive content (no thin pages)
- Update existing content rather than only publishing new content

---

## Component Architecture

```
src/
├── components/
│   ├── seo/
│   │   ├── SEO.astro              → All meta tags, OG, canonical, robots
│   │   ├── Schema.astro           → JSON-LD graph builder
│   │   ├── SchemaOrg.ts           → Organization piece
│   │   ├── SchemaWebsite.ts       → WebSite piece
│   │   ├── SchemaWebpage.ts       → WebPage piece (dynamic)
│   │   ├── SchemaArticle.ts       → Article/BlogPosting piece
│   │   ├── SchemaService.ts       → Service piece
│   │   ├── SchemaBreadcrumb.ts    → BreadcrumbList piece
│   │   └── SchemaContact.ts       → ContactPoint piece
│   ├── Breadcrumbs.astro          → Visual breadcrumbs (data feeds into schema too)
│   ├── Header.astro               → Navigation (simple, flat, accessible)
│   ├── Footer.astro               → Footer + essential links
│   ├── Hero.astro                 → Homepage hero
│   ├── ServiceCard.astro          → Service listing card
│   ├── CaseCard.astro             → Case study card
│   ├── BlogCard.astro             → Blog listing card
│   └── CTA.astro                  → Call-to-action blocks
├── layouts/
│   ├── Base.astro                 → HTML shell + SEO + Schema components
│   ├── Page.astro                 → Standard page layout
│   └── Post.astro                 → Blog/case study layout with article schema
├── content/
│   ├── config.ts                  → Content collection definitions + frontmatter validation
│   ├── blog/                      → Blog posts (.md)
│   ├── cases/                     → Case studies (.md)
│   └── services/                  → Service pages (.md)
├── pages/
│   ├── index.astro                → Homepage
│   ├── about.astro                → About page
│   ├── contact.astro              → Contact page
│   ├── robots.txt.ts              → Dynamic robots.txt
│   ├── rss.xml.ts                 → RSS feed
│   ├── blog/
│   │   ├── index.astro            → Blog listing (optimized landing page)
│   │   └── [...slug].astro        → Dynamic blog post
│   ├── cases/
│   │   ├── index.astro            → Cases listing (optimized landing page)
│   │   └── [...slug].astro        → Dynamic case study
│   └── services/
│       ├── index.astro            → Services listing (optimized landing page)
│       └── [...slug].astro        → Dynamic service page
├── styles/
│   └── global.css                 → Design tokens + base styles
├── utils/
│   ├── seo.ts                     → SEO helper functions
│   └── schema.ts                  → Schema graph assembly + @id management
└── data/
    └── site.json                  → Global site metadata (name, URL, social links, org details)
```

---

## Design Tokens (placeholder → updated after Peter's Figma design)

```css
:root {
  /* Colors — to be defined by Peter */
  --color-primary: #000000;
  --color-secondary: #555555;
  --color-accent: #0066FF;
  --color-bg: #FFFFFF;
  --color-bg-alt: #F5F5F5;
  --color-text: #1A1A1A;
  --color-text-muted: #666666;

  /* Typography */
  --font-heading: 'Inter', system-ui, sans-serif;
  --font-body: 'Inter', system-ui, sans-serif;
  --font-mono: 'JetBrains Mono', monospace;

  /* Spacing */
  --space-xs: 0.25rem;
  --space-sm: 0.5rem;
  --space-md: 1rem;
  --space-lg: 2rem;
  --space-xl: 4rem;
  --space-2xl: 8rem;

  /* Layout */
  --max-width: 1200px;
  --content-width: 720px;
}
```

---

## Build Phases

### Phase 1 — Foundation
- [x] Define stack and approach
- [x] Create buildplan v1 with full SEO architecture
- [ ] `npm create astro@latest` with blog template
- [ ] Push to GTM Factory repo
- [ ] Deploy to Cloudflare Pages or Vercel (verify it builds)

### Phase 2 — Design
- [ ] Connect Figma MCP
- [ ] Peter creates design in Figma
- [ ] Export design tokens (colors, typography, spacing)
- [ ] Update `global.css` with final tokens

### Phase 3 — SEO Foundation + Core Build
- [ ] Create `site.json` with all organization metadata
- [ ] Build `<SEO>` component (all meta tags, OG, canonical, robots)
- [ ] Build `<Schema>` component with connected graph approach (@id linking)
- [ ] Build all schema pieces (Organization, WebSite, WebPage, Article, Service, Breadcrumb, Contact)
- [ ] Build base layouts (Base, Page, Post)
- [ ] Build Breadcrumbs component (visual + schema data)
- [ ] Build core UI components (Header, Footer, Hero, CTA)
- [ ] Configure content collections with frontmatter validation (config.ts)
- [ ] Add `@astrojs/sitemap` with lastmod, changefreq, priority config
- [ ] Add `@astrojs/rss` feed
- [ ] Add robots.txt with sitemap reference
- [ ] Set up OG image auto-generation (satori or astro-og-image)
- [ ] Implement internal linking via relatedPosts frontmatter

### Phase 4 — Content
- [ ] Write homepage content (positioning, services overview)
- [ ] Write service pages with proper category structure
- [ ] Write initial blog posts (SEO-targeted, keyword-researched)
- [ ] Create case studies from existing client work
- [ ] Internal linking audit: every page connected properly
- [ ] Category landing pages have unique intro content (not just lists)

### Phase 5 — Launch
- [ ] Custom domain + DNS
- [ ] Validate structured data (Google Rich Results Test) on every page type
- [ ] Validate schema graph connections (@id references resolve)
- [ ] Validate sitemap (Google Search Console)
- [ ] Core Web Vitals audit (PageSpeed Insights — all green)
- [ ] Heading hierarchy check on every page (single H1, logical nesting)
- [ ] Canonical URL verification
- [ ] Submit sitemap to Google Search Console
- [ ] Go live

---

## SEO Validation Checklist (run before every deploy)

- [ ] Every page has unique `<title>` and `<meta description>`
- [ ] Every page has canonical URL
- [ ] Every page has OG tags (title, description, image, type)
- [ ] Every page has valid JSON-LD with connected @graph
- [ ] Schema graph entities reference each other via @id (no orphans)
- [ ] Exactly one H1 per page
- [ ] Heading hierarchy is logical (no skipped levels)
- [ ] All images have alt text and explicit width/height dimensions
- [ ] Sitemap includes all public pages with correct lastmod dates
- [ ] RSS feed validates
- [ ] robots.txt references sitemap, doesn't overblock
- [ ] No broken internal links
- [ ] No orphan pages (pages not linked from anywhere)
- [ ] Category pages have unique content (not just auto-generated lists)
- [ ] Core Web Vitals all green (LCP < 2.5s, CLS < 0.1, INP < 200ms)

---

## Notes

- **No CMS.** Content = markdown in Git. Claude Code is the editing interface.
- **No WordPress patterns.** No plugins, no database, no theme marketplace.
- **SEO is code, not plugins.** Every SEO feature is a component — meta tags, schema, sitemaps, OG images.
- **Schema graph, not schema blocks.** Connected entities via `@id`, replicating Yoast SEO 11.0+ graph approach.
- **Content is 90% of SEO.** Technical foundation ensures discoverability. Quality content drives ranking.
- **Site structure matters.** Google is a blind visitor. Make navigation and hierarchy crystal clear.
- **Categories over tags.** Small number of well-optimized categories. Tags are noindex or absent.
- **AI-ready.** Static HTML + structured data = readable by every crawler including AI systems.
- **Ship at 80%.** Get Phase 1-3 live with placeholder content, then iterate.
- **Peter's design is additive.** Build structure first, apply design second.
