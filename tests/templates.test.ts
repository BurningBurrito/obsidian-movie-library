import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { parse } from 'yaml';
import { renderTemplate } from '../src/core/render';
import { resultDetails } from '../src/media/create-note';
import { BUILT_IN_TEMPLATES, buildVariables, displayTitle } from '../src/media/templates';
import { sampleTitle } from './support/titles';

const now = { format: (format: string) => ({ 'YYYY-MM-DD HH:mm:ss': '2026-10-06 12:00:00' })[format] ?? `<${format}>` };
const props = (note: string) => parse(note.match(/^---\n([\s\S]*?)\n---\n/)?.[1] ?? '') as Record<string, unknown>;
const SHARED_END = ['watched', 'rating', 'owned', 'streaming', 'source', 'sourceUrl', 'created', 'link'];

describe('built-in templates', () => {
	it('movie: the agreed properties, a poster link, and a link back to the library note', () => {
		const vars = buildVariables(sampleTitle('movie'), { noteTitle: 'Inception', posterPath: 'Watch Library/Posters/Inception (2010) - tmdb-movie-27205.jpg', libraryNoteName: 'Watch Library MOC' });
		const note = renderTemplate(BUILT_IN_TEMPLATES.movie, vars, now);
		const p = props(note);
		assert.deepEqual(Object.keys(p), [
			'tags', 'title', 'originalTitle', 'year', 'releaseDate', 'director', 'cast', 'genre', 'runtime', 'score', 'description', 'cover', 'localCover',
			...SHARED_END,
		]);
		assert.deepEqual(p.tags, ['🎬Movie']);
		assert.equal(p.originalTitle, null, 'same as the title, so left empty');
		assert.equal(p.year, 2010);
		assert.equal(p.releaseDate, '2010-07-15');
		assert.deepEqual(p.director, ['Christopher Nolan']);
		assert.equal(p.runtime, 148);
		assert.equal(p.score, 8.37);
		assert.equal(p.localCover, '[[Watch Library/Posters/Inception (2010) - tmdb-movie-27205.jpg]]');
		assert.equal(p.watched, false);
		assert.equal(p.rating, 'N/A');
		assert.equal(p.owned, 'N/A');
		assert.equal(p.streaming, 'N/A');
		assert.equal(p.source, 'TMDB');
		assert.equal(p.created, '2026-10-06 12:00:00');
		assert.deepEqual(p.link, ['[[Watch Library MOC]]']);
		assert.match(note, /---\n# Summary:\n\n# Notes:\n\n# Quotes:\n$/);
	});

	it('TV show: the agreed properties', () => {
		const p = props(renderTemplate(BUILT_IN_TEMPLATES.tv, buildVariables(sampleTitle('tv'), { noteTitle: 'Severance', posterPath: null, libraryNoteName: 'Watch Library MOC' }), now));
		assert.deepEqual(Object.keys(p), [
			'tags', 'title', 'year', 'firstAired', 'lastAired', 'status', 'creator', 'network', 'seasons', 'episodes', 'cast', 'genre', 'score', 'description', 'cover', 'localCover',
			...SHARED_END,
		]);
		assert.deepEqual(p.tags, ['📺TVShow']);
		assert.equal(p.firstAired, '2022-02-18');
		assert.equal(p.lastAired, null);
		assert.deepEqual(p.creator, ['Dan Erickson']);
		assert.equal(p.network, 'Apple TV');
		assert.equal(p.seasons, 2);
		assert.equal(p.episodes, 19);
		assert.equal(p.localCover, null, 'no poster');
		assert.equal(p.cover, 'https://static.tvmaze.com/uploads/images/original_untouched/548/1371406.jpg');
	});

	it('anime: the agreed properties, all three titles kept', () => {
		const title = sampleTitle('anime');
		const p = props(renderTemplate(BUILT_IN_TEMPLATES.anime, buildVariables(title, { noteTitle: displayTitle(title, 'english'), posterPath: null, libraryNoteName: 'Watch Library MOC' }), now));
		assert.deepEqual(Object.keys(p), [
			'tags', 'title', 'englishTitle', 'romajiTitle', 'japaneseTitle', 'format', 'year', 'episodes', 'status', 'firstAired', 'lastAired', 'studio', 'genre', 'score', 'description', 'cover', 'localCover',
			...SHARED_END,
		]);
		assert.deepEqual(p.tags, ['🎌Anime']);
		assert.equal(p.title, "Frieren: Beyond Journey's End");
		assert.equal(p.romajiTitle, 'Sousou no Frieren');
		assert.equal(p.japaneseTitle, '葬送のフリーレン');
		assert.equal(p.format, 'TV');
		assert.deepEqual(p.studio, ['Madhouse']);
	});

	it('has the other variables for custom templates', () => {
		const vars = buildVariables(sampleTitle('anime'), { noteTitle: 'x', posterPath: 'P/x.jpg', libraryNoteName: 'M' });
		const body = renderTemplate('{{ageRating}} | {{season}} | {{mediaType}} | {{localCoverPath}} | {{imdbId}}', vars, now);
		assert.equal(body, 'PG-13 - Teens 13 or older | Fall 2023 | Anime | P/x.jpg | ', 'no IMDb ID for anime: empty');
	});
});

describe('titles', () => {
	it('names anime by the chosen title, falling back to romaji', () => {
		const frieren = sampleTitle('anime');
		assert.equal(displayTitle(frieren, 'english'), "Frieren: Beyond Journey's End");
		assert.equal(displayTitle(frieren, 'romaji'), 'Sousou no Frieren');
		assert.equal(displayTitle(frieren, 'japanese'), '葬送のフリーレン');
		const noEnglish = sampleTitle('anime', { englishTitle: '', japaneseTitle: '' });
		assert.equal(displayTitle(noEnglish, 'english'), 'Sousou no Frieren');
		assert.equal(displayTitle(noEnglish, 'japanese'), 'Sousou no Frieren');
		assert.equal(displayTitle(sampleTitle('movie'), 'japanese'), 'Inception', 'only anime');
	});

	it('describes each result in one line', () => {
		assert.equal(resultDetails(sampleTitle('movie', { originalTitle: 'Le Fabuleux Destin' })), '2010 · Le Fabuleux Destin');
		assert.equal(resultDetails(sampleTitle('tv')), '2022 · Apple TV · Running');
		assert.equal(resultDetails(sampleTitle('anime')), '2023 · TV · 28 episodes · Madhouse');
		assert.equal(resultDetails(sampleTitle('anime', { format: 'Movie', episodes: 1, year: null })), 'Movie · 1 episode · Madhouse');
	});
});
