# Theme tools

Optional helpers for working on the theme in `../sample-theme/`. None of this goes into the upload: `pack` zips only the theme folder.

```text
tools/
├── run-eyivo-theme.mjs    validate, pack and scaffold a theme (no packages needed)
├── run-render-demo.mjs    render every demo page to static HTML in ../preview/
├── run-screenshots.mjs    capture the screenshots declared in theme.json
├── lib/
│   └── common.mjs         paths and helpers shared by the two preview scripts
├── package.json           npm scripts and the preview dependencies
└── package-lock.json
```

Everything needs Node.js 22 or later. `run-eyivo-theme.mjs` needs nothing else. Run `npm install` in `tools/` once before using the preview scripts. `node_modules/` and the generated `../preview/` folder are ignored by git.

## npm scripts

Run these from `tools/`:

| Command | Does |
| --- | --- |
| `npm run validate` | Checks the theme against Theme API 1.0 and 1.1, including the theme script rules |
| `npm run pack` | Validates, then builds `<key>-<version>.zip` next to the theme folder |
| `npm run preview` | Renders every demo page, in every demo language, to `../preview/` |
| `npm run screenshots` | Replaces the images in `../sample-theme/screenshots/` with new captures |

Pass options after `--`, for example `npm run preview -- --locale en`.

## Validate, pack and scaffold

`run-eyivo-theme.mjs` works from the repository root or from `tools/`:

```bash
# from the repository root
node tools/run-eyivo-theme.mjs validate
node tools/run-eyivo-theme.mjs pack
node tools/run-eyivo-theme.mjs init ../my-theme

# from tools/
node run-eyivo-theme.mjs validate
```

| Command | Arguments |
| --- | --- |
| `validate [theme-directory]` | Prints `Valid Theme API <version> package: <name> <version>`, or the first problem found and exits with code 1 |
| `pack [theme-directory] [output.zip]` | Validates first. The default output is `<key>-<version>.zip` beside the theme folder, for example `eyivo-sample-theme-1.4.0.zip` in the repository root for the unchanged sample. Every file gets the same timestamp, so packing twice gives the same zip |
| `init <new-directory>` | Copies the theme into a new folder as a starting point. Refuses a folder that already exists |

Without a theme directory, the helper uses the current folder when it contains `theme.json`, and otherwise `sample-theme/`.

Raise `version` in `theme.json` before every upload: Eyivo only accepts a new version of a theme with a higher version number.

## Preview

```bash
npm run preview
npm run preview -- --locale en
```

| Option | Default | Does |
| --- | --- | --- |
| `--locale en\|tr\|all` | `all` | Which demo languages to render. Other languages go in a subfolder, such as `preview/tr/` |
| `--out <folder>` | `../preview` | Where to write the pages |

It writes one HTML file per page (`index.html`, `about.html`, `catalog/<item>.html`, `blog/<post>.html` and so on), with links rewritten between the files. Open `preview/index.html` in a browser and click through.

The layout, page types and theme components are the real theme files, rendered with LiquidJS and the data in `demo.json`. Eyivo's built-in `eyivo:*` components, form fields and blog styles are rendered by Eyivo and not published, so the preview approximates them. Use it to check design changes, not as the final word on how a page looks in Eyivo.

## Screenshots

```bash
npm run preview          # first, for local captures
npm run screenshots
npm run screenshots -- --base-url https://your-site.example
```

| Option | Default | Does |
| --- | --- | --- |
| `--base-url <url>` | none | Capture a live site instead of the local preview |
| `--out <folder>` | `../sample-theme/screenshots` | Where to save the images |
| `--preview <folder>` | `../preview` | Which local preview to capture |
| `--browser msedge\|chrome` | `msedge` | Which installed browser to use. Nothing is downloaded |

It first deletes the images in the output folder, then captures the 15 screenshots declared in `theme.json` with the same file names: 1440px wide for desktop and 390px for mobile. Most are full pages; the home shots show the first screen, the footer shots start at the call-to-action band, and `navigation-mobile.png` has the menu open. It warns if the list it captures and the list in `theme.json` stop matching.

For local captures, run `npm run preview` first. If preview pages are missing, it stops before deleting anything.

**Before uploading:** Eyivo only accepts screenshots of a real site with `demo.json` loaded. Upload the theme, load the demo data on a site, then capture with `--base-url` so the final images replace the local ones.
