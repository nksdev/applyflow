# ApplyFlow — Private Job Application Tracker

ApplyFlow is an offline-first job application tracker for managing company details, application stages, follow-up dates, interview notes, and job links. It is a static web app with **zero runtime dependencies**: no backend, account, API key, paid service, or external database is required.

## Features

- Dashboard with application, interview, offer, follow-up, and pipeline counts.
- Add, edit, and delete applications with company, role, stage, priority, location, source, dates, URL, and notes.
- Search across company, role, location, source, and notes; filter by status; sort by update date, applied date, company, or follow-up date.
- Dedicated follow-up queue, including overdue follow-ups.
- Export a JSON backup or spreadsheet-ready CSV; import JSON backups in merge or replace mode.
- Dark/light themes, responsive layout, keyboard-friendly forms, and confirmation before destructive actions.
- PWA shell caching for offline app access after the first successful load.
- Local-first storage: application records are saved in `localStorage` and are not sent to an ApplyFlow server.
- Formula-injection precautions in CSV export and URL protocol validation.
- Automated tests for data validation, filters, statistics, import and export handling.

## Run locally

Requirements: Node.js 18 or newer (only required to run tests).

1. Open a terminal in the project directory.
2. Start a static server:

   ```bash
   python3 -m http.server 8000
   ```

3. Visit `http://localhost:8000`.

Service workers require HTTPS or localhost. Opening `index.html` as a `file://` URL can show the interface, but offline caching will not activate.

## Test and validate

Run these commands from the repository root:

```bash
npm run check
```

No package installation is needed. Tests use Node's built-in test runner.

## Deploy to GitHub Pages

The application source and deployment workflow are already in this repository. One GitHub Pages setting still needs to be enabled before the first deployment.

1. Open this repository's **Settings → Pages**.
2. Under **Build and deployment**, set **Source** to **GitHub Actions** and save.
3. Return to the [Actions tab](https://github.com/nksdev/applyflow/actions) and re-run the failed **Deploy ApplyFlow to GitHub Pages** workflow, or push a new commit to `main`.
4. After a successful deployment, the expected public URL is `https://nksdev.github.io/applyflow/`.

The **ApplyFlow checks** workflow separately runs JavaScript syntax checks and unit tests for changes. The deploy workflow cannot complete until GitHub Pages is enabled for this repository.

## Privacy and limitations

- Records and the theme preference are stored in the current browser profile on the current device. Clearing site data removes them. Use JSON export for backup; there is no cloud sync.
- Imported JSON files are validated, bounded to 5,000 records / 5 MB on the UI, and normalised before saving.
- This is a personal tracker, not a multi-user service. Anyone with access to the same unlocked browser profile may be able to view its records.
- The app loads no third-party scripts, fonts, analytics, or APIs. It uses installed system fonts for a network-independent interface.
- Tests cover the domain logic. Before relying on a deployment, run the UI in your target browser and verify import/export and service-worker behaviour there.

## Project structure

```text
.
├── index.html
├── styles.css
├── app.js
├── core.js
├── sw.js
├── manifest.webmanifest
├── icon.svg
├── package.json
├── LICENSE
├── .github/workflows/
│   ├── applyflow-tests.yml
│   └── deploy-pages.yml
└── tests/core.test.js
```

## License

MIT. See `LICENSE`.
