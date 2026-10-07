# Watchlist Notes

Search for movies, TV shows, and anime, save each one as a note with its poster, and keep a library note with a table of everything you watch. TV shows and anime work without an API key.

Type a title, pick it from the results, and Watchlist Notes creates a note from your template, saves the poster in your vault, and lists the title in a library note with tables of your movies, TV shows, and anime.

## Features

- **TV shows and anime without any setup:** TV shows come from [TVmaze](https://www.tvmaze.com) and anime from [MyAnimeList](https://myanimelist.net) (through Tenrai, with Jikan as a backup), with no account or API key.
- **Movies with your own free key:** add a [TMDB](https://www.themoviedb.org) or [OMDb](https://www.omdbapi.com) key to search movies. TMDB can also stand in for TV shows and anime.
- **Backup sources:** if a service fails or finds nothing, Watchlist Notes can try the next one and tells you it did. A service that just failed is skipped for a while, so one that's down doesn't slow every search.
- **Posters saved in your vault:** each poster is downloaded once into a posters folder, so your notes show it offline. Titles without a poster still get a note.
- **A library note with three tables:** Movies, TV shows, and Anime, each with poster, title, year, director / creator / studio, genre, a link to the note, whether you've watched it (🟩 / 🟥), and whether you own it or where it streams. It's created the first time you add a title and never overwritten.
- **Watched status:** one command marks the open note as watched or unwatched.
- **Anime titles your way:** name anime notes by their English, romaji, or Japanese title. Every note keeps all three.
- **Notes from templates:** a built-in template for each type, or your own, with the properties you choose.
- **Safe with existing notes:** if a title already has a note, you choose to open it, create a copy, or cancel. A copy is named by its year, such as `The Office (2001)`. Nothing is ever overwritten, renamed, or deleted.
- **Clear errors:** you get a plain message when you're offline, nothing is found, a service is busy or down, or a key is wrong.

Requires Obsidian 1.13.0 or later. The library tables need the [Dataview](https://github.com/blacksmithgu/obsidian-dataview) plugin.

### Compared with other plugins

- **[Library Notes](https://github.com/BurningBurrito/library-notes)** (same author) does the same for books. The two plugins are separate and work side by side in one vault; their library tables look the same.
- **[Media DB](https://github.com/mProjectsCode/obsidian-media-db-plugin)** covers many more kinds of media (games, music, board games, and others) and lets you choose which APIs to search each time. Watchlist Notes focuses on movies, TV shows, and anime: it needs no key for TV shows and anime, falls back between sources automatically, always saves posters, keeps a library note with Dataview tables and a watched toggle, and never overwrites a note.

## Installation

### From Community plugins

1. Open **Settings → Community plugins** and turn off **Restricted mode** if it's on.
2. Select **Browse**, search for **Watchlist Notes**, then select **Install** and **Enable**.
3. For the library tables, also install and enable **Dataview**.

### Manually

1. Download `main.js`, `manifest.json`, and `styles.css` from the [latest release](https://github.com/BurningBurrito/obsidian-movie-library/releases/latest).
2. In your vault folder, create the folder `.obsidian/plugins/watchlist-notes/` and copy the three files into it.
3. Reload Obsidian, then enable **Watchlist Notes** in **Settings → Community plugins**.

## Usage

Select the clapperboard icon in the ribbon and choose **Movie**, **TV show**, or **Anime**, or open the command palette (<kbd>Ctrl/Cmd</kbd>+<kbd>P</kbd>) and run one of these commands:

| Command | What it does |
| --- | --- |
| **Watchlist Notes: Create movie note** | Search for a movie and create its note. Needs a TMDB or OMDb key. |
| **Watchlist Notes: Create TV show note** | Search for a TV show and create its note. |
| **Watchlist Notes: Create anime note** | Search for an anime series or film and create its note. |
| **Watchlist Notes: Toggle watched status** | Mark the open note as watched or unwatched. Available when a note in your movies, TV shows, or anime folder is open. |
| **Watchlist Notes: Regenerate library note** | Rebuild the library tables, or add them to a library note you made yourself. You confirm first. |
| **Watchlist Notes: Refresh TMDB notes** | Download the details and posters of notes from TMDB again. See [TMDB's 6-month limit](#tmdbs-6-month-limit). |

### Adding a title

1. Choose the type from the ribbon menu, or run its command. If you have text selected in a note, it's used as the search text.
2. Type the title and press <kbd>Enter</kbd>. If you've set up more than one source for that type, choose one with the buttons at the top.
3. Choose the title from the list. It shows posters, years, and details such as the network or studio, and you can type to filter it.
4. The note is created in that type's folder and opened, with the poster saved in your posters folder.

If a note with that name already exists (small differences such as capital letters or ’ vs ' don't count), you're asked whether to **Open existing**, **Create copy**, or **Cancel**. The window shows the existing note's year, and a copy is named by its year, such as `Dune (2021)`, so a remake doesn't look like a sequel.

### Search tips

- **A year in parentheses** puts that year's results first: `The Office (2005)`. Only in parentheses, because a number can be part of a title (*Blade Runner 2049*).
- **An IMDb ID** (`tt0903747`) or IMDb link finds that movie or TV show directly, without a list.
- **A MyAnimeList link** (`https://myanimelist.net/anime/5114/…`) finds that anime directly.
- **Anime** can be searched by English or romaji title.

### Which source?

| Type | Sources, in order | Without a key |
| --- | --- | --- |
| Movies | TMDB, OMDb | Explains that a key is needed and how to get one |
| TV shows | TVmaze, TMDB, OMDb | TVmaze |
| Anime | Tenrai, Jikan, TMDB | Tenrai and Jikan |

The first source you've set up is the default; you can change it in the settings or with the buttons in the search window. With **Try the next source if the default one fails or finds nothing** on, the next source is tried when one fails or finds nothing, and the results list says so, such as "20 results from Tenrai (instead of Jikan)". Each note's `source` property says which service it came from.

### Tips

- Assign hotkeys in **Settings → Hotkeys** by searching for "Watchlist Notes".
- To hide the ribbon icon, right-click the ribbon and turn it off. The commands keep working.
- To change what notes contain, select **Create editable templates** in the settings and edit the files in `Templates/`.

## Folder structure

Watchlist Notes keeps everything in one library folder, which can be inside another folder (such as `Synced Notes/Watch Library`):

```
Watch Library/
├── Watch Library MOC.md   ← the library note, with tables of your movies, TV shows, and anime
├── Movies/                ← one note per movie
├── TV Shows/              ← one note per TV show
├── Anime/                 ← one note per anime series or film (the format property says which)
└── Posters/               ← poster images
```

All six names are settings. Missing folders are created the first time you add a title. Existing folders and notes are never renamed, moved, or deleted. Notes in subfolders you make yourself, such as `Movies/Favorites/`, still show in the tables.

Posters are named after the title, its year, and the source's ID, such as `Inception (2010) - tmdb-movie-27205.jpg` or `Severance (2022) - tvmaze-44933.jpg`, so two titles never share a poster.

## The library note and Dataview

The library note has three tables:

| Table | Columns |
| --- | --- |
| Movies | Poster, Title, Year, Director, Genre, Note, Watched, Owned, Streaming |
| TV shows | Poster, Title, Year, Creator, Genre, Note, Watched, Owned, Streaming |
| Anime | Poster, Title, Year, Format, Studio, Genre, Note, Watched, Owned, Streaming |

**Owned** and **Streaming** are for you to fill in: set `owned` to 🟩, 🟥, or N/A (for example, whether you have it on disc or as a digital copy), and `streaming` to where you can watch it, such as `Netflix`.

The tables are [Dataview](https://github.com/blacksmithgu/obsidian-dataview) queries, so **Dataview must be installed and enabled** for them to show. Watchlist Notes doesn't install it for you; if it's missing or turned off, you get a notice explaining what to do, and the settings show its status.

The library note is created with `cssclasses: watchlist-notes-moc`, which makes that note use the full width of the window so the tables fit. To keep the normal width, remove that class from the note's properties.

The generated Movies table, with the default folders (the TV shows and Anime tables differ only in their folder and middle columns):

````markdown
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
````

The Anime table's Title column follows the **Anime title** setting, for example `default(englishTitle, default(title, file.name)) AS Title`. The poster column shows posters stored as a link (`"[[Posters/Dune.jpg]]"`, what Watchlist Notes writes), an embed (`"![[Posters/Dune.jpg]]"`), or a plain path. If a poster file is missing, the cell is left empty.

### Regenerating

**Regenerate library note** rebuilds the tables from your current settings. It always asks first, and only changes the tables:

- In a library note that Watchlist Notes created, it replaces the part between its `%% watchlist-notes:start %%` and `%% watchlist-notes:end %%` markers.
- In a library note you made yourself that has one Dataview table, you can **Replace that table** or **Add at the end**.
- Otherwise, the tables are added at the end.

Your properties and any other text stay as they are. Run it after changing a folder or the **Anime title** setting. If your library note's name differs from the setting only in capital letters, Watchlist Notes uses your note instead of creating a second one.

## Settings

| Setting | Default | Description |
| --- | --- | --- |
| Library folder | `Watch Library` | Holds the library note and the other folders. Can be inside another folder. |
| Movies folder | `Movies` | Inside the library folder. One note per movie. |
| TV shows folder | `TV Shows` | Inside the library folder. One note per TV show. |
| Anime folder | `Anime` | Inside the library folder. One note per anime series or film. |
| Posters folder | `Posters` | Inside the library folder. Posters are saved here. |
| Open note after creating it | On | Opens the new note in the current tab. |

Movies, TV shows, anime, and posters each need their own folder; one can't be the same as, or inside, another.

**Library note**

| Setting | Default | Description |
| --- | --- | --- |
| Library note name | `Watch Library MOC` | The overview note in the library folder. |
| Dataview | | Shows whether Dataview is installed and enabled. |
| Regenerate library note | | Same as the command. |

**Templates**

| Setting | Default | Description |
| --- | --- | --- |
| Movie template, TV show template, Anime template | _(empty)_ | A note to use as the template for that type. Leave empty to use the built-in template. |
| Create editable templates | | Saves the built-in templates to `Templates/Movie note.md`, `Templates/TV show note.md`, and `Templates/Anime note.md` (existing files aren't overwritten) and selects them. |

**Sources**

| Setting | Default | Description |
| --- | --- | --- |
| Movie / TV show / Anime: default source | TMDB / TVmaze / Tenrai | Where searches go first. Shown once a source for that type is set up. |
| Try the next source if the default one fails or finds nothing | On | Uses your other sources for that type, in order. A source that just failed is skipped for 10 minutes. |
| Hide adult titles | On | Leaves titles rated for adults out of search results. A MyAnimeList link always finds its anime. |
| Anime title | English | Which title names anime notes and the anime table: English, Romaji, or Japanese. English and Japanese fall back to romaji. |
| Check sources | | Makes one small request to Tenrai, Jikan, or TVmaze to check that it can be reached. |

**TMDB**

| Setting | Default | Description |
| --- | --- | --- |
| Read Access Token or API key | | Your TMDB key. It's kept in Obsidian's keychain, not in the plugin's settings file. |
| Check TMDB key | | Makes one small request to TMDB with your key. Shown once a key is set. |
| Refresh TMDB notes | | Shows how many notes from TMDB are due for a refresh, and refreshes them. |
| Preferred language | `en` | Two-letter code for TMDB's titles and descriptions. Leave empty for TMDB's default. |

**OMDb**

| Setting | Default | Description |
| --- | --- | --- |
| API key | | Your OMDb key, kept in Obsidian's keychain. |
| Check OMDb key | | Makes one small request to OMDb with your key. Shown once a key is set. |

**Credits** lists the services the information comes from, with TMDB's logo and notice.

### Getting a TMDB key

TMDB is free for non-commercial use:

1. Create an account at [themoviedb.org](https://www.themoviedb.org/signup). TMDB recommends doing the next steps on a computer; the registration isn't designed for phones.
2. In your account settings, select **API** and follow the steps to request an API key, agreeing to TMDB's API terms of use.
3. Copy the **API Read Access Token** (the long one). The shorter **API Key** works too, but the token is better: Watchlist Notes sends it in a request header, while the API key has to be part of each web address.
4. In Obsidian, open **Settings → Watchlist Notes → TMDB → Read Access Token or API key**, and add it.
5. Select **Check TMDB key**.

### Getting an OMDb key

1. Go to [omdbapi.com/apikey.aspx](https://www.omdbapi.com/apikey.aspx), choose **FREE! (1,000 daily limit)**, and enter your email address.
2. OMDb emails you the key; follow the instructions in the email. It can take up to an hour, especially with Yahoo and Microsoft addresses.
3. In Obsidian, open **Settings → Watchlist Notes → OMDb → API key**, add the key, and select **Check OMDb key**.

A free key allows 1,000 requests a day; if you reach it, Watchlist Notes says so and you can use TMDB instead.

## TMDB's 6-month limit

TMDB's [API terms of use](https://www.themoviedb.org/api-terms-of-use) don't allow keeping information from TMDB for more than six months. A note made from TMDB, and its poster, keep that information, so Watchlist Notes helps you keep it fresh:

- A note from TMDB is **due** five months after its last update (its `sourceUpdated` property, or `created` if it has none).
- When notes are due, a notice says so once per session, and **Settings → Watchlist Notes → TMDB** shows how many.
- **Refresh TMDB notes** asks first, then downloads each note's details and poster again. It replaces the poster file and updates the TMDB properties the note has (such as year, director, cast, genre, score, and description), and sets `sourceUpdated`. The note's name and title, `watched`, `rating`, your other properties, and your text don't change. Nothing is deleted.

Nothing happens on its own. If you stop using TMDB, its terms ask you to delete what came from it; you can find those notes by their `source: TMDB` property. Notes from TVmaze, MyAnimeList, and OMDb aren't affected.

## Templates

A template is a normal note containing `{{variables}}`. When a note is created, each variable is replaced with information about the title. Variables Watchlist Notes doesn't recognize are left as they are, so syntax from other template plugins keeps working.

When a variable is the whole value of a property, such as `cast: {{cast}}`, Watchlist Notes formats it so the properties stay valid: lists become list properties, numbers stay numbers, and text is quoted when needed. Don't add your own quotes around these variables.

| Variable | Movies | TV shows | Anime | Contents |
| --- | :-: | :-: | :-: | --- |
| `{{title}}` | ✓ | ✓ | ✓ | Title; for anime, the one chosen in **Anime title** |
| `{{year}}` | ✓ | ✓ | ✓ | Year of release or first air date |
| `{{genre}}` | ✓ | ✓ | ✓ | Genres (a list property), with the same names across sources, such as `Science fiction` |
| `{{description}}` | ✓ | ✓ | ✓ | Description |
| `{{score}}` | ✓ | ✓ | ✓ | The source's average score, 0–10 |
| `{{cast}}` | ✓ | ✓ | | Up to five cast members (a list property) |
| `{{originalTitle}}` | ✓ | | | Title in the original language, when it differs |
| `{{releaseDate}}` | ✓ | | | Release date, such as `2010-07-15` |
| `{{director}}` | ✓ | | | Directors (a list property) |
| `{{runtime}}` | ✓ | ✓ | ✓ | Minutes (per episode for TV shows and anime) |
| `{{firstAired}}`, `{{lastAired}}` | | ✓ | ✓ | First and last air dates |
| `{{status}}` | | ✓ | ✓ | As the source says it, such as `Running` or `Finished Airing` |
| `{{episodes}}` | | ✓ | ✓ | Number of episodes |
| `{{creator}}` | | ✓ | | Creators (a list property) |
| `{{network}}` | | ✓ | | Network or streaming service |
| `{{seasons}}` | | ✓ | | Number of seasons |
| `{{englishTitle}}`, `{{romajiTitle}}`, `{{japaneseTitle}}` | | | ✓ | The three titles |
| `{{format}}` | | | ✓ | TV, Movie, OVA, ONA, Special, or TV Special |
| `{{studio}}` | | | ✓ | Studios (a list property) |
| `{{ageRating}}` | | | ✓ | Such as `PG-13 - Teens 13 or older` |
| `{{season}}` | | | ✓ | Such as `Fall 2023` |
| `{{imdbId}}` | ✓ | ✓ | | IMDb ID, when the source knows it |
| `{{mediaType}}` | ✓ | ✓ | ✓ | `Movie`, `TV show`, or `Anime` |
| `{{coverUrl}}` | ✓ | ✓ | ✓ | Web address of the poster |
| `{{localCover}}` | ✓ | ✓ | ✓ | Link to the saved poster, such as `[[Watch Library/Posters/Inception (2010) - tmdb-movie-27205.jpg]]`; empty when there's no poster |
| `{{localCoverPath}}` | ✓ | ✓ | ✓ | Path of the saved poster, without the link brackets |
| `{{source}}`, `{{sourceUrl}}` | ✓ | ✓ | ✓ | Where the information came from, and the title's page there |
| `{{libraryLink}}` | ✓ | ✓ | ✓ | Link to the library note, such as `[[Watch Library MOC]]` |
| `{{date}}`, `{{time}}` | ✓ | ✓ | ✓ | When the note was created (`YYYY-MM-DD`, `HH:mm`) |
| `{{date:FORMAT}}`, `{{time:FORMAT}}` | ✓ | ✓ | ✓ | Same, in a [Moment.js format](https://momentjs.com/docs/#/displaying/format/) |

Not every source provides every field; an unavailable field is left empty.

### Built-in templates

The movie template:

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

The TV show template has `tags: 📺TVShow`, `title`, `year`, `firstAired`, `lastAired`, `status`, `creator`, `network`, `seasons`, `episodes`, `cast`, `genre`, `score`, `description`, `cover`, and `localCover`, followed by the same properties from `watched` on. The anime template has `tags: 🎌Anime`, `title`, `englishTitle`, `romajiTitle`, `japaneseTitle`, `format`, `year`, `episodes`, `status`, `firstAired`, `lastAired`, `studio`, `genre`, `score`, `description`, `cover`, and `localCover`, followed by the same properties. **Create editable templates** saves all three so you can read and change them.

`localCover` is stored as a link, so Obsidian updates it if you rename or move the image. `watched` is the property that **Toggle watched status** changes and the tables show. `rating` is for your own rating. `link` points back to the library note.

## Network use and privacy

Watchlist Notes needs an internet connection to search. It sends **only what you type in the search window** to the services below, the TMDB IDs of notes you refresh to TMDB, and your keys to the services that need them. Its requests identify Watchlist Notes with a link to this repository; the poster thumbnails in the results list are loaded by Obsidian like any image.

| Service | Used for | Account needed |
| --- | --- | --- |
| [Tenrai](https://tenrai.org) (`api.tenrai.org`) | Searching anime (default anime source) | No |
| [Jikan](https://jikan.moe) (`api.jikan.moe`) | Searching anime when Tenrai can't be used, or when you choose it | No |
| MyAnimeList's image service (`cdn.myanimelist.net`) | Anime posters | No |
| [TVmaze](https://www.tvmaze.com) (`api.tvmaze.com`, images from `static.tvmaze.com`) | Searching TV shows (default TV source), and their posters | No |
| [TMDB](https://www.themoviedb.org) (`api.themoviedb.org`, images from `image.tmdb.org`) | Searching movies, and TV shows and anime when you choose it or as a backup; refreshing notes from TMDB | Yes. A free TMDB account and key. Use is subject to [TMDB's API terms](https://www.themoviedb.org/api-terms-of-use). |
| [OMDb](https://www.omdbapi.com) (`www.omdbapi.com`, posters from `m.media-amazon.com`) | Searching movies and TV shows, when you add a key | Yes. A free OMDb key (by email). |

Adding a title sends a few requests: one or two searches, one for the details (none for anime from Tenrai or Jikan, whose search results are complete), and one for the poster. Requests to each service are spaced out within its published limits (for example, two a second for TVmaze and Tenrai, one a second for Jikan), and a busy service is asked again after a short wait, as the services ask. Searches on TVmaze, Tenrai, and Jikan are remembered for 30 minutes (until Obsidian closes), so repeating one doesn't ask again.

Keys are kept in Obsidian's keychain, not in the plugin's settings file. TMDB's Read Access Token is sent in a request header. OMDb's key, and TMDB's older API key, can only be sent as part of the web address; Watchlist Notes never writes request addresses or keys to the developer console.

Watchlist Notes has no telemetry or analytics, and it doesn't read or send your notes. Each service may log requests under its own policies.

## Content and licensing

- **TMDB:** This product uses TMDB and the TMDB APIs but is not endorsed, certified, or otherwise approved by TMDB. Use of TMDB is free for non-commercial use under [TMDB's API terms](https://www.themoviedb.org/api-terms-of-use), which also limit keeping TMDB data to six months (see [TMDB's 6-month limit](#tmdbs-6-month-limit)).
- **TV show information from TVmaze** is licensed [CC BY-SA](https://creativecommons.org/licenses/by-sa/4.0/). Each note links back to the show's page on TVmaze in `sourceUrl`.
- **Anime information from MyAnimeList** comes through [Tenrai](https://tenrai.org) and [Jikan](https://jikan.moe), unofficial services that are not affiliated with MyAnimeList. Each note links to the anime's MyAnimeList page.
- **Information from OMDb** is licensed [CC BY-NC 4.0](https://creativecommons.org/licenses/by-nc/4.0/). OMDb is not endorsed by or affiliated with IMDb.
- **Posters** belong to their rights holders. Watchlist Notes saves a copy for use in your own notes.

## Troubleshooting

| Message | What to do |
| --- | --- |
| Movie search needs a key | Add a free TMDB or OMDb key; see [Getting a TMDB key](#getting-a-tmdb-key). TV shows and anime don't need one. |
| You appear to be offline | Check your internet connection. TV show and anime searches from the last 30 minutes still work. |
| No … found for "…" | Try fewer words, the IMDb ID, or for anime the romaji title or the MyAnimeList link. |
| … has received too many requests | Wait a few minutes, or turn on **Try the next source…** in the settings. |
| … is having problems / took too long to respond | The service is down or slow. Try again later, or choose another source in the search window. |
| Tenrai (or Jikan) can't reach MyAnimeList right now | MyAnimeList itself is unavailable to that service. Try the other one, or TMDB. |
| … has no poster for "…" | The note was created without a poster; add an image yourself if you like. |
| TMDB rejected the key | Check the key in **Settings → Watchlist Notes → TMDB**. Use the API Read Access Token or the API key from your TMDB account. |
| OMDb rejected the key | Check the key in **Settings → Watchlist Notes → OMDb**, and that you followed the instructions in OMDb's email. |
| Your OMDb key has used up today's 1,000 requests | Try again tomorrow, or use TMDB. |
| … notes from TMDB are due for a refresh | Run **Refresh TMDB notes**; see [TMDB's 6-month limit](#tmdbs-6-month-limit). |
| The tables in "Watch Library MOC" need the Dataview plugin | Install Dataview from **Community plugins** and enable it. |
| Template "…" was not found | The template file was moved or deleted. Choose it again in the settings. |
| "…" is a file, not a folder | A file has the name of one of the library folders. Rename it or choose another folder. |

## Development

```bash
npm install
npm run dev         # rebuild on every change
npm run build       # type-check and production build
npm run lint        # Obsidian's official ESLint rules
npm test            # offline test suite
npm run test:record # make real requests and save new recordings for the tests
```

If a `test-vault/` folder exists in the project, `npm run dev` copies `main.js`, `manifest.json`, and `styles.css` into `test-vault/.obsidian/plugins/watchlist-notes/` after every build. Open `test-vault/` as a vault to try changes without touching your real notes; the [Hot Reload](https://github.com/pjeby/hot-reload) plugin reloads the plugin automatically. `test-vault/` is gitignored.

The code is organized by job: `src/core/` (network, files, templates, posters), `src/sources/` (one module per service, behind the `MediaSource` interface in `src/sources/types.ts`), `src/media/` (creating a note and the built-in templates), `src/library/` (the library note, watched status, and refreshing notes from TMDB), and `src/ui/` (windows). The tests in `tests/` run the real code with stand-ins for Obsidian (`tests/support/`). Answers from TVmaze and Tenrai are recorded from the live services (`tests/fixtures/http/`); TMDB and OMDb tests use hand-written answers in each service's documented format (`tests/support/stand-ins.ts`), because TMDB's terms don't allow keeping its data, and the recording tool refuses those services.

### Releasing

1. Run `npm version patch` (or `minor` / `major`). This updates `package.json`, `manifest.json`, and `versions.json`, commits, and creates a tag such as `1.0.1` (no `v` prefix).
2. Run `git push --follow-tags`.
3. The **Release Obsidian plugin** workflow builds the plugin and creates a draft GitHub release with `main.js`, `manifest.json`, and `styles.css`. Review it on GitHub, then publish it.

## Credits

<a href="https://www.themoviedb.org"><img src="assets/tmdb-logo.svg" alt="TMDB" height="14"></a>

This product uses TMDB and the TMDB APIs but is not endorsed, certified, or otherwise approved by TMDB.

- Movie, TV show, and anime information and posters from [The Movie Database (TMDB)](https://www.themoviedb.org) when you use your TMDB key.
- TV show information and posters from [TVmaze](https://www.tvmaze.com) (CC BY-SA).
- Anime information and posters from [MyAnimeList](https://myanimelist.net), through [Tenrai](https://tenrai.org) and [Jikan](https://jikan.moe).
- Movie and TV information from [OMDb](https://www.omdbapi.com) (CC BY-NC 4.0) when you use your OMDb key.
- The library tables use [Dataview](https://github.com/blacksmithgu/obsidian-dataview) by Michael Brenan.
- Built from [Library Notes](https://github.com/BurningBurrito/library-notes) (same author) and the [Obsidian sample plugin](https://github.com/obsidianmd/obsidian-sample-plugin).

## License

[MIT](LICENSE). The TMDB logo in `assets/tmdb-logo.svg` is a trademark of TMDB, used for attribution as TMDB's terms require; it isn't covered by the MIT license.
