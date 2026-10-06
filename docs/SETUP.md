# Wander setup guide

Everything here is free and none of it needs a credit card. Steps 1–2 get the app
onto your iPhone. Step 3 (sync) is optional; do it once you want your phone and
laptop to share data.

---

## 1. Run it on your laptop

```bash
npm install
npm run dev
```

Open http://localhost:5173. On a laptop, location is approximate (Wi-Fi based).
Long-press or right-click the map to drop a pin, and use search to jump around.

**Simulating GPS (dev only):** in the browser console run
`__wanderFix(-37.8678, 144.976)` to place yourself anywhere.

---

## 2. Put it on your iPhone (Vercel)

iPhone Safari only gives location to **https** sites, so the phone needs a real
deployed URL.

1. **Push the code to GitHub.** Create an empty repo on github.com (e.g. `wander`), then:
   ```bash
   git remote add origin https://github.com/<you>/wander.git
   git push -u origin main
   ```
2. **Sign up at https://vercel.com** with **Continue with GitHub** (the free Hobby plan needs no card).
3. **Add New → Project**, then import your `wander` repo. Vercel reads `vercel.json`, so the settings
   fill themselves in (Framework **Vite**, build `npm run build`, output `dist`). Leave
   **Root Directory** as `./`.
4. **Environment Variables** (optional; only for sync or your own routing key):
   `VITE_SUPABASE_URL`, `VITE_SUPABASE_KEY`, `VITE_API_URL`. These are read at build time, so
   **Redeploy** after adding or changing one.
5. **Deploy.** You get a URL like `https://wander-xyz.vercel.app`. Every `git push` to `main`
   redeploys automatically, and other branches get preview URLs.
6. **On your iPhone:** open that URL in **Safari**, tap **Share → Add to Home Screen**,
   then open Wander from the new icon. When asked, allow location (**While Using the App**).

> **After each deploy:** the installed app updates itself, but iOS may keep the old version until
> you fully close Wander (swipe it away in the app switcher) and reopen it.

<details><summary>Prefer Cloudflare Pages instead?</summary>

**Workers & Pages → Create → Pages → Connect to Git**, then set build `npm run build`, output `dist`,
and the variable `NODE_VERSION=22`. You'll get a `*.pages.dev` URL.
</details>

> Why install to the home screen: it runs full-screen, works offline, and Safari's
> "delete site data after 7 days of no use" rule doesn't apply to home-screen apps.

### Quick phone test without deploying (optional)

```bash
npm run dev
```

Then in a second terminal (no account needed):

```bash
npx cloudflared tunnel --url http://localhost:5173
```

Open the printed `https://….trycloudflare.com` URL on your phone. It's a temporary URL,
so don't install from it, because data saved there won't carry over to the real one.

---

## 3. Accounts and sync (Supabase)

Without this, Wander runs on-device only: the landing page's **Try it without an account**
opens the map, and **Settings → Export/Import backup** moves data between devices. With it you
get the sign-in screen (Google, or email + password with reset) and encrypted phone ↔ laptop sync.

1. Sign up at https://supabase.com with GitHub (no card).
2. **New project**: any name, set a database password (save it somewhere), region **Sydney**.
3. **Database tables:** set up the automatic schema update below (recommended), or once by hand:
   **SQL Editor → New query**, paste all of [`supabase/schema.sql`](../supabase/schema.sql) and
   click **Run**. It's safe to re-run.

   **Apply database changes automatically on deploy (recommended).** Every production deploy on
   Vercel runs [`scripts/apply-schema.mjs`](../scripts/apply-schema.mjs), which sends
   `schema.sql` to your project through Supabase's API in one transaction (all or nothing).
   It never blocks a deploy: if it can't run, the build log says why and the app still goes live.
   One-time setup:
   1. In Supabase, click your **profile picture** (top right) → **Account preferences** →
      **Access Tokens** → **Generate new token**. Name it `Vercel deploy`. Under **Resource
      access** choose **Project** and pick your organization and the **wander** project. Under
      **Permissions → Database**, set the **Database** row ("Database access and data
      operations") to **Read & write** and leave everything else as **None**. **Review access**
      should list only Database (read-write) on wander, with `execute_sql` among its tools.
      **Create token** and copy it (it's shown only once).
   2. In Vercel: your project → **Settings → Environment Variables** → add
      `SUPABASE_ACCESS_TOKEN` with the token as the value. Tick **Production** only, then **Save**.
   3. **Deployments** → **⋯** on the latest one → **Redeploy**. In the build log you should see
      `[schema] supabase/schema.sql applied to project …`.

   That token can run any SQL on your database (it's limited to the wander project), so it only
   goes in Vercel's settings: never in `.env` files, never with a `VITE_` prefix (that would put
   it in the app).
4. **Project Settings → API Keys**: copy the **Project URL** and the **publishable** key
   (starts with `sb_publishable_`; the legacy `anon` key also works). Both are safe to put in
   front-end code, because row-level security stops anyone reading your rows.
5. **Locally:** copy `.env.example` to `.env.local` and fill in:
   ```
   VITE_SUPABASE_URL=https://xxxx.supabase.co
   VITE_SUPABASE_KEY=sb_publishable_...
   ```
   Restart `npm run dev`. **On Vercel:** add the same two under **Settings → Environment
   Variables** and **redeploy** (they're baked in at build time).
6. **Redirect URLs** (needed for Google, confirmation and password-reset links):
   **Authentication → URL Configuration**. Set **Site URL** to your Vercel URL
   (e.g. `https://wander-xyz.vercel.app`) and add these under **Redirect URLs**:
   ```
   http://localhost:5173/**
   https://wander-xyz.vercel.app/**
   ```
7. **Password rules:** **Authentication → Sign In / Providers → Email**. Set **Minimum password
   length** to `10` and **Password requirements** to *Lowercase, uppercase, digits and symbols*.
   This matches the app's checks, so they're also enforced by the server. (The app also checks
   new passwords against Have I Been Pwned's breach list. Only the first five characters of the
   password's hash leave the device.)
8. **Email confirmation and reset emails:** on the same page, decide whether **Confirm email**
   stays on. Supabase's built-in mailer only delivers to your own project's team members and
   sends a few emails an hour. That's fine while it's just you, but before other people sign up,
   add free SMTP under **Authentication → Emails → SMTP Settings**. [Brevo](https://www.brevo.com)
   gives 300 emails a day with no card: verify your sender address, then paste the SMTP host,
   port, login and key it gives you.

### Google sign-in

1. Go to https://console.cloud.google.com (no billing account needed), create a project, then
   open **APIs & Services → OAuth consent screen**. Choose **External**, fill in the app name
   and your email, and add yourself as a **Test user** (or publish the app).
2. **Credentials → Create credentials → OAuth client ID → Web application.** Under
   **Authorised redirect URIs**, add the callback URL shown in Supabase at
   **Authentication → Sign In / Providers → Google** (it looks like
   `https://xxxx.supabase.co/auth/v1/callback`).
3. Copy the **Client ID** and **Client secret** into that Supabase Google provider page,
   enable it and save.

> **iPhone home-screen app:** Google sign-in leaves the app for Google's page. iOS normally
> brings you back signed in, but some iOS versions finish the sign-in in a Safari sheet instead.
> If that happens, use email + password in the installed app. They're the same account if you
> used the same email.

### How your data is protected

- **In transit:** everything goes over HTTPS/TLS.
- **Encrypted before upload:** each place, visit, walk and pick is encrypted on the device with
  AES-256-GCM (`src/lib/crypto.ts`). The `records` table only stores ciphertext, plus the row id,
  timestamps and deleted flag that sync needs. The database rejects new plaintext rows.
- **Per-user keys:** each account's key is derived from a root secret in **Supabase Vault**,
  and only that signed-in user can fetch it (`data_key()` in the schema). So a leaked table,
  backup or log can't be read. Keys survive password resets and work the same for Google
  accounts. This protects against leaks, not against Supabase itself: a fully zero-knowledge
  design would need a separate passphrase you could never recover.
- **Row-level security:** every query only sees the signed-in user's rows.
- **Passwords:** hashed with bcrypt by Supabase Auth, never stored by Wander.
- **On the device:** data in IndexedDB is protected by your phone's or laptop's own disk
  encryption (iPhone passcode, BitLocker, FileVault).

> **Never delete or rotate** the `wander_data_key_root` secret in Vault: synced data
> encrypted with it would become unreadable. Each device still keeps its own copy, though.

**Free-tier notes:** Supabase pauses projects after about a week with no activity.
If sync shows an error after a break, open the Supabase dashboard and click **Restore**.
Your data is safe on your devices in the meantime.

---

## 4. Optional: your own routing key (openrouteservice + Cloudflare Worker)

The walk planner already works without this: it uses a free, keyless walking router.
Setting up your own gives you openrouteservice's dedicated quota (2,000 routes a day)
and is the part of the project that shows a real backend. The Worker exists only so
your key never appears in the app's code.

1. **Get a key:** sign up at https://openrouteservice.org/dev/#/signup (email, no card),
   then open **Dashboard → Tokens**, create a token (Standard plan) and copy it.
2. **Create a free Cloudflare account** at https://dash.cloudflare.com/sign-up (email only, no card),
   then log in to it from the terminal:
   ```bash
   cd worker
   npm install
   npx wrangler login
   ```
3. **Store the key as a secret** (paste it when asked):
   ```bash
   npx wrangler secret put ORS_API_KEY
   ```
4. **Allow your site:** in `worker/wrangler.jsonc`, add your Vercel URL to `ALLOWED_ORIGINS`,
   e.g. `"http://localhost:5173,https://wander-xyz.vercel.app,https://wander-*-yourname.vercel.app"`
   (the second pattern covers Vercel preview deployments).
5. **Deploy:**
   ```bash
   npm run deploy
   ```
   It prints a URL like `https://wander-api.<you>.workers.dev`. Opening `/health` on it should
   show `{"ok":true,"ors":true}`.
6. **Point the app at it:** add `VITE_API_URL=https://wander-api.<you>.workers.dev` to
   `.env.local` *and* to Vercel → Settings → Environment Variables, then redeploy.

### AI picks and Wander Wrapped (optional, Gemini)

Explore, the "Explore next" picks and Wrapped all work without AI: Wander ranks real
OpenStreetMap places itself and writes plain reasons. With a Gemini key, the AI re-ranks
those same real places and writes the reasons and the Wrapped recap. It can't add places.

1. Get a free key at https://aistudio.google.com/apikey (Google account, no card).
2. Store it on the Worker (it never goes in the app):
   ```bash
   cd worker
   npx wrangler secret put GEMINI_API_KEY
   npm run deploy
   ```
3. `/health` on your Worker should now show `"ai":true`.

On the free tier Google may use what's sent to improve its models. Wander only sends place
names, kinds of place, rough distances and visit counts: never coordinates or your GPS trail.

**Running the Worker locally (optional):** copy `worker/.dev.vars.example` to `worker/.dev.vars`,
put your key in it, run `npm run dev` inside `worker/`, and set `VITE_API_URL=http://localhost:8787`.

---

## Phase 1 gate: real-world test on your phone

Before moving on to the walk planner, check these on an actual walk:

- [ ] App opens from the home-screen icon, full-screen, and the blue dot finds you
- [ ] **Check in** suggests the café/park you're actually at
- [ ] Second visit to the same place turns it into a ⭐ Favourite
- [ ] Reopening the app at a saved place shows the “You're at…” card
- [ ] Turn on Airplane mode → app still opens, places and history still show
- [ ] Export a backup and find it in the Files app

## Phase 2 gate: walk planner

- [ ] Open a place → **Walk here** draws the route with time, distance and arrival time
- [ ] Cafés and restaurants along the route appear in the list and as markers on the map
- [ ] Changing **Leaving** to later greys out places that will be closed by then
- [ ] Picking a café reshapes the route through it and shows how much time it adds
- [ ] **Start walk**, lock your phone, walk a bit, reopen Wander → the banner shows time left
- [ ] Arriving shows “You've arrived” with a one-tap **Check in**
