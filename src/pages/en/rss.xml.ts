import rss from '@astrojs/rss';
import { getCollection } from 'astro:content';
import type { APIContext } from 'astro';

export async function GET(context: APIContext) {
  const posts = (await getCollection('blog-en'))
    .filter((p) => !p.data.noindex)
    .sort((a, b) => b.data.publishDate.valueOf() - a.data.publishDate.valueOf());

  return rss({
    title: 'MS618 — Blog',
    description: 'Knowledge and insights on SEO, content marketing and digital strategy from MS618.',
    site: context.site ?? 'https://www.ms618.nl',
    items: posts.map((post) => ({
      title: post.data.title,
      pubDate: post.data.publishDate,
      description: post.data.description,
      author: post.data.author ?? 'MS618',
      categories: [post.data.category],
      link: `/en/blog/${post.id}/`,
    })),
    customData: `<language>en</language>`,
  });
}
