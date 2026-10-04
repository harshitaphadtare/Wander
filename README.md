# Wander

A personal explore map that remembers where you go, turns repeat visits into
favourites, and (soon) nudges you to explore somewhere new. It's a PWA built for the
iPhone home screen that also works as a website on a laptop. It costs $0 to run and
needs no API keys for the core app.

**Setup and deployment:** see [docs/SETUP.md](docs/SETUP.md).

## Phase 1 (MVP): built

| Feature | How |
| --- | --- |
| Live map with your location | MapLibre GL JS + OpenFreeMap tiles + Geolocation API |
| Search places | Photon geocoder, biased to where you are |
| **Check in** | Suggests your saved places nearby, then named OSM places, or a custom name |
| "You're at…" card | Opening the app near a saved place offers a one-tap check-in |
| Auto-detect visits | Within ~75 m for 10+ min while the app is open (Turf.js distance) |
| Favourites and levels | 1 visit = Visited · 2 = ⭐ Favourite · 5 = ☕ Regular · 10 = 👑 Local legend |
| Journal | Timeline by week/month/year with visit, place and new-spot counts |
| Drop a pin | Long-press (phone) or right-click (laptop) |
| Design | Geist + Instrument Serif, lucide icons, Motion spring animations, glass UI |
| Level-up moments | Confetti and a badge when a place becomes a Favourite, Regular or Local legend |
| EatClub reminder | A note on café/restaurant cards (no EatClub data is fetched) |
| Offline and installable | vite-plugin-pwa; recently viewed map tiles are cached |
| Backup / restore | JSON export (share sheet on iPhone) and merge-import |
| Optional cloud sync | Supabase, email-code sign-in, last-write-wins merge |

## Phase 2: walk planner (built)

| Feature | How |
| --- | --- |
| Walking route A → B | openrouteservice `foot-walking` via the Cloudflare Worker; falls back to the keyless FOSSGIS OSRM foot router |
| Stop on the way | Cafés/restaurants within 150 m of the route, sorted by detour; picking one re-routes through it |
| Open when you get there | `opening_hours` tags evaluated at the time you'd pass each place (opening_hours.js, lazy-loaded) |
| Resilient place data | Instant results from the map's vector tiles, upgraded by Overpass (raced across mirrors) with hours |
| Walk in progress | Banner with time/distance left, survives the app being closed, “You've arrived → Check in” |

## Phase 3: built

| Feature | How |
| --- | --- |
| **Leave-by planner** (built) | "Arrive by sunset" or "arrive by 7pm" works out when to leave. SunCalc computes sunset on the phone; Open-Meteo gives an hourly forecast for the walk window (keyless, cached 30 min) |
| **Heatmap** (built) | Flame button or Journal → "See your heatmap". MapLibre heatmap layer of your visits for the week/month/year/all, weighted by time spent; pins step aside, the map frames everywhere you went |

## Architecture

```
Phone / laptop browser
├─ React UI (bottom sheets on phones, side panel on ≥900px screens)
├─ Dexie (IndexedDB)  ← source of truth on each device, works offline
│    places · visits · walks · picks   (UUID ids, updatedAt, soft deletes)
├─ Keyless services: OpenFreeMap tiles · Photon search · Overpass · FOSSGIS OSRM
├─ Cloudflare Worker (worker/) → openrouteservice, key kept server-side
└─ Optional: Supabase `records` table ⇄ sync engine (push dirty rows, pull by server cursor)
```

- **Local-first.** Every write lands in IndexedDB instantly. Sync is a background extra.
- **Visit counts are derived** from the visits table, not stored, so visits logged on two
  devices merge without conflicts.
- **The sync table is generic** (one row = one JSON record), so later phases (walks, AI picks)
  need no database migrations.

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Dev server at http://localhost:5173 |
| `npm run build` | Typecheck + production build to `dist/` |
| `npm run preview` | Serve the production build locally |
| `npm run lint` | oxlint |
| `npm run icons` | Regenerate PWA icons from `public/favicon.svg` |

## Roadmap

- **Phase 4:** AI "Explore next" picks and Wander Wrapped (Overpass + Gemini via the Worker)

Map data © OpenStreetMap contributors · tiles by OpenFreeMap / OpenMapTiles · search by Photon (komoot).
