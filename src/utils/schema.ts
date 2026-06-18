import site from '@/data/site.json';

export interface BreadcrumbItem {
  name: string;
  item?: string;
}

export interface SchemaGraphPiece {
  '@type': string | string[];
  '@id': string;
  [key: string]: unknown;
}

export function buildSchemaGraph(pieces: SchemaGraphPiece[]) {
  return {
    '@context': 'https://schema.org',
    '@graph': pieces,
  };
}

const org = site.organization;

function buildPostalAddress() {
  return {
    '@type': 'PostalAddress',
    ...(org.address.streetAddress && { streetAddress: org.address.streetAddress }),
    ...(org.address.postalCode && { postalCode: org.address.postalCode }),
    addressLocality: org.address.addressLocality,
    addressCountry: org.address.addressCountry,
  };
}

export function buildOrganizationPiece(): SchemaGraphPiece {
  return {
    '@type': 'Organization',
    '@id': `${site.url}/#organization`,
    name: org.name,
    legalName: org.legalName,
    url: site.url,
    logo: {
      '@type': 'ImageObject',
      '@id': `${site.url}/#logo`,
      url: `${site.url}${site.logo}`,
      caption: site.name,
    },
    address: buildPostalAddress(),
    ...(org.phone && { telephone: org.phone }),
    ...(org.vatID && { vatID: org.vatID }),
    ...(org.kvk && {
      identifier: {
        '@type': 'PropertyValue',
        propertyID: 'KvK',
        value: org.kvk,
      },
    }),
    contactPoint: {
      '@type': 'ContactPoint',
      email: org.email,
      ...(org.phone && { telephone: org.phone }),
      contactType: 'customer service',
      areaServed: 'NL',
      availableLanguage: ['Dutch', 'English'],
    },
    founder: site.team
      .filter((m) => m.slug === 'jorrit-miedema' || m.slug === 'jurjan-groothuis')
      .map((m) => ({ '@id': `${site.url}/over-ons/#${m.slug}` })),
    sameAs: [site.social.linkedin].filter(Boolean),
  };
}

export function buildWebsitePiece(lang: 'nl' | 'en' = 'nl'): SchemaGraphPiece {
  return {
    '@type': 'WebSite',
    '@id': `${site.url}/#website`,
    url: site.url,
    name: site.name,
    description: site.description,
    publisher: { '@id': `${site.url}/#organization` },
    inLanguage: lang === 'en' ? 'en' : 'nl-NL',
  };
}

export function buildWebpagePiece(
  pageUrl: string,
  title: string,
  description: string,
  breadcrumbItems: BreadcrumbItem[],
  datePublished?: string,
  dateModified?: string,
): SchemaGraphPiece {
  const id = `${pageUrl}#webpage`;
  return {
    '@type': 'WebPage',
    '@id': id,
    url: pageUrl,
    name: title,
    description,
    isPartOf: { '@id': `${site.url}/#website` },
    breadcrumb: { '@id': `${pageUrl}#breadcrumb` },
    inLanguage: pageUrl.includes('/en/') ? 'en' : 'nl-NL',
    ...(datePublished && { datePublished }),
    ...(dateModified && { dateModified }),
  };
}

export function buildBreadcrumbPiece(
  pageUrl: string,
  items: BreadcrumbItem[],
): SchemaGraphPiece {
  return {
    '@type': 'BreadcrumbList',
    '@id': `${pageUrl}#breadcrumb`,
    itemListElement: items.map((item, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: item.name,
      ...(item.item && { item: item.item }),
    })),
  };
}

/**
 * Resolve an author name to a proper Person author node.
 * If the name matches a team member, reference that Person entity (@id on /over-ons);
 * otherwise emit a standalone Person linked to the organisation.
 */
function resolveAuthor(author: string) {
  const member = site.team.find((m) => m.name === author);
  if (member) {
    return {
      '@type': 'Person',
      '@id': `${site.url}/over-ons/#${member.slug}`,
      name: member.name,
      url: `${site.url}/over-ons/`,
    };
  }
  return {
    '@type': 'Person',
    name: author,
    worksFor: { '@id': `${site.url}/#organization` },
  };
}

export function buildArticlePiece(
  pageUrl: string,
  title: string,
  description: string,
  author: string,
  datePublished: string,
  dateModified: string,
  image?: string,
): SchemaGraphPiece {
  return {
    '@type': 'BlogPosting',
    '@id': `${pageUrl}#article`,
    headline: title,
    description,
    url: pageUrl,
    datePublished,
    dateModified,
    author: resolveAuthor(author),
    publisher: { '@id': `${site.url}/#organization` },
    mainEntityOfPage: { '@id': `${pageUrl}#webpage` },
    isPartOf: { '@id': `${site.url}/#website` },
    inLanguage: pageUrl.includes('/en/') ? 'en' : 'nl-NL',
    ...(image && {
      image: {
        '@type': 'ImageObject',
        url: image.startsWith('http') ? image : `${site.url}${image}`,
      },
    }),
  };
}

export interface TeamMember {
  slug: string;
  name: string;
  jobTitle: string;
  education?: string;
  linkedin?: string;
  website?: string;
  knowsAbout?: string[];
}

/** Person node for a team member (used on /over-ons). @id resolves to /over-ons/#slug. */
export function buildPersonPiece(member: TeamMember): SchemaGraphPiece {
  const sameAs = [member.linkedin, member.website].filter(Boolean);
  return {
    '@type': 'Person',
    '@id': `${site.url}/over-ons/#${member.slug}`,
    name: member.name,
    jobTitle: member.jobTitle,
    ...(member.education && { alumniOf: member.education }),
    ...(member.knowsAbout && { knowsAbout: member.knowsAbout }),
    worksFor: { '@id': `${site.url}/#organization` },
    ...(sameAs.length > 0 && { sameAs }),
  };
}

/** All team Person nodes, for the /over-ons page graph. */
export function buildTeamPieces(): SchemaGraphPiece[] {
  return site.team.map((m) => buildPersonPiece(m as TeamMember));
}

/** LocalBusiness node for the contact page (physical office in Joure). */
export function buildLocalBusinessPiece(): SchemaGraphPiece {
  return {
    '@type': 'ProfessionalService',
    '@id': `${site.url}/#localbusiness`,
    name: org.legalName,
    image: `${site.url}${site.logo}`,
    url: site.url,
    ...(org.phone && { telephone: org.phone }),
    email: org.email,
    address: buildPostalAddress(),
    ...(org.geo && {
      geo: {
        '@type': 'GeoCoordinates',
        latitude: org.geo.latitude,
        longitude: org.geo.longitude,
      },
    }),
    areaServed: { '@type': 'Country', name: 'Netherlands' },
    parentOrganization: { '@id': `${site.url}/#organization` },
    sameAs: [site.social.linkedin].filter(Boolean),
  };
}

export function buildServicePiece(
  pageUrl: string,
  name: string,
  description: string,
): SchemaGraphPiece {
  return {
    '@type': 'Service',
    '@id': `${pageUrl}#service`,
    name,
    description,
    url: pageUrl,
    provider: { '@id': `${site.url}/#organization` },
    areaServed: {
      '@type': 'Country',
      name: 'Netherlands',
    },
  };
}

export function buildFaqPiece(
  pageUrl: string,
  faqs: { question: string; answer: string }[],
): SchemaGraphPiece {
  return {
    '@type': 'FAQPage',
    '@id': `${pageUrl}#faq`,
    mainEntity: faqs.map((f) => ({
      '@type': 'Question',
      name: f.question,
      acceptedAnswer: {
        '@type': 'Answer',
        text: f.answer,
      },
    })),
  };
}

export function buildContactPiece(): SchemaGraphPiece {
  return {
    '@type': 'ContactPage',
    '@id': `${site.url}/contact/#webpage`,
    url: `${site.url}/contact/`,
    name: 'Contact — MS618',
    mainEntity: {
      '@type': 'ContactPoint',
      email: site.organization.email,
      contactType: 'customer service',
      areaServed: 'NL',
      availableLanguage: ['Dutch', 'English'],
    },
  };
}
