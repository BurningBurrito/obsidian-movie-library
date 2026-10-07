# Design: movie, TV, and anime plugin

Status: **Phase 1 (review and research) approved 2026-10-06** (decisions in §4). **Phase 2 (design, §5–§16)
proposed 2026-10-06; waiting for approval.** Everything in §2 was checked against the live services and their current
official pages on 2026-10-06; links are given so it can be re-checked.

---

## 1. Library Notes: architecture and what's reused

Library Notes 1.0.0 (`../ObsidianBookSearch`, read only) is split by job:

```
src/
├── main.ts            commands, ribbon icon, settings tab, getSecret() for the keychain
├── settings.ts        settings + declarative settings tab (Obsidian 1.13)
├── core/              knows nothing about books
│   ├── http.ts        requestUrl wrapper: User-Agent, offline check, 15 s timeout, 429/5xx → plain errors, 30-min cache
│   ├── throttle.ts    spaces requests per service (queue per key)
│   ├── errors.ts      BookError(kind, message) — message is shown to the user as is
│   ├── render.ts      {{variables}}; YAML-safe frontmatter (lists, numbers, quoting)
│   ├── notes.ts       safe file names, loose name matching, nested folder creation, template loading
│   ├── paths.ts       root / books / covers / MOC paths from settings
│   ├── covers.ts      download, check real image bytes > 1 KB, save with vault.createBinary, reuse never overwrite
│   ├── dataview.ts    is Dataview installed / enabled
│   └── utils.ts       defensive JSON readers
├── sources/           one module per service behind the BookSource interface, plus the fallback order
├── books/             the create-note flow and the built-in template
├── library/           library note (create, never overwrite, regenerate between markers) and read toggle
├── ui/                search window (source buttons, errors inside), result list with thumbnails, choice window
└── dev/checks.ts      developer checks, only in `npm run dev` builds (DEV_BUILD flag)
tests/                 Node test runner; fake `obsidian`, in-memory vault with real YAML edits, scripted windows,
                       HTTP answers recorded once (`npm run test:record`) and replayed offline from .json.gz
```

| Part | Plan |
| --- | --- |
| Build and tooling: esbuild config (copy to `test-vault/`), tsconfig, ESLint with `eslint-plugin-obsidianmd`, version-bump, `.npmrc` (no `v` tag prefix), `.editorconfig`, `.gitignore`, MIT LICENSE, `lint.yml` (Node 22/24, build, lint, tests, lint without moment types), `release.yml` (tag = manifest version, attestation, draft release) | **Reuse** as is; only names and paths change |
| `core/throttle.ts`, `render.ts`, `notes.ts`, `dataview.ts`, `utils.ts`, covers logic | **Reuse** (covers become posters) |
| `core/http.ts` | **Reuse and extend**: retry with backoff for 429 and 5xx (Jikan, Tenrai, TVmaze ask for this), honoring `Retry-After`; longer timeout for slow anime APIs |
| `core/errors.ts`, `paths.ts` | **Adapt**: new error class name and messages; paths for Movies / TV Shows / Anime / Posters |
| `sources/types.ts`, `sources/index.ts` | **Adapt**: one interface for all sources, each declaring which media types it covers; a fallback order **per media type** |
| `sources/open-library.ts`, `google-books.ts`, `genres.ts`, `books/` | **Drop** (book-specific). New: one module per movie/TV/anime source; three templates |
| `library/moc.ts`, `read-status.ts` | **Adapt**: same table technique (cover column that can't error, full-width class, markers, regenerate with confirmation, capitals-insensitive lookup); `watched` instead of `read` |
| `ui/` (search, pick, choice windows) | **Reuse**; CSS class names renamed |
| `tests/` support (recordings, stand-ins, in-memory vault) | **Reuse**; book tests replaced by movie/TV/anime tests |
| `dev/checks.ts` | **Adapt** to the new sources (only in dev builds) |

**Running next to Library Notes.** Everything that could collide gets a new name: plugin ID, command IDs, ribbon
icon, CSS classes (`library-notes-*`), the MOC class (`library-notes-moc`), the markers (`%% library-notes:start %%`),
the template copy path (`Templates/Book note.md`), the default root folder (`Library`), the User-Agent, and the
test-vault plugin folder. Each plugin's `main.js` has its own copy of the module-level cache and throttle state, so
they can't interfere at runtime. Keys live in Obsidian's keychain under names the user picks.

---

## 2. Data sources (verified 2026-10-06)

### Summary

| Source | Media | Key | Limits | Terms for saving in a vault | Posters | Recommendation |
| --- | --- | --- | --- | --- | --- | --- |
| **Tenrai** (MyAnimeList data, Jikan-compatible) | Anime | No | 4/s, 120/min, 40,000/day per IP | Allowed ("store, cache … for private use") | MAL CDN | **Default anime source** (new, see below) |
| **Jikan** (MyAnimeList data) | Anime | No | 3/s, 60/min | No terms page (link is dead) | MAL CDN | **Backup only**: currently down |
| AniList | Anime | No | 30/min (degraded) | Prohibits list/tracker apps | AniList CDN | **Leave out** |
| Kitsu | Anime | No | Not published | No API terms found | Kitsu CDN | Leave out |
| **TVmaze** | TV (incl. anime series) | No | ≥ 20 per 10 s per IP | CC BY-SA; images may be cached indefinitely | TVmaze CDN | **Default TV source** |
| **TMDB** | Movies, TV, anime | User's free key | ~40/s | Non-commercial; **caching limited to 6 months** | image.tmdb.org | **Main movie source**; fallback for TV and anime |
| **OMDb** | Movies, TV | User's free key | 1,000/day | CC BY-NC 4.0 | Poster URL on Amazon's IMDb CDN (free tier) | Movie backup |
| Wikidata | Movies | No | Polite use | CC0 | **None** | Leave out of 1.0 |

### Anime: Jikan — currently unavailable
- Official spec ([jikan-rest api-docs.json](https://raw.githubusercontent.com/jikan-me/jikan-rest/master/storage/api-docs/api-docs.json),
  v4.0.0): **3 requests/second, 60/minute, unlimited daily**; "It's still possible to get rate limited from
  MyAnimeList.net instead." Responses cached 24 h on their side. Errors are JSON `{status, type, message, error,
  report_url}` with 400/404/405/429/500/503; in practice also **504** "Jikan failed to connect to MyAnimeList".
- Search `GET /v4/anime?q=&type=&sfw&limit=`; details `GET /v4/anime/{id}/full`; titles (default/English/Japanese/
  synonyms), `type` (TV, Movie, OVA, ONA, Special, TV Special, Music, CM, PV), episodes, status, aired, studios,
  genres, score, synopsis, `images.jpg.large_image_url`.
- **Status today:** `api.jikan.moe` didn't accept connections from this machine (5 attempts between about
  08:05 and 08:24 UTC, all connection timeouts), nor from a second network (WebFetch). Issue
  [#612 "FULL OUTAGE: api.jikan.moe returns 504 on ALL endpoints since Aug 28"](https://github.com/jikan-me/jikan-rest/issues/612)
  is open with no maintainer reply; the last code commit was 2026-06-14. Media DB replaced Jikan with Tenrai in
  0.9.0 (2026-08-22, commit "Replace Jikan with Tenrai").
- Terms: the docs say "By using the API, you are agreeing to Jikan's terms of use", but that link
  (`jikan.moe/terms`) returns 404.

### Anime: Tenrai — found during research, proposed as the default
- [tenrai.org](https://tenrai.org), API `https://api.tenrai.org/v1`. Its spec says: "Implemented endpoints follow the
  **Jikan v4 schema**, so existing applications can point requests at this API instead of or alongside Jikan with only
  a base URL update." So **one module serves both** Tenrai and Jikan (two base URLs).
- No key. Public limits "enforced per unique IP address": **4/s, 120/min, 40,000/day**; 429 with `Retry-After`.
- [Terms](https://tenrai.org/terms) (updated 2026-07-04): "You may collect, store, cache, index, aggregate, analyze,
  and transform API responses for private use or as part of your applications". Attribution to MyAnimeList and Tenrai
  "is appreciated but is not a contractual requirement". Don't conceal identity to avoid limits; don't resell as a
  competing API (doesn't apply).
- Risks: "the API is in beta … there will likely be some downtime"; v1 is "an interim version", a v2 is planned
  (possible breaking change later).
- Live test: `GET /v1/anime?q=your name&limit=5&sfw` → *Kimi no Na wa.* / *Your Name.* / 君の名は。, type Movie,
  2016, CoMix Wave Films, poster `cdn.myanimelist.net/…l.jpg`; 0.37 s; accepted a plugin-style User-Agent. English
  titles work as search text. Results can include commercials (`CM`), which the plugin should filter out.

### Anime: AniList — recommend leaving it out
- [Terms of use](https://docs.anilist.co/guide/terms-of-use), quoted:
  - "Using the AniList API as a backup or data storage service is strictly prohibited."
  - "Hoarding or mass collection of data from the AniList API is strictly prohibited."
  - "Use of the AniList API within competing, non-complementary services of the same nature is prohibited. This
    includes, but is not limited to, anime and manga list or tracker services. The restriction applies to all data
    provided through the API, including both user data and media data."
  - Free for non-commercial use (and commercial under $150/month revenue).
- [Rate limit](https://docs.anilist.co/guide/rate-limiting): normally 90/min, but "currently in a degraded state and is
  limited to 30 requests per minute" (confirmed live: `x-ratelimit-limit: 30`); 429 gives a 1-minute timeout.
- **Why leave it out:** a plugin that keeps a note per anime with a `watched` checkbox and a table of your anime is
  close to an "anime list or tracker", and the rule explicitly covers media data. Tenrai and Jikan cover the same need
  without that question. If you want AniList later, ask AniList first (contact@anilist.co).

### Anime: Kitsu — no published terms
Works without a key (`kitsu.app/api/edge/anime`, 0.2 s; English/romaji/Japanese titles, posters), but I found no API
terms or rate limits: the [API docs](https://hummingbird-me.github.io/api-docs/) (last updated 2024-08) don't mention
them, and the site's terms page only renders with JavaScript. Not recommended without terms.

### TV: TVmaze — default TV source
- [API page](https://www.tvmaze.com/api), quoted: "Use of the TVmaze API is licensed by CC BY-SA … as long as TVmaze is
  properly credited as source and your usage complies with the ShareAlike provision. You can satisfy the attribution
  requirement by linking back to TVmaze from within your application or website, for example using the URLs available
  in the API." → each TV note links to its TVmaze page (`sourceUrl`), and the README credits TVmaze.
- Rate limit: "at least 20 calls every 10 seconds per IP address … simply retry the request after a small pause
  instead of treating it as a permanent failure." Don't leave more than one idle connection open.
- User-Agent: "While not required, we strongly recommend setting your client's HTTP User Agent to something that'll
  uniquely describe it."
- Images: "we recommend to cache the images on your end … on the client in case of a desktop/mobile app. Images can
  safely be cached indefinitely" → saving posters in the vault is explicitly fine.
- Endpoints: `/search/shows?q=`, `/shows/{id}?embed[]=cast&embed[]=crew&embed[]=seasons`; poster `image.original`.
  Anime series are included (e.g. *Frieren*: type Animation, language Japanese, genre "Anime"); anime films aren't.

### Movies: TMDB — main movie source (user's own free key)
- Auth: v3 API with either the **API key** (`api_key` query parameter) or the **API Read Access Token**
  (`Authorization: Bearer`); "Both authentication methods provide the same level of access"
  ([docs](https://developer.themoviedb.org/docs/authentication-application)). The token keeps the key out of URLs.
  Invalid key → 401 `{"status_code":7,"status_message":"Invalid API key: You must be granted a valid key."}`.
- Rate limit: "somewhere in the 40 requests per second range" ([docs](https://developer.themoviedb.org/docs/rate-limiting)).
- Images: `https://image.tmdb.org/t/p/{size}{file_path}`, e.g. `w500` ([docs](https://developer.themoviedb.org/docs/image-basics)).
- [API Terms of Use](https://www.themoviedb.org/api-terms-of-use) (last updated **2023-10-20**): free license for
  non-commercial use only (a free plugin qualifies); no use for training AI; attribution required (§3).

**Attribution — the notice wording differs between TMDB's own pages:**
- The **API Terms §3** (the binding contract): "You must use the TMDB logo to identify Your use … Any use of any TMDB
  logos in Your Application must be less prominent than the logos or marks that primarily describe or identify Your
  Application … In addition, You must place the following notice prominently in or on Your Application:
  *"This [website, program, service, application, product] uses TMDB and the TMDB APIs but is not endorsed,
  certified, or otherwise approved by TMDB."*"
- The **developer FAQ** ([faq](https://developer.themoviedb.org/docs/faq)) still has the older wording from your
  prompt, *"This product uses the TMDB API but is not endorsed or certified by TMDB."*, and adds: "the attribution
  must be within your application's 'About' or 'Credits' type section"; use one of the approved logos; don't change
  its color (white, black, or the brand colors are fine), aspect ratio, or rotation; call it "TMDB" or "The Movie
  Database"; link to https://www.themoviedb.org.
- **Recommendation:** use the Terms' wording with "product": *"This product uses TMDB and the TMDB APIs but is not
  endorsed, certified, or otherwise approved by TMDB."* It says everything the FAQ version says, and the Terms are what
  the license is conditioned on.
- **Showing the logo in the plugin:** bundle one of TMDB's approved SVG logos
  ([logos page](https://www.themoviedb.org/about/logos-attribution): Primary full/short/long, Alt long/short) inside
  the plugin and show it as a small image in a **Credits** section at the bottom of the settings tab, with the notice
  and a link to themoviedb.org. Bundled = no network request. It sits below the plugin's own name, so it's less
  prominent. The README shows the same logo and notice in its Credits section. The logo is TMDB's trademark, not
  covered by the plugin's MIT license (the README will say so).

### TMDB's 6-month caching limit — what it means for posters in your vault (decision needed)
- Terms §1.C: you must not "**Cache, for longer than 6 months, any information obtained through or from TMDB or the
  TMDB APIs.**" §1.D: if the license ends, you "must promptly delete or otherwise purge all TMDB Content, including any
  cached content."
- A note built from TMDB data and its saved poster are copies of TMDB content kept in the vault indefinitely. Read
  literally, keeping them longer than 6 months isn't allowed. This covers **the note's text** (overview, cast,
  director) as much as the poster, so skipping the poster download alone wouldn't solve it.
- Who's bound: each user gets their own TMDB key and accepts these terms when they do, so the user is the licensee
  for their own requests; the plugin is the "Application" that must show attribution.
- TMDB staff's view (under the older "reasonable periods" wording): "We encourage you to cache data locally. The
  primary point of that clause is that you acknowledge that the data is not owned by you and should we request you to
  remove it, you are bound to do so" ([2013](https://www.themoviedb.org/talk/52c0d75719c2951bf418ce77)); "You are free
  to cache the data … As long as you attribute TMDb you are ok" ([2018](https://www.themoviedb.org/talk/5ba32c77925141523700e0c9)).
  The 6-month cap came later; a [June 2025 question](https://www.themoviedb.org/talk/684fccb6bac1f078e05c83a8) asking
  whether a long-term cache refreshed every 6 months is OK has no answer.
- TMDB also says: "We do not claim ownership of any of the images or data in the API." Posters belong to the studios.
- Media DB saves TMDB posters (w780) and data with no refresh.

Options:
- **A. Save, then refresh (recommended).** TMDB notes work like the others, plus a `sourceUpdated` date. A
  **Refresh from TMDB** command re-downloads the poster and the TMDB-provided details for notes older than 6 months
  (or the open note). The settings show how many are due, and a notice reminds you; nothing happens on its own, so
  there's no surprise network use. Posters stay local and offline, and staying within 6 months is possible. Cost: more
  code, and the refresh replaces the plugin's own poster file and the TMDB-provided properties in those notes (your
  `watched` value, other properties, and text are untouched).
- **B. Save and disclose.** Same as the other sources; the README explains the 6-month term and that you, as the key
  holder, decide. Simplest; what Media DB and most apps do; outside the letter of the terms after 6 months.
- **C. Don't save TMDB posters** (link to image.tmdb.org). Not recommended: the table needs the internet, posters
  aren't "saved locally", and the note's text is still TMDB content.

Whichever you pick, TV and anime default to TVmaze and Tenrai, whose terms allow keeping copies, so TMDB only matters
for movies and as a fallback.

### Movies: OMDb — movie backup (user's own free key)
- [omdbapi.com](https://www.omdbapi.com): free key "FREE! (1,000 daily limit)"
  ([key page](https://www.omdbapi.com/apikey.aspx)); "All content licensed under CC BY-NC 4.0"; "not endorsed by or
  affiliated with IMDb.com".
- Posters: the separate **Poster API** (`img.omdbapi.com`) "is only available to patrons". The normal answers include
  a `Poster` field with a URL on Amazon's IMDb image CDN (`m.media-amazon.com`, 300 px wide), which is what free keys
  get. I couldn't test that without a key: **to confirm with your key in Phase 4.**
- The key can only go in the URL (`apikey=`), so the plugin must never log request URLs (Library Notes already logs
  only the service name). Errors: no key → `{"Response":"False","Error":"No API key provided."}`; bad key → 401
  `{"Response":"False","Error":"Invalid API key!"}`. HTTPS works.

### Movies: Wikidata — recommend leaving it out of 1.0
CC0 data, no key; Wikimedia asks for "an informative User-Agent string with contact information"
([policy](https://foundation.wikimedia.org/wiki/Policy:Wikimedia_Foundation_User-Agent_Policy)). But in a live test,
searching "Inception" returned a database term and a software tool before the film; director, genre, and cast come back
as IDs that need extra requests for their names; and there's **no poster** (the film-poster property is empty; the only
image is a cast photo). A table row without a poster defeats the purpose, and a free TMDB key gives far better results.
Worth revisiting only if a no-key movie source becomes important.

---

## 3. Media DB and the rest of the field

[Media DB](https://github.com/mProjectsCode/obsidian-media-db-plugin) (`obsidian-media-db-plugin`, 0.9.1 of 2026-08-25,
GPL-3.0, ~490 stars): searches movies, series, anime, manga, books, comics, games, board games, music, and wiki articles
across ~13 APIs; you pick which APIs to search; templates are appended to a fixed frontmatter (`{{ title }}` syntax);
optional poster download named `type_title (year)`; property renaming; bulk import of existing folders; search by ID;
"Update metadata". Stores `watched`, `lastWatched`, `personalRating`, but has no command to toggle them. No library note
or table. Its code is GPL-3.0, so nothing from it will be used (only its feature list was read).

| | Media DB | This plugin |
| --- | --- | --- |
| Scope | 10 media types, ~13 APIs | Movies, TV, and anime only |
| Without any key | Anime only (Tenrai) | **TV (TVmaze) and anime (Tenrai)** |
| Picking sources | You choose APIs per search | Default per media type, **automatic fallback** with a notice |
| Posters | Optional, `type_title (year)` | Always saved, `Title (Year) - source-id` (can't collide) |
| Overview | — | **A library note with a Dataview table** of posters, titles, watched status, created on first use, never overwritten, regenerated only between its markers |
| Watched | Property only | Property + **Toggle watched status** command |
| Existing note | "Do you want to overwrite it?" Yes / No | Open existing / create copy / cancel; nothing overwritten |
| Templates | Appended after generated frontmatter | Whole-note templates with YAML-safe variables (as in Library Notes) |
| Anime title | MAL title | Choose English, romaji, or Japanese for note names and the table |
| Looks like | — | Same table look as Library Notes, for vaults that use both |

Other plugins in the space (47 listed with movie/TV/anime in their name or description), e.g. Library, Lorebase,
AnimeList, WatchLog, Reel, MovieLog, Film + Anime-Manga Tracker, Search Movies and TV Shows TMDB. None found combines
key-free TV and anime, automatic fallback, local posters, and a generated Dataview library table. The description and
README should lead with those.

---

## 4. Phase 1 decisions (user: "go with your recommendations", 2026-10-06)

| # | Question | Decision |
| --- | --- | --- |
| R1 | Anime default source | **Tenrai**, with Jikan as backup (same code), then TMDB if a key is set |
| R2 | AniList | **Left out** (terms) |
| R3 | TMDB 6-month caching | **Option A** (save, then refresh) |
| R4 | TMDB notice wording | The **Terms' wording** with "product" |
| R5 | Wikidata | **Left out** of 1.0 |
| R6 | TV fallback order | TVmaze → TMDB (key) → OMDb (key) |
| R7 | Movie order | TMDB (key) → OMDb (key); no key → explain and link to setup |

---

# Phase 2 — Design

Status: **proposed 2026-10-06; waiting for approval** (questions in §16). Identifiers below use the recommended name
**Watchlist Notes** (`watchlist-notes`); if you pick another name, every `watchlist-notes` becomes its ID.

## 5. Name, ID, and description **[Q1]**

Rules checked 2026-10-06 in Obsidian's developer docs (repo commit c56c7e7, 2026-08-10):
- ID: "must contain only lowercase letters and hyphens, can't end with `plugin`, and can't contain `obsidian`"
  (so no digits); it can never change after release.
- Name: Basic Latin only; "No punctuation (except hyphens, plus sign, and parenthesis), emoji, or special
  characters"; no "Obsidian" and no "Plugin"; unique.
- Description: at most 250 characters, ends with a period, no emoji or special characters, ideally starts with an
  action ("Search for…").

All checked against the 8,456 listed and 175 removed plugins and your GitHub repositories: all free. (Submissions
still in review aren't in that list; checked again at release.)

| # | Name | ID / repo | Description (characters) | Why |
| --- | --- | --- | --- | --- |
| 1 | **Watchlist Notes** (recommended) | `watchlist-notes` | "Search for movies, TV shows, and anime, save each one as a note with its poster, and keep a library note with a table of everything you watch. TV shows and anime work without an API key." (186) | Same family as Dictionary Notes and Library Notes, but clearly about watching; no shared word with "Library Notes" |
| 2 | Watch Library | `watch-library` | "Search for movies, TV shows, and anime, save each one as a note with its poster, and keep a library table with what you've watched. TV shows and anime work without an API key; movies use a free TMDB or OMDb key." (211) | Matches the default folder; but shares "Library" with Library Notes |
| 3 | Movie TV and Anime Notes | `movie-tv-anime-notes` | "Create notes for movies, TV shows, and anime with their posters saved in your vault, a library table, and a watched toggle. TV shows and anime work without an API key; movies use a free TMDB or OMDb key." (203) | Most explicit; reads awkwardly because commas and "&" aren't allowed in names |

The short description can't name other plugins; the longer listing text (Phase 6) says how it differs from Library
Notes (books) and Media DB (§3).

**Nothing shared with Library Notes:**

| | Library Notes | This plugin |
| --- | --- | --- |
| Plugin ID | `library-notes` | `watchlist-notes` |
| Command IDs | `create-book-note`, `toggle-read-status`, `regenerate-library-note` | `create-movie-note`, `create-tv-show-note`, `create-anime-note`, `toggle-watched-status`, `regenerate-watch-library`, `refresh-tmdb-notes` |
| Ribbon icon | `library` | `clapperboard` (checked: in Obsidian 1.14.4's icon set) |
| CSS classes / MOC class | `library-notes-*` / `library-notes-moc` | `watchlist-notes-*` / `watchlist-notes-moc` |
| Markers | `%% library-notes:start %%` / `end` | `%% watchlist-notes:start %%` / `end` |
| Template copies | `Templates/Book note.md` | `Templates/Movie note.md`, `Templates/TV show note.md`, `Templates/Anime note.md` |
| Default folder / note | `Library/`, `Library MOC` | `Watch Library/`, `Watch Library MOC` |
| User-Agent | `LibraryNotes/…` | `WatchlistNotes/<version> (+https://github.com/BurningBurrito/obsidian-movie-library)` |
| GitHub repository | `BurningBurrito/library-notes` | `BurningBurrito/obsidian-movie-library` (user, 2026-10-06) |
| Test vault folder | `test-vault/.obsidian/plugins/library-notes` | `test-vault/.obsidian/plugins/watchlist-notes` |

## 6. Commands and ribbon

| Command | What it does |
| --- | --- |
| **Create movie note** | Search for a movie and create its note |
| **Create TV show note** | Same for TV shows |
| **Create anime note** | Same for anime (series and films) |
| **Toggle watched status** | Flips `watched` on the open note; only offered when the note is in the Movies, TV Shows, or Anime folder (`checkCallback`), like Toggle read status |
| **Regenerate library note** | Same as Library Notes: confirmation, replaces only the part between the markers (or replaces a single hand-made Dataview table / adds at the end) |
| **Refresh TMDB notes** | §12 |

- **Ribbon:** one `clapperboard` icon that opens a small menu: **Movie** (`film`), **TV show** (`tv`), **Anime**
  (`sparkles`). Three commands rather than one, so each can have its own hotkey; one icon, so the ribbon stays tidy.
- **Search window:** the same window as Library Notes, titled "Search for a movie" (TV show, anime), with a button per
  configured source for that type when there are two or more. Selected text in the editor fills the search box, as in
  Library Notes.
- **Exact lookups** (like ISBNs in Library Notes, the result list is skipped): an IMDb ID (`tt1375666`) or IMDb link for
  movies and TV, a MyAnimeList link for anime. A bare number is never treated as an ID, since it can be a title (*1917*,
  *300*). A year in parentheses puts that year's results first: `The Office (2001)`. Only in parentheses, because a
  bare number can be part of the title (*Blade Runner 2049*). (Built 2026-10-06, milestone 1.)
- **Results list:** poster thumbnail, title, and details: movies "2010 · original title if different"; TV "2022 ·
  Apple TV · Running"; anime "2023 · TV · 28 episodes · Madhouse".
- **Movies without a key:** instead of a search window, a window explains "Movie search needs a free TMDB or OMDb key"
  with **Open settings** (Obsidian's internal `app.setting.openTabById`, behind a feature check like the Dataview
  check) and **How to get a key** (README section).

## 7. Sources: order, fallback, limits, retries

| Type | Order (default first) | Without any key |
| --- | --- | --- |
| Movies | TMDB → OMDb | Explains and links to setup (§6) |
| TV shows | TVmaze → TMDB → OMDb | TVmaze |
| Anime | Tenrai → Jikan → TMDB | Tenrai, Jikan |

- **Default source per type** is a setting (only configured sources are offered). **Try the next source if the default
  one fails or finds nothing** (one setting, on by default) works exactly as in Library Notes: never when offline; a
  notice says when another source answered ("Tenrai is having problems (error 503). Showing results from Jikan
  instead."); when everything fails, the default source's error is shown in the search window.
- **New: a source that just failed is skipped for 10 minutes** when falling back (its button still works). Without
  this, a down service like Jikan would cost a full timeout on every search.
- **TMDB as an anime source:** TV and movie searches, keeping only Animation; English name, original (Japanese) name,
  format TV or Movie, production companies as studio.
- **Request spacing** (per service, Library Notes' throttle): Tenrai 500 ms (120/min), Jikan 1 s (60/min), TVmaze
  500 ms (20 per 10 s), TMDB 100 ms, OMDb 250 ms. Poster CDNs aren't spaced beyond one download per note.
- **Retries (new in `core/http.ts`):** on 429, wait `Retry-After` (2 s if missing) and retry, up to twice, as long as
  the wait is at most 10 s; otherwise "… has received too many requests. Try again in N minutes." On 500/502/503/504,
  retry after 1 s, then 3 s. No retry on timeouts (an unreachable service goes straight to the next source).
- **Timeouts:** 20 s for Tenrai and Jikan ("expect slow responses"), 15 s for the others. After 5 s the search window
  says "Still waiting for Tenrai…", and "Tenrai is busy; trying again…" during a retry.
- **Cache:** searches and details kept in memory for 30 minutes, as in Library Notes (well within TMDB's 6 months).
- **Adult titles:** hidden by default (TMDB `include_adult=false`, Tenrai/Jikan `sfw`); a setting turns this off.
  Anime results of type CM, PV, and Music (commercials, promo videos, music videos) are always left out.
- **Keys:** TMDB accepts the **Read Access Token** (sent as `Authorization: Bearer`, never in a URL; recommended) or
  the short **API key** (only possible as `api_key=` in the URL). OMDb's key can only go in the URL. Requests are
  never logged with their URL (as in Library Notes), so keys can't end up in the console.

## 8. Folders, note names, duplicates, posters

```
Watch Library/
├── Watch Library MOC.md   ← the library note
├── Movies/
├── TV Shows/
├── Anime/                 ← anime series and films; `format` says which
└── Posters/
```

- Your proposed names are good; I'd keep them. All five names are settings; the root can be nested
  (`Synced Notes/Watch Library`); missing folders are created on first use; nothing is renamed, moved, or deleted.
- **Anime films and series together** in Anime, with `format`: TV, Movie, OVA, ONA, Special, TV Special (MyAnimeList's
  own values). Agreed with your proposal: one place for all anime, and the table can show the format.
- **Note names:** `{title}.md` in the type's folder, made file-safe as in Library Notes (straight apostrophes, no
  `: / ? # [ ] |`). Anime use the title chosen in the settings (English, romaji, or Japanese; English and Japanese
  fall back to romaji when missing).
- **Duplicates:** as in Library Notes: a note with the same name in that type's folder (ignoring capitals, quote and
  dash styles, extra spaces; subfolders included) → **Open existing / Create copy / Cancel**. One proposed change
  **[Q5]**: name the copy `Dune (2021).md` when the year is known (Library Notes would make `Dune 2.md`, which looks like
  a sequel), falling back to `Dune 2.md`. The window also shows the existing note's year.
- **Poster names:** `{title} ({year}) - {source}-{id}.{ext}`, title cut to 80 characters, so two titles never share
  a poster:
  - `Inception (2010) - tmdb-movie-27205.jpg` (TMDB movie and TV IDs overlap, hence `movie`/`tv`)
  - `Severance (2022) - tvmaze-44933.jpg`
  - `Frieren Beyond Journey's End (2023) - mal-52991.jpg` (Tenrai and Jikan share MyAnimeList IDs)
  - `Inception (2010) - imdb-tt1375666.jpg` (OMDb)
- Poster sizes: TMDB `w500`, TVmaze `medium` (210×295, about 15 KB; its only other size is the 2000×3000 original,
  1.3 MB for Severance; user 2026-10-06: "smaller size is fine"), MyAnimeList `large` (425×600), OMDb as given (300 px
  wide). Checked as in
  Library Notes (real image bytes, > 1 KB), saved with `vault.createBinary`, an existing file is reused, and no poster
  means the note is still created with a notice.

## 9. Notes: properties and templates

Kept from Library Notes with the same meaning: `tags`, `title`, `description`, `cover` (poster web address),
`localCover`, `rating` (**your** rating, `N/A` until you set it **[Q4]**), `source`, `sourceUrl`, `created`, `link`
(back-link to the library note). New: `watched` (false), `score` (the source's average, 0–10), `year` in all three
types (so every table has a Year column and sorts the same way).

Changes from your proposed lists, for you to confirm:
- `rating` stays **your** rating as in Library Notes; the source's score goes in `score` **[Q4]**. (MyAnimeList's
  "rating" is actually an age rating such as "PG-13", so the name would mean three things otherwise.)
- Anime dates use `firstAired` / `lastAired` like TV, instead of one `aired` text.
- Anime gets `romajiTitle` too, so all three titles are kept whichever one names the note.
- `cover` (poster web address) added to all three, as in Library Notes.

### Built-in movie template
```markdown
---
tags:
  - 🎬Movie
title: {{title}}
originalTitle: {{originalTitle}}
year: {{year}}
releaseDate: {{releaseDate}}
director: {{director}}
cast: {{cast}}
genre: {{genre}}
runtime: {{runtime}}
score: {{score}}
description: {{description}}
cover: {{coverUrl}}
localCover: {{localCover}}
watched: false
rating: N/A
owned: N/A
streaming: N/A
source: {{source}}
sourceUrl: {{sourceUrl}}
created: {{date:YYYY-MM-DD HH:mm:ss}}
link:
  - {{libraryLink}}
---
# Summary:

# Notes:

# Quotes:
```

### Built-in TV show template
Frontmatter: `tags: [📺TVShow]`, `title`, `year`, `firstAired`, `lastAired`, `status`, `creator`, `network`,
`seasons`, `episodes`, `cast`, `genre`, `score`, `description`, `cover`, `localCover`, `watched: false`,
`rating: N/A`, `owned: N/A`, `streaming: N/A`, `source`, `sourceUrl`, `created`, `link` (same layout and body as the movie template).

### Built-in anime template
Frontmatter: `tags: [🎌Anime]`, `title`, `englishTitle`, `romajiTitle`, `japaneseTitle`, `format`, `year`, `episodes`,
`status`, `firstAired`, `lastAired`, `studio`, `genre`, `score`, `description`, `cover`, `localCover`,
`watched: false`, `rating: N/A`, `owned: N/A`, `streaming: N/A`, `source`, `sourceUrl`, `created`, `link` (same body).

### Template variables
Same engine as Library Notes: lists become list properties, numbers stay numbers, text is quoted when needed, unknown
variables are left alone.

| Variable | Movies | TV | Anime | Contents |
| --- | :-: | :-: | :-: | --- |
| `{{title}}`, `{{year}}`, `{{genre}}`, `{{description}}`, `{{score}}` | ✓ | ✓ | ✓ | `genre` is a list, names made consistent across sources ("Sci-Fi", "Science-Fiction" → "Science fiction"; "Action & Adventure" → "Action", "Adventure"; "Award Winning" dropped) |
| `{{cast}}` | ✓ | ✓ | | Up to 5 names, list |
| `{{originalTitle}}`, `{{releaseDate}}`, `{{director}}`, `{{runtime}}` | ✓ | | | Runtime in minutes (number) |
| `{{firstAired}}`, `{{lastAired}}`, `{{status}}`, `{{episodes}}` | | ✓ | ✓ | Dates `YYYY-MM-DD`; status as the source says it |
| `{{creator}}`, `{{network}}`, `{{seasons}}` | | ✓ | | Network or streaming service (TVmaze's `webChannel`, e.g. Apple TV) |
| `{{englishTitle}}`, `{{romajiTitle}}`, `{{japaneseTitle}}`, `{{format}}`, `{{studio}}`, `{{ageRating}}`, `{{season}}` | | | ✓ | `season` such as "Fall 2023" |
| `{{imdbId}}` | ✓ | ✓ | | When the source knows it |
| `{{mediaType}}` | ✓ | ✓ | ✓ | "Movie", "TV show", "Anime" |
| `{{coverUrl}}`, `{{localCover}}`, `{{localCoverPath}}`, `{{source}}`, `{{sourceUrl}}`, `{{libraryLink}}`, `{{date}}`, `{{time}}`, `{{date:FORMAT}}` | ✓ | ✓ | ✓ | As in Library Notes |

Descriptions are cleaned (TVmaze HTML → text; MyAnimeList's "[Written by MAL Rewrite]" removed). Unavailable fields
are left empty.

## 10. The library note and the exact Dataview queries **[Q2] [Q3]**

Created as `{root}/{name}.md` on first use, never overwritten, `cssclasses: watchlist-notes-moc` (full width; hides the
"80" label of a missing poster), regenerated only between the markers, found regardless of capitals, Dataview status
checked: all as in Library Notes. The poster column is Library Notes' cover column unchanged, so it accepts `[[…]]`,
`![[…]]`, `|alias`, and plain paths, and can't make a row disappear.

**Recommended: three tables, one heading each, inside one marked block.** Each table stays small, the third column
can be named for what it is, and anime can show its format. Default settings, anime title "English":

````markdown
%% watchlist-notes:start (generated: "Regenerate library note" replaces only the part between these markers) %%
## Movies

```dataview
TABLE WITHOUT ID
  choice(localCover, embed(link(regexreplace(string(localCover), "^!?\[\[|\|.*$|\]\]$|^/", ""), "80")), "") AS Poster,
  default(title, file.name) AS Title,
  year AS Year,
  director AS Director,
  genre AS Genre,
  file.link AS Note,
  choice(watched, "🟩", "🟥") AS Watched,
  owned AS Owned,
  streaming AS Streaming
FROM "Watch Library/Movies"
SORT default(title, file.name) ASC
```

## TV shows

```dataview
TABLE WITHOUT ID
  choice(localCover, embed(link(regexreplace(string(localCover), "^!?\[\[|\|.*$|\]\]$|^/", ""), "80")), "") AS Poster,
  default(title, file.name) AS Title,
  year AS Year,
  creator AS Creator,
  genre AS Genre,
  file.link AS Note,
  choice(watched, "🟩", "🟥") AS Watched,
  owned AS Owned,
  streaming AS Streaming
FROM "Watch Library/TV Shows"
SORT default(title, file.name) ASC
```

## Anime

```dataview
TABLE WITHOUT ID
  choice(localCover, embed(link(regexreplace(string(localCover), "^!?\[\[|\|.*$|\]\]$|^/", ""), "80")), "") AS Poster,
  default(englishTitle, default(title, file.name)) AS Title,
  year AS Year,
  format AS Format,
  studio AS Studio,
  genre AS Genre,
  file.link AS Note,
  choice(watched, "🟩", "🟥") AS Watched,
  owned AS Owned,
  streaming AS Streaming
FROM "Watch Library/Anime"
SORT default(englishTitle, default(title, file.name)) ASC
```
%% watchlist-notes:end %%
````

- The anime Title column follows the **Anime title** setting (`englishTitle`, `romajiTitle`, or `japaneseTitle`, falling
  back to `title`), so after changing that setting, **Regenerate library note** retitles every anime in the table.
  Note file names never change.
- `Format` in the anime table is an addition to your column list (TV / Movie / OVA…); easy to drop **[Q3]**.
- Checked in Dataview's source (0.5.68): `default(value, fallback)` takes two values (hence nesting), `choice` uses
  truthiness (missing `watched` → 🟥), `startswith` returns empty for empty values.

**Alternative: one table with a Type column** (type taken from the folder, so it also works for notes made by hand):

```dataview
TABLE WITHOUT ID
  choice(localCover, embed(link(regexreplace(string(localCover), "^!?\[\[|\|.*$|\]\]$|^/", ""), "80")), "") AS Poster,
  default(title, file.name) AS Title,
  choice(startswith(file.folder, "Watch Library/Movies"), "Movie", choice(startswith(file.folder, "Watch Library/TV Shows"), "TV show", "Anime")) AS Type,
  year AS Year,
  default(director, default(creator, studio)) AS "Director / Creator / Studio",
  genre AS Genre,
  file.link AS Note,
  choice(watched, "🟩", "🟥") AS Watched,
  owned AS Owned,
  streaming AS Streaming
FROM "Watch Library/Movies" OR "Watch Library/TV Shows" OR "Watch Library/Anime"
SORT default(title, file.name) ASC
```

**Extra columns [Q3], decided: Owned and Streaming** (like Library Notes' AudioBook / EBook), in all three tables after
Watched. `owned` is typed by hand as 🟩 / 🟥 / N/A (e.g. on disc or digital); `streaming` holds a service name such as
"Netflix", or N/A. Both start as `N/A` in the templates. Filling Streaming automatically would need TMDB's
watch-provider data, which comes from JustWatch and has its own attribution rules, so it isn't planned.

## 11. Watched toggle
As Toggle read status: `processFrontMatter` flips only `watched` (missing → true); notice "Marked "Inception" as
watched." / "…as unwatched."; offered only for notes in the three type folders (and their subfolders).

## 12. Refresh from TMDB (decision R3, option A)
- Applies to notes in the three folders whose `sourceUrl` is a TMDB address (it holds the TMDB ID and whether it's a
  movie or TV show), whatever their type folder.
- **Due** when last updated more than **5 months** ago (`sourceUpdated`, otherwise `created`, otherwise the file's
  creation time), so there's a month of margin before TMDB's 6 months.
- **Reminder:** once per Obsidian session, when you use any of the plugin's commands and notes are due: "3 notes
  from TMDB are due for a refresh (TMDB allows keeping its data for up to 6 months). Run "Refresh TMDB notes"."
  The TMDB settings show the count and a **Refresh now** button. Nothing runs by itself.
- **Refresh TMDB notes** asks first: **Refresh N due notes** / **Refresh all M TMDB notes** / Cancel, saying what
  changes. For each note: download the details and poster again; replace the bytes of the poster file the note links
  to (only if it's in the Posters folder; otherwise save a new poster and update `localCover`); update the
  TMDB-provided properties **that the note already has** (year, release date, director, cast, genre, runtime, score,
  description, cover; for TV first/last aired, status, creator, network, seasons, episodes); set `sourceUpdated` to
  today. **Never changed:** the file name, `title`, `watched`, `rating`, `tags`, `link`, `created`, any other
  property, and the note's text.
- A title TMDB no longer has (404), or a missing key, is listed in the summary and left as is; the plugin never
  deletes anything. If TMDB no longer has a poster, the summary says so (you decide whether to delete the old copy).
- Added while building (2026-10-07): notes whose `source` is TMDB but have no TMDB address in `sourceUrl` (e.g. a
  custom template) can't be refreshed and are listed by name; the refresh **stops** at the first problem that would
  repeat for every note (offline, key rejected or missing, rate limit, network), and says so; a refreshed poster
  keeps its file name (same naming as new notes).
- README and settings explain TMDB's 6-month term; the README also says that if you stop using TMDB, its terms ask
  you to delete TMDB content, and how to find those notes (`source: TMDB`).

### Tests for TMDB and OMDb (added 2026-10-06, milestone 3)
The other sources' tests replay answers recorded from the live services. TMDB and OMDb can't: recorded TMDB answers in
a public repository would keep TMDB data far longer than its 6-month limit, and keyed requests would carry a key. Their
tests use **hand-written answers in each service's documented format** (TMDB: field names and structure from its
OpenAPI spec, `developer.themoviedb.org/openapi/tmdb-api.json`; OMDb: the field names it documents), with descriptions
written for the tests and made-up poster paths (`tests/support/stand-ins.ts`). The recording tool refuses TMDB and OMDb
hosts. The live check happens in the test vault with the user's keys and isn't recorded.

## 13. Settings layout

**(General)** Library folder `Watch Library` · Movies folder `Movies` · TV shows folder `TV Shows` · Anime folder
`Anime` · Posters folder `Posters` · Open note after creating it (on)

**Library note** Library note name `Watch Library MOC` · Dataview status · Regenerate library note

**Templates** Movie template · TV show template · Anime template (empty = built-in) · **Create editable templates**
(saves the three built-in templates to `Templates/Movie note.md`, `TV show note.md`, `Anime note.md`, skipping any that
exist, and selects them)

**Sources** Movies: default source · TV shows: default source · Anime: default source · Try the next source if the
default one fails or finds nothing (on) · Hide adult titles (on) · Preferred language `en` (TMDB titles and
descriptions; the other sources are English only) · Anime title: English / Romaji / Japanese · Check buttons for
Tenrai, Jikan, TVmaze

**TMDB** Read Access Token or API key (Obsidian keychain; how to get one) · Check · refresh status line · Refresh now

**OMDb** API key (keychain; how to get one) · Check

**Credits** (bottom of the tab) TMDB logo (bundled SVG, small, linked to themoviedb.org) with "This product uses TMDB
and the TMDB APIs but is not endorsed, certified, or otherwise approved by TMDB." · TV information from TVmaze
(CC BY-SA), linked · Anime information from MyAnimeList via Tenrai or Jikan · OMDb content (CC BY-NC 4.0)

## 14. Error messages (plain language, in the search window when possible)
As in Library Notes (offline, can't reach, took too long, too many requests with "try again in N minutes", server
problems, unreadable response, nothing found, no poster, template missing, Dataview missing, file in the way), plus:
TMDB rejected the key (status 7) · OMDb "Invalid API key!" and its daily limit (exact wording checked with your key in
Phase 4) · MyAnimeList unavailable (Tenrai/Jikan 504: "Tenrai can't reach MyAnimeList right now") · "Still waiting for
…" / "… is busy; trying again…" · movie search without a key (§6) · refresh summary (§12).

## 15. Not in 1.0
AniList, Kitsu, Wikidata (Phase 1 decisions) · season-by-season or episode tracking · syncing with Trakt, Letterboxd,
or MyAnimeList accounts · bulk import · automatic streaming availability.

## 16. Phase 2 decisions (user: "nice, next phase when you are ready", 2026-10-06 — recommendations accepted)

| # | Question | Decision |
| --- | --- | --- |
| Q1 | Name / ID | **Watchlist Notes**, `watchlist-notes`; public GitHub repository **`obsidian-movie-library`** (user, 2026-10-06) |
| Q2 | Three tables (Movies, TV shows, Anime) or one table with a Type column | **Three tables** |
| Q3 | Extra columns: anime **Format**; **Owned** / **Streaming** like AudioBook / EBook | Format **yes**; Owned / Streaming **yes** (user, 2026-10-06): `owned: N/A` and `streaming: N/A` in all three templates, typed by hand (🟩 / 🟥 / N/A; a service name), columns after Watched in all three tables |
| Q4 | `rating` = your rating (`N/A`) and `score` = the source's score | **Yes** |
| Q5 | "Create copy" names the copy `Title (Year)` instead of `Title 2` | **Yes** |
| Q6 | Everything else in §6–§14 | **Approved** as written |
