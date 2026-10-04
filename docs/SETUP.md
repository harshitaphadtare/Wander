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

## 3. Optional: sync phone ↔ laptop (Supabase)

Without this, each device keeps its own data (use **Settings → Export/Import backup**
to move it). With it, sign in with the same email on both and they stay in sync.

1. Sign up at https://supabase.com with GitHub (no card).
2. **New project**: any name, set a database password (save it somewhere), region **Sydney**.
3. **SQL Editor → New query**: paste all of [`supabase/schema.sql`](../supabase/schema.sql) and click **Run**.
4. **Send a login code instead of a link** (links open Safari instead of the
   home-screen app). Go to **Authentication → Emails → Magic Link** and set the body to:
   ```html
   <h2>Your Wander sign-in code</h2>
   <p style="font-size:28px;letter-spacing:4px"><strong>{{ .Token }}</strong></p>
   ```
5. **Project Settings → API Keys**: copy the **Project URL** and the **publishable** key
   (starts with `sb_publishable_`; the legacy `anon` key also works). Both are safe to put in
   front-end code, because row-level security stops anyone reading your rows.
6. **Locally:** copy `.env.example` to `.env.local` and fill in:
   ```
   VITE_SUPABASE_URL=https://xxxx.supabase.co
   VITE_SUPABASE_KEY=sb_publishable_...
   ```
   Restart `npm run dev`.
7. **On Vercel:** your project → **Settings → Environment Variables**, then add the same
   two variables and **redeploy** (they're baked in at build time).
8. In Wander: **Settings → Sync across devices**, enter your email, type the code you receive.
   Do this on each device.

**Free-tier notes:** Supabase pauses projects after about a week with no activity.
If sync shows an error after a break, open the Supabase dashboard and click **Restore**.
Your data is safe on your devices in the meantime. The built-in email sender only allows a
few emails an hour, which is plenty because you stay signed in.

---

## 4. Optional: your own routing key (openrouteservice + Cloudflare Worker)

The walk planner already works without this: it uses a free, keyless walking router.
Setting up your own gives you openrouteservice's dedicated quota (2,000 routes a day)
and is the part of the project that shows a real backend. The Worker exists only so
your key never appears in the app's code.

1. **Get a key:** sign up at https://openrouteservice.org/dev/#/signup (email, no card),
   then open **Dashboard → Tokens**, create a token (Standard plan) and copy it.
2. **Log in to Cloudflare from the terminal** (uses the account from step 2):
   ```bash
   cd worker
   npm install
   npx wrangler login
   ```
3. **Store the key as a secret** (paste it when asked):
   ```bash
   npx wrangler secret put ORS_API_KEY
   ```
4. **Allow your site:** in `worker/wrangler.jsonc`, add your Pages URL to `ALLOWED_ORIGINS`,
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
