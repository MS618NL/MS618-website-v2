export const languages = {
  nl: 'Nederlands',
  en: 'English',
} as const;

export type Lang = keyof typeof languages;

export const translations = {
  nl: {
    // Nav
    'nav.services': 'Services',
    'nav.cases': 'Cases',
    'nav.blog': 'Blog',
    'nav.about': 'Over ons',
    'nav.contact': 'Contact',
    'nav.cta': 'Plan een gesprek',

    // Hero
    'hero.label': 'Richting in versnelling',
    'hero.headline': 'AI maakt marketing oneindig,<br>en daardoor betekenisloos.',
    'hero.sub': 'Terwijl iedereen meer produceert, verliezen merken hun richting. MS618 brengt focus: de juiste keuzes, de juiste kanalen, de juiste boodschap.',
    'hero.cta': 'Plan een gesprek',
    'hero.cta.secondary': 'Bekijk onze aanpak',
    'hero.stat.years': 'Jaar ervaring',
    'hero.stat.clients': 'Klanten geholpen',
    'hero.stat.senior': 'Senior specialisten',

    // Common
    'common.scroll': 'Scroll',
    'common.readmore': 'Lees meer',
    'common.allposts': 'Alle artikelen →',
    'common.allcases': 'Alle cases →',

    // Footer
    'footer.services': 'Services',
    'footer.nav': 'Navigatie',
    'footer.contact': 'Contact',
    'footer.rights': 'Alle rechten voorbehouden.',
    'footer.privacy': 'Privacybeleid',
    'footer.sitemap': 'Sitemap',
    'footer.desc': 'Digitaal bureau gespecialiseerd in strategische SEO, content marketing en digitale performance.',

    // CTA block
    'cta.headline': 'Klaar voor richting?',
    'cta.body': 'Plan een strategische intake. 45 minuten, geen verplichtingen. Wel helderheid over waar je staat en waar je naartoe kunt.',
    'cta.button': 'Plan een gesprek →',
    'cta.secondary': 'Bekijk onze aanpak',
  },
  en: {
    // Nav
    'nav.services': 'Services',
    'nav.cases': 'Cases',
    'nav.blog': 'Blog',
    'nav.about': 'About us',
    'nav.contact': 'Contact',
    'nav.cta': 'Schedule a call',

    // Hero
    'hero.label': 'Direction in acceleration',
    'hero.headline': 'AI makes marketing infinite,<br>and therefore meaningless.',
    'hero.sub': 'While everyone produces more, brands lose their direction. MS618 brings focus: the right choices, the right channels, the right message.',
    'hero.cta': 'Schedule a call',
    'hero.cta.secondary': 'See our approach',
    'hero.stat.years': 'Years experience',
    'hero.stat.clients': 'Clients served',
    'hero.stat.senior': 'Senior specialists',

    // Common
    'common.scroll': 'Scroll',
    'common.readmore': 'Read more',
    'common.allposts': 'All articles →',
    'common.allcases': 'All cases →',

    // Footer
    'footer.services': 'Services',
    'footer.nav': 'Navigation',
    'footer.contact': 'Contact',
    'footer.rights': 'All rights reserved.',
    'footer.privacy': 'Privacy policy',
    'footer.sitemap': 'Sitemap',
    'footer.desc': 'Digital agency specialised in strategic SEO, content marketing and digital performance.',

    // CTA block
    'cta.headline': 'Ready for direction?',
    'cta.body': 'Schedule a strategic intake. 45 minutes, no obligations. Just clarity on where you stand and where you can go.',
    'cta.button': 'Schedule a call →',
    'cta.secondary': 'See our approach',
  },
} as const;
