import type { APIRoute } from 'astro';

// security.txt (RFC 9116): where to report a vulnerability in this site.
// Same endpoint as the MS618 starter (astro-website@16), with the live domain fixed here.
// Contact is MS618 on every client site (decision 23-11-2026): we build and maintain the site,
// so reports come to us and we loop in the client.
// Expires is set at build time, 364 days ahead: RFC 9116 asks for less than a year, and every
// deploy renews it. prerender keeps it a static file, also when the site has server output.
export const prerender = true;

const SITE = 'https://www.ms618.nl';
const VALID_DAYS = 364;

export const GET: APIRoute = () => {
  const expires = new Date(Date.now() + VALID_DAYS * 24 * 60 * 60 * 1000);
  expires.setUTCHours(0, 0, 0, 0);

  const body = [
    'Contact: mailto:data@ms618.nl',
    `Expires: ${expires.toISOString()}`,
    'Preferred-Languages: nl, en',
    `Canonical: ${SITE}/.well-known/security.txt`,
    '',
  ].join('\n');

  return new Response(body, {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  });
};
