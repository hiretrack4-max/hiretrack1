# HireTrack — Frontend

A premium React + TypeScript single-page app for the HireTrack HR Recruitment
Portal. Built with Vite, Tailwind CSS, TanStack Query, React Router and Recharts.

This is **Pass 1**: the foundation, design system, app shell, authentication and
the Dashboard (Module 7). Jobs, Candidates, Reports, Search and Notifications are
elegant placeholders to be filled in Pass 2.

## Prerequisites

- **Node.js 18+** and npm.
- The **HireTrack Django backend running on `http://localhost:8000`** with a valid
  HR user. Start it first — the frontend proxies all `/api` calls to it.

## Getting started

```bash
cd frontend
npm install
npm run dev
```

Open **http://localhost:5173** and sign in with your Django HR user's username and
password.

### How it talks to the backend

- The Vite dev server proxies `/api/*` → `http://localhost:8000` (see
  `vite.config.ts`), so requests are same-origin in development — cookies and
  HTTP Basic auth flow cleanly with no CORS preflight.
- Auth uses **HTTP Basic** (DRF `BasicAuthentication`). Credentials are captured
  at login, validated against `GET /api/notifications/unread_count/` (200 = valid,
  401 = invalid), then kept in memory + `localStorage` and attached as an
  `Authorization: Basic …` header on every request. A 401 anywhere forces a
  logout and redirect to `/login`.

> Run the backend **before** the frontend. If login reports it "couldn't reach the
> server", the Django server on :8000 isn't up.

## Scripts

| Command           | Description                                  |
| ----------------- | -------------------------------------------- |
| `npm run dev`     | Start the Vite dev server on :5173           |
| `npm run build`   | Type-check and build for production          |
| `npm run preview` | Preview the production build                 |
| `npm run lint`    | Run ESLint                                    |

## Design system

- **Brand:** indigo-violet `#6D5EF6` with a signature gradient to blue `#4F8CFF`
  and a warm coral accent `#FF7A59`. A deep midnight sidebar `#12132A`.
- **Fonts:** Space Grotesk (display / headings), Inter Variable (body) — both
  self-hosted via `@fontsource`, no runtime CDN.
- **Tokens:** brand/status/job colours live in `tailwind.config.ts`; theme-aware
  surface/ink/border tokens are CSS variables in `src/index.css` and flip for
  dark mode. Status colours (the nine pipeline stages + job statuses) are the
  single source of truth in `src/constants/statuses.ts`, shared by `StatusPill`
  and the charts.
- **Dark mode:** Tailwind `darkMode: 'class'`, toggled from the topbar and
  persisted to `localStorage` (applied pre-paint to avoid a flash).

## Project structure

```
src/
  components/
    ui/           reusable primitives (Button, Card, StatusPill, Table, Modal, …)
    layout/       Sidebar, Topbar, AppLayout, Logo, nav
    dashboard/    KpiCard, ChartCard, ChartTooltip
    RequireAuth.tsx
  context/        Auth, Theme, Toast providers
  hooks/          useDashboard, useNotifications (TanStack Query)
  lib/            api.ts (axios + Basic auth), queryClient, utils
  types/          API response types
  constants/      status → colour/label maps
  pages/          Login, Dashboard, + placeholder feature pages
```
