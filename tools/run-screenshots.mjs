#!/usr/bin/env node
// Captures the preview screenshots declared in sample-theme/theme.json.
//
//   node run-screenshots.mjs                               # from the local preview (run run-render-demo.mjs first)
//   node run-screenshots.mjs --base-url https://your-site.example
//   node run-screenshots.mjs --out ../preview/screenshots  # somewhere other than sample-theme/screenshots
//   node run-screenshots.mjs --browser chrome              # msedge (default) or chrome
//
// Empties the output folder of images first, then writes one file per shot below, at the same sizes as the
// original sample screenshots: 1440px desktop and 390px mobile, full page unless noted.
// Eyivo only accepts screenshots of a real site with demo.json loaded, so use --base-url for the ones you
// upload; local-preview captures approximate Eyivo's built-in components.

import { readFileSync, readdirSync, rmSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { chromium } from 'playwright-core';
import { parseFlags, previewDir as defaultPreviewDir, previewFile, themeDir } from './lib/common.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const args = parseFlags();

const manifest = JSON.parse(readFileSync(join(themeDir, 'theme.json'), 'utf8'));
const demo = JSON.parse(readFileSync(join(themeDir, 'demo.json'), 'utf8'));
const outDir = resolve(here, args.out ?? join(themeDir, 'screenshots'));
const previewDir = resolve(here, args.preview ?? defaultPreviewDir);
const baseUrl = args['base-url']?.replace(/\/+$/, '');

const viewports = {
    desktop: { width: 1440, height: 1000 },
    mobile: { width: 390, height: 844 },
};

const firstProduct = [...(demo.catalog ?? [])].sort((a, b) => a.sort_order - b.sort_order)[0]?.translations?.en?.slug;
const pageWithBody = demo.pages.find((page) => page.type === 'page' && page.translations?.en?.body)?.translations?.en?.slug;

// Footer shots run from the call-to-action band to the bottom of the page.
const footerClip = '.sample-footer-callout, .site-footer';

const shots = [
    { file: 'home-desktop.png', path: '/', viewport: 'desktop' },
    { file: 'home-mobile.png', path: '/', viewport: 'mobile' },
    { file: 'catalog-desktop.png', path: '/catalog', viewport: 'desktop', fullPage: true },
    { file: 'catalog-mobile.png', path: '/catalog', viewport: 'mobile', fullPage: true },
    { file: 'catalog-detail-desktop.png', path: `/catalog/${firstProduct}`, viewport: 'desktop', fullPage: true },
    { file: 'gallery-desktop.png', path: '/gallery', viewport: 'desktop', fullPage: true },
    { file: 'gallery-mobile.png', path: '/gallery', viewport: 'mobile', fullPage: true },
    { file: 'contact-desktop.png', path: '/contact', viewport: 'desktop', fullPage: true },
    { file: 'contact-mobile.png', path: '/contact', viewport: 'mobile', fullPage: true },
    { file: 'about-desktop.png', path: '/about', viewport: 'desktop', fullPage: true },
    { file: 'videos-desktop.png', path: '/videos', viewport: 'desktop', fullPage: true },
    { file: 'page-body-desktop.png', path: `/${pageWithBody}`, viewport: 'desktop', fullPage: true },
    { file: 'footer-desktop.png', path: '/', viewport: 'desktop', clipFrom: footerClip },
    { file: 'footer-mobile.png', path: '/', viewport: 'mobile', clipFrom: footerClip },
    { file: 'navigation-mobile.png', path: '/', viewport: 'mobile', open: 'details.sample-navigation' },
];

// Same path-to-file mapping run-render-demo.mjs uses for the local preview.
const urlFor = (path) => {
    if (baseUrl) return `${baseUrl}${path}`;
    const file = join(previewDir, previewFile(path));
    if (!existsSync(file)) throw new Error(`Missing ${relative(process.cwd(), file)}. Run node run-render-demo.mjs first.`);
    return pathToFileURL(file).href;
};

// Warn about declared screenshots this script does not produce, and the reverse.
const declared = (manifest.preview?.screenshots ?? []).map((shot) => shot.path.replace(/^screenshots\//, ''));
for (const file of declared.filter((name) => !shots.some((shot) => shot.file === name))) console.warn(`theme.json declares screenshots/${file}, which this script does not capture.`);
for (const shot of shots.filter((s) => !declared.includes(s.file))) console.warn(`${shot.file} is not declared in theme.json preview.screenshots.`);

// Fail before deleting anything if the source pages are not there.
const targets = shots.map((shot) => ({ ...shot, url: urlFor(shot.path) }));

mkdirSync(outDir, { recursive: true });
const old = readdirSync(outDir).filter((name) => /\.(png|jpe?g|webp)$/i.test(name));
for (const name of old) rmSync(join(outDir, name));
console.log(`Removed ${old.length} old image(s) from ${relative(process.cwd(), outDir)}`);

const browser = await chromium.launch({ channel: args.browser ?? 'msedge', headless: true });
try {
    const contexts = {};
    for (const [name, viewport] of Object.entries(viewports)) {
        contexts[name] = await browser.newContext({ viewport, deviceScaleFactor: 1, isMobile: name === 'mobile', hasTouch: name === 'mobile', colorScheme: 'light', reducedMotion: 'reduce' });
    }

    for (const shot of targets) {
        const page = await contexts[shot.viewport].newPage();
        await page.goto(shot.url, { waitUntil: 'networkidle', timeout: 60_000 });
        // Load lazy images before a full-page capture.
        await page.evaluate(async () => {
            document.querySelectorAll('img[loading="lazy"]').forEach((img) => { img.loading = 'eager'; });
            await Promise.all([...document.images].filter((img) => !img.complete).map((img) => new Promise((done) => { img.onload = img.onerror = done; })));
        });
        if (shot.open) {
            await page.locator(`${shot.open} > summary`).first().click();
            await page.waitForTimeout(250);
        }

        const target = join(outDir, shot.file);
        if (shot.clipFrom) {
            const top = await page.evaluate((selector) => {
                const element = document.querySelector(selector);
                return element ? element.getBoundingClientRect().top + window.scrollY : 0;
            }, shot.clipFrom);
            const height = await page.evaluate(() => document.documentElement.scrollHeight);
            await page.screenshot({ path: target, fullPage: true, clip: { x: 0, y: top, width: viewports[shot.viewport].width, height: height - top } });
        } else {
            await page.screenshot({ path: target, fullPage: Boolean(shot.fullPage) });
        }
        console.log(`  ${shot.file}  ← ${shot.path} (${shot.viewport}${shot.fullPage ? ', full page' : ''})`);
        await page.close();
    }
} finally {
    await browser.close();
}

console.log(`Saved ${targets.length} screenshots to ${relative(process.cwd(), outDir)}${baseUrl ? '' : ' (from the local preview)'}`);
