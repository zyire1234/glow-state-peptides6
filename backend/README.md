# Glow State Peptides — Backend (Django + SQLite)

Real backend for the existing frontend, replacing the localStorage mock. No
frontend design, structure, or file names were changed — only the
`localFetch` import in `App.tsx` / `AdminPanel.tsx` was swapped for native
`fetch`, and the Netlify redirect was updated to proxy `/api/*` to this
service.

## Stack
- Python / Django (plain views — no DRF needed for this API surface)
- SQLite (file-based, works out of the box on Render's persistent disk)
- django-cors-headers for cross-origin requests from the Netlify frontend
- gunicorn + whitenoise for production serving

## API surface

Matches the original mock exactly:
- `POST /api/auth/login`, `GET /api/auth/me`, `POST /api/auth/change-password`
- `GET/POST /api/products`, `GET/PUT/DELETE /api/products/<id>`
- `POST /api/orders` (public), `GET /api/orders` (admin), `PUT /api/orders/<id>/status`
- `GET /api/activities`
- `GET /api/email-preview`

Added (no frontend UI calls these yet, but they're fully working and ready
for future admin-panel screens):
- `GET/POST /api/deliveries`, `GET/PUT /api/deliveries/<id>`, `PUT /api/deliveries/<id>/status`
- `GET /api/customers` — derived from order history (name, email, address, order count, lifetime spend)
- `GET /api/analytics/best-sellers` — real units-sold ranking from order history
- `GET /api/analytics/sales` — total orders, total revenue, breakdown by status

Payment system:
- `GET /api/payment-details` — public. Returns the bank transfer details and
  PayPal client ID, all editable from Django admin (`PaymentDetails` model,
  a singleton row). The frontend checkout page fetches this instead of any
  hardcoded values.
- `POST /api/paypal/create-order` — creates a real PayPal order (Orders v2
  API) for a given local `order_id`, returns the PayPal order ID for the JS SDK.
- `POST /api/paypal/capture-order` — captures the PayPal payment server-side,
  verifies it's `COMPLETED`, then marks the local order `paid`, stores the
  PayPal transaction ID, and timestamps `paid_at`.

Auth is Bearer-token based: `POST /api/auth/login` returns a `token`, which
the frontend already sends as `Authorization: Bearer <token>` on every admin
call — no frontend change was needed for this part.

## Local setup

```bash
cd backend
python -m venv venv && source venv/bin/activate
pip install -r requirements.txt
cp .env.example .env   # edit as needed
python manage.py migrate
python manage.py seed_data     # creates default admin + starter products
python manage.py runserver
```

Default admin login (change immediately after first login, via the existing
Account Security tab): `admin` / `glowstate2026` (override via
`ADMIN_DEFAULT_USERNAME` / `ADMIN_DEFAULT_PASSWORD` before the first
`seed_data` run).

## Deploy to Render

1. Push this `backend/` folder (or the whole repo) to GitHub.
2. In Render: **New → Web Service**, connect the repo, root directory `backend/`.
3. Render will pick up `render.yaml` automatically (Blueprint), or set manually:
   - Build command: `./build.sh`
   - Start command: `gunicorn core.wsgi:application`
   - Add a **1GB persistent disk** mounted at `/var/data` (keeps `db.sqlite3`
     across redeploys) and set `DJANGO_DB_PATH=/var/data/db.sqlite3`.
4. Set environment variables (see `.env.example`):
   - `DJANGO_SECRET_KEY` — generate a random string
   - `CORS_ALLOWED_ORIGINS` — your Netlify URL, e.g. `https://glow-state-peptides.netlify.app`
   - `PAYPAL_CLIENT_ID` / `PAYPAL_CLIENT_SECRET` — from a PayPal REST app
     (developer.paypal.com) tied to `Glowstatepeps@hotmail.com`. Without
     these, bank transfer still works fully; the PayPal button will show a
     "not configured" notice until they're set.
5. Deploy. Once live, copy the Render URL into `netlify.toml`'s `/api/*`
   redirect target and redeploy the frontend on Netlify.
6. After the first deploy, log into `/django-admin/`, open **Payment
   Details**, and confirm the bank account + PayPal Client ID are correct
   (seeded automatically from `seed_data`, editable any time).

## Notes

- SQLite is used as required. For a single small store this is fine on
  Render's persistent disk; if you ever need multiple server instances,
  SQLite won't scale past one writer — Postgres would be the upgrade path.
- Email notifications are logged to the Activity feed either way (matching
  the original mock). Set `EMAIL_ENABLED=True` plus the `SMTP_*` variables
  to also actually send them.
- Rate limiting is applied to the login endpoint (10 attempts/minute/IP) to
  slow down brute-force attempts.
