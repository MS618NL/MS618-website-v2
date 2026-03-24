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

export function buildOrganizationPiece(): SchemaGraphPiece {
  return {
    '@type': 'Organization',
    '@id': `${site.url}/#organization`,
    name: site.organization.name,
    legalName: site.organization.legalName,
    url: site.url,
    logo: {
      '@type': 'ImageObject',
      '@id': `${site.url}/#logo`,
      url: `${site.url}${site.logo}`,
      caption: site.name,
    },
    address: {
      '@type': 'PostalAddress',
      addressLocality: site.organization.address.addressLocality,
      addressCountry: site.organization.address.addressCountry,
    },
    contactPoint: {
      '@type': 'ContactPoint',
      email: site.organization.email,
      contactType: 'customer service',
      areaServed: 'NL',
      availableLanguage: ['Dutch', 'English'],
    },
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
    author: {
      '@type': 'Organization',
      '@id': `${site.url}/#organization`,
      name: author,
    },
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
