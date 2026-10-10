# Optional accounts and sync (Google sign-in)

Tracewise works with none of this: it is local-first and fully offline. This turns on one optional feature: **Continue with Google** in Settings, which keeps your progress in sync across devices. If the two environment variables below are not set, none of the account code runs and nothing is sent anywhere.

How it works: progress stays in `localStorage` as the source of truth. When signed in, the app merges the cloud copy with the device's copy (XP, units, streaks and badges only ever move forward, see `src/account/merge.ts`) and writes the result back a few seconds after each change, when the tab is hidden, and when it regains focus. A guest who signs in for the first time keeps everything they already earned.

## 1. Supabase (free tier is enough)
1. Create a project at <https://supabase.com> (or reuse one: the table is named `tracewise_progress`, so it will not clash with other apps).
2. **SQL Editor**: paste and run `supabase/migrations/001_tracewise_progress.sql`. It creates the table with row level security so each user can only read and write their own row.
3. **Authentication, URL Configuration**: set **Site URL** to your deployed address and add these under **Redirect URLs**: your production URL, your preview wildcard (for example `https://*-yourname.vercel.app/**`), and `http://localhost:5173/**`.

## 2. Google
1. <https://console.cloud.google.com>, create or pick a project. **Google Auth Platform** (OAuth consent screen): External, app name Tracewise, keep only the default scopes `openid`, `email`, `profile`, then publish the app (Testing mode only lets listed test users in).
2. **Credentials, Create credentials, OAuth client ID, Web application**.
   - **Authorized JavaScript origins**: your production URL and `http://localhost:5173`.
   - **Authorized redirect URI**: exactly `https://<project-ref>.supabase.co/auth/v1/callback`.
3. In Supabase, **Authentication, Sign In / Providers, Google**: enable it and paste the Client ID and secret.

## 3. Environment variables
Both are public by design (row level security is the protection). Copy `.env.example` to `.env` for local runs, and add the same two names in Vercel under Project, Settings, Environment Variables, then redeploy (they are baked in at build time).

| Name | Value |
|---|---|
| `VITE_SUPABASE_URL` | `https://<project-ref>.supabase.co` |
| `VITE_SUPABASE_ANON_KEY` | the anon / publishable key from Supabase, Project Settings, API |

Never put the `service_role` key in a `VITE_` variable: everything with that prefix is shipped to the browser.

## 4. Check it
- `npm run dev`, open Settings, **Continue with Google**, sign in, and you land back on Settings showing your name and "Synced".
- In Supabase, Table editor, `tracewise_progress` has one row for you.
- Open the deployed site on another device, sign in with the same Google account: your XP and units appear.
- **Delete cloud copy** removes the row. **Reset everything** while signed in also removes it (otherwise the next sync would merge it back).

## Troubleshooting
| Symptom | Fix |
|---|---|
| `redirect_uri_mismatch` from Google | The redirect URI in Google must be exactly `https://<project-ref>.supabase.co/auth/v1/callback`. |
| Back from Google but still signed out | The page you came from is missing from Supabase **Redirect URLs** (include the `/**` wildcard form). |
| Vercel asks you to log in to Vercel | That is Vercel Deployment Protection on preview URLs, not this app. Use the production domain, or turn off Vercel Authentication under Project, Settings, Deployment Protection. |
| Settings shows "Sync problem" | Run the migration (table missing) or check the two variables; progress is still saved locally. |
| Sign-in does nothing inside LinkedIn/Instagram | Google blocks sign-in in in-app browsers; open the page in Chrome or Safari. |
