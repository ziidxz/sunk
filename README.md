# Sunk

A private subscription ledger. It shows what leaves every month, what renews
next, what changed price, and what cancelling gives back. No account, no bank
login, no analytics, and no server-side copy of the ledger.

Public site, once deployed: <https://ziidxz.github.io/sunk/>

## Editions

| | Free web edition | Offline edition |
| --- | --- | --- |
| Price | $0 | $12 once |
| Where it runs | `docs/app/` | one HTML file |
| Subscriptions | 5 | unlimited |
| Manual entry | yes | yes |
| CSV import | no | yes |
| `.ics` reminders | no | yes |
| Calendar view | yes | yes |
| JSON backup and restore | yes | yes |
| Account or activation | none | none |

The free edition is the full ledger with a five-subscription ceiling. The paid
edition is bundled from the same source into a single file with the import and
calendar-export paths enabled. There is no license server and no technical
lock; the license is an agreement, and the file is sold as a convenience.

## Development

Requirements: Node.js 20 or newer. The runtime has no dependencies. `happy-dom`
is the only development dependency.

```sh
npm install
npm test          # builds the site, then runs core, UI and offline tests
npm run build     # writes docs/ and dist/
npm run dev       # serves docs/ at http://127.0.0.1:8080/
```

`PORT` and `HOST` change the development server bind address:

```sh
PORT=9000 HOST=0.0.0.0 npm run dev
```

## Layout

```
src/                 app source
  index.html         app shell and dialogs
  theme.css          colour, type and shared controls
  app.css            app layout
  core.js            money, cycles, totals, CSV, recurring detection, ICS
  store.js           localStorage load/save/normalise
  ui.js              routing, rendering and every interaction
  sw.js              service worker for the hosted app
  manifest.webmanifest
  icon.svg, *.png
test/                node:test suites
  core.test.js       business logic
  ui.test.js         happy-dom end-to-end app tests
  offline.test.js    the built single file
tools/
  build.mjs          docs/ and dist/ builder, link checker
  icons.mjs          reproducible PNG icons
  OFFLINE-README.txt buyer readme template
site/                public marketing site and legal pages
docs/                generated GitHub Pages output (committed)
dist/                generated paid bundle (not committed)
server.mjs           zero-dependency static server for docs/
```

`docs/` is generated. Edit `site/` or `src/`, then run `npm run build`; do not
hand-edit `docs/`.

## What the build does

1. Copies `site/` to `docs/`.
2. Copies the hosted app to `docs/app/`.
3. Inlines `theme.css`, `app.css`, `core.js`, `store.js`, `ui.js`, the SVG icon
   and the touch icon into `dist/sunk-offline.html`, and sets the pro edition
   flag before the app runs.
4. Rewrites the offline file's navigation links to the public site so the
   single file has no broken relative links.
5. Checks every local `href` and `src` in `docs/` and fails on a missing target.

Dollar amounts are stored as integer minor units. Cycles are converted with
calendar-aware date arithmetic, not fixed day counts. The ledger is kept in
`localStorage` under `sunk.v1`; the theme is kept under `sunk.theme`.

## Deploying

The site is plain static files. On GitHub Pages:

1. Push the repository to GitHub.
2. Set Pages to deploy from the `main` branch, `/docs` folder.
3. Wait for the build, then open <https://ziidxz.github.io/sunk/>.

`docs/.nojekyll` is written by the build so the folder is served as-is.

## Orders

Card checkout is not connected yet. `site/order.html` describes a manual email
order path: the buyer writes to `ziidcxz@gmail.com`, receives the payment method
and total, pays, and gets the HTML file and `README.txt` by email. The paid
bundle is generated with `npm run build` and kept out of Git.

Before switching to card checkout, connect a payment provider and replace the
email steps on the order page with the provider's checkout link. The price,
refund window and delivery promise should stay in one place.

## Privacy and limits

- The free app stores data in the browser. Clearing site data deletes it.
- The app registers a service worker only over `http:` or `https:`, never from
  `file://`.
- The offline app skips service-worker registration and makes no network
  requests of its own.
- A phone and a laptop do not sync. A JSON backup moves the ledger between them.
- Some browsers restrict `localStorage` for `file://` pages. The offline README
  tells buyers to keep a JSON backup and what to do if saving is blocked.
- The ledger is a record, not a cancellation service. It cannot cancel anything
  with a provider.

## License

Copyright 2026 the maker of Sunk. All rights reserved. The source is published
for transparency and review; the offline edition is licensed for one person's
personal use under the terms at <https://ziidxz.github.io/sunk/terms.html>.
