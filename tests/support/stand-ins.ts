// Stand-in answers for the services that need a key (TMDB, OMDb). They follow each service's
// documented format (TMDB's OpenAPI spec; OMDb's field names), but every description is written for
// these tests and poster paths are made up: TMDB's terms don't allow keeping its data for more than
// six months, so no real TMDB answers are stored in this repository.
import { json } from './network';

/** Made-up keys in TMDB's formats: a JWT-shaped token ({"alg":"HS256"}.{"test":true}.test-signature) and a hex API key. */
export const FAKE_TMDB_TOKEN = 'eyJhbGciOiJIUzI1NiJ9.eyJ0ZXN0Ijp0cnVlfQ.dGVzdC1zaWduYXR1cmU'; // gitleaks:allow (made up for tests)
export const FAKE_TMDB_API_KEY = '0123456789abcdef0123456789abcdef'; // gitleaks:allow (made up for tests)

const TEXT = 'A description written for the Watchlist Notes tests.';
const bytes = Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, ...new Array<number>(4096).fill(7)]);
/** A small stand-in JPEG for poster downloads. */
export const POSTER = { status: 200, base64: Buffer.from(bytes).toString('base64'), headers: { 'content-type': 'image/jpeg' } };

export const tmdbAnswers = {
	movieSearch: () =>
		json(200, {
			page: 1,
			results: [
				{ adult: false, genre_ids: [28, 878], id: 27205, original_language: 'en', original_title: 'Inception', overview: TEXT, poster_path: '/test-inception.jpg', release_date: '2010-07-15', title: 'Inception', vote_average: 8.369 },
				{ adult: false, genre_ids: [99], id: 1, original_language: 'en', original_title: 'The Making of Inception', overview: TEXT, poster_path: null, release_date: '2010-12-07', title: 'The Making of Inception', vote_average: 0 },
			],
			total_pages: 1,
			total_results: 2,
		}),
	movieDetails: () =>
		json(200, {
			genres: [{ id: 28, name: 'Action' }, { id: 878, name: 'Science Fiction' }],
			id: 27205,
			imdb_id: 'tt1375666',
			original_language: 'en',
			original_title: 'Inception',
			overview: TEXT,
			poster_path: '/test-inception.jpg',
			production_companies: [{ id: 923, name: 'Legendary Pictures' }],
			release_date: '2010-07-15',
			runtime: 148,
			status: 'Released',
			title: 'Inception',
			vote_average: 8.369,
			credits: {
				cast: [
					{ name: 'Joseph Gordon-Levitt', order: 1 },
					{ name: 'Leonardo DiCaprio', order: 0 },
					{ name: 'Elliot Page', order: 2 },
					{ name: 'Tom Hardy', order: 3 },
					{ name: 'Ken Watanabe', order: 4 },
					{ name: 'Cillian Murphy', order: 5 },
				],
				crew: [
					{ name: 'Hans Zimmer', job: 'Original Music Composer' },
					{ name: 'Christopher Nolan', job: 'Director' },
					{ name: 'Christopher Nolan', job: 'Screenplay' },
				],
			},
		}),
	tvSearch: () =>
		json(200, {
			page: 1,
			results: [{ adult: false, genre_ids: [18], id: 1396, origin_country: ['US'], original_language: 'en', original_name: 'Breaking Bad', overview: TEXT, poster_path: '/test-breaking-bad.jpg', first_air_date: '2008-01-20', name: 'Breaking Bad', vote_average: 8.9 }],
			total_pages: 1,
			total_results: 1,
		}),
	tvDetails: () =>
		json(200, {
			created_by: [{ id: 66633, name: 'Vince Gilligan' }],
			episode_run_time: [45, 47],
			first_air_date: '2008-01-20',
			genres: [{ id: 18, name: 'Drama' }, { id: 80, name: 'Crime' }],
			id: 1396,
			last_air_date: '2013-09-29',
			name: 'Breaking Bad',
			networks: [{ id: 174, name: 'AMC' }],
			number_of_episodes: 62,
			number_of_seasons: 5,
			original_language: 'en',
			original_name: 'Breaking Bad',
			overview: TEXT,
			poster_path: '/test-breaking-bad.jpg',
			production_companies: [{ id: 11073, name: 'Sony Pictures Television Studios' }],
			status: 'Ended',
			vote_average: 8.9,
			credits: { cast: [{ name: 'Bryan Cranston', order: 0 }, { name: 'Aaron Paul', order: 1 }], crew: [] },
			external_ids: { imdb_id: 'tt0903747' },
		}),
	animeTvSearch: () =>
		json(200, {
			page: 1,
			results: [
				{ id: 500, name: 'An American Cartoon', original_name: 'An American Cartoon', original_language: 'en', genre_ids: [16, 35], first_air_date: '2020-01-01', poster_path: '/test-cartoon.jpg', overview: TEXT, vote_average: 7 },
				{ id: 209867, name: "Frieren: Beyond Journey's End", original_name: '葬送のフリーレン', original_language: 'ja', genre_ids: [16, 10765], first_air_date: '2023-09-29', poster_path: '/test-frieren.jpg', overview: TEXT, vote_average: 8.8 },
				{ id: 600, name: 'Frieren: The Live-Action Talk Show', original_name: 'Frieren Talk', original_language: 'ja', genre_ids: [10767], first_air_date: '2024-01-01', poster_path: null, overview: TEXT, vote_average: 0 },
			],
		}),
	animeMovieSearch: () =>
		json(200, {
			page: 1,
			results: [{ id: 372058, title: 'Your Name.', original_title: '君の名は。', original_language: 'ja', genre_ids: [16, 10749, 18], release_date: '2016-08-26', poster_path: '/test-your-name.jpg', overview: TEXT, vote_average: 8.5 }],
		}),
	animeTvDetails: () =>
		json(200, {
			id: 209867,
			name: "Frieren: Beyond Journey's End",
			original_name: '葬送のフリーレン',
			original_language: 'ja',
			first_air_date: '2023-09-29',
			last_air_date: '2024-03-22',
			genres: [{ id: 16, name: 'Animation' }, { id: 10765, name: 'Sci-Fi & Fantasy' }],
			number_of_episodes: 28,
			number_of_seasons: 1,
			production_companies: [{ id: 3464, name: 'Madhouse' }],
			networks: [{ name: 'Nippon TV' }],
			status: 'Ended',
			overview: TEXT,
			poster_path: '/test-frieren.jpg',
			vote_average: 8.8,
			credits: { cast: [], crew: [] },
			external_ids: { imdb_id: 'tt22248376' },
		}),
	findMovie: () => json(200, { movie_results: [{ id: 27205, title: 'Inception', original_title: 'Inception', release_date: '2010-07-15', poster_path: '/test-inception.jpg', overview: TEXT, media_type: 'movie' }], tv_results: [], person_results: [] }),
	authOk: () => json(200, { success: true, status_code: 1, status_message: 'Success.' }),
	invalidKey: () => json(401, { status_code: 7, status_message: 'Invalid API key: You must be granted a valid key.', success: false }),
	notFound: () => json(404, { status_code: 34, status_message: 'The resource you requested could not be found.', success: false }),
};

export const omdbAnswers = {
	search: () =>
		json(200, {
			Search: [
				{ Title: 'Inception', Year: '2010', imdbID: 'tt1375666', Type: 'movie', Poster: 'https://m.media-amazon.com/images/M/test-inception._V1_SX300.jpg' },
				{ Title: 'Inception: The Cobol Job', Year: '2010', imdbID: 'tt5295894', Type: 'movie', Poster: 'N/A' },
			],
			totalResults: '2',
			Response: 'True',
		}),
	movie: () =>
		json(200, {
			Title: 'Inception',
			Year: '2010',
			Rated: 'PG-13',
			Released: '16 Jul 2010',
			Runtime: '148 min',
			Genre: 'Action, Adventure, Sci-Fi',
			Director: 'Christopher Nolan',
			Writer: 'Christopher Nolan',
			Actors: 'Leonardo DiCaprio, Joseph Gordon-Levitt, Elliot Page',
			Plot: TEXT,
			Poster: 'https://m.media-amazon.com/images/M/test-inception._V1_SX300.jpg',
			imdbRating: '8.8',
			imdbID: 'tt1375666',
			Type: 'movie',
			Response: 'True',
		}),
	series: (year = '2008–2013') =>
		json(200, {
			Title: 'Breaking Bad',
			Year: year,
			Released: '20 Jan 2008',
			Runtime: '49 min',
			Genre: 'Crime, Drama, Thriller',
			Director: 'N/A',
			Writer: 'Vince Gilligan',
			Actors: 'Bryan Cranston, Aaron Paul, Anna Gunn',
			Plot: TEXT,
			Poster: 'N/A',
			imdbRating: '9.5',
			imdbID: 'tt0903747',
			Type: 'series',
			totalSeasons: '5',
			Response: 'True',
		}),
	error: (message: string, status = 200) => json(status, { Response: 'False', Error: message }),
};
