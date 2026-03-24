import type { APIRoute } from 'astro';

export const GET: APIRoute = () => {
  const content = `User-agent: *
Allow: /

Sitemap: https://ms618.nl/sitemap-index.xml
`;

  return new Response(content, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
    },
  });
};
