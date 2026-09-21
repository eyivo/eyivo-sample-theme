# Feature coverage

This sample is deliberately broad: it demonstrates the contracts a production Eyivo theme is expected to support while keeping the visual design original.

## Page types

| Page type | Demonstrates |
| --- | --- |
| Home | Hero, editable areas, native catalog/gallery previews, theme-owned component |
| Standard page | Hero media, body content, breadcrumbs, flexible component areas |
| Contact | Company details, contact form, CSRF, validation states, honeypot, Turnstile hook |
| Catalog | Search/filter UI, responsive cards, localized detail links |
| Catalog item | Cover media, body content, enquiry CTA, product component area |
| Gallery | Grid presentation modes, localized captions and alt text, direct CTA component |
| Videos | Uploaded media or external URLs, presentation cards, direct CTA component |

## Components

The manifest exposes all 29 Theme API `1.0` core components in appropriate page areas:

- `announcement`, `article_list`, `business_hours`, `collection_grid`
- `contact_actions`, `contact_details`, `credentials`, `cta`
- `download_list`, `faq`, `feature_grid`, `hero`
- `image_slider`, `image_text`, `lead_form`, `location_map`
- `logo_cloud`, `media_gallery`, `price_offer`, `product_specs`
- `project_grid`, `rich_text`, `search_filter`, `service_grid`
- `stats`, `tabs`, `team_grid`, `testimonials`, `video`

The included `theme:capability_note` additionally demonstrates:

- A theme-owned Liquid component
- A manifest schema and defaults
- Translatable and non-translatable fields
- Component variants
- Direct rendering with `{% eyivo_component %}`
- Editor placement through an allowed component area

## Platform and presentation features

- Site logo and inverted footer logo through Eyivo's `brand-mark` hooks
- Theme color settings and company brand-color CSS variables
- Locale-aware navigation, URLs, language switcher, and translation filter
- Right-to-left layout safeguards
- Responsive desktop and mobile navigation
- Quick-navigation dialog and client-side filtering
- Optional light/dark color mode with saved preference
- Announcement bar, floating contact actions, and back-to-top control
- Analytics consent for GA4 and Plausible integrations
- Contact form success/error states and optional Cloudflare Turnstile
- Semantic landmarks, skip link, focus states, alt text, and reduced-motion handling
- Draft/publish and per-locale publication compatibility for pages and resources
- Public catalog, gallery, video, company, and theme-setting data supplied by the runtime

## Demo shown in screenshots

The repository screenshots were captured from a seeded local Eyivo tenant with:

- Eleven home-page components, including `theme:capability_note`
- Three published catalog items
- One published six-image gallery
- Three published video entries
- About and contact pages
- Company profile, social links, theme settings, consent configuration, and responsive navigation
