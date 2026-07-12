# HireTrack — Deployment

Free-tier stack: **React → Vercel**, **Django API → Render**, **Postgres → Neon**
(already live), **resume files → Cloudflare R2**.

## Continuous deployment (automatic)

After the one-time connection below, **every `git push` to `main` auto-deploys**:

- **Render** rebuilds and redeploys the API (`autoDeploy: true` in `render.yaml`).
- **Vercel** rebuilds and redeploys the frontend (Git integration, on by default).

So the day-to-day flow is just:

```bash
git add -A
git commit -m "…"
git push          # Render + Vercel deploy on their own
```

## One-time setup (per service — needs your dashboard login)

### 1. Render (backend)
1. Dashboard → **New → Blueprint** → select this repo (reads `render.yaml`).
2. In the service **Environment** tab, set the secrets (`sync:false` in the yaml):
   - `POSTGRES_DB=neondb`
   - `POSTGRES_USER=neondb_owner`
   - `POSTGRES_HOST=ep-lively-field-aol001fd.c-2.ap-southeast-1.aws.neon.tech`
   - `POSTGRES_PASSWORD=` *(from `backend/.env`)*
   - `DJANGO_CSRF_TRUSTED_ORIGINS=` your Vercel URL (step 3)
   - `CORS_ALLOWED_ORIGINS=` your Vercel URL (step 3)
   - `R2_BUCKET`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_ENDPOINT_URL` (step 2)
   - `DJANGO_SECRET_KEY` auto-generates; `DJANGO_ALLOWED_HOSTS` auto-injects.
3. Deploy → note the URL, e.g. `https://hiretrack-api.onrender.com`.

### 2. Cloudflare R2 (resume storage)
1. Create a bucket, e.g. `hiretrack-resumes`.
2. Create an **R2 API token** → Access Key ID + Secret.
3. Endpoint: `https://<account-id>.r2.cloudflarestorage.com`.
4. Add the four `R2_*` values to Render → it redeploys.

### 3. Vercel (frontend)
1. Import this repo → **Root Directory = `frontend`**.
2. Env var: `VITE_API_URL=https://<render-app>.onrender.com/api`.
3. Deploy → note `https://<app>.vercel.app`.
4. Put that URL into Render's `CORS_ALLOWED_ORIGINS` + `DJANGO_CSRF_TRUSTED_ORIGINS`.

### 4. Verify
Open the Vercel URL → log in with the existing Neon credentials → dashboard loads.
(The Neon DB already holds the data + admin user, so no migration/superuser step.)

## Notes
- Render free tier sleeps after ~15 min idle (~50 s cold start).
- Heuristic resume parser is the zero-cost default (`ANTHROPIC_API_KEY` empty).
- Existing resume *files* live on the old local disk, not R2 — re-upload if needed.
