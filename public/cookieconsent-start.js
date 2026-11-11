/*
 * Cookiemelding ms618.nl: CookieConsent v3 (Orest Bida, MIT), zelf gehost in /vendor/cookieconsent/3.1.0/.
 * MS618-standaard zoals op de klantsites, opbouw v2 (6-11-2026): eerste laag Accepteren + Instellingen,
 * weigeren via Instellingen > Alles weigeren. Geladen door src/components/CookieBanner.astro.
 *
 * Waarom een los bestand en geen script in CookieBanner.astro: de CSP van deze site (astro.config.mjs)
 * werkt met hashes en 'strict-dynamic'. Astro hasht alleen de scripts die het inline zet; een groter
 * script wordt een los bestand in /_astro/ zonder hash, en dat blokkeert de browser (getest 11-11-2026).
 * Een script dat een vertrouwd script zelf toevoegt, mag wel, net als gtm.js. Dit bestand wordt dus
 * geladen door een klein inline script met hash.
 *
 * De Consent Mode-standaard staat in src/components/ConsentDefaults.astro; hier alleen de melding en
 * de update na een keuze. Huisstijl: src/styles/global.css (#cc-main). Knoppen elders openen de
 * voorkeuren met data-cc="show-preferencesModal" (Footer.astro, privacyverklaring NL en EN).
 *
 * ms618.nl adverteert niet (zie ConsentDefaults.astro), dus alleen de categorieën noodzakelijk en
 * analytisch. Teksten in de jij-vorm zoals de rest van de site, NL en EN; de taal komt uit <html lang>.
 * CONSENT_REVISION gelijk houden met ConsentDefaults.astro.
 */
(function () {
  var CONSENT_REVISION = 0;
  var BASE = '/vendor/cookieconsent/3.1.0';

  var TEKSTEN = {
    nl: {
      consentModal: {
        title: 'Help ons de website beter te maken',
        description:
          'Met jouw toestemming meten we via Google hoe je de site gebruikt. Wijzigen kan altijd onderaan de pagina. <a href="/privacy/#cookies">Cookiebeleid</a>',
        acceptAllBtn: 'Accepteren',
        showPreferencesBtn: 'Instellingen',
      },
      preferencesModal: {
        title: 'Cookie-instellingen',
        acceptAllBtn: 'Alles accepteren',
        acceptNecessaryBtn: 'Alles weigeren',
        savePreferencesBtn: 'Keuze opslaan',
        closeIconLabel: 'Sluiten',
        sections: [
          {
            description:
              'Kies per soort welke cookies je toestaat. Je kunt je keuze altijd wijzigen via Cookie-instellingen onderaan elke pagina.',
          },
          {
            title: 'Noodzakelijk',
            description: 'Nodig om de website te laten werken en om je cookiekeuze te onthouden. Deze staan altijd aan.',
            linkedCategory: 'necessary',
          },
          {
            title: 'Analytisch',
            description:
              'Google Analytics laat ons zien welke pagina’s bekeken worden en hoe bezoekers de site vinden. Daarmee maken we de website beter.',
            linkedCategory: 'analytics',
          },
          {
            title: 'Meer informatie',
            description:
              'Alle cookies op een rij en hoe we met je gegevens omgaan, lees je in onze <a href="/privacy/#cookies">privacyverklaring</a>.',
          },
        ],
      },
    },
    en: {
      consentModal: {
        title: 'Help us improve this website',
        description:
          'With your consent, we use Google to measure how you use the site. You can change this at any time at the bottom of the page. <a href="/en/privacy/#cookies">Cookie policy</a>',
        acceptAllBtn: 'Accept',
        showPreferencesBtn: 'Settings',
      },
      preferencesModal: {
        title: 'Cookie settings',
        acceptAllBtn: 'Accept all',
        acceptNecessaryBtn: 'Reject all',
        savePreferencesBtn: 'Save choice',
        closeIconLabel: 'Close',
        sections: [
          {
            description:
              'Choose which types of cookies you allow. You can change your choice at any time via Cookie settings at the bottom of every page.',
          },
          {
            title: 'Necessary',
            description: 'Needed to make the website work and to remember your cookie choice. These are always on.',
            linkedCategory: 'necessary',
          },
          {
            title: 'Analytics',
            description:
              'Google Analytics shows us which pages are viewed and how visitors find the site. We use this to improve the website.',
            linkedCategory: 'analytics',
          },
          {
            title: 'More information',
            description:
              'All cookies, and how we handle your data, are described in our <a href="/en/privacy/#cookies">privacy policy</a>.',
          },
        ],
      },
    },
  };

  function updateConsent() {
    window.gtag('consent', 'update', {
      analytics_storage: window.CookieConsent.acceptedCategory('analytics') ? 'granted' : 'denied',
    });
  }

  // Alleen bij een nieuwe of gewijzigde keuze, voor eventuele GTM-triggers.
  function pushConsentEvent() {
    window.dataLayer.push({
      event: 'cookie_consent_update',
      consent_analytics: window.CookieConsent.acceptedCategory('analytics') ? 'granted' : 'denied',
    });
  }

  function run() {
    // Desktop: venster in het midden, mobiel: paneel onderaan (binnen duimbereik). Beide met gedimde
    // achtergrond tot er een keuze is, zoals op de klantsites.
    var mobile = window.matchMedia('(max-width: 640px)').matches;
    var taal = (document.documentElement.lang || '').toLowerCase().indexOf('en') === 0 ? 'en' : 'nl';
    var translations = {};
    translations[taal] = TEKSTEN[taal];
    window.CookieConsent.run({
      revision: CONSENT_REVISION,
      disablePageInteraction: true,
      guiOptions: {
        consentModal: {
          layout: 'box wide',
          position: mobile ? 'bottom center' : 'middle center',
          equalWeightButtons: true,
          flipButtons: false,
        },
        preferencesModal: { layout: 'box', equalWeightButtons: true, flipButtons: false },
      },
      categories: {
        necessary: { enabled: true, readOnly: true },
        analytics: { autoClear: { cookies: [{ name: /^_ga/ }] } },
      },
      onConsent: updateConsent, // eerste keuze én elke pagina daarna
      onFirstConsent: pushConsentEvent,
      onChange: function () {
        updateConsent();
        pushConsentEvent();
      },
      language: { default: taal, translations: translations },
    });
  }

  // CSS en script los laden, zodat de melding de eerste weergave niet ophoudt.
  // MS618-standaard voor het starten van de cookiemelding (CookieConsent v3), kopie van
  // gtm-factory/_skills/website/references/cookiemelding-start.js (11-11-2026).
  //
  // 1. De melding verschijnt pas als haar lettertypen er zijn, hoogstens 3 s na het laden van de
  //    bibliotheek. Anders verschijnt ze in een vervangend lettertype en verspringt ze zodra het
  //    echte lettertype binnen is: een layoutverschuiving (CLS). Een onzichtbaar proefelement met de
  //    klassen van de melding leest welke lettertypen de CSS kiest; zo werkt het met elke huisstijl.
  // 2. Na een klik draaien de callbacks van run() (Consent Mode-update, dataLayer) pas na de volgende
  //    weergave. Dan reageert Accepteren direct (INP); de tags volgen een frame later.
  // Controle: scripts/cookiebanner-check.mjs in de website-skill (ook in vercel-deploy-veilig --vooraf).
  function loadBannerFonts(done) {
    var probe = document.createElement('div');
    probe.id = 'cc-main';
    probe.setAttribute('aria-hidden', 'true');
    probe.style.cssText = 'position:absolute;left:-9999px;top:0;visibility:hidden;pointer-events:none';
    probe.innerHTML =
      '<div class="cm cm--box cm--wide"><div class="cm__body"><div class="cm__texts">' +
      '<h2 class="cm__title">Aa</h2><p class="cm__desc">Aa <a href="#">Aa</a></p></div>' +
      '<div class="cm__btns"><div class="cm__btn-group"><button class="cm__btn" data-role="all">Aa</button>' +
      '<button class="cm__btn cm__btn--secondary" data-role="show">Aa</button></div></div></div></div>';
    document.body.appendChild(probe);
    var faces = {};
    probe.querySelectorAll('*').forEach(function (el) {
      var s = getComputedStyle(el);
      faces[s.fontStyle + ' ' + s.fontWeight + ' 16px ' + s.fontFamily] = true;
    });
    probe.remove();
    var finished = false;
    function finish() { if (!finished) { finished = true; done(); } }
    if (!document.fonts || !document.fonts.load) return finish();
    Promise.all(Object.keys(faces).map(function (f) { return document.fonts.load(f).catch(function () {}); })).then(finish);
    setTimeout(finish, 3000);
  }
  function afterPaint(fn) {
    return function () {
      var a = arguments, self = this;
      requestAnimationFrame(function () { setTimeout(function () { fn.apply(self, a); }, 0); });
    };
  }
  function runAfterPaint() {
    var cc = window.CookieConsent, start = cc.run;
    cc.run = function (cfg) {
      ['onConsent', 'onFirstConsent', 'onChange'].forEach(function (k) { if (typeof cfg[k] === 'function') cfg[k] = afterPaint(cfg[k]); });
      cc.run = start;
      return start.call(cc, cfg);
    };
    run();
  }

  var pending = 2;
  function ready() {
    if (--pending === 0) loadBannerFonts(runAfterPaint);
  }
  var css = document.createElement('link');
  css.rel = 'stylesheet';
  css.href = BASE + '/cookieconsent.css';
  css.onload = css.onerror = ready;
  var js = document.createElement('script');
  js.src = BASE + '/cookieconsent.umd.js';
  js.async = true;
  js.onload = ready;
  document.head.append(css, js);
})();
