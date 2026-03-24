import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

const blog = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/blog' }),
  schema: z.object({
    title: z.string(),
    seoTitle: z.string().optional(),
    description: z.string().max(160),
    ogImage: z.string().optional(),
    ogType: z.literal('article').default('article'),
    noindex: z.boolean().default(false),
    publishDate: z.coerce.date(),
    updatedDate: z.coerce.date().optional(),
    author: z.string().default('MS618'),
    category: z.string(),
    relatedPosts: z.array(z.string()).default([]),
  }),
});

const cases = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/cases' }),
  schema: z.object({
    title: z.string(),
    seoTitle: z.string().optional(),
    description: z.string().max(160),
    ogImage: z.string().optional(),
    noindex: z.boolean().default(false),
    publishDate: z.coerce.date(),
    updatedDate: z.coerce.date().optional(),
    client: z.string(),
    service: z.string(),
    result: z.string(),
    category: z.string().default('case-study'),
  }),
});

const services = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/services' }),
  schema: z.object({
    title: z.string(),
    seoTitle: z.string().optional(),
    description: z.string().max(160),
    ogImage: z.string().optional(),
    noindex: z.boolean().default(false),
    order: z.number().default(99),
    icon: z.string().default('→'),
    category: z.string().default('service'),
    updatedDate: z.coerce.date().optional(),
  }),
});

const servicesEn = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/services-en' }),
  schema: z.object({
    title: z.string(),
    seoTitle: z.string().optional(),
    description: z.string().max(160),
    ogImage: z.string().optional(),
    noindex: z.boolean().default(false),
    order: z.number().default(99),
    icon: z.string().default('→'),
    category: z.string().default('service'),
    updatedDate: z.coerce.date().optional(),
  }),
});

const blogEn = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/blog-en' }),
  schema: z.object({
    title: z.string(),
    seoTitle: z.string().optional(),
    description: z.string().max(160),
    ogImage: z.string().optional(),
    ogType: z.literal('article').default('article'),
    noindex: z.boolean().default(false),
    publishDate: z.coerce.date(),
    updatedDate: z.coerce.date().optional(),
    author: z.string().default('MS618'),
    category: z.string(),
    relatedPosts: z.array(z.string()).default([]),
  }),
});

export const collections = { blog, cases, services, 'services-en': servicesEn, 'blog-en': blogEn };
