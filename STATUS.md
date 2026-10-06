# Status: Watchlist Notes (`watchlist-notes`)
**Current phase:** Phase 3 — Scaffold: **complete** (local commit, nothing pushed); waiting for the user's Phase 3
check in the test vault and one open question (Owned / Streaming columns) before Phase 4
**Last updated:** 2026-10-06

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

## In progress
- [ ] User: Phase 3 check in the test vault (`test-vault/Start here.md`)
- [ ] User: Owned / Streaming columns (Q3, still open)

## Next
- [ ] Phase 4 — build and test, in milestones, each tested in the test vault with Library Notes alongside:
  - M1: http retries/backoff + 10-minute skip of failed sources; source registry per type; TVmaze; Create TV show
    note end to end (search window, results, exact IMDb lookup, duplicates with `Title (Year)` copies, poster,
    template); ribbon menu; templates settings; "Create editable templates"
  - M2: Tenrai + Jikan (one module, two base URLs); Create anime note; anime title for note names; MyAnimeList link
    lookup; CM/PV/Music filtered; adult titles hidden
  - M3: TMDB (movies; TV and anime fallback) and OMDb with keys in the keychain, Check buttons, no-key window,
    Credits with the bundled TMDB logo and notice
  - M4: Refresh TMDB notes (due after 5 months, reminder, confirmation, summary)
  - M5: recorded-response tests for every source, developer checks, error cases (offline, no results, rate limits,
    slow responses, invalid keys)
- [ ] Phase 5: GitHub repo and docs (confirm name and visibility first)
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
- Q2 **Three tables** (Movies, TV shows, Anime) in one marked block; Q3 anime **Format** column yes
- Q4 `rating` = the user's own rating (`N/A`), source score in `score`; Q5 "Create copy" → `Title (Year)`
- Q6 rest of DESIGN.md §6–§14 approved as written
- Scaffold: developer checks left out until Phase 4 (they test the sources); README is a stub until Phase 5

## Open questions / blockers
- Q3 (open): add **Owned** (🟩 / 🟥 / N/A) and **Streaming** (text) columns like AudioBook / EBook?
- Phase 4 proposal: TVmaze's "original" poster can be large (Severance: 1.3 MB vs 60–180 KB for MyAnimeList
  posters); consider a smaller size for TVmaze
- Risk: Tenrai is in beta with a v2 planned; Jikan is down. Anime without a key depends on one of them working
- To verify in Phase 4 with the user's keys: OMDb `Poster` field on a free key; TMDB with a real token
