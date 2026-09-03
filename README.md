# Sahara Public School — Frontend

React + Vite + Tailwind. Runs against `Sps-backend`.

---

## Running it

```bash
npm install
npm run dev          # http://localhost:5173
```

The dev server proxies `/api` to `localhost:8000` (see `vite.config.js`).
That means development behaves the same way production will — same origin, so
the refresh cookie stays first-party and there is no CORS preflight before
every request.

The backend needs to be running first:

```bash
cd ../Sps-backend && npm run dev
```

---

## How it is put together

```
src/
├─ lib/
│  ├─ api.js          axios + refresh queue + error normalisation
│  ├─ queryClient.js  TanStack Query defaults
│  ├─ cloudinary.js   browser-side compression + signed direct upload
│  └─ format.js       rupees, dates, month keys — all in one place
├─ store/auth.js      user + permissions (zustand)
├─ hooks/queries.js   EVERY API call — screens never touch axios directly
├─ components/
│  ├─ ui.jsx          Button, Input, Table, Card, Pill, Modal, Meter…
│  ├─ Layout.jsx      permission-driven sidebar
│  ├─ Can.jsx         RequireAuth · RequirePermission · Can
│  ├─ Toast.jsx
│  └─ ImageUpload.jsx
└─ pages/             12 screens, each lazy-loaded
```

---

## Four things done deliberately

**1. The menu is permission-driven, not role-driven.**
In `Layout.jsx` each nav item asks for its capability (`fee.view`,
`salary.view`…) — the same one the backend route asks for. When the Admin
flips a switch in Settings the menu changes by itself. There is no hardcoded
list of roles anywhere.

**2. The refresh queue.**
Opening the dashboard fires five requests. If the token has expired all five
return 401. Without a queue all five would call refresh — and because the
backend **rotates** the token on every refresh, the first would invalidate the
other four. The result is random logouts that are impossible to debug. In
`api.js` the first 401 creates one refresh promise and the rest await it.

**3. Access token in memory, refresh token in an httpOnly cookie.**
Keeping a token in localStorage leaves the door open to XSS. On a page reload
the access token is gone and the app recovers the session with a silent
refresh (`bootstrap()`).

**4. Images never pass through the server.**
`cloudinary.js` downscales and re-encodes in the browser via canvas (a 4MB
phone photo becomes ~250KB), then does a signed direct upload. That bypasses
Vercel's 4.5MB body cap, halves the bandwidth, and keeps the API secret away
from the client.

---

## UI rules

- **Every status pill carries text**, not just colour — for colour-blind users,
  and so it still works in print and photocopies. The attendance P/A/H/L
  buttons carry their letter for the same reason.
- **Amounts always use `tnum`** (tabular numbers) so digits line up in columns;
  without it an amount table is hard to read.
- **Wide tables scroll inside their own container**; the page body never
  scrolls horizontally.
- **Receipts and salary slips print from the browser** (`@media print`) — no
  server-side PDF generation, and none of that dependency's cold-start cost.
- **Error messages say what to fix**, never just "invalid". Field-level errors
  from the backend appear directly on the form fields.

---

## Build

```bash
npm run build        # dist/
```

Each page is its own chunk — an Accountant never downloads the salary bundle.
Vendor (React, Router) and query (TanStack, axios) are separate chunks, so
changing app code does not invalidate the user's cached vendor bundle.

---

## Deploying

Keep the frontend and the API in one Vercel project. Then `VITE_API_URL` stays
empty, the cookie stays first-party, and CORS preflight never happens.

If they must live on different domains: set `VITE_API_URL` **and** set
`COOKIE_SAMESITE=none` in the backend's `.env` — otherwise the browser will not
send the refresh cookie on a cross-site request, and users will be logged out
every 15 minutes.
