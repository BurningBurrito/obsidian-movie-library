# Status: Watchlist Notes (`watchlist-notes`)
**Current phase:** Phase 5 — GitHub repo and docs: **complete** (repo public, `main` pushed, CI green); Phase 6 next
**Last updated:** 2026-10-07

## Done

### Setup
- [x] Project folder `ObsidianMovieLibrary/` (already existed, empty) is the project root; STATUS.md created
- [x] Base project located: Library Notes 1.0.0 at `../ObsidianBookSearch` (remote
      `BurningBurrito/library-notes`). Treated as **read-only**: nothing there is modified (its working tree still
      shows 0 changes after the copy)
- [x] Attribution off at both levels: user `~/.claude/settings.json` and project `.claude/settings.local.json`
      (`commit: ""`, `pr: ""`, `sessionUrl: false`); `.claude/` is gitignored

### Phase 1 — Review and research (approved)
- [x] Read Library Notes in full: README, DESIGN.md, STATUS.md, all of `src/` (23 files), tests and their support
      code, build/lint/release config. Architecture and reuse plan in DESIGN.md §1 (core reused; book sources, genres,
      and book flow dropped; http.ts gains retry with backoff; sources get a fallback order per media type)
- [x] Listed everything that could collide with Library Notes in the same vault (ID, command IDs, icon, CSS classes,
      MOC class, markers, template copy path, default folder, User-Agent, test-vault folder): all get new names
- [x] Sources verified against current official pages and live requests (DESIGN.md §2):
  - **Jikan**: 3/s, 60/min (official spec); **down**: no connection from two networks (5 attempts 08:05–08:24 UTC);
    issue #612 "FULL OUTAGE … since Aug 28" open, no maintainer reply; terms link is a 404
  - **Tenrai** (found during research): Jikan-compatible MyAnimeList API, no key, 4/s, 120/min, 40,000/day; terms
    (2026-07-04) allow storing/caching for private use; beta, v2 planned. Live search works (English titles too).
    Media DB switched from Jikan to Tenrai on 2026-08-22
  - **AniList**: terms prohibit use in "anime and manga list or tracker services" (including media data) and as data
    storage; rate limit degraded to 30/min (confirmed live)
  - **Kitsu**: works without a key, but no published API terms or limits
  - **TVmaze**: CC BY-SA (link back), ≥ 20 calls/10 s per IP, retry 429 after a pause, User-Agent recommended, images
    "can safely be cached indefinitely" on the client; has anime series too
  - **TMDB**: API Terms last updated 2023-10-20: non-commercial license, logo + notice in an About/Credits section,
    **no caching longer than 6 months**; v3 with API key or Bearer read token; ~40 req/s; images on image.tmdb.org;
    401 status_code 7 for a bad key. **The required notice differs** between the Terms ("uses TMDB and the TMDB APIs
    but is not endorsed, certified, or otherwise approved by TMDB") and the FAQ (the wording in the prompt)
  - **OMDb**: free key 1,000/day, CC BY-NC 4.0, Poster API patrons only; normal answers carry a `Poster` URL on Amazon's
    IMDb CDN (to confirm with a real key in Phase 4); key must be in the URL
  - **Wikidata**: CC0, no key, but noisy search, extra lookups for names, no posters
- [x] Media DB reviewed (README on master and release, manifest, command list, models; GPL-3.0, so no code used):
      10 media types, user picks APIs, optional posters, overwrite prompt, `watched` property without a toggle, no
      library note. Comparison and other related plugins (47 found) in DESIGN.md §3
- [x] DESIGN.md written (Phase 1 part: §1–§4)
- [x] **Phase 1 approved** (user, 2026-10-06: "go with your recommendations"): decisions R1–R7 below

### Phase 2 — Design (approved)
- [x] Obsidian rules re-checked (developer docs commit c56c7e7, 2026-08-10): ID only lowercase letters and hyphens
      (no digits), not ending in `plugin`, no `obsidian`; name Basic Latin, no punctuation except `-`, `+`, `()`, no
      "Obsidian"/"Plugin"; description ≤ 250 characters, ends with a period, no emoji, starts with an action;
      submission requirements page moved to "Community directory/"
- [x] Names checked against 8,456 listed + 175 removed plugins and the user's 8 GitHub repos: Watchlist Notes,
      Watch Library, Movie TV and Anime Notes (and 5 others) all free. Descriptions 186 / 211 / 203 characters
- [x] Dataview 0.5.68 source: `default` (2 values, nestable), `startswith`, `choice`, `FROM … OR …` confirmed
- [x] Icons in Obsidian 1.14.4's set: clapperboard, film, tv, sparkles, popcorn (all present); internal
      `app.setting.openTabById` present (not in public typings → feature-checked wrapper)
- [x] Real data checked for templates: TVmaze (network vs webChannel, Creator in crew, seasons with unknown episode
      counts, HTML summaries), Tenrai full record (three titles, format, aired from/to, studios, age rating vs score,
      "[Written by MAL Rewrite]")
- [x] DESIGN.md §5–§16 written
- [x] **Phase 2 approved** (user, 2026-10-06: "nice, next phase when you are ready"): decisions Q1–Q6 below

### Phase 3 — Scaffold (complete)
- [x] Copied from Library Notes, unchanged: `.editorconfig`, `.npmrc` (no `v` tag prefix), `.gitignore`, LICENSE (MIT,
      2026 BurningBurrito), `tsconfig.json`, `eslint.config.mts`, `version-bump.mjs`, `lint.yml`, `release.yml`,
      `globals.d.ts`, `core/{dataview,throttle,utils,render,notes,http}.ts`, `ui/{choice,pick,search}-modal.ts`, test
      runner and support code (recordings, Obsidian stand-in, in-memory vault, scripted windows)
- [x] Renamed throughout: `BookError` → `MediaError`, plugin name in messages, CSS prefix `watchlist-notes-`,
      recording switch `WN_RECORD`; book wording in comments and messages; `covers.ts` → `posters.ts`
      (`downloadPoster`, `savePoster`, same checks); esbuild copies to `test-vault/.obsidian/plugins/watchlist-notes`
- [x] New: `manifest.json` (`watchlist-notes` 0.1.0, minAppVersion 1.13.0, description 186 characters),
      `versions.json` `{}` (only released versions go in), `package.json` (name, description, keywords),
      `media/types.ts` (movie / tv / anime, headings), `core/paths.ts` (root, one folder per type, posters, MOC),
      `settings.ts` (folders, open after create, library note name, Dataview status, Regenerate, Anime title;
      the four type/poster folders must be separate, refused otherwise), `library/moc.ts` (three headed tables,
      `watchlist-notes` markers, `watchlist-notes-moc` class, anime Title follows the setting),
      `library/watched-status.ts`, `main.ts` (Toggle watched status, Regenerate library note), README stub
- [x] Removed (never copied): Open Library, Google Books, genres, book template and flow, developer checks (rebuilt
      for the new sources in Phase 4), book tests and recordings, Library Notes' docs
- [x] Identifiers compared programmatically with Library Notes: plugin ID, command IDs, ribbon icon, CSS classes,
      MOC class, markers, template path, User-Agent, test-vault folder: **nothing shared** except
      `modal-button-container`, which is Obsidian's own class
- [x] `npm install`: lockfile has the same 358 packages at the same versions as Library Notes (only name/version
      differ). `npm audit`: the same 3 moderate `moment` advisories (dev-only, via the Obsidian types; not bundled).
      npm 12 blocks esbuild's postinstall; the build doesn't need it
- [x] `npm run build`, `npm run lint`, lint without moment types: clean. Release `main.js` 12,228 bytes, no
      developer-check code. `npm test`: **38 tests pass** (render 5, file names/folders/paths 8, settings 3,
      posters 5, library tables/regeneration/library note/watched 17), including: three tables and their columns,
      anime title setting, markers not shared with Library Notes, Library Notes' library note left alone in a shared
      folder, separate-folder rule
- [x] Test vault `test-vault/` (gitignored): Watchlist Notes dev build + `.hotreload`; **Library Notes 1.0.0 from
      the GitHub release** (main.js sha256 be2c0ab9…, same as the published build); Dataview 0.5.70 and Hot Reload
      0.3.1 from their GitHub releases; sample notes (movie without poster, movie in a subfolder with a missing poster
      file, TV show with a TVmaze poster, anime series and film with MyAnimeList posters) and Library Notes' two
      sample books + library note for comparison; `Start here.md` with the Phase 3 checks
- [x] git: new repository (branch `main`), identity BurningBurrito with the GitHub noreply address (as Library
      Notes), first commit local only; commit history checked for attribution lines
- [x] User tested the Phase 3 vault (2026-10-06). Reported: (1) "the movies creates a separate folder for the genre
      inside the movies folder (Sci-fi)"; (2) "no posters for the movies; there was for the show and anime". Both came
      from the **hand-made sample data**, not the plugin (the only file the plugin created was the library note):
      (1) `Movies/Sci-fi/` was a test of notes in a user-made subfolder; renamed to `Movies/Subfolder test/` and
      explained in `Start here.md` (the plugin never creates subfolders); (2) both movie samples were deliberately
      poster-less (no poster / missing file) because movie posters need TMDB/OMDb keys (milestone 3). Added
      *Charade* (1963) with a **public-domain** poster from Wikimedia Commons (license checked: "Public domain",
      not copyrighted) so a movie row shows a poster now
- [x] Q3 answered (user: "yes"): **Owned** and **Streaming** columns after Watched in all three tables (`owned AS
      Owned`, `streaming AS Streaming`), `owned: N/A` / `streaming: N/A` in the templates (DESIGN.md §9, §10).
      Sample notes given values. Tests updated (38 pass)
- [x] TVmaze poster size (user: "smaller size is fine"): **medium**, 210×295, ~15 KB (TVmaze's only other size is the
      2000×3000 original, 1.3 MB). Sample poster replaced. Note: smaller than MyAnimeList (425 px) and TMDB (500 px);
      sharp in the table (80 px), soft if embedded full-size in a note

### Phase 4 — Build and test
- [x] **Milestone 1** (TVmaze, Create TV show note), local commit:
  - `core/http.ts`: 429 retried after `Retry-After` (2 s if missing) up to twice when ≤ 10 s, else "try again in N
    minutes"; 500/502/503/504 retried after 1 s and 3 s; no retry on timeouts or network errors; per-source timeout;
    progress messages ("Still waiting for …" after 5 s, "… is busy; trying again…"); option to hand the final 5xx to
    the source (for Tenrai/Jikan's "can't reach MyAnimeList" in M2). The URL is never logged (keys may be in it)
  - `sources/`: `Title` model for all types; registry with the fallback order per type; `parseQuery` (year in
    parentheses, IMDb ID or link, MyAnimeList link; bare numbers stay titles); fallback as in Library Notes plus a
    **10-minute skip** of a source that just failed (network/timeout/server/rate limit/bad response), except when
    chosen with its button; "Searching TVmaze…" in the window; genre names made consistent; HTML → text
  - **TVmaze**: search (year first), IMDb lookup (301 → show, 404 → none), details in one request (cast, crew, seasons
    embedded): creators, top-5 cast, seasons with a date, episodes; network or streaming service; medium poster saved,
    original linked; 500 ms spacing; check button
  - `media/`: the three built-in templates (DESIGN.md §9, with owned/streaming), variables, anime title choice;
    the create flow (search → pick → duplicates → details → poster → template → open), copies named `Title (Year)`,
    duplicate window shows the existing note's year, posters `Title (Year) - source-id.jpg`, the "needs a key"
    window for movies (Open settings via a feature-checked wrapper; How to get a key → README section)
  - UI: ribbon `clapperboard` → menu (Movie, TV show; Anime in M2); commands Create movie note / Create TV show note;
    settings groups Templates (per type + Create editable templates) and Sources (default per type, fallback,
    anime title, Check buttons); search window shows progress
  - Ribbon tooltip reworded to "Create a watchlist note": the sentence-case lint rule's acronym list lacks "TV"
    (Obsidian's review uses the defaults; same approach as Library Notes)
  - Tests: **77 pass offline in 0.2 s** (new: retries 6, sources/fallback/genres/parsing 9, templates 6, TVmaze 6
    recorded, create flow 11 recorded). Recordings: 17 TVmaze responses (api + static hosts), content-type header
    only, scanned clean. Recording run: 17/17 against the live service
  - build (main.js 35,556 bytes), lint, lint without moment types: clean
  - Design details settled while building (DESIGN.md §6): anime exact lookup = MyAnimeList **link** only; a year in
    parentheses puts that year's results **first** (others follow)

- [x] User tested milestone 1 in the vault (2026-10-06): "yes all tests passed"
- [x] **Milestone 2** (anime), local commit:
  - `sources/myanimelist.ts`: one module for APIs in Jikan v4's format, used twice: **Tenrai**
    (`api.tenrai.org/v1`, 500 ms spacing) and **Jikan** (`api.jikan.moe/v4`, 1 s spacing); 20 s timeout; search with
    `sfw=true` when "Hide adult titles" is on (checked live: R+ titles left out); CM/PV/Music left out; MyAnimeList
    link → that anime (404 → none); no second request for details (search answers are complete); three titles,
    format, episodes, aired dates, studios, genres, age rating, season ("Fall 2023"), runtime ("2 hr 4 min" → 124),
    synopsis without "[Written by MAL Rewrite]"; poster `large`; key `mal-<id>` shared by both
  - `core/http.ts`: sources can describe a server error left after the retries; Tenrai/Jikan's 504 becomes
    "Tenrai can't reach MyAnimeList right now…" (replaces the earlier hand-back option; keeps the cache)
  - Settings: **Hide adult titles** (on); Create anime note command + **Anime** in the ribbon menu (`sparkles`)
  - **Bug fix (also present in Library Notes):** file names ending with a dot or space are invalid on Windows;
    `safeFileName` now trims them ("Your Name." → `Your Name.md`, not `Your Name..md`; the `title` property keeps
    the real title). Library Notes has the same code (books rarely end with a dot); not changed there (read-only)
  - Jikan still down today (connection timeouts at 16:30 local); Jikan tested with stand-in answers in its format
  - Tests: **91 pass offline in 0.24 s** (new: MyAnimeList sources 8 with recorded Tenrai answers, anime create
    flow 6 recorded, file-name cases 3). Recording run 14/14 live. Recordings scanned: only Tenrai and
    cdn.myanimelist.net, content-type header only; one scan hit ("toNY") is inside a poster's base64 bytes
  - build (main.js 38,343 bytes), lint, lint without moment types: clean

- [x] User tested milestone 2 (2026-10-06): steps 1–2 passed; "Jikan actually worked". Checked: every anime note in
      the vault has `source: Tenrai` (none from Jikan), and Jikan still times out here on every route (02:46 UTC),
      so the Jikan button most likely **fell back to Tenrai**, signalled only by a notice. Fix: the results list now
      says "N results from Tenrai (instead of Jikan)"; test added (92 pass). To confirm in the vault: a note created
      after choosing Jikan says which source answered in `source`
- [x] User (2026-10-06): **skip the TMDB and OMDb keys for now**; build milestone 3 anyway, tested with stand-in answers
      in the services' documented formats; live check with the user's keys later

- [x] **Milestone 3** (movies: TMDB and OMDb), built without keys, local commit:
  - **TMDB** (`sources/tmdb.ts`; movies, TV, anime): the Read Access Token goes in `Authorization: Bearer` (never in a
    URL); the older API key in `api_key=` (TMDB's only option for it). Search with language, `include_adult` from
    "Hide adult titles", year (`primary_release_year` / `first_air_date_year`); IMDb ID via `/find`; details with
    `append_to_response=credits` (+`external_ids` for TV): directors, top-5 cast in billing order, runtime, genres,
    creators, network, seasons, episodes, status, IMDb ID; anime = animated series and films, Japanese first, English
    and Japanese titles (TMDB has no romaji), studios; posters `w500`, thumbnails `w154`; key check via
    `/authentication` ("Validate Key"); 401/status 7 → "TMDB rejected the key…"; 404/34 → no entry; 100 ms spacing
  - **OMDb** (`sources/omdb.ts`; movies, TV): key in `apikey=` (OMDb's only option); search `s` + `type`; IMDb ID via
    `i`; details with `plot=full`; "N/A" read as empty; field names read regardless of capitals; `Released`
    "16 Jul 2010" → date; series years "2008–2013" → ended / "2019–" → running; Writer → creators for series;
    errors: not found → no results, too many results, invalid key, **daily limit** ("used up today's 1,000
    requests"), no key; 250 ms spacing. Formats from OMDb's Swagger file (parameters, `apikey` in the query) and
    published field lists; live confirmation pending
  - Settings: **TMDB** (key in Obsidian's keychain with how-to-get steps, Check TMDB key, Preferred language) and
    **OMDb** (key, Check OMDb key) sections; key-based sources marked `needsKey` (not under "Check sources");
    **Credits** section: TMDB's approved "Alt short" logo, bundled unchanged as a data URL (sha256 8e7b30f73a40…,
    the same hash as TMDB's file name; verified in the built main.js), 14 px high, linking to themoviedb.org, with
    the exact notice from TMDB's API Terms §3; credits for TVmaze (CC BY-SA), MyAnimeList via Tenrai/Jikan, OMDb
    (CC BY-NC 4.0). `assets/tmdb-logo.svg` kept for the README
  - Brand names in link texts come from the source modules (`tmdb.name`, …) and a `MYANIMELIST` constant, because
    the sentence-case lint rule doesn't know these brands (it would lowercase "TVmaze", "OMDb")
  - Tests: **113 pass offline in 0.28 s** (new: TMDB 9, OMDb 7, movie and backup flows 5) with hand-written answers
    in each service's documented format (DESIGN.md, "Tests for TMDB and OMDb"); the recording tool refuses TMDB/OMDb hosts
  - build (main.js 52,017 bytes; hosts: the 13 expected), lint, lint without moment types: clean

- [x] User tested milestone 3 checks 1–3 (2026-10-07): "looks good, tests are fine"
- [x] **Milestone 4** (Refresh TMDB notes, decision R3 option A), local commit:
  - `library/tmdb-refresh.ts`: finds notes in the three folders whose `sourceUrl` is a TMDB address (type from the
    folder, movie/TV and ID from the address); **due** 5 calendar months after `sourceUpdated`, else `created`, else
    the file's creation time; command **Refresh TMDB notes** asks first (**Refresh N due** / **Refresh all M** /
    Cancel, explaining what changes); per note: details again, poster downloaded and the linked poster file
    **replaced in place** (`vault.modifyBinary`, only inside the posters folder; otherwise a new poster under the
    usual name is linked), only the TMDB properties the note already has are updated, `sourceUpdated` = today;
    never changed: file name, `title`, `watched`, `rating`, `tags`, `link`, `created`, other properties, the text
  - Summary notice: refreshed count; no longer on TMDB (left as is); no poster at TMDB (old one kept); failures;
    stops at problems that would repeat (offline, key missing/rejected, rate limit, network); notes that say
    `source: TMDB` without a TMDB address are listed as not refreshable. Progress shown in one notice ("3 of 12")
  - Reminder once per session when a create or regenerate command runs and notes are due; TMDB settings show the
    status ("N of your M notes from TMDB were last updated more than 5 months ago…") with the action
  - Shared poster naming (`posterBaseName`), `notesIn` (notes in a folder tree), `localDate`
  - Tests: **123 pass offline** (new: refresh 10, stand-in answers). Build (main.js 58,778 bytes), lint, lint without
    moment types: clean
  - Test vault: `Watch Library/Movies/Refresh test.md` (pretends to be from TMDB, 9 months old) for checks without a key

- [x] User (2026-10-07): "ok, go ahead. next phase." Phase 4 closed; milestone 5 (in-app developer checks) **skipped** as
      recommended (Library Notes already proved the User-Agent on this Obsidian; tables checked by eye). Milestone 4
      checks not reported separately. Live checks with the TMDB/OMDb keys stay pending (below)

### Phase 5 — GitHub repo and docs
- [x] README in Library Notes' style: features, comparison with Library Notes and Media DB, installation, usage
      (commands, adding a title, search tips, which source), folder structure, the library note and its generated query
      (taken from the code, not copied by hand), regenerating, settings (every group), **Getting a TMDB key**
      (the "How to get a key" button's anchor) and **Getting an OMDb key** (checked against TMDB's getting-started page
      and OMDb's key page: OMDb mentions no activation link, so the README doesn't promise one), TMDB's 6-month limit,
      templates and variables, network use and privacy (every host), content and licensing, troubleshooting,
      development, releasing, credits with TMDB's logo and notice; MIT license with a note that the TMDB logo isn't MIT
- [x] Checked the README against the code: 27 setting/command/button names and 16 messages found in the code; both
      internal anchors resolve. Fixed what the check found: "searches are remembered" applies only to TVmaze, Tenrai,
      and Jikan (TMDB and OMDb aren't cached); anime details request wording; Dataview notice now says "tables";
      logged network errors now have any `apikey=`/`api_key=` value replaced with `[key]` (new test)
- [x] Pre-push security checks (gitleaks 8.30.1 from the official release, checksum verified, run from the scratch
      folder): every commit, the exact files to be pushed (`git archive`), and the decoded test recordings. First run:
      4 findings, all made-up test keys (a JWT-shaped token decoding to {"alg":"HS256"}.{"test":true}.test-signature,
      and `0123456789abcdef…`); moved into `tests/support/stand-ins.ts` with `gitleaks:allow`, earlier findings listed
      in `.gitleaksignore` with an explanation. Re-run: **no leaks** in commits or files to be pushed. Personal-data
      scan of every commit: only the made-up keys. 76 tracked files; ignored: `.claude/`, `main.js`, `node_modules/`,
      `test-vault/`, `tests/.build/`. All commits by BurningBurrito (noreply address); 0 attribution lines

- [x] User (2026-10-07): "Yes, include DESIGN/STATUS" — create the public repo and push
- [x] Before the push: `gh` signed in as BurningBurrito (scopes include `repo`, `workflow`); clean tree; 0 attribution
      lines; one author (noreply)
- [x] Created **https://github.com/BurningBurrito/obsidian-movie-library** (public; description = manifest description;
      topics obsidian, obsidian-plugin, obsidian-md, movies, tv-shows, anime, tmdb, tvmaze, myanimelist, dataview,
      watchlist)
- [x] Pushed `main` only (11 commits, f73bd5a; no tags). CI run 37578016662: **success** on Node 22 and 24 (npm ci,
      build, lint, `npm test`, lint without moment types)
- [x] Checked from outside: `assets/tmdb-logo.svg`, README.md, manifest.json served from GitHub (200) and identical to
      the local files
- [x] Carried over from Library Notes and in the repo: release workflow, LICENSE (MIT), .gitignore, lint setup

- [x] Phase 6 decision (user, 2026-10-07): first release is **1.0.0**. User is getting a TMDB key now, so the live
      TMDB check runs before the release

## In progress
- [ ] User: TMDB key (steps given in chat), then milestone 3 checks 4, 6, 7 and the milestone 4 refresh check with it

## Next
- [ ] Phase 4 — build and test, in milestones, each tested in the test vault with Library Notes alongside:
  - M5: recorded-response tests for every source, developer checks, error cases (offline, no results, rate limits,
    slow responses, invalid keys)
- [ ] Phase 6: release and community submission (show everything before submitting)

## Decisions made
- Library Notes is never modified; the new plugin is a separate project with its own git history
- No code from Media DB (GPL-3.0); only its features were compared
- R1 Anime: **Tenrai** default, Jikan backup (same module), then TMDB (user, 2026-10-06)
- R2 AniList **left out** (terms prohibit list/tracker use). R5 Wikidata **left out** of 1.0
- R3 TMDB 6-month caching: **option A**, save then refresh (DESIGN.md §12)
- R4 TMDB notice: the API Terms' wording, "This product uses TMDB and the TMDB APIs but is not endorsed, certified,
  or otherwise approved by TMDB."
- R6 TV: TVmaze → TMDB → OMDb. R7 Movies: TMDB → OMDb; without a key, explain and link to setup
- Q1 Name **Watchlist Notes**, ID **`watchlist-notes`** (user, 2026-10-06). The ID can never change after release
- First release version **1.0.0** (user, 2026-10-07)
- Public GitHub repository: **`BurningBurrito/obsidian-movie-library`** (user, 2026-10-06: "name this
  obsidian-movie-library as the public git before we publish"). Name checked free on the account. The repo is
  still created only in Phase 5, after confirming. Plugin name and ID unchanged (a repo name may differ from the
  ID and may contain "obsidian"; the ID may not). Used in the User-Agent
- Q2 **Three tables** (Movies, TV shows, Anime) in one marked block; Q3 anime **Format** column yes; **Owned** and
  **Streaming** columns yes (user, 2026-10-06)
- TVmaze posters saved at the **medium** size (user, 2026-10-06)
- Q4 `rating` = the user's own rating (`N/A`), source score in `score`; Q5 "Create copy" → `Title (Year)`
- Q6 rest of DESIGN.md §6–§14 approved as written
- Scaffold: developer checks left out until Phase 4 (they test the sources); README is a stub until Phase 5

## Open questions / blockers
- Risk: Tenrai is in beta with a v2 planned; Jikan is down. Anime without a key depends on one of them working
- **Pending live check with the user's keys** (user, 2026-10-06: keys later): TMDB with a real Read Access Token and
  an API key (search, details, credits, `/find`, anime results, posters); OMDb with a free key (field names, the
  `Poster` field on a free key, the daily-limit message's exact wording)
- Phase 5: the README needs a heading "Getting a TMDB key" (the "How to get a key" button links to
  `#getting-a-tmdb-key`)
