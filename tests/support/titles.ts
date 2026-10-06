import type { MediaType } from '../../src/media/types';
import { emptyTitle, Title } from '../../src/sources/types';

/** A complete title of each type, as a source would return it. */
export function sampleTitle(type: MediaType, overrides: Partial<Title> = {}): Title {
	const samples: Record<MediaType, Partial<Title>> = {
		movie: {
			title: 'Inception',
			originalTitle: 'Inception',
			year: 2010,
			releaseDate: '2010-07-15',
			directors: ['Christopher Nolan'],
			cast: ['Leonardo DiCaprio', 'Joseph Gordon-Levitt'],
			genres: ['Action', 'Science fiction'],
			runtime: 148,
			score: 8.37,
			description: 'Cobb steals secrets from deep within the subconscious.',
			posterUrl: 'https://image.tmdb.org/t/p/w500/inception.jpg',
			posterDownloadUrl: 'https://image.tmdb.org/t/p/w500/inception.jpg',
			imdbId: 'tt1375666',
			source: { id: 'tmdb', name: 'TMDB', url: 'https://www.themoviedb.org/movie/27205', key: 'tmdb-movie-27205' },
		},
		tv: {
			title: 'Severance',
			year: 2022,
			firstAired: '2022-02-18',
			status: 'Running',
			creators: ['Dan Erickson'],
			network: 'Apple TV',
			seasons: 2,
			episodes: 19,
			cast: ['Adam Scott', 'Britt Lower'],
			genres: ['Drama', 'Science fiction', 'Mystery'],
			runtime: 49,
			score: 7.7,
			description: 'Mark Scout leads a team at Lumon Industries.',
			posterUrl: 'https://static.tvmaze.com/uploads/images/original_untouched/548/1371406.jpg',
			posterDownloadUrl: 'https://static.tvmaze.com/uploads/images/medium_portrait/548/1371406.jpg',
			imdbId: 'tt11280740',
			source: { id: 'tvmaze', name: 'TVmaze', url: 'https://www.tvmaze.com/shows/44933/severance', key: 'tvmaze-44933' },
		},
		anime: {
			title: 'Sousou no Frieren',
			englishTitle: "Frieren: Beyond Journey's End",
			romajiTitle: 'Sousou no Frieren',
			japaneseTitle: '葬送のフリーレン',
			format: 'TV',
			year: 2023,
			episodes: 28,
			status: 'Finished Airing',
			firstAired: '2023-09-29',
			lastAired: '2024-03-22',
			studios: ['Madhouse'],
			genres: ['Adventure', 'Drama', 'Fantasy'],
			ageRating: 'PG-13 - Teens 13 or older',
			season: 'Fall 2023',
			score: 9.25,
			description: 'The adventure is over but life goes on for an elf mage.',
			posterUrl: 'https://cdn.myanimelist.net/images/anime/1015/138006l.jpg',
			posterDownloadUrl: 'https://cdn.myanimelist.net/images/anime/1015/138006l.jpg',
			source: { id: 'tenrai', name: 'Tenrai', url: 'https://myanimelist.net/anime/52991/Sousou_no_Frieren', key: 'mal-52991' },
		},
	};
	const sample = samples[type];
	return { ...emptyTitle(type, sample.source!), ...sample, ...overrides };
}

/** A Jikan v4 search answer with one anime, for tests that can't use recordings (Jikan was down). */
export function jikanAnswer() {
	return {
		data: [
			{
				mal_id: 52991,
				url: 'https://myanimelist.net/anime/52991/Sousou_no_Frieren',
				images: { jpg: { image_url: 'https://cdn.myanimelist.net/images/anime/1015/138006.jpg', large_image_url: 'https://cdn.myanimelist.net/images/anime/1015/138006l.jpg' } },
				titles: [
					{ type: 'Default', title: 'Sousou no Frieren' },
					{ type: 'Japanese', title: '葬送のフリーレン' },
					{ type: 'English', title: "Frieren: Beyond Journey's End" },
				],
				title: 'Sousou no Frieren',
				title_english: "Frieren: Beyond Journey's End",
				title_japanese: '葬送のフリーレン',
				type: 'TV',
				episodes: 28,
				status: 'Finished Airing',
				aired: { from: '2023-09-29T00:00:00+00:00', to: '2024-03-22T00:00:00+00:00' },
				duration: '24 min per ep',
				rating: 'PG-13 - Teens 13 or older',
				score: 9.25,
				synopsis: 'The adventure is over but life goes on for an elf mage.\n\n[Written by MAL Rewrite]',
				season: 'fall',
				year: 2023,
				studios: [{ name: 'Madhouse' }],
				genres: [{ name: 'Adventure' }, { name: 'Award Winning' }, { name: 'Fantasy' }],
			},
		],
	};
}
