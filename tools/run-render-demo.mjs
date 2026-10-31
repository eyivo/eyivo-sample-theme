#!/usr/bin/env node
// Renders an approximate static copy of every demo page from sample-theme/ and demo.json, for local checks.
//
//   node run-render-demo.mjs [--locale en|tr|all] [--out ../preview]
//
// Writes one HTML file per page (index.html, about.html, catalog.html, catalog/<item>.html, blog/<post>.html, ...)
// with links rewritten between the files, so the preview can be browsed from disk. Non-default locales go in
// a subfolder named after the locale code.
//
// The layout, page types and theme:* components are the real theme files, rendered with LiquidJS.
// Built-in eyivo:* components, form fields and the blog styles from eyivo_head are produced by Eyivo on the
// server and are not published, so the stubs below approximate them from the class names base.css styles.
// Treat the result as a preview, not as the screenshots Eyivo requires: those must still come from a real
// site with the demo data loaded.

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, join, relative, resolve, posix } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Liquid } from 'liquidjs';
import { parseFlags, previewDir, previewFile, themeDir } from './lib/common.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const args = parseFlags();

const readJson = (path) => JSON.parse(readFileSync(path, 'utf8'));
const manifest = readJson(join(themeDir, 'theme.json'));
const demo = readJson(join(themeDir, 'demo.json'));
const outDir = resolve(here, args.out ?? previewDir);
const defaultLocale = demo.default_locale ?? 'en';

const localeInfo = {
    en: { name: 'English', native_name: 'English', direction: 'ltr' },
    tr: { name: 'Turkish', native_name: 'Türkçe', direction: 'ltr' },
};
const demoLocales = [...new Set(demo.pages.flatMap((page) => Object.keys(page.translations ?? {})))];
const locales = !args.locale || args.locale === 'all' ? demoLocales : [args.locale];

const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const e = escapeHtml;
const byOrder = (a, b) => (a.sort_order ?? a.position ?? 0) - (b.sort_order ?? b.position ?? 0);

const fileForPath = (path) => previewFile(path, locales.concat(demoLocales));

// --- Liquid engine ----------------------------------------------------------

const liquid = new Liquid({ root: themeDir, extname: '.liquid', outputEscape: 'escape', strictFilters: false, strictVariables: false });
// Per-render state the filters and tags read; set by renderPage before each page.
let current = null;

liquid.registerFilter('asset_url', (path) => relative(dirname(join(outDir, current.file)), join(themeDir, 'assets', path)).replaceAll('\\', '/'));
liquid.registerFilter('localized_url', (url) => current.site.localUrl(url));
liquid.registerFilter('t', (key) => current.site.strings[key] ?? key);

liquid.registerTag('eyivo_head', {
    render() {
        return `<title>${e(current.seo.title)}</title>\n    <meta name="description" content="${e(current.seo.description)}">\n    <style>${blogStyles}</style>`;
    },
});

// {% eyivo_component "type", data: expr, key: expr, ... %}
liquid.registerTag('eyivo_component', {
    parse(token) {
        const match = token.args.trim().match(/^["']([^"']+)["']\s*,?([\s\S]*)$/);
        if (!match) throw new Error(`eyivo_component needs a quoted type: ${token.args}`);
        this.type = match[1];
        this.pairs = match[2].split(/,(?=\s*[a-z_]+\s*:)/i).map((part) => part.trim()).filter(Boolean).map((part) => {
            const at = part.indexOf(':');
            return [part.slice(0, at).trim(), part.slice(at + 1).trim()];
        });
    },
    * render(ctx) {
        let data = {};
        for (const [key, expression] of this.pairs) {
            const value = yield liquid.evalValue(expression, ctx);
            if (key === 'data' && value && typeof value === 'object') data = { ...value, ...data };
            else data[key] = value;
        }
        return yield renderComponent({ component_type: this.type, variant: null, data }, ctx.getAll());
    },
});

// Stand-in for the blog styles Eyivo injects through eyivo_head.
const blogStyles = '.blog-shell{margin-inline:auto;max-width:var(--max);padding-inline:var(--gutter);width:100%}.blog-header{border-bottom:1px solid var(--line);padding-block:clamp(3rem,6vw,5rem)}.blog-breadcrumbs{display:flex;flex-wrap:wrap;gap:.5rem;font-size:.85rem;margin-bottom:1rem}.blog-content{padding-block:clamp(2.5rem,5vw,4rem)}.blog-category-links{display:flex;flex-wrap:wrap;gap:.75rem;margin-bottom:2rem}.blog-category-links a{border:1px solid var(--line);padding:.4rem .8rem}.blog-grid{display:grid;gap:1.5rem;grid-template-columns:repeat(auto-fill,minmax(18rem,1fr))}.blog-card{border:1px solid var(--line);display:flex;flex-direction:column}.blog-card-media img{aspect-ratio:16/10;object-fit:cover;width:100%}.blog-card-copy{display:grid;gap:.6rem;padding:1.25rem}.blog-card-read{font-weight:600}.blog-pagination{display:flex;justify-content:space-between;margin-top:2rem}.blog-post{max-width:46rem}.blog-post-meta{font-size:.85rem;margin-block:.75rem}.blog-post-cover{margin-bottom:2rem;width:100%}.blog-post-body>*+*{margin-top:1rem}.mt-4{margin-top:2rem}';

// --- Site data per locale ---------------------------------------------------

function buildSite(localeCode) {
    const tr = (record) => record?.translations?.[localeCode] ?? record?.translations?.[defaultLocale] ?? {};
    const prefix = localeCode === defaultLocale ? '' : `/${localeCode}`;
    // Like Eyivo's localized_url: known internal paths get the locale prefix and the page's translated slug.
    const localUrl = (path) => {
        if (typeof path !== 'string' || !path.startsWith('/') || path.startsWith('//')) return path;
        if (prefix && (path === prefix || path.startsWith(`${prefix}/`))) return path;
        const page = demo.pages.find((candidate) => candidate.type !== 'home' && `/${candidate.translations?.en?.slug}` === path);
        const slug = page?.translations?.[localeCode]?.slug;
        return `${prefix}${path === '/' ? '' : slug ? `/${slug}` : path}` || '/';
    };
    const media = (key) => {
        const item = demo.media?.[key];
        return item ? { url: item.public_url, width: item.width, height: item.height } : null;
    };
    const stringsFile = join(themeDir, 'locales', `${localeCode}.json`);
    const strings = existsSync(stringsFile) ? readJson(stringsFile) : {};
    const t = (key) => strings[key] ?? key;

    // Pages without a translation in this locale are skipped, as on a real site.
    const pages = demo.pages.filter((page) => page.translations?.[localeCode]).sort(byOrder);
    const pageUrl = (page) => (page.type === 'home' ? localUrl('/') : localUrl(`/${tr(page).slug}`));
    const pageBySlug = (slug) => pages.find((page) => page.translations?.en?.slug === slug);

    const settings = { ...manifest.defaults, ...demo.theme_settings?.settings, ...demo.theme_settings?.translations?.[localeCode] };
    const companyText = tr(demo.company);
    const company = {
        name: companyText.display_name ?? demo.company.display_name,
        legal_name: companyText.legal_name ?? demo.company.legal_name,
        description: companyText.description ?? demo.company.description,
        address: companyText.address ?? demo.company.address,
        phone: demo.company.phone,
        email: demo.company.email,
        social_links: Object.entries(demo.company.social_links ?? {}).map(([key, url]) => ({ label: { linkedin: 'LinkedIn' }[key] ?? key[0].toUpperCase() + key.slice(1), url })),
        // Assumption: Eyivo exposes the chosen colors as these custom properties, which theme.css reads.
        brand_style: [settings.accent_color && `--public-accent: ${settings.accent_color}`, settings.secondary_color && `--brand-accent: ${settings.secondary_color}`].filter(Boolean).join('; '),
    };
    const routes = { home: localUrl('/'), contact: localUrl('/contact'), catalog: localUrl('/catalog'), gallery: localUrl('/gallery'), videos: localUrl('/videos'), blog: localUrl('/blog') };
    const contactPage = pages.find((page) => page.type === 'contact');
    if (contactPage) routes.contact = pageUrl(contactPage);

    const products = [...(demo.catalog ?? [])].sort(byOrder).map((item) => ({
        title: tr(item).title, summary: tr(item).summary, body: tr(item).body, url: localUrl(`/catalog/${tr(item).slug}`), cover_media: media(item.cover_asset),
        seo: { title: tr(item).meta_title, description: tr(item).meta_description },
    }));
    const galleries = [...(demo.galleries ?? [])].sort(byOrder).map((gallery) => ({
        title: tr(gallery).title, description: tr(gallery).description, url: routes.gallery, presentation_mode: gallery.presentation_mode,
        items: [...gallery.items].sort(byOrder).map((item) => ({ media: media(item.asset), title: tr(item).title ?? item.title, alt_text: tr(item).alt_text ?? item.alt_text, caption: tr(item).caption ?? item.caption })),
    }));
    const videos = [...(demo.videos ?? [])].sort(byOrder).map((video) => ({
        title: tr(video).title, description: tr(video).description, source_type: video.source_type, source_url: video.source_url,
        // Linked (URL) videos have no uploaded file, so the theme shows its play link; uploads would set media and playback_url.
        media: video.source_type === 'url' ? null : media(video.media_asset),
        playback_url: video.source_type === 'url' ? null : media(video.media_asset)?.url,
    }));
    const posts = (demo.blog_posts ?? []).filter((post) => post.translations?.[localeCode]).map((post, index) => {
        const text = tr(post);
        const published = new Date(Date.UTC(2026, 0, 15 + index));
        return {
            title: text.title, summary: text.summary, slug: text.slug, url: localUrl(`/blog/${text.slug}`),
            published_at: published.toISOString(), published_date: published.toLocaleDateString(localeCode, { day: 'numeric', month: 'long', year: 'numeric' }),
            categories: [], cover_media: media(post.cover_asset), body_html: docToHtml(text.document),
        };
    });

    const navMain = [
        ...pages.filter((page) => page.navigation_visible).map((page) => ({ label: tr(page).title, url: pageUrl(page), kind: 'page' })),
        { label: settings.catalog_label, url: routes.catalog, kind: 'catalog' },
        { label: t('Gallery'), url: routes.gallery, kind: 'gallery' },
        { label: t('Videos'), url: routes.videos, kind: 'videos' },
        { label: t('Blog'), url: routes.blog, kind: 'blog' },
    ];
    const menuItems = (items = []) => items.map((item) => {
        if (item.type === 'page') {
            const page = pageBySlug(item.slug);
            if (!page) return null;
            return { label: item.labels?.[localeCode] ?? tr(page).title, url: pageUrl(page), kind: 'page' };
        }
        if (item.type === 'listing') return { label: item.labels?.[localeCode] ?? t(item.listing[0].toUpperCase() + item.listing.slice(1)), url: routes[item.listing] ?? localUrl(`/${item.listing}`), kind: item.listing };
        return { label: item.labels?.[localeCode] ?? item.labels?.[defaultLocale] ?? item.url, url: item.url, kind: 'custom' };
    }).filter(Boolean);

    const available = demoLocales.map((code) => ({
        code, ...localeInfo[code], label: localeInfo[code]?.name, url: code === defaultLocale ? '/' : `/${code}`,
        is_default: code === defaultLocale, current: code === localeCode, has_translation: true,
    }));

    return {
        localeCode, tr, localUrl, media, strings, t, pages, pageUrl, settings, company, routes, products, galleries, videos, posts,
        menus: { main: navMain, footer: menuItems(demo.menus?.footer), useful_links: menuItems(demo.menus?.useful_links) },
        locale: { code: localeCode, ...localeInfo[localeCode], is_default: localeCode === defaultLocale, home_url: localUrl('/'), available },
    };
}

// Minimal ProseMirror-style document to HTML, for demo blog posts.
function docToHtml(node) {
    if (!node) return '';
    const inner = () => (node.content ?? []).map(docToHtml).join('');
    switch (node.type) {
        case 'doc': return inner();
        case 'paragraph': return `<p>${inner()}</p>`;
        case 'heading': return `<h${node.attrs?.level ?? 2}>${inner()}</h${node.attrs?.level ?? 2}>`;
        case 'bulletList': return `<ul>${inner()}</ul>`;
        case 'orderedList': return `<ol>${inner()}</ol>`;
        case 'listItem': return `<li>${inner()}</li>`;
        case 'blockquote': return `<blockquote>${inner()}</blockquote>`;
        case 'hardBreak': return '<br>';
        case 'text': return (node.marks ?? []).reduce((html, mark) => ({
            bold: `<strong>${html}</strong>`, italic: `<em>${html}</em>`, link: `<a href="${e(mark.attrs?.href)}">${html}</a>`,
        }[mark.type] ?? html), e(node.text));
        default: return inner();
    }
}

// --- Forms ------------------------------------------------------------------

// Eyivo supplies each plugin's fields; these are plausible stand-ins so the form layouts can be checked.
const formFields = {
    contact: [['name', 'Name', 'text', true, 'name'], ['email', 'Email', 'email', true, 'email'], ['phone', 'Phone', 'tel', false, 'tel'], ['message', 'Message', 'textarea', true]],
    quote_request: [['name', 'Name', 'text', true, 'name'], ['email', 'Email', 'email', true, 'email'], ['company', 'Company', 'text', false, 'organization'], ['budget', 'Budget', 'select', false], ['details', 'Project details', 'textarea', true]],
    product_inquiry: [['name', 'Name', 'text', true, 'name'], ['email', 'Email', 'email', true, 'email'], ['product', 'Product', 'text', true], ['quantity', 'Quantity', 'number', false], ['message', 'Message', 'textarea', false]],
    appointment: [['name', 'Name', 'text', true, 'name'], ['email', 'Email', 'email', true, 'email'], ['date', 'Preferred date', 'date', true], ['notes', 'Notes', 'textarea', false]],
    course_application: [['name', 'Name', 'text', true, 'name'], ['email', 'Email', 'email', true, 'email'], ['course', 'Course', 'select', true], ['motivation', 'Why this course?', 'textarea', true]],
    reservation: [['name', 'Name', 'text', true, 'name'], ['email', 'Email', 'email', true, 'email'], ['date', 'Date', 'date', true], ['guests', 'Guests', 'number', true], ['requests', 'Special requests', 'textarea', false]],
    property_inquiry: [['name', 'Name', 'text', true, 'name'], ['email', 'Email', 'email', true, 'email'], ['property', 'Property', 'text', true], ['consent', 'I agree to be contacted', 'checkbox', true], ['message', 'Message', 'textarea', false]],
};
const buildForm = (binding) => ({
    available: true, id: binding, placement: `form-${binding}`, action: '#', csrf_token: 'preview', context: 'preview', success: false, errors: [],
    verification_html: '<p class="form-preset">Human verification appears here</p>',
    fields: (formFields[binding] ?? formFields.contact).map(([key, label, control, required, autocomplete]) => ({
        key, id: `${binding}-${key}`, name: key, label, control, required, autocomplete, placeholder: '', value: '', max: control === 'number' ? 99 : 500, min: control === 'number' ? 1 : null, errors: [],
        help: control === 'select' ? 'Choose an option' : '', options: control === 'select' ? [{ value: 'a', label: 'Option A' }, { value: 'b', label: 'Option B' }] : [],
    })),
});
const forms = Object.fromEntries(Object.keys(manifest.forms ?? formFields).map((binding) => [binding, buildForm(binding)]));

function formHtml(binding, submitLabel) {
    const form = forms[binding] ?? buildForm(binding);
    const field = (f) => {
        const optional = f.required ? '' : ' <small>Optional</small>';
        const control = {
            textarea: `<textarea id="${f.id}" name="${f.name}" rows="4"${f.required ? ' required' : ''}></textarea>`,
            select: `<select id="${f.id}" name="${f.name}"${f.required ? ' required' : ''}><option value="">${e(f.help)}</option>${f.options.map((o) => `<option value="${o.value}">${e(o.label)}</option>`).join('')}</select>`,
            checkbox: `<input type="checkbox" id="${f.id}" name="${f.name}" value="1"${f.required ? ' required' : ''}>`,
        }[f.control] ?? `<input type="${f.control}" id="${f.id}" name="${f.name}"${f.autocomplete ? ` autocomplete="${f.autocomplete}"` : ''}${f.required ? ' required' : ''}>`;
        return `<label for="${f.id}">${e(f.label)}${optional}${control}</label>`;
    };
    return `<form class="lead-form" id="${form.placement}" onsubmit="return false">${form.fields.map(field).join('')}${form.verification_html}<button class="button" type="submit">${e(submitLabel ?? 'Send enquiry')} <span>›</span></button></form>`;
}

// --- Components -------------------------------------------------------------

async function renderThemeComponent(name, component, scope) {
    const definition = manifest.components?.[name] ?? {};
    let source = readFileSync(join(themeDir, 'components', `${name}.liquid`), 'utf8');
    // Rich text arrives from Eyivo already expanded to safe HTML, so print those fields unescaped.
    for (const [field, schema] of Object.entries(definition.schema ?? {})) {
        if (schema.type === 'richtext') source = source.replace(new RegExp(`\\{\\{\\s*component\\.data\\.${field}\\s*\\}\\}`, 'g'), `{{ component.data.${field} | raw }}`);
    }
    const data = { ...definition.defaults, ...component.data };
    return liquid.parseAndRender(source, { ...scope, component: { id: 'preview', type: `theme:${name}`, variant: component.variant ?? 'default', data } });
}

const heading = (d) => (d.eyebrow || d.heading || d.intro
    ? `<div class="section-heading"><div>${d.eyebrow ? `<p class="eyebrow">${e(d.eyebrow)}</p>` : ''}${d.heading ? `<h2>${e(d.heading)}</h2>` : ''}</div>${d.intro ? `<p>${e(d.intro)}</p>` : ''}</div>`
    : '');
const eyebrowHeading = (d) => `${d.eyebrow ? `<p class="eyebrow">${e(d.eyebrow)}</p>` : ''}${d.heading ? `<h2>${e(d.heading)}</h2>` : ''}`;
const section = (classes, inner) => `<section class="component ${classes}">${inner}</section>`;
const img = (url, alt, loading = 'lazy') => (url ? `<img src="${e(url)}" alt="${e(alt)}" loading="${loading}">` : '');
const link = (url, label, classes = 'text-link') => (label ? `<a class="${classes}" href="${e(current.site.localUrl(url))}">${e(label)}${classes === 'text-link' ? ' <span>›</span>' : ''}</a>` : '');

const builtIn = {
    hero(d, variant) {
        const variantClass = { centered: 'hero-centered', immersive: 'hero-immersive' }[variant] ?? `hero-${variant ?? 'split'}`;
        return section(`hero-component ${variantClass}`, `<div class="shell hero-component-grid"><div class="hero-copy">${d.eyebrow ? `<p class="eyebrow">${e(d.eyebrow)}</p>` : ''}<h1>${e(d.heading)}</h1>${d.summary ? `<p class="hero-summary">${e(d.summary)}</p>` : ''}<div class="button-row">${link(d.primary_url, d.primary_label, 'button')}${link(d.secondary_url, d.secondary_label)}</div></div>${d.image_url ? `<figure>${img(d.image_url, d.image_alt, 'eager')}<figcaption><i></i>${e(d.image_alt)}</figcaption></figure>` : ''}</div>`);
    },
    rich_text: (d) => section('section', `<div class="shell prose-layout"><div class="prose-index"><span>${e(d.eyebrow)}</span><i></i></div><div class="prose">${d.heading ? `<h2>${e(d.heading)}</h2>` : ''}<p>${e(d.body)}</p></div></div>`),
    stats: (d) => section('stats-section', `<div class="shell">${heading(d)}<div class="stats-grid">${(d.items ?? []).map((i) => `<article><strong>${e(i.value)}</strong><span>${e(i.label)}</span>${i.note ? `<small>${e(i.note)}</small>` : ''}</article>`).join('')}</div></div>`),
    feature_grid: (d) => section('section', `<div class="shell">${heading(d)}<div class="feature-grid">${(d.items ?? []).map((i, n) => `<article><span class="card-number">0${n + 1}</span><div class="feature-icon" aria-hidden="true">${e(i.icon)}</div><h3>${e(i.title)}</h3><p>${e(i.text)}</p></article>`).join('')}</div></div>`),
    image_text: (d, variant) => section('section', `<div class="shell image-text-grid image-text-${variant ?? 'image_left'}"><figure>${img(d.image_url, d.image_alt)}${d.badge ? `<figcaption>${e(d.badge)}</figcaption>` : ''}</figure><div class="image-text-copy">${eyebrowHeading(d)}<p>${e(d.body)}</p>${link(d.button_url, d.button_label)}</div></div>`),
    service_grid: (d) => section('section', `<div class="shell">${heading(d)}<div class="service-list">${(d.items ?? []).map((i, n) => `<article><span>0${n + 1}</span><div><h3>${e(i.title)}</h3><p>${e(i.text)}</p></div><a href="${e(current.site.localUrl(i.url))}" aria-label="${e(i.title)}">›</a></article>`).join('')}</div></div>`),
    media_gallery: (d) => section('section', `<div class="shell">${heading(d)}<div class="gallery-grid">${(d.items ?? []).map((i) => `<figure>${img(i.image_url, i.image_alt)}${i.caption ? `<figcaption><strong>${e(i.caption)}</strong></figcaption>` : ''}</figure>`).join('')}</div></div>`),
    testimonials: (d) => section('section', `<div class="shell">${heading(d)}<div class="testimonial-grid">${(d.items ?? []).map((i) => `<blockquote><p>${e(i.quote)}</p><footer><strong>${e(i.name)}</strong> <span>${e(i.role)}</span></footer></blockquote>`).join('')}</div></div>`),
    faq: (d) => section('section', `<div class="shell faq-layout"><div>${eyebrowHeading(d)}</div><div class="faq-list">${(d.items ?? []).map((i) => `<details><summary>${e(i.question)}<span aria-hidden="true">+</span></summary><p>${e(i.answer)}</p></details>`).join('')}</div></div>`),
    logo_cloud: (d) => section('logo-cloud', `<div class="shell"><p>${e(d.heading)}</p><div>${(d.items ?? []).map((i) => `<span>${e(i.name)}</span>`).join('')}</div></div>`),
    announcement: (d) => section('announcement-panel', `<div class="shell"><span>${e(d.label)}</span><div><h2>${e(d.heading)}</h2><p>${e(d.body)}</p></div>${link(d.button_url, d.button_label, 'button button-ghost')}</div>`),
    collection_grid: (d) => section('section', `<div class="shell">${heading(d)}<div class="native-card-grid">${current.site.products.map((p) => `<a class="native-card" href="${e(p.url)}">${p.cover_media ? img(p.cover_media.url, p.title) : ''}<div><h3>${e(p.title)}</h3><p>${e(p.summary)}</p></div></a>`).join('')}</div>${d.button_label ? `<div class="section-action">${link(d.button_url, d.button_label, 'button')}</div>` : ''}</div>`),
    image_slider: (d) => section('section', `<div class="shell">${heading(d)}<div class="slider-track">${(d.items ?? []).map((i) => `<figure>${img(i.image_url, i.alt)}<figcaption><strong>${e(i.title)}</strong><span>${e(i.caption)}</span></figcaption></figure>`).join('')}</div></div>`),
    location_map: (d) => section('section', `<div class="shell location-grid"><div>${eyebrowHeading(d)}<p>${e(d.address)}</p>${d.map_url ? `<a class="text-link" href="${e(d.map_url)}">Open map <span>›</span></a>` : ''}</div><div class="map-visual">${img(d.image_url, d.image_alt)}<span>${e(d.address)}</span></div></div>`),
    price_offer: (d) => section('section', `<div class="shell price-offer"><div>${eyebrowHeading(d)}</div><div><p class="price"><strong>${e(d.price)}</strong> <span>${e(d.period)}</span></p><ul>${(d.features ?? []).map((f) => `<li>${e(f.label)}</li>`).join('')}</ul></div>${link(d.button_url, d.button_label, 'button')}</div>`),
    product_specs: (d) => section('section', `<div class="shell specs-layout"><h2>${e(d.heading)}</h2><dl>${(d.items ?? []).map((i) => `<div><dt>${e(i.label)}</dt><dd>${e(i.value)}</dd></div>`).join('')}</dl></div>`),
    search_filter: (d) => section('filter-panel', `<div class="shell"><h2>${e(d.heading)}</h2><label><span class="sr-only">${e(d.placeholder)}</span><input type="search" placeholder="${e(d.placeholder)}"></label><div class="filter-chips">${(d.categories ?? []).map((c) => `<button type="button">${e(c.label)}</button>`).join('')}</div></div>`),
    event_list: (d) => section('section event-section', `<div class="shell"><div class="section-heading event-section-heading"><div>${eyebrowHeading(d)}</div>${d.intro ? `<p>${e(d.intro)}</p>` : ''}</div><div class="event-list">${(d.items ?? []).map((i) => `<article class="event-card">${i.image_url ? `<div class="event-card-image">${img(i.image_url, i.image_alt)}</div>` : ''}<div class="event-card-content"><div class="event-card-meta"><span class="event-card-date">${e(i.date_label)}</span><span class="event-card-category">${e(i.category)}</span></div><h3>${e(i.title)}</h3><p>${e(i.summary)}</p><p class="event-card-location"><span>${e(i.location)}</span></p>${i.url ? `<a class="event-card-link" href="${e(current.site.localUrl(i.url))}">${e(i.link_label)}</a>` : ''}</div></article>`).join('')}</div></div>`),
    lead_form: (d) => section('section lead-form-section', `<div class="shell lead-form-layout"><div>${eyebrowHeading(d)}<p>${e(d.text)}</p>${d.form_binding ? `<span class="form-preset">${e(d.form_binding.replaceAll('_', ' '))}</span>` : ''}</div>${formHtml(d.form_binding, d.submit_label)}</div>`),
    cta: (d) => section('cta-section', `<div class="shell">${d.eyebrow ? `<p class="eyebrow">${e(d.eyebrow)}</p>` : '<span></span>'}<div><h2>${e(d.heading)}</h2>${d.text ? `<p>${e(d.text)}</p>` : ''}</div>${link(d.button_url, d.button_label, 'button')}</div>`),
    contact_details: (d) => { const c = current.site.company; return section('section', `<div class="shell contact-details"><div>${eyebrowHeading(d)}</div><div>${c.phone ? `<p><span>Phone</span>${e(c.phone)}</p>` : ''}${c.email ? `<p><span>Email</span>${e(c.email)}</p>` : ''}${c.address ? `<p><span>Address</span>${e(c.address)}</p>` : ''}</div></div>`); },
    contact_actions: (d) => { const c = current.site.company; return `<section class="component contact-actions-section"><div class="shell contact-actions"><div>${d.heading ? `<h2>${e(d.heading)}</h2>` : ''}${d.text ? `<p>${e(d.text)}</p>` : ''}</div><div>${c.phone ? `<a href="tel:${e(c.phone)}"><span>Call</span>${e(c.phone)}</a>` : ''}${c.email ? `<a href="mailto:${e(c.email)}"><span>Email</span>${e(c.email)}</a>` : ''}${d.whatsapp_url ? `<a href="${e(d.whatsapp_url)}"><span>WhatsApp</span>Message us</a>` : ''}</div></div></section>`; },
    article_list: (d) => section('section', `<div class="shell">${heading(d)}<div class="article-list">${(d.items ?? []).map((i) => `<a href="${e(current.site.localUrl(i.url))}"><span>${e(i.date)}</span><h3>${e(i.title)}</h3><p>${e(i.summary)}</p><b>›</b></a>`).join('')}</div></div>`),
    business_hours: (d) => section('section', `<div class="shell hours-layout"><div>${eyebrowHeading(d)}</div><dl>${(d.items ?? []).map((i) => `<div><dt>${e(i.day)}</dt><dd>${e(i.hours)}</dd></div>`).join('')}</dl></div>`),
    credentials: (d) => section('credentials-section', `<div class="shell"><div>${eyebrowHeading(d)}</div><div class="credentials-grid">${(d.items ?? []).map((i) => `<article><strong>${e(i.label)}</strong><span>${e(i.note)}</span></article>`).join('')}</div></div>`),
    download_list: (d) => section('section', `<div class="shell">${heading(d)}<div class="download-list">${(d.items ?? []).map((i) => `<a href="${e(i.url)}"><span>${e(i.type)}</span><strong>${e(i.label)}</strong><small>${e(i.meta)}</small><b>↓</b></a>`).join('')}</div></div>`),
    project_grid: (d) => section('section', `<div class="shell">${heading(d)}<div class="project-grid">${(d.items ?? []).map((i) => `<a href="${e(current.site.localUrl(i.url))}"><figure>${img(i.image_url, i.alt)}</figure><div><span>${e(i.meta)}</span><h3>${e(i.title)}</h3><p>${e(i.text)}</p></div></a>`).join('')}</div></div>`),
    tabs: (d) => section('section tabs-component', `<div class="shell"><h2>${e(d.heading)}</h2><div class="tab-buttons" role="tablist">${(d.items ?? []).map((i, n) => `<button type="button" role="tab" aria-selected="${n === 0}">${e(i.label)}</button>`).join('')}</div>${(d.items ?? []).map((i, n) => `<div role="tabpanel"${n ? ' hidden' : ''}><h3>${e(i.heading)}</h3><p>${e(i.text)}</p></div>`).join('')}</div>`),
    team_grid: (d) => section('section', `<div class="shell">${heading(d)}<div class="team-grid">${(d.items ?? []).map((i) => `<article>${img(i.image_url, i.name)}<h3>${e(i.name)}</h3><p>${e(i.role)}</p><small>${e(i.bio)}</small></article>`).join('')}</div></div>`),
    video: (d) => section('section', `<div class="shell">${heading({ ...d, intro: d.summary })}<a class="video-poster" href="${e(d.video_url)}" rel="noopener">${img(d.poster_url, d.heading)}<span class="play-button"><i>▶</i>Play video</span></a></div>`),
};

async function renderComponent(component, scope) {
    const [namespace, name] = component.component_type.split(':');
    const data = { ...component.data, ...(component.translations ? current.site.tr(component) : {}) };
    if (namespace === 'theme') return renderThemeComponent(name, { ...component, data }, scope);
    const stub = builtIn[name];
    if (stub) return stub(data, component.variant);
    return section('section', `<div class="shell"><p class="eyebrow">Preview</p><p>No local stub for <code>${e(component.component_type)}</code>.</p></div>`);
}

// --- Rendering --------------------------------------------------------------

// Root-relative links become relative file links, so the preview can be browsed straight from disk.
function rewriteLinks(html, file) {
    const from = posix.dirname(file);
    return html.replace(/(href)="(\/[^"]*)"/g, (match, attr, path) => {
        if (path.startsWith('//')) return match;
        const hash = path.match(/#.*$/)?.[0] ?? '';
        return `${attr}="${posix.relative(from, fileForPath(path)) || posix.basename(fileForPath(path))}${hash}"`;
    });
}

// Eyivo hands page bodies to templates as safe, already-rendered rich text, so print them unescaped here too.
const readTemplate = (path) => readFileSync(join(themeDir, path), 'utf8').replace(/\{\{\s*page\.body\s*\}\}/g, '{{ page.body | raw }}');

async function renderPage(site, { template, path, title, seo, page = {}, components = [], extra = {} }) {
    const file = fileForPath(path);
    current = { site, file, seo: { title: seo?.title ?? `${title} | ${site.company.name}`, description: seo?.description ?? site.company.description } };
    const navigation = Object.fromEntries(Object.entries(site.menus).map(([key, items]) => [key, items.map((item) => ({ ...item, active: item.url === path }))]));
    const scope = {
        site: { name: site.company.name, locale: site.localeCode },
        company: site.company,
        seo: current.seo,
        theme: { key: manifest.key, name: manifest.name, settings: site.settings },
        assets: { version: manifest.version },
        locale: site.locale,
        navigation,
        routes: site.routes,
        page: { id: path, title, body: null, settings: {}, hero_media: null, ...page },
        products: site.products,
        galleries: site.galleries,
        videos: site.videos,
        forms,
        ...extra,
    };
    const areas = {};
    for (const component of [...components].sort(byOrder)) {
        areas[component.area] = (areas[component.area] ?? '') + await renderComponent(component, scope);
    }
    scope.areas = areas;
    const content = await liquid.parseAndRender(readTemplate(`page-types/${template}.liquid`), scope);
    const html = await liquid.parseAndRender(readTemplate('layouts/default.liquid'), { ...scope, content });
    const target = join(outDir, file);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, rewriteLinks(html, file));
    return file;
}

const pageTypes = new Set(Object.keys(manifest.page_types));
const written = [];

for (const localeCode of locales) {
    const site = buildSite(localeCode);
    const { tr, t } = site;

    for (const page of site.pages) {
        const text = tr(page);
        // Page types without their own template (such as about) use the standard page template.
        const template = pageTypes.has(page.type) ? page.type : 'page';
        written.push(await renderPage(site, {
            template, path: site.pageUrl(page), title: text.title,
            seo: { title: text.meta_title, description: text.meta_description },
            page: { id: page.type, type: page.type, title: text.title, slug: text.slug, body: text.body ?? null, settings: page.settings ?? {}, hero_media: site.media(page.hero_asset) },
            components: page.components ?? [],
        }));
    }

    written.push(await renderPage(site, { template: 'products', path: site.routes.catalog, title: site.settings.catalog_label, page: { type: 'products' } }));
    for (const product of site.products) {
        written.push(await renderPage(site, { template: 'product', path: product.url, title: product.title, seo: product.seo, page: { type: 'product' }, extra: { product } }));
    }
    written.push(await renderPage(site, { template: 'gallery', path: site.routes.gallery, title: t('Gallery'), page: { type: 'gallery' } }));
    written.push(await renderPage(site, { template: 'videos', path: site.routes.videos, title: t('Videos'), page: { type: 'videos' } }));

    const blog = { title: t('Blog'), url: site.routes.blog, categories: [], category: null, posts: site.posts, post: null, pagination: {} };
    written.push(await renderPage(site, { template: 'blog', path: site.routes.blog, title: blog.title, page: { type: 'blog' }, extra: { blog } }));
    for (const post of site.posts) {
        written.push(await renderPage(site, { template: 'blog_post', path: post.url, title: post.title, seo: { description: post.summary }, page: { type: 'blog_post' }, extra: { blog: { ...blog, post } } }));
    }
}

console.log(`Wrote ${written.length} pages to ${relative(process.cwd(), outDir) || '.'}:`);
for (const file of written) console.log(`  ${file}`);
