// library-providers.js — show data for "Meine Serien" from free APIs:
//   • TVmaze  (api.tvmaze.com)  — TV shows of all kinds, no key needed
//   • AniList (graphql.anilist.co) — anime, no key needed
//   • TMDB    (api.themoviedb.org) — TV shows with German texts; needs the
//     user's own free API key (v3 key or v4 read token)
// Everything is turned into one shape:
//   { ref: 'tvmaze:123', provider, id, name, year, poster, network, genres,
//     status, summary, score, totalEpisodes, seasons: [{ n, eps }],
//     next: { at, season, episode, name } | null, url }
// Only metadata — nothing is written to these services.

(function () {
  'use strict';

  const strip = (html) => String(html || '').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
  const norm = (s) => String(s || '').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '');
  async function getJson(url, opts) {
    const r = await fetch(url, opts);
    if (r.status === 429) throw new Error('Zu viele Anfragen – kurz warten');
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return r.json();
  }

  // ── TVmaze ─────────────────────────────────────────────────────────────
  function fromTvmaze(s) {
    const emb = s._embedded || {};
    const seasons = (emb.seasons || []).filter((x) => x.number > 0).map((x) => ({ n: x.number, eps: x.episodeOrder || 0 }));
    const ne = emb.nextepisode;
    return {
      ref: 'tvmaze:' + s.id, provider: 'tvmaze', type: 'show', id: s.id, name: s.name,
      year: s.premiered ? +s.premiered.slice(0, 4) : null,
      poster: s.image ? (s.image.original || s.image.medium) : '',
      network: (s.network || s.webChannel || {}).name || '',
      genres: s.genres || [], status: s.status || '', summary: strip(s.summary),
      score: s.rating && s.rating.average ? Math.round(s.rating.average * 10) / 10 : null,
      totalEpisodes: emb.episodes ? emb.episodes.filter((e) => e.season > 0).length : seasons.reduce((n, x) => n + x.eps, 0) || null,
      seasons,
      next: ne ? { at: ne.airstamp ? Date.parse(ne.airstamp) : Date.parse(ne.airdate), season: ne.season, episode: ne.number, name: ne.name } : null,
      url: s.url || ''
    };
  }
  const TVMAZE = {
    name: 'TVmaze', needsKey: false,
    async search(q) {
      const r = await getJson('https://api.tvmaze.com/search/shows?q=' + encodeURIComponent(q));
      // weight: TVmaze's own popularity (0–100) — high for almost every show, so it counts
      // less than TMDB's votes (where the big films / series stand out clearly)
      return r.map((x) => ({ ...fromTvmaze(x.show), pop: (x.show.weight || 0) / 100 * 0.6 }));
    },
    async details(id) {
      return fromTvmaze(await getJson('https://api.tvmaze.com/shows/' + id + '?embed[]=seasons&embed[]=nextepisode'));
    }
  };

  // ── AniList ────────────────────────────────────────────────────────────
  const AL_FIELDS = `id format duration status episodes averageScore popularity genres siteUrl description(asHtml: false)
    title { romaji english userPreferred } coverImage { large } startDate { year }
    nextAiringEpisode { episode airingAt } studios(isMain: true) { nodes { name } }`;
  function fromAnilist(m) {
    return {
      ref: 'anilist:' + m.id, provider: 'anilist', type: m.format === 'MOVIE' ? 'movie' : 'show', id: m.id, runtime: m.duration || null,
      name: m.title.english || m.title.userPreferred || m.title.romaji,
      altNames: [m.title.romaji, m.title.english, m.title.userPreferred].filter(Boolean),
      year: m.startDate && m.startDate.year, poster: m.coverImage && m.coverImage.large || '',
      network: (m.studios && m.studios.nodes[0] && m.studios.nodes[0].name) || 'Anime',
      genres: m.genres || [], status: m.status || '', summary: strip(m.description),
      score: m.averageScore ? m.averageScore / 10 : null,
      totalEpisodes: m.episodes || null,
      seasons: m.episodes ? [{ n: 1, eps: m.episodes }] : [],
      next: m.nextAiringEpisode ? { at: m.nextAiringEpisode.airingAt * 1000, season: null, episode: m.nextAiringEpisode.episode, name: '' } : null,
      url: m.siteUrl || ''
    };
  }
  async function anilistQuery(query, variables) {
    const r = await getJson('https://graphql.anilist.co', {
      method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ query, variables })
    });
    if (r.errors && r.errors.length) throw new Error(r.errors[0].message);
    return r.data;
  }
  // AniList lists every season (cour) as its own entry, linked by PREQUEL / SEQUEL relations.
  // Walk those links to get the real season order: [{ id, episodes, duration, stream: [...] }].
  const alNodeCache = new Map();
  const AL_NODE = `query ($id: Int) { Media(id: $id, type: ANIME) { id format episodes duration
    streamingEpisodes { title thumbnail url site }
    relations { edges { relationType node { id format } } } } }`;
  async function alNode(id) {
    if (!alNodeCache.has(id)) alNodeCache.set(id, anilistQuery(AL_NODE, { id }).then((d) => d.Media).catch((e) => { alNodeCache.delete(id); throw e; }));
    return alNodeCache.get(id);
  }
  const alIsSeason = (f) => f === 'TV' || f === 'ONA';
  // The next/previous entry: a season if there is one, else a film / OVA / special – seasons are often
  // separated by films ("S1 → film → film → S2"), so the walk has to pass through those too.
  function alLink(m, type, seen) {
    const edges = ((m.relations && m.relations.edges) || []).filter((e) => e.relationType === type && e.node && e.node.format !== 'MUSIC' && !seen.has(e.node.id));
    return edges.find((e) => alIsSeason(e.node.format)) || edges[0] || null;
  }
  async function anilistSeasons(id) {
    const start = await alNode(+id);
    const seen = new Set([start.id]);
    let root = start;
    for (let i = 0; i < 30; i++) {                       // back to the first entry
      const p = alLink(root, 'PREQUEL', seen);
      if (!p) break;
      seen.add(p.node.id);
      root = await alNode(p.node.id);
    }
    const all = [root];
    const done = new Set([root.id]);
    for (let cur = root, i = 0; i < 30; i++) {           // and forward through the sequels
      const s = alLink(cur, 'SEQUEL', done);
      if (!s) break;
      done.add(s.node.id);
      cur = await alNode(s.node.id);
      all.push(cur);
    }
    // only real seasons count (films are the "Filme" tab); a sequel that has not aired yet (no episode
    // count) is no season for now – except the entry that was asked for
    return all.filter((m) => m.id === start.id || (alIsSeason(m.format) && m.episodes > 0));
  }
  const ANILIST = {
    name: 'AniList', needsKey: false,
    async search(q) {
      const d = await anilistQuery(`query ($q: String) { Page(perPage: 12) { media(search: $q, type: ANIME, sort: SEARCH_MATCH) { ${AL_FIELDS} } } }`, { q });
      // popularity: how many AniList users have it (≈ 1 000 … 1 000 000)
      return d.Page.media.filter((m) => m.format !== 'MUSIC').map((m) => ({ ...fromAnilist(m), anime: true, pop: Math.min(1, Math.log10((m.popularity || 0) + 1) / 6) }));
    },
    async details(id) {
      const meta = fromAnilist((await anilistQuery(`query ($id: Int) { Media(id: $id, type: ANIME) { ${AL_FIELDS} } }`, { id: +id })).Media);
      if (meta.type === 'movie') return meta;
      try {
        const chain = await anilistSeasons(id);
        if (chain.length > 1) {
          meta.seasons = chain.map((m, i) => ({ n: i + 1, eps: m.episodes || 0 }));
          meta.totalEpisodes = meta.seasons.reduce((n, s) => n + s.eps, 0) || meta.totalEpisodes;
        }
      } catch (_) {}   // keep the single-season data
      return meta;
    }
  };

  // ── TMDB (own key) ─────────────────────────────────────────────────────
  let tmdbKey = '';
  function tmdbFetch(path, params = {}) {
    const p = new URLSearchParams({ language: 'de-DE', ...params });
    const opts = {};
    if (/^eyJ/.test(tmdbKey)) opts.headers = { Authorization: 'Bearer ' + tmdbKey, Accept: 'application/json' };
    else p.set('api_key', tmdbKey);
    return getJson('https://api.themoviedb.org/3' + path + '?' + p, opts);
  }
  const img = (p, size) => (p ? 'https://image.tmdb.org/t/p/' + size + p : '');
  // popularity from the number of votes (≈ 10 … 30 000) and TMDB's own trend value
  const tmdbPop = (t) => Math.min(1, Math.max(Math.log10((t.vote_count || 0) + 1) / 4.5, Math.log10((t.popularity || 0) + 1) / 3));
  // TMDB marks animation as genre 16; with a Japanese original it is anime
  const tmdbAnime = (t) => (t.genre_ids || []).includes(16) && (t.original_language === 'ja' || (t.origin_country || []).includes('JP'));
  function fromTmdb(t) {
    const seasons = (t.seasons || []).filter((s) => s.season_number > 0).map((s) => ({ n: s.season_number, eps: s.episode_count }));
    const ne = t.next_episode_to_air;
    return {
      ref: 'tmdb:' + t.id, provider: 'tmdb', type: 'show', id: t.id, name: t.name,
      year: t.first_air_date ? +t.first_air_date.slice(0, 4) : null,
      poster: img(t.poster_path, 'w500'),
      network: (t.networks && t.networks[0] && t.networks[0].name) || '',
      genres: (t.genres || []).map((g) => g.name), status: t.status || '', summary: t.overview || '',
      score: t.vote_average ? Math.round(t.vote_average * 10) / 10 : null,
      totalEpisodes: t.number_of_episodes || null, seasons,
      next: ne ? { at: Date.parse(ne.air_date), season: ne.season_number, episode: ne.episode_number, name: ne.name } : null,
      url: 'https://www.themoviedb.org/tv/' + t.id
    };
  }
  const TMDB = {
    name: 'TMDB', needsKey: true,
    async search(q) {
      if (!tmdbKey) throw new Error('Kein TMDB-Schlüssel eingetragen');
      const r = await tmdbFetch('/search/tv', { query: q });
      return (r.results || []).slice(0, 15).map((t) => ({ ...fromTmdb(t), pop: tmdbPop(t), anime: tmdbAnime(t) }));
    },
    async details(id) {
      if (!tmdbKey) throw new Error('Kein TMDB-Schlüssel eingetragen');
      return fromTmdb(await tmdbFetch('/tv/' + id));
    }
  };

  // ── Full details for the show page ────────────────────────────────────
  // { episodes: [{ season, number, title, image, runtime, airdate }],
  //   seasons: [n…], loadSeason(n) (TMDB: per season, else null),
  //   cast: [{ name, role, image }], watch: { link, list: [{ name, logo, type, url, color }] },
  //   ratings: [{ label, value, url }], trailer: url, backdrop, summary, runtime, externals }
  async function fullTvmaze(id) {
    const s = await getJson('https://api.tvmaze.com/shows/' + id + '?embed[]=episodes&embed[]=cast');
    const eps = ((s._embedded && s._embedded.episodes) || []).filter((e) => e.season > 0).map((e) => ({
      season: e.season, number: e.number, title: e.name, image: e.image ? e.image.medium : '',
      runtime: e.runtime || s.runtime || s.averageRuntime || null, airdate: e.airdate
    }));
    const net = s.webChannel || s.network;
    const full = {
      episodes: eps, seasons: [...new Set(eps.map((e) => e.season))], loadSeason: null,
      cast: ((s._embedded && s._embedded.cast) || []).slice(0, 16).map((c) => ({
        name: (c.person && c.person.name) || (c.character && c.character.name) || '',
        role: (c.character && c.character.name) || (c.person && c.person.name) || '',
        image: (c.character && c.character.image && (c.character.image.medium || c.character.image.original)) || (c.person && c.person.image && (c.person.image.medium || c.person.image.original)) || ''
      })).filter((c) => c.name),
      watch: { link: '', list: (net && net.name) ? [{ name: net.name, type: s.webChannel ? 'Streamen' : 'Sender', url: s.officialSite || '' }] : [] },
      ratings: [
        s.rating && s.rating.average ? { label: 'TVmaze', value: s.rating.average.toFixed(1), url: s.url } : null,
        s.externals && s.externals.imdb ? { label: 'IMDb', value: '↗', url: 'https://www.imdb.com/title/' + s.externals.imdb } : null
      ].filter(Boolean),
      trailer: '', backdrop: s.image ? s.image.original : '', summary: strip(s.summary),
      runtime: s.runtime || s.averageRuntime || null, premiered: s.premiered, externals: s.externals || {}
    };
    // with a TMDB key: German text and the German streaming services
    if (tmdbKey && s.externals && (s.externals.imdb || s.externals.thetvdb)) {
      try {
        const f = s.externals.imdb
          ? await tmdbFetch('/find/' + s.externals.imdb, { external_source: 'imdb_id' })
          : await tmdbFetch('/find/' + s.externals.thetvdb, { external_source: 'tvdb_id' });
        const hit = f.tv_results && f.tv_results[0];
        if (hit) {
          const t = await fullTmdb(hit.id);
          full.watch = t.watch.list.length ? t.watch : full.watch;
          if (t.summary) full.summary = t.summary;
          full.ratings.push(...t.ratings);
          if (!full.cast.length) full.cast = t.cast;
          full.trailer = t.trailer;
          if (t.backdrop) full.backdrop = t.backdrop;
          if (t.recommendations) full.recommendations = t.recommendations;
        }
      } catch (_) {}
    }
    return full;
  }

  async function fullAnilist(id) {
    const d = await anilistQuery(`query ($id: Int) { Media(id: $id, type: ANIME) {
      format episodes duration averageScore idMal bannerImage siteUrl description(asHtml: false)
      coverImage { extraLarge }
      trailer { id site }
      streamingEpisodes { title thumbnail url site }
      externalLinks { site url type icon color }
      characters(perPage: 16, sort: [ROLE, RELEVANCE]) { edges { role node { name { full } image { medium } } voiceActors(language: JAPANESE) { name { full } } } }
      relations { edges { relationType node { id format title { userPreferred english romaji } coverImage { large } startDate { year } averageScore description(asHtml: false) } } }
    } }`, { id: +id });
    const m = d.Media;
    // streamingEpisodes: "Episode 5 - Title", not always in order
    const seasonEps = (media, season) => {
      const stream = (media.streamingEpisodes || []).map((e) => {
        const x = /Episode\s*(\d+)\s*[-–:]?\s*(.*)$/i.exec(e.title || '');
        return { season, number: x ? +x[1] : null, title: x ? x[2] : e.title, image: e.thumbnail, runtime: media.duration, url: e.url };
      }).filter((e) => e.number).sort((a, b) => a.number - b.number);
      const byNum = new Map(stream.map((e) => [e.number, e]));
      const total = Math.max(media.episodes || 0, stream.length ? stream[stream.length - 1].number : 0);
      const out = [];
      for (let n = 1; n <= total; n++) out.push(byNum.get(n) || { season, number: n, title: 'Folge ' + n, image: '', runtime: media.duration });
      return out;
    };
    let chain = [];
    if (m.format !== 'MOVIE') { try { chain = await anilistSeasons(id); } catch (_) {} }
    const eps = chain.length > 1 ? chain.flatMap((c, i) => seasonEps(c, i + 1)) : seasonEps(m, 1);
    const seasonNums = chain.length > 1 ? chain.map((_, i) => i + 1) : [1];
    const relParts = ((m.relations && m.relations.edges) || [])
      .filter((e) => e && e.node && e.node.format !== 'MUSIC' && e.node.id !== +id)
      .map((e) => ({
        id: e.node.id,
        ref: 'anilist:' + e.node.id,
        name: e.node.title.english || e.node.title.userPreferred || e.node.title.romaji,
        year: e.node.startDate && e.node.startDate.year,
        poster: e.node.coverImage && e.node.coverImage.large,
        score: e.node.averageScore ? Math.round(e.node.averageScore) / 10 : null,
        summary: strip(e.node.description),
        relationType: e.relationType,
        type: e.node.format === 'MOVIE' ? 'movie' : 'show'
      }));
    return {
      episodes: eps, seasons: seasonNums, loadSeason: null,
      cast: (m.characters && m.characters.edges ? m.characters.edges : []).map((c) => {
        const node = c && c.node;
        const name = (node && node.name && (node.name.full || node.name.userPreferred)) || '';
        const va = c && c.voiceActors && c.voiceActors[0] && c.voiceActors[0].name && c.voiceActors[0].name.full;
        return {
          name,
          role: va ? 'Stimme: ' + va : (c && c.role === 'MAIN' ? 'Hauptrolle' : 'Nebenrolle'),
          image: (node && node.image && (node.image.medium || node.image.large)) || ''
        };
      }).filter((c) => c.name),
      watch: {
        link: '', list: (m.externalLinks || []).filter((l) => l.type === 'STREAMING')
          .map((l) => ({ name: l.site, type: 'Streamen', url: l.url, direct: true, logo: l.icon || '', color: l.color || '' }))
      },
      ratings: [
        m.averageScore ? { label: 'AniList', value: m.averageScore + ' %', url: m.siteUrl } : null,
        m.idMal ? { label: 'MAL', value: '↗', url: 'https://myanimelist.net/anime/' + m.idMal } : null
      ].filter(Boolean),
      trailer: m.trailer && m.trailer.site === 'youtube' ? 'https://www.youtube.com/watch?v=' + m.trailer.id : '',
      backdrop: m.bannerImage || (m.coverImage && m.coverImage.extraLarge) || '',
      summary: strip(m.description), runtime: m.duration, externals: { mal: m.idMal },
      collection: relParts.length ? { name: 'Zugehörige Werke & Fortsetzungen', parts: relParts } : null
    };
  }

  async function fullTmdb(id) {
    const t = await tmdbFetch('/tv/' + id, { append_to_response: 'aggregate_credits,videos,watch/providers,external_ids,recommendations' });
    const de = (t['watch/providers'] && t['watch/providers'].results && t['watch/providers'].results.DE) || {};
    const list = [];
    const addP = (arr, type) => { for (const p of arr || []) if (!list.some((x) => x.name === p.provider_name)) list.push({ name: p.provider_name, type, logo: img(p.logo_path, 'w92'), url: de.link || '' }); };
    addP(de.flatrate, 'Streamen'); addP(de.free, 'Kostenlos'); addP(de.ads, 'Mit Werbung'); addP(de.rent, 'Leihen'); addP(de.buy, 'Kaufen');
    const video = ((t.videos && t.videos.results) || []).find((v) => v.site === 'YouTube' && v.type === 'Trailer') || ((t.videos && t.videos.results) || []).find((v) => v.site === 'YouTube');
    const seasons = (t.seasons || []).filter((s) => s.season_number > 0).map((s) => s.season_number);
    const recs = ((t.recommendations && t.recommendations.results) || []).slice(0, 10).map((r) => ({
      id: r.id,
      ref: 'tmdb:' + r.id,
      name: r.name,
      year: r.first_air_date ? +r.first_air_date.slice(0, 4) : null,
      poster: img(r.poster_path, 'w500'),
      score: r.vote_average ? Math.round(r.vote_average * 10) / 10 : null,
      summary: r.overview || '',
      type: 'show'
    }));
    return {
      episodes: [], seasons,
      loadSeason: async (n) => {
        const s = await tmdbFetch('/tv/' + id + '/season/' + n);
        return (s.episodes || []).map((e) => ({ season: n, number: e.episode_number, title: e.name, image: img(e.still_path, 'w300'), runtime: e.runtime, airdate: e.air_date }));
      },
      cast: ((t.aggregate_credits && t.aggregate_credits.cast) || []).slice(0, 16).map((c) => ({
        name: c.name, role: c.roles && c.roles[0] ? c.roles[0].character : '', image: img(c.profile_path, 'w185')
      })),
      watch: { link: de.link || '', list },
      ratings: t.vote_average ? [{ label: 'TMDB', value: Math.round(t.vote_average * 10) + ' %', url: 'https://www.themoviedb.org/tv/' + id }] : [],
      trailer: video ? 'https://www.youtube.com/watch?v=' + video.key : '',
      backdrop: img(t.backdrop_path, 'w1280'), summary: t.overview || '',
      runtime: t.episode_run_time && t.episode_run_time[0], externals: t.external_ids || {},
      recommendations: recs
    };
  }

  // ── TMDB films (same key) ─────────────────────────────────────────────
  function fromTmdbMovie(t) {
    return {
      ref: 'tmdbmovie:' + t.id, provider: 'tmdbmovie', type: 'movie', id: t.id, name: t.title,
      altNames: [t.original_title].filter(Boolean),
      year: t.release_date ? +t.release_date.slice(0, 4) : null,
      poster: img(t.poster_path, 'w500'), network: 'Film',
      genres: (t.genres || []).map((g) => g.name), status: t.status || '', summary: t.overview || '',
      score: t.vote_average ? Math.round(t.vote_average * 10) / 10 : null,
      totalEpisodes: 1, seasons: [], next: null, runtime: t.runtime || null,
      url: 'https://www.themoviedb.org/movie/' + t.id
    };
  }
  const TMDB_MOVIE = {
    name: 'TMDB', needsKey: true,
    async search(q) {
      if (!tmdbKey) throw new Error('Kein TMDB-Schlüssel eingetragen');
      const r = await tmdbFetch('/search/movie', { query: q });
      return (r.results || []).slice(0, 15).map((t) => ({ ...fromTmdbMovie(t), pop: tmdbPop(t), anime: tmdbAnime(t) }));
    },
    async details(id) { return fromTmdbMovie(await tmdbFetch('/movie/' + id)); }
  };
  async function fullTmdbMovie(id) {
    const t = await tmdbFetch('/movie/' + id, { append_to_response: 'credits,videos,watch/providers,recommendations,similar' });
    const de = (t['watch/providers'] && t['watch/providers'].results && t['watch/providers'].results.DE) || {};
    const list = [];
    const addP = (arr, type) => { for (const p of arr || []) if (!list.some((x) => x.name === p.provider_name)) list.push({ name: p.provider_name, type, logo: img(p.logo_path, 'w92'), url: de.link || '' }); };
    addP(de.flatrate, 'Streamen'); addP(de.free, 'Kostenlos'); addP(de.ads, 'Mit Werbung'); addP(de.rent, 'Leihen'); addP(de.buy, 'Kaufen');
    const video = ((t.videos && t.videos.results) || []).find((v) => v.site === 'YouTube' && v.type === 'Trailer');

    let collection = null;
    if (t.belongs_to_collection && t.belongs_to_collection.id) {
      try {
        const col = await tmdbFetch('/collection/' + t.belongs_to_collection.id);
        if (col && col.parts) {
          collection = {
            id: col.id,
            name: col.name || t.belongs_to_collection.name,
            parts: (col.parts || []).map((p) => ({
              id: p.id,
              ref: 'tmdbmovie:' + p.id,
              name: p.title || p.name,
              year: p.release_date ? +p.release_date.slice(0, 4) : null,
              poster: img(p.poster_path, 'w500'),
              backdrop: img(p.backdrop_path, 'w1280'),
              score: p.vote_average ? Math.round(p.vote_average * 10) / 10 : null,
              summary: p.overview || '',
              type: 'movie'
            })).sort((a, b) => (a.year || 0) - (b.year || 0))
          };
        }
      } catch (_) {}
    }

    const recs = ((t.recommendations && t.recommendations.results) || (t.similar && t.similar.results) || []).slice(0, 12).map((r) => ({
      id: r.id,
      ref: 'tmdbmovie:' + r.id,
      name: r.title || r.name,
      year: r.release_date ? +r.release_date.slice(0, 4) : null,
      poster: img(r.poster_path, 'w500'),
      score: r.vote_average ? Math.round(r.vote_average * 10) / 10 : null,
      summary: r.overview || '',
      type: 'movie'
    }));

    return {
      episodes: [], seasons: [], loadSeason: null,
      cast: ((t.credits && t.credits.cast) || []).slice(0, 16).map((c) => ({ name: c.name, role: c.character, image: img(c.profile_path, 'w185') })),
      watch: { link: de.link || '', list },
      ratings: t.vote_average ? [{ label: 'TMDB', value: Math.round(t.vote_average * 10) + ' %', url: 'https://www.themoviedb.org/movie/' + id }] : [],
      trailer: video ? 'https://www.youtube.com/watch?v=' + video.key : '',
      backdrop: img(t.backdrop_path, 'w1280'), summary: t.overview || '', runtime: t.runtime, externals: { imdb: t.imdb_id },
      collection,
      recommendations: recs
    };
  }

  const ALL = { tvmaze: TVMAZE, anilist: ANILIST, tmdb: TMDB, tmdbmovie: TMDB_MOVIE };
  const FULL = { tvmaze: fullTvmaze, anilist: fullAnilist, tmdb: fullTmdb, tmdbmovie: fullTmdbMovie };

  // ── Finding the right show for a name NINA tracked ────────────────────
  const PLATFORM_NET = { prime: /prime|amazon/i, netflix: /netflix/i, disney: /disney|hulu|star/i, joyn: /joyn|prosieben|sat\.?1|kabel/i };
  function pickBest(results, name, platform) {
    const n = norm(name);
    let best = null, bestScore = -1;
    results.forEach((r, i) => {
      const names = [r.name, ...(r.altNames || [])].map(norm);
      let s = names.includes(n) ? 10 : names.some((x) => x.includes(n) || n.includes(x)) ? 4 : 0;
      if (!s) return;
      if (PLATFORM_NET[platform] && PLATFORM_NET[platform].test(r.network)) s += 6;
      s -= i * 0.3; // the service's own ranking
      if (r.poster) s += 1;
      if (s > bestScore) { bestScore = s; best = r; }
    });
    return best;
  }

  self.NinaProviders = {
    ALL,
    setTmdbKey(k) { tmdbKey = String(k || '').trim(); },
    async search(q, enabled) {
      const out = [];
      const errors = [];
      // films come with the TMDB key too
      const list = enabled.includes('tmdb') ? [...enabled, 'tmdbmovie'] : enabled;
      await Promise.all(list.map(async (p) => {
        try { out.push(...(await ALL[p].search(q)).map((r) => ({ ...r, _p: p }))); } catch (e) { errors.push(ALL[p].name + ': ' + e.message); }
      }));
      // One list for films, series and anime, the best first: how well the title fits the
      // search, then how well known it is (votes / users / TVmaze weight), then has a poster.
      const n = norm(q);
      const fit = (r) => {
        const names = [r.name, ...(r.altNames || [])].map(norm);
        if (names.includes(n)) return 3;
        if (names.some((x) => x.startsWith(n))) return 2.5;   // "Spider-Man: No Way Home" for "Spider-Man"
        if (names.some((x) => x.includes(n))) return 1.6;
        return 0.6;
      };
      for (const r of out) r._score = fit(r) * 1.5 + (r.pop || 0) * 4 + (r.poster ? 0.3 : 0) + (r.year && r.year >= 2000 ? 0.1 : 0);
      out.sort((a, b) => b._score - a._score);
      // the same title from two sources (TVmaze + TMDB): keep the better one
      const seen = new Map();
      const results = [];
      for (const r of out) {
        const k = r.type + ':' + norm(r.name) + ':' + (r.year || '');
        if (seen.has(k)) continue;
        seen.set(k, r);
        results.push(r);
      }
      return { results, errors };
    },
    details(ref) {
      const [p, id] = ref.split(':');
      return ALL[p].details(id);
    },
    full(ref) {
      const [p, id] = ref.split(':');
      return FULL[p](id);
    },
    // best match for a show name (+ platform for the right network)
    // type: 'show' (default) or 'movie'
    async lookup(name, platform, enabled, type) {
      const movie = type === 'movie';
      const order = movie ? ['tmdbmovie', 'anilist']
        : ['tvmaze', 'tmdb', 'anilist']; // whole-show numbering first (AniList lists every cour separately)
      for (const p of order) {
        if (!enabled.includes(p === 'tmdbmovie' ? 'tmdb' : p)) continue;
        try {
          const results = (await ALL[p].search(name)).filter((r) => (r.type === 'movie') === movie);
          const best = pickBest(results, name, platform);
          if (best) return best;
        } catch (_) {}
      }
      return null;
    }
  };
})();
