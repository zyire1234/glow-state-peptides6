# Glow State Peptides

Premium peptide compounds storefront — Brisbane, Australia. Nationwide shipping, a real Django + SQLite backend (products, orders, bank transfer + PayPal Checkout payments), a reconstitution calculator, and a secure admin panel for managing products, orders, and activity logs.

See `backend/README.md` for backend setup, and the **Backend added** section below for how the frontend connects to it.

## Run locally

**Prerequisites:** Node.js

1. Install dependencies:
   `npm install`
2. Run the app:
   `npm run dev`

## Build

`npm run build` outputs a static site to `dist/`.

## Deploy to Netlify

This repo is Netlify-ready out of the box via `netlify.toml`:
- Build command: `npm run build`
- Publish directory: `dist`
- SPA redirect (`/* -> /index.html`) is already configured.

No environment variables or server configuration are needed either way.

### Option A — Connect a Git repo (recommended, auto-redeploys on push)
1. Push the contents of this folder to a new GitHub/GitLab/Bitbucket repo (the files should sit at the **repo root** — don't nest them in a subfolder).
2. In Netlify: **Add new site → Import an existing project**, pick the repo.
3. Netlify will auto-detect the build command (`npm run build`) and publish directory (`dist`) from `netlify.toml` — just click **Deploy**.

### Option B — Drag-and-drop (fastest, no Git required)
1. Run `npm install` then `npm run build` locally (or use the pre-built `dist` folder already provided alongside this project).
2. Go to [app.netlify.com/drop](https://app.netlify.com/drop) and drag the `dist` folder onto the page.
3. Your site is live immediately at a generated `*.netlify.app` URL — you can rename it or attach a custom domain from the site settings.

> Option B deploys a snapshot only — if you make further code changes you'll need to rebuild and re-drag the `dist` folder. Option A keeps redeploying automatically whenever you push to Git.


## Admin panel

Click the admin/lock icon in the site header to sign in.

- Username: `admin`
- Password: `glowstate2026` (first-login default only — see below)

From there you can manage products, review order requests, update order status, and preview order-confirmation email activity — all persisted in the real Django + SQLite backend.

**Important — change the default password immediately.** The default credentials above are only used to seed a brand-new database on first `seed_data` run. Once logged in, go to the **Account Security** tab and set your own password — it's hashed (bcrypt-style via Django's password hasher) and stored server-side.

---

## Backend added (Django + SQLite)

This project now has a real backend in `backend/` — see `backend/README.md`
for setup and Render deployment steps. The frontend was not redesigned or
restructured; the only changes were:

1. Removed the `localFetch` mock import in `App.tsx` and `AdminPanel.tsx`
   (2 lines each) so the app's existing `fetch('/api/...')` calls hit the
   real network instead of the in-browser mock.
2. Added an `/api/*` proxy redirect in `netlify.toml` pointing at the Render
   backend URL (fill in your actual URL after deploying).

Everything else — components, styles, routes, file names — is untouched.
