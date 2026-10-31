# Agent instructions

This repository is a starting point for Eyivo themes. The theme is `sample-theme/`; `tools/` holds optional helpers.

This file is the single source of agent instructions. The tool-specific files (`CLAUDE.md`, `GEMINI.md`, `.cursor/rules/`, `.github/copilot-instructions.md`, `.windsurf/rules/`, `.clinerules/`, `.junie/`, `.aider.conf.yml`) only point here, so edit this file, not those.

## Required: ask the user about the theme identity

The theme's identity is the `key`, `name` and `version` fields at the top of `sample-theme/theme.json`. The original Eyivo sample ships with these defaults:

```json
"key": "eyivo-sample-theme",
"name": "Eyivo Sample Theme",
"version": "1.0.0",
```

Before you change anything else in the theme, check the three fields. If `key` is still `eyivo-sample-theme` or `name` is still `Eyivo Sample Theme`, stop and ask the user what they should be. Do not continue with the task until the user has answered.

- **Never choose these values yourself.** Do not invent a key or name from the task, the folder name, the company in `demo.json`, or anything else. Ask, and use exactly what the user gives you.
- **Ask every time a session starts work on the theme**, even if a previous session already asked. If the values have already been changed from the sample defaults, confirm them with the user instead of assuming they are still right.
- **Ask about `version` before every pack or upload.** Eyivo rejects a new upload of the same theme unless `version` is higher. Suggest the next version, for example `1.0.0` → `1.0.1` for fixes or `1.1.0` for new features, and let the user decide.
- If the user declines to change a value, keep it as it is and mention once that it is still the sample default.

Format rules, which `run-eyivo-theme.mjs validate` enforces:

| Field | Rule | Example |
| --- | --- | --- |
| `key` | lowercase letters, numbers and single hyphens | `acme-energy` |
| `name` | any non-empty text, shown in the Eyivo panel | `Acme Energy` |
| `version` | semantic version `MAJOR.MINOR.PATCH` | `1.0.0` |

When you ask, ask for all three in one question, show the current values, and give the format rules. After the user answers, update `sample-theme/theme.json` and run the validator.

## Checking your work

```bash
node tools/run-eyivo-theme.mjs validate
```

Run it after every change to the theme. `tools/README.md` describes the preview and screenshot scripts.
