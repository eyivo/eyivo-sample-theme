// Shared by the preview scripts: repository locations, flag parsing and the page-path to preview-file mapping.

import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const repoDir = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
export const themeDir = join(repoDir, 'sample-theme');
export const previewDir = join(repoDir, 'preview');

// Turns `--name value` pairs into { name: value }.
export const parseFlags = (argv = process.argv.slice(2)) => Object.fromEntries(argv.reduce((pairs, arg, i, all) => {
    if (arg.startsWith('--')) pairs.push([arg.slice(2), all[i + 1]]);
    return pairs;
}, []));

// The site path a page is served at maps to a file in the preview folder: / → index.html, /tr → tr/index.html,
// /about → about.html, /catalog/item → catalog/item.html.
export const previewFile = (path, localeCodes = []) => {
    const clean = path.replace(/[?#].*$/, '').replace(/\/+$/, '');
    if (clean === '') return 'index.html';
    if (localeCodes.includes(clean.slice(1))) return `${clean.slice(1)}/index.html`;
    return `${clean.slice(1)}.html`;
};
