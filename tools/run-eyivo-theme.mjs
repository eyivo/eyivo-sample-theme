#!/usr/bin/env node
// Eyivo Theme API v1 helper: init, validate and pack. Needs Node.js 22 or later and no packages.

import { closeSync, copyFileSync, existsSync, mkdirSync, openSync, readFileSync, readdirSync, realpathSync, statSync, writeSync } from 'node:fs';
import { dirname, extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { crc32, deflateRawSync } from 'node:zlib';

const isObject = (value) => value !== null && typeof value === 'object';
const isString = (value) => typeof value === 'string';
// JSON objects with keys 0..n-1, and empty objects, count as lists, as they do once PHP decodes them.
const isList = (value) => Array.isArray(value) || (isObject(value) && Object.keys(value).every((key, index) => key === String(index)));
const values = (value) => (isObject(value) ? Object.values(value) : []);
const entries = (value) => (isObject(value) ? Object.entries(value) : []);
const isEmpty = (value) => !isObject(value) || Object.keys(value).length === 0;
const pick = (record, keys) => Object.fromEntries(keys.filter((key) => key in record).map((key) => [key, record[key]]));
const hasOnly = (record, allowed) => Object.keys(record).every((key) => allowed.includes(key));
const has = (record, key) => isObject(record) && record[key] !== undefined && record[key] !== null;

function menuErrors(data) {
    const menus = data.menus ?? [];
    if (!isObject(menus) || Object.keys(menus).length > 20) {
        return ['menus must be an object containing at most 20 additional menus'];
    }
    const errors = [];
    for (const [key, definition] of entries(menus)) {
        if (!/^[a-z][a-z0-9_]{0,63}$/.test(key)
            || ['main', 'constructor', 'prototype', '__proto__'].includes(key)
            || !isObject(definition) || !hasOnly(definition, ['label', 'description', 'translations', 'initialize_from_main'])
            || !isString(definition.label) || definition.label.trim() === ''
            || !isString(definition.description) || definition.description.trim() === '') {
            errors.push('Each additional menu needs a valid non-reserved key, label and description.');
            continue;
        }
        if (has(definition, 'initialize_from_main') && typeof definition.initialize_from_main !== 'boolean') {
            errors.push('initialize_from_main must be a boolean');
        }
        if (!isObject(definition.translations ?? [])) {
            errors.push('Menu translations must be an object.');
            continue;
        }
        for (const [locale, translation] of entries(definition.translations ?? [])) {
            if (!['en', 'tr', 'de', 'fr', 'es', 'it', 'pt', 'ar', 'ru', 'zh', 'ja', 'ko', 'nl', 'pl'].includes(locale) || !isObject(translation)
                || !isString(translation.label) || !isString(translation.description)) {
                errors.push('Menu translations need a supported locale, label and description.');
            }
        }
    }
    return errors;
}

// Mirrors the platform demo locale validation contract.
function demoLocaleErrors(demo, locales) {
    const errors = [];
    if ((demo.default_locale ?? 'en') !== 'en') {
        errors.push('demo.default_locale must be en.');
    }
    const check = (record, path, legacy = {}) => {
        const translations = record.translations ?? [];
        if (!isObject(translations) || (!isEmpty(translations) && isList(translations))) {
            errors.push(`${path}.translations must be a locale-keyed object.`);
            return;
        }
        if (!isEmpty(translations) && !has(translations, 'en') && isEmpty(legacy)) {
            errors.push(`${path}.translations.en is required; other demo languages are optional.`);
        }
        for (const [locale, localized] of entries(translations)) {
            if (!locales.includes(locale) || !isObject(localized) || (!isEmpty(localized) && isList(localized))) {
                errors.push(`${path}.translations.${locale} must be an object for a supported locale.`);
            }
        }
    };
    for (const resource of ['pages', 'catalog', 'galleries', 'videos', 'blog_posts']) {
        const records = demo[resource] ?? [];
        if (!isObject(records) || !isList(records)) {
            errors.push(`demo.${resource} must be a list.`);
            continue;
        }
        values(records).forEach((record, index) => {
            if (!isObject(record)) {
                errors.push(`demo.${resource}.${index} must be an object.`);
                return;
            }
            const legacy = pick(record, ['slug', 'title']);
            const path = `demo.${resource}.${index}`;
            check(record, path, legacy);
            const english = { ...legacy, ...(isObject(record.translations?.en) ? record.translations.en : {}) };
            if (!isString(english.slug) || english.slug === '' || !isString(english.title) || english.title === '') {
                errors.push(`${path} requires an English slug and title.`);
            }
            entries(record.components).forEach(([i, component]) => {
                if (isObject(component)) check(component, `${path}.components.${i}`, isObject(component.translation) ? component.translation : {});
            });
            entries(record.items).forEach(([i, item]) => {
                if (isObject(item)) check(item, `${path}.items.${i}`, pick(item, ['title', 'caption', 'alt_text']));
            });
        });
    }
    for (const section of ['company', 'theme_settings']) {
        if (isObject(demo[section])) {
            check(demo[section], `demo.${section}`, section === 'company'
                ? pick(demo[section], ['display_name', 'description', 'address', 'legal_name'])
                : (isObject(demo[section].settings) ? demo[section].settings : {}));
        }
    }
    return errors;
}

// Mirrors the platform's Theme API 1.1 script rules: where files live, their limits, no import/export, readable code,
// and how templates may load them. The platform's AI security review runs only after upload.
const SCRIPT_PATH = /^assets\/js\/[A-Za-z0-9_][A-Za-z0-9_.-]{0,99}\.js$/;
const lineOf = (source, offset) => source.slice(0, offset).split('\n').length;
// The source with comments and strings blanked (newlines kept), so rules read only code.
const codeOf = (source) => source.replace(/\/\/[^\n]*|\/\*[\s\S]*?\*\/|"(?:[^"\\\n]|\\.)*"|'(?:[^'\\\n]|\\.)*'|`(?:[^`\\]|\\.)*`/g, (match) => match.replace(/[^\n]/g, ' '));

function scriptErrors(directory, scripts, allowed, manifest) {
    const errors = [];
    if (scripts.length > 0 && !allowed) {
        errors.push('custom_javascript_declaration: theme.json: a package with JavaScript files must declare "eyivo_theme_api": "1.1" and "capabilities": {"custom_javascript": true}.');
    }
    if (scripts.length === 0 && manifest.capabilities?.custom_javascript === true) {
        errors.push('custom_javascript_declaration: theme.json: capabilities.custom_javascript is declared, but the package has no assets/js files.');
    }
    if (scripts.length > 20) {
        errors.push('script_size: a theme may include at most 20 JavaScript files.');
    }
    let total = 0;
    for (const path of scripts) {
        if (!SCRIPT_PATH.test(path)) {
            errors.push(`script_file: ${path}: JavaScript files are allowed only directly in assets/js/.`);
            continue;
        }
        const bytes = readFileSync(join(directory, path));
        total += bytes.length;
        if (bytes.length > 102400) {
            errors.push(`script_size: ${path}: a JavaScript file may be at most 100 KB.`);
        }
        let source;
        try {
            source = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
        } catch {
            errors.push(`script_file: ${path}: JavaScript files must be UTF-8 text.`);
            continue;
        }
        const code = codeOf(source);
        if (/^[ \t]*(import|export)\b(?![ \t]*[.:(=])/m.test(code) || /(?<![.\w$])import[ \t]*\(/.test(code)) {
            errors.push(`script_import: ${path}: import and export are not allowed; share code through a global such as window.ThemeName.`);
        }
        const long = source.split(/\r?\n/).findIndex((line) => line.length > 400);
        if (long !== -1) {
            errors.push(`readability: ${path}:${long + 1}: a line longer than 400 characters looks minified; upload readable source.`);
        }
        if (/eval\s*\(\s*function\s*\(\s*p\s*,\s*a\s*,\s*c\s*,\s*k\s*,\s*e|[A-Za-z0-9+/=]{200,}|(?:\\x[0-9a-fA-F]{2}){20,}/.test(source)
            || (source.match(/\b_0x[0-9a-f]{4,}\b/gi) ?? []).length > 10) {
            errors.push(`readability: ${path}: the code looks packed, encoded or obfuscated; upload readable source.`);
        }
    }
    if (total > 307200) {
        errors.push('script_size: all JavaScript files together may be at most 300 KB.');
    }
    return errors;
}

function templateErrors(source, allowed, scripts) {
    const errors = [];
    for (const match of source.matchAll(/<\s*script\b[^>]*>/gi)) {
        const line = lineOf(source, match.index);
        if (!allowed) {
            errors.push(`${line}: custom_javascript: script elements need Theme API 1.1 with the custom_javascript capability.`);
            continue;
        }
        const tag = /^<script\s+src="\{\{\s*'js\/([A-Za-z0-9_][A-Za-z0-9_.-]{0,99}\.js)'\s*\|\s*asset_url\s*\}\}"(?:\s+(?:defer|type="module"))+\s*>$/.exec(match[0]);
        if (!tag || !scripts.includes(`assets/js/${tag[1]}`) || !/^\s*<\/script\s*>/i.test(source.slice(match.index + match[0].length, match.index + match[0].length + 12))) {
            errors.push(`${line}: script_tag: load scripts only as <script src="{{ 'js/<file>.js' | asset_url }}" defer></script> for a file in assets/js/; inline scripts are not allowed.`);
        }
    }
    for (const [pattern, message] of [
        [/<[a-z][^>]*\son[a-z]+\s*=/i, 'event_handler: event-handler attributes such as onclick= are not allowed.'],
        [/javascript\s*:/i, 'javascript_url: javascript: URLs are not allowed.'],
        [/<\s*(iframe|object|embed|base)\b/i, 'embedded_content: <iframe>, <object>, <embed> and <base> elements are not allowed.'],
    ]) {
        const found = pattern.exec(source);
        if (found) {
            errors.push(`${lineOf(source, found.index)}: ${message}`);
        }
    }
    return errors;
}

const fail = (message, code = 1) => {
    process.stderr.write(`Error: ${message}\n`);
    process.exit(code);
};

const isFile = (path) => existsSync(path) && statSync(path).isFile();

// Package files, keyed by forward-slash relative path and sorted, without repository-only files.
function files(directory) {
    const result = {};
    const walk = (folder, prefix) => {
        for (const entry of readdirSync(folder, { withFileTypes: true })) {
            const relative = prefix + entry.name;
            const absolute = join(folder, entry.name);
            if (entry.isDirectory()) walk(absolute, `${relative}/`);
            else if (entry.isFile()
                && !relative.startsWith('.git/')
                && !relative.startsWith('bin/')
                && !['.gitignore', 'LICENSE'].includes(relative)) {
                result[relative] = absolute;
            }
        }
    };
    walk(directory, '');
    return Object.fromEntries(Object.entries(result).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)));
}

const readJson = (path, label) => {
    try {
        return JSON.parse(readFileSync(path, 'utf8'));
    } catch (error) {
        return fail(`${label} is invalid: ${error.message}`);
    }
};

function validate(directory) {
    const manifestPath = join(directory, 'theme.json');
    if (!isFile(manifestPath)) {
        fail('theme.json was not found.');
    }
    const manifest = readJson(manifestPath, 'theme.json');
    if (!isObject(manifest)) {
        fail('theme.json must contain an object.');
    }
    for (const field of ['name', 'version', 'eyivo_theme_api']) {
        if (!isString(manifest[field]) || manifest[field].trim() === '') {
            fail(`theme.json must provide ${field}.`);
        }
    }
    // Eyivo gives every uploaded theme its own ID; key is an optional label.
    if ('key' in manifest && !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(String(manifest.key ?? ''))) {
        fail('The theme key may contain only lowercase letters, numbers, and hyphens.');
    }
    if (!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(manifest.version)) {
        fail('The theme version must use semantic versioning.');
    }
    if (!['1.0', '1.1'].includes(manifest.eyivo_theme_api)) {
        fail('This CLI supports Eyivo Theme API 1.0 and 1.1.');
    }
    const scriptsAllowed = manifest.eyivo_theme_api === '1.1' && manifest.capabilities?.custom_javascript === true;
    if (!isObject(manifest.forms) || !has(manifest.forms, 'contact')) {
        fail('theme.json must declare portable forms, including forms.contact.');
    }
    const plugins = values(manifest.plugins);
    for (const [alias, binding] of entries(manifest.forms)) {
        if (!/^[a-z][a-z0-9_]{0,63}$/.test(alias)
            || ['constructor', 'prototype'].includes(alias) || !isObject(binding)
            || !hasOnly(binding, ['plugin', 'type', 'schema_version', 'instance', 'settings'])
            || !isString(binding.plugin) || !plugins.includes(binding.plugin)
            || !isString(binding.type) || !/^[a-z][a-z0-9_]{0,63}$/.test(binding.type)
            || !Number.isInteger(binding.schema_version) || binding.schema_version < 1 || binding.instance !== 'default'
            || (alias === 'contact' && (binding.plugin !== 'eyivo/contact' || binding.type !== 'contact'))
            || (has(binding, 'settings') && (!isObject(binding.settings) || !hasOnly(binding.settings, ['presentation', 'additional_fields'])))) {
            fail(`Invalid portable form binding: ${alias}`);
        }
    }
    for (const error of menuErrors(manifest)) {
        fail(error);
    }
    const demoPath = join(directory, 'demo.json');
    if (!isFile(demoPath)) {
        fail('demo.json is required.');
    }
    const demo = readJson(demoPath, 'demo.json');
    if (!isObject(demo)) {
        fail('demo.json must contain an object.');
    }
    for (const error of demoLocaleErrors(demo, ['en', 'tr', 'de', 'fr', 'es', 'it', 'pt', 'nl', 'pl', 'ar', 'ru', 'ja', 'ko', 'zh'])) {
        fail(error);
    }
    // Mirrors the platform's demo_media_url rule: an https URL on an allowed host, or a file packaged under assets/.
    const packaged = files(directory);
    for (const [asset, definition] of entries(demo.media)) {
        const url = isObject(definition) ? definition.public_url : null;
        if (url === null || url === undefined || url === '') {
            if (!asset.startsWith('assets/') || !has(packaged, asset)) {
                fail(`demo_media_url: demo media ${asset} needs an https URL on an allowed host or a file packaged under assets/ at that path.`);
            }
            continue;
        }
        let parsed = null;
        try {
            parsed = isString(url) ? new URL(url) : null;
        } catch {
            parsed = null;
        }
        if (!parsed || parsed.protocol !== 'https:' || parsed.username || parsed.password
            || (parsed.port !== '' && parsed.port !== '443') || !['cdn.eyivo.com', 'images.pexels.com'].includes(parsed.hostname.toLowerCase())) {
            fail(`demo_media_url: demo media ${asset} must use https on cdn.eyivo.com or images.pexels.com, or be packaged under assets/.`);
        }
    }
    for (const page of values(demo.pages)) {
        for (const component of values(page?.components)) {
            if (component?.component_type === 'eyivo:lead_form') {
                const binding = component.data?.form_binding;
                if (!isString(binding) || !has(manifest.forms, binding) || has(component.data, 'form_preset')) {
                    fail('Demo lead forms must use a declared portable form_binding, not a site UUID or legacy form_preset.');
                }
            }
        }
    }
    const preview = manifest.preview;
    if (!isObject(preview) || preview.data_source !== 'demo_data') {
        fail('theme.json must declare preview.data_source as demo_data.');
    }
    const screenshots = preview.screenshots;
    if (!isObject(screenshots) || isEmpty(screenshots)) {
        fail('theme.json must declare at least one demo-data preview screenshot.');
    }
    for (const [index, screenshot] of entries(screenshots)) {
        const path = isObject(screenshot) ? screenshot.path : null;
        if (!isString(path)
            || !/^screenshots\/[a-z0-9][a-z0-9._/-]*\.(?:png|jpe?g|webp)$/i.test(path)
            || !isFile(join(directory, path))) {
            fail(`theme.json preview.screenshots.${index}.path must reference an existing image in screenshots/.`);
        }
        if (!isString(screenshot.page) || screenshot.page.trim() === ''
            || !['desktop', 'mobile'].includes(screenshot.viewport)) {
            fail(`theme.json preview.screenshots.${index} must declare a page and desktop or mobile viewport.`);
        }
    }
    for (const type of ['home', 'page', 'contact', 'products', 'product', 'gallery', 'videos']) {
        if (!has(manifest.page_types, type) || !isFile(join(directory, 'page-types', `${type}.liquid`))) {
            fail(`The ${type} page type is required.`);
        }
    }
    // Older v1 themes inherit blog templates from Eyivo's core theme.
    for (const type of ['blog', 'blog_category', 'blog_post']) {
        if (has(manifest.page_types, type) && !isFile(join(directory, 'page-types', `${type}.liquid`))) {
            fail(`The declared ${type} page type must provide its Liquid template.`);
        }
    }
    if (!isFile(join(directory, 'layouts', 'default.liquid'))) {
        fail('layouts/default.liquid is required.');
    }
    const scripts = Object.keys(files(directory)).filter((path) => path.toLowerCase().endsWith('.js'));
    for (const error of scriptErrors(directory, scripts, scriptsAllowed, manifest)) {
        fail(error);
    }
    let menuSource = '';
    for (const [relative, absolute] of Object.entries(files(directory))) {
        const extension = extname(relative).slice(1).toLowerCase();
        if (['php', 'phtml', 'phar', 'zip', 'tar', 'gz'].includes(extension) || /\.(?:php\d?|phtml|phar|cgi)(?:\.|$)|(?:^|\/)\.htaccess$/i.test(relative)) {
            fail(`${relative} is not allowed by the Theme API v1 policy.`);
        }
        if (extension !== 'liquid') continue;
        const source = readFileSync(absolute, 'utf8');
        if (/<\?(?:php|=)?|@php|\{!!/i.test(source)) {
            fail(`${relative} contains forbidden executable markup.`);
        }
        for (const error of templateErrors(source, scriptsAllowed, scripts)) {
            fail(`${relative}:${error}`);
        }
        if (/\bcontact\.(?:action|csrf_token|old|success)|\bform_preset\b/.test(source)) {
            fail(`${relative} uses the retired contact form contract; use forms bindings and schema fields.`);
        }
        menuSource += source;
    }
    for (const key of Object.keys(isObject(manifest.menus) ? manifest.menus : {})) {
        if (!menuSource.includes(`navigation.${key}`) && !menuSource.includes(`navigation['${key}']`)) {
            fail(`Declared menu ${key} must be rendered by the theme.`);
        }
    }
    return manifest;
}

// Writes a standard zip archive. Every entry gets the same timestamp (2000-01-01 00:00) so packs are reproducible.
function writeZip(target, entriesToPack) {
    const dosTime = 0;
    const dosDate = ((2000 - 1980) << 9) | (1 << 5) | 1;
    const fd = openSync(target, 'w');
    const central = [];
    let offset = 0;
    const write = (buffer) => {
        writeSync(fd, buffer);
        offset += buffer.length;
    };
    try {
        for (const [name, absolute] of entriesToPack) {
            const data = readFileSync(absolute);
            const deflated = deflateRawSync(data, { level: 9 });
            const stored = deflated.length >= data.length;
            const body = stored ? data : deflated;
            const fileName = Buffer.from(name, 'utf8');
            const checksum = crc32(data);
            const header = Buffer.alloc(30);
            header.writeUInt32LE(0x04034b50, 0);
            header.writeUInt16LE(20, 4);
            header.writeUInt16LE(0x0800, 6);
            header.writeUInt16LE(stored ? 0 : 8, 8);
            header.writeUInt16LE(dosTime, 10);
            header.writeUInt16LE(dosDate, 12);
            header.writeUInt32LE(checksum, 14);
            header.writeUInt32LE(body.length, 18);
            header.writeUInt32LE(data.length, 22);
            header.writeUInt16LE(fileName.length, 26);
            header.writeUInt16LE(0, 28);
            const localOffset = offset;
            write(header);
            write(fileName);
            write(body);

            const record = Buffer.alloc(46);
            record.writeUInt32LE(0x02014b50, 0);
            record.writeUInt16LE(20, 4);
            record.writeUInt16LE(20, 6);
            record.writeUInt16LE(0x0800, 8);
            record.writeUInt16LE(stored ? 0 : 8, 10);
            record.writeUInt16LE(dosTime, 12);
            record.writeUInt16LE(dosDate, 14);
            record.writeUInt32LE(checksum, 16);
            record.writeUInt32LE(body.length, 20);
            record.writeUInt32LE(data.length, 24);
            record.writeUInt16LE(fileName.length, 28);
            record.writeUInt32LE(localOffset, 42);
            central.push(record, fileName);
        }
        const centralStart = offset;
        for (const buffer of central) write(buffer);
        const end = Buffer.alloc(22);
        end.writeUInt32LE(0x06054b50, 0);
        end.writeUInt16LE(central.length / 2, 8);
        end.writeUInt16LE(central.length / 2, 10);
        end.writeUInt32LE(offset - centralStart, 12);
        end.writeUInt32LE(centralStart, 16);
        write(end);
    } finally {
        closeSync(fd);
    }
}

const [command = 'help', ...rest] = process.argv.slice(2);
// Validate, pack and init default to the theme in the current folder, or else this repository's sample-theme/.
const themeFolder = isFile(join(process.cwd(), 'theme.json'))
    ? process.cwd()
    : resolve(dirname(fileURLToPath(import.meta.url)), '..', 'sample-theme');
const rootArgument = rest[0] ?? themeFolder;
const root = existsSync(rootArgument) ? realpathSync(rootArgument) : rootArgument;

if (command === 'init') {
    const target = rest[0];
    if (!isString(target) || target.trim() === '') {
        fail('Provide a new destination directory.');
    }
    if (existsSync(target)) {
        fail('The destination already exists.');
    }
    try {
        mkdirSync(target, { recursive: true });
    } catch {
        fail('Unable to create the destination.');
    }
    for (const [relative, absolute] of Object.entries(files(themeFolder))) {
        if (extname(relative).toLowerCase() === '.zip') continue;
        const destination = join(target, ...relative.split('/'));
        try {
            mkdirSync(dirname(destination), { recursive: true });
        } catch {
            fail(`Unable to create the directory for ${relative}.`);
        }
        try {
            copyFileSync(absolute, destination);
        } catch {
            fail(`Unable to copy ${relative}.`);
        }
    }
    validate(themeFolder);
    process.stdout.write(`Created an Eyivo Theme API v1 scaffold at ${target}\nEdit theme.json, then run validate and pack.\n`);
    process.exit(0);
}

if (command === 'validate') {
    const manifest = validate(root);
    process.stdout.write(`Valid Theme API ${manifest.eyivo_theme_api} package: ${manifest.name} ${manifest.version}\n`);
    process.exit(0);
}

if (command === 'pack') {
    const manifest = validate(root);
    const target = rest[1] ?? `${dirname(root)}/${manifest.key ?? 'theme'}-${manifest.version}.zip`;
    try {
        writeZip(target, Object.entries(files(root)));
    } catch (error) {
        fail(`Unable to create ${target}. ${error.message}`);
    }
    process.stdout.write(`Created ${target}\n`);
    process.exit(0);
}

process.stdout.write(`Eyivo Theme API v1 helper

Usage:
  node tools/run-eyivo-theme.mjs init <new-directory>
  node tools/run-eyivo-theme.mjs validate [theme-directory]
  node tools/run-eyivo-theme.mjs pack [theme-directory] [output.zip]

The theme directory defaults to the current folder when it contains theme.json,
and otherwise to sample-theme/. That folder is a complete package:
zipping it yourself works too. The app panel remains the authority: upload the
ZIP under Custom Themes as a new theme, or as a new version from the theme's page.
`);
