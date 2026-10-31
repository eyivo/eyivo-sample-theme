# Feature coverage

This sample is deliberately broad: it demonstrates the contracts a production Eyivo theme is expected to support while keeping the visual design original.

## Page types

| Page type | Demonstrates |
| --- | --- |
| Home | Hero, editable areas, native catalog/gallery previews, theme-owned component |
| Standard page | Hero media, body content, breadcrumbs, flexible component areas |
| Contact | Company details, contact form, localized input guidance, CSRF, validation states, honeypot, required Human Verification placement |
| Catalog | Responsive cards, entry count, localized detail links |
| Catalog item | Cover media, body content, enquiry CTA, product component area |
| Gallery | Grid presentation modes, localized captions and alt text, direct CTA component |
| Videos | Uploaded media or external URLs, presentation cards, direct CTA component |

## Components

The manifest exposes all 30 Theme API `1.0` core components in appropriate page areas:

- `announcement`, `article_list`, `business_hours`, `collection_grid`
- `contact_actions`, `contact_details`, `credentials`, `cta`
- `download_list`, `event_list`, `faq`, `feature_grid`, `hero`
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
- Native expandable quick navigation, also available on mobile without custom JavaScript
- Reviewed theme script (Theme API 1.1): menus close on an outside click or Escape, the header gains a scrolled state, and products get a search field that appears only when the script runs
- Optional light/dark colors following the visitor's system preference
- Announcement bar, floating contact actions, and a native back-to-top link
- Portable form bindings to persistent site form instances, independent of theme changes
- Plugin-owned typed fields with localized guidance, placement-specific feedback and required Human Verification
- Trusted `form.verification_html` placement inside the form, with platform-issued submission context
- Shared inbox and mandatory plugin submission list/detail pages displaying the same saved records
- Platform-managed verification scripts/styles, challenge refresh and server-side proof validation
- Semantic landmarks, skip link, focus states, alt text, and reduced-motion handling
- Draft/publish and per-locale publication compatibility for pages and resources
- Public catalog, gallery, video, company, and theme-setting data supplied by the runtime

## Demo shown in screenshots

The declared captures were refreshed from this version’s demo rendered by Eyivo, including the page-body and desktop/mobile menu examples. The uploadable sample uses native expandable navigation and system color preference. Check the current verification widget there with plugin services configured; the no-script theme preview cannot complete a challenge.

The repository screenshots were captured from a seeded local Eyivo tenant with:

- Eleven home-page components, including `theme:capability_note`
- Three published catalog items
- One published six-image gallery
- Three published video entries
- About and contact pages
- Company profile, social links, theme settings, and responsive navigation

## Blog support

Free blogs support flat categories, multiple categories per post, cover and inline images, translated rich text, draft previews, and scheduled publication. Use `blog`, `blog_category`, and `blog_post` page types with the `blog` Liquid object. Only server-produced `blog.post.body_html` should use `raw`. Omitted blog types inherit core templates inside the active layout. `eyivo_head` supplies responsive blog and bounded card-image styles. Demo blog posts are imported as drafts.

## Menus and rich text

- Automatic Main navigation remains controlled by existing page and listing rules.
- Independent Footer and Useful links locations demonstrate manifest registration.
- Multi-menu content assignments and independent menu draft publication.
- Localized labels and URLs, unpublished-target handling, and theme-switch retention.
- Explicit page-body support and an editable rich-text theme component.
- Safe platform-rendered formatting and stable page-picker links.
- RTL-safe hidden form honeypot without off-screen overflow.
- Blog listing, category, and article templates are included.

The static design class stays stable when the platform assigns a custom theme key.

## Demo localization

- English required as the base (`default_locale: en`); all other site languages optional.
- English and Turkish examples for company, theme settings, pages, components, products, galleries and image descriptions, videos, and blog posts.
- Selected native language on creation, with English fallback for each missing field.
- Localized slugs, rich-text links, and portable menu destinations without tenant IDs.
- Packaging checks reject a non-English default, missing English content, or invalid locale objects.
- English screenshots remain the baseline preview; additional demo translations do not change them.
