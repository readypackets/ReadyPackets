# SEO, GEO, and answer-discovery implementation basis

## Official references

1. Google Search Central, [Introduction to structured data markup in Google Search](https://developers.google.com/search/docs/appearance/structured-data/intro-structured-data), last updated 2025-12-10.
2. Google Search Central, [Organization structured data](https://developers.google.com/search/docs/appearance/structured-data/organization), last updated 2026-04-15.
3. Google Search Central, [Optimizing your website for generative AI features on Google Search](https://developers.google.com/search/docs/fundamentals/ai-optimization-guide), last updated 2026-07-10.
4. Schema.org, [FAQPage](https://schema.org/FAQPage).

## Decisions applied

| Finding | ReadyPackets implementation decision |
| --- | --- |
| Google recommends JSON-LD as the most maintainable structured-data format and requires markup to describe visible page content accurately. | Render accurate JSON-LD for the organization, website, visible public FAQ content, and public product detail pages; never add empty, hidden, or fictional structured-data entities. |
| Organization markup helps search engines understand an organization’s identity, address, logo, contact information, and website. | Include `Organization` data only with verified ReadyPackets business fields already shown in the public footer and brand metadata. |
| Sitemap submission helps keep search engines informed of meaningful public URL changes. | Generate a public sitemap, retain a deliberate robots policy, and ensure portal, administration, API, and private resources remain excluded. |
| Google describes AEO/GEO as SEO for generative-search experiences, not a separate set of hacks. | Prioritize crawlable public content, clear semantic structure, accurate product and FAQ answers, technical performance, and helpful source material. Do not create llms.txt, content farms, keyword-stuffed pages, or non-user-visible special markup for Google. |
| FAQPage is a Schema.org type for a page presenting frequently asked questions. | Generate FAQPage markup only when at least one administrator-published FAQ is visibly rendered on `/faq`. |

## Ongoing operational requirement

After deployment, validate structured data with Google’s Rich Results Test, verify the public domain in Google Search Console, submit the sitemap, and monitor crawl/index coverage and generative-search performance. Structured data may improve content understanding and eligibility for supported search appearances but does not guarantee rankings, indexing, rich-result display, or generative-search inclusion.
