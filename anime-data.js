/* ══════════════════════════════════════════════════════════════════════
   ANIME DATA — the live, reliable data layer for the AI assistant.

   The assistant used to answer episode questions from memory, which is how
   a model invents "episode 13" details. This module asks the real databases
   first and hands the answer ONLY data it can quote:

     · AniList GraphQL  — canonical title, season list, episode count,
                          synopsis, manga chapters/volumes/status.
     · TVMaze           — episode titles and episode summaries.
     · Jikan (MAL)      — the official MAL episode title for that season.
     · Kitsu            — extra episode title / synopsis and manga counts.
     · Wikipedia        — the long episode ShortSummary, and the volume /
                          chapter count for an ongoing manga.

   Everything is cached (localStorage + in-memory) so repeat questions are
   instant and the free APIs are not hammered. Jikan and Kitsu are allowed
   to fail: TVMaze + AniList already cover the answer, and the caller marks
   the data as "verified" only when two sources agree.

   Exposed as window.AnimeData:
     episode(title, season, episode)   → episode facts + next/previous
     anime(title)                      → anime facts
     manga(title)                      → manga facts
     parseExplain(message, last, opts) → { title, season, episode, depth }
     episodeHeading(info)              → "**TOP 3** — Blue Lock · …"
   ══════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  var ANILIST = 'https://graphql.anilist.co';
  var TVMAZE = 'https://api.tvmaze.com';
  var JIKAN = 'https://api.jikan.moe/v4';
  var KITSU = 'https://kitsu.io/api/edge';
  var WIKI = 'https://en.wikipedia.org/w/api.php';

  var CACHE_PREFIX = 'fardin_anime_data_v2:';
  /* Short-lived on purpose: the answer is fetched live, and a long cache made
     a just-aired episode or a fresh manga chapter look "not listed" for days. */
  var TTL_SEARCH = 12 * 60 * 60 * 1000;   /* title / episode-count metadata: 12 h */
  var TTL_EPISODE = 6 * 60 * 60 * 1000;   /* episode title + summary: 6 h */
  var TTL_MANGA = 24 * 60 * 60 * 1000;    /* ongoing chapter / volume counts: 24 h */
  var TTL_EPISODE_SEARCH = 60 * 60 * 1000; /* re-check an ongoing show's episode list hourly */
  var mem = {};
  var inflight = {};
  var jikanDownUntil = 0;   /* circuit breaker for a blocked Jikan host */

  /* ─────────────────────────────────────────────── tiny helpers */
  function norm(s) {
    return String(s == null ? '' : s)
      .toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/&/g, ' and ')
      .replace(/[^a-z0-9]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function asciiDigits(s) {
    return String(s == null ? '' : s).replace(/[০-৯]/g, function (d) {
      return String(d.charCodeAt(0) - 0x09E6);
    });
  }

  function decodeEntities(s) {
    return String(s || '')
      .replace(/&#(\d+);/g, function (m, n) { return String.fromCharCode(parseInt(n, 10)); })
      .replace(/&#x([0-9a-f]+);/gi, function (m, n) { return String.fromCharCode(parseInt(n, 16)); })
      .replace(/&nbsp;/gi, ' ')
      .replace(/&amp;/gi, '&')
      .replace(/&quot;/gi, '"')
      .replace(/&#39;|&apos;/gi, "'")
      .replace(/&lt;/gi, '<')
      .replace(/&gt;/gi, '>')
      .replace(/&mdash;/gi, '—')
      .replace(/&ndash;/gi, '–');
  }

  function stripHtml(s) {
    return decodeEntities(String(s || '').replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]*>/g, ' '))
      .replace(/\s+/g, ' ')
      .trim();
  }

  function cacheGet(key, ttl) {
    var maxAge = ttl || TTL_EPISODE;
    var now = Date.now();
    /* the memory copy must expire too — otherwise a long-lived tab ignores
       the TTL and keeps serving an old episode count until a reload */
    if (mem[key]) {
      if (mem[key].t && (now - mem[key].t) <= maxAge) return mem[key].v;
      delete mem[key];
    }
    try {
      var raw = localStorage.getItem(CACHE_PREFIX + key);
      if (!raw) return null;
      var box = JSON.parse(raw);
      if (!box || !box.t || (now - box.t) > maxAge) return null;
      mem[key] = { t: box.t, v: box.v };
      return box.v;
    } catch (e) { return null; }
  }

  function cacheSet(key, value) {
    var box = { t: Date.now(), v: value };
    mem[key] = box;
    try {
      localStorage.setItem(CACHE_PREFIX + key, JSON.stringify(box));
    } catch (e) { /* private mode / quota — the in-memory cache still works */ }
  }

  function fetchJson(url, options, timeoutMs) {
    if (typeof AbortController !== 'function') {
      return fetch(url, options).then(function (r) {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.json();
      });
    }
    var controller = new AbortController();
    var timer = setTimeout(function () { controller.abort(); }, timeoutMs || 10000);
    var opts = options || {};
    opts.signal = controller.signal;
    return fetch(url, opts).then(function (r) {
      clearTimeout(timer);
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.json();
    }, function (e) {
      clearTimeout(timer);
      throw e;
    });
  }

  function once(key, fn) {
    if (inflight[key]) return inflight[key];
    var p = Promise.resolve().then(fn).then(function (value) {
      delete inflight[key];
      return value;
    }, function (err) {
      delete inflight[key];
      throw err;
    });
    inflight[key] = p;
    return p;
  }

  /* Optional sources must never hold the whole answer hostage. The promise
     keeps running (and caching) in the background; the caller gets the
     fallback after `ms` at the latest. */
  function withTimeout(promise, ms, fallback) {
    return new Promise(function (resolve) {
      var done = false;
      var timer = setTimeout(function () {
        if (done) return;
        done = true;
        resolve(fallback);
      }, ms);
      Promise.resolve(promise).then(function (value) {
        if (done) return;
        done = true;
        clearTimeout(timer);
        resolve(value);
      }, function () {
        if (done) return;
        done = true;
        clearTimeout(timer);
        resolve(fallback);
      });
    });
  }

  /* ─────────────────────────────────────────────── AniList */
  var SEARCH_QUERY = [
    'query ($search: String, $type: MediaType) {',
    '  Page(perPage: 10) {',
    '    media(search: $search, type: $type, sort: SEARCH_MATCH) {',
    '      id idMal format episodes chapters volumes status',
    '      popularity averageScore',
    '      title { english romaji native }',
    '      synonyms',
    '      description(asHtml: false)',
    '      coverImage { large extraLarge }',
    '      genres',
    '      startDate { year month day }',
    '      endDate { year month day }',
    '      streamingEpisodes { title thumbnail url }',
    '      studios(isMain: true) { nodes { name } }',
    '      relations { edges { relationType node { id idMal format episodes startDate { year month day } title { english romaji } } } }',
    '    }',
    '  }',
    '}'
  ].join('\n');

  var CHAIN_QUERY = [
    'query ($ids: [Int]) {',
    '  Page(perPage: 50) {',
    '    media(id_in: $ids, type: ANIME) {',
    '      id idMal format episodes status',
    '      description genres averageScore',
    '      coverImage { large }',
    '      streamingEpisodes { title thumbnail url }',
    '      title { english romaji }',
    '      startDate { year month day }',
    '      relations { edges { relationType node { id idMal format episodes status startDate { year month day } title { english romaji } } } }',
    '    }',
    '  }',
    '}'
  ].join('\n');

  function titleOf(media) {
    if (!media || !media.title) return '';
    var masked = function (t) { return !t || /[●◯□■*]{2,}/.test(t); };
    return masked(media.title.english) ? (media.title.romaji || media.title.english || '') : media.title.english;
  }

  function dateValue(d) {
    if (!d || !d.year) return 0;
    return d.year * 10000 + (d.month || 1) * 100 + (d.day || 1);
  }

  function similarity(a, b) {
    a = norm(a); b = norm(b);
    if (!a || !b) return 0;
    if (a === b) return 3;
    if (a.indexOf(b) === 0 || b.indexOf(a) === 0) return 2.5;
    if (a.indexOf(b) > -1 || b.indexOf(a) > -1) return 2;
    /* light word overlap */
    var A = a.split(' '), B = b.split(' '), hit = 0;
    B.forEach(function (w) { if (w.length > 2 && A.indexOf(w) > -1) hit++; });
    return hit ? Math.min(1.9, hit / Math.max(A.length, B.length) + 0.6) : 0;
  }

  function bestMatch(list, query) {
    var best = null, bestScore = -1;
    (list || []).forEach(function (m) {
      if (!m) return;
      var names = [titleOf(m), (m.title && m.title.romaji) || ''].concat(m.synonyms || []).filter(Boolean);
      var s = 0;
      names.forEach(function (n) { s = Math.max(s, similarity(n, query)); });
      var formatBonus = m.format === 'TV' ? 0.35 : m.format === 'TV_SHORT' ? 0.2 : 0;
      var score = s * 100 + formatBonus + Math.min(0.2, (m.popularity || 0) / 200000);
      if (score > bestScore) { bestScore = score; best = m; }
    });
    return best;
  }

  function searchAniList(title, type, opts) {
    var key = 'al:' + (type || 'ANIME') + ':' + norm(title);
    var maxAge = opts && opts.maxAge != null ? opts.maxAge : TTL_SEARCH;
    var cached = cacheGet(key, maxAge);
    if (cached) return Promise.resolve(cached);
    return once(key, function () {
      return fetchJson(ANILIST, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ query: SEARCH_QUERY, variables: { search: title, type: type || 'ANIME' } })
      }, 12000).then(function (json) {
        var page = json && json.data && json.data.Page;
        var list = (page && page.media) || [];
        var best = bestMatch(list, title);
        if (best) cacheSet(key, best);
        return best;
      });
    });
  }

  /* Walk SEQUEL / PREQUEL / PARENT links so "season 3" can be resolved even
     when AniList's search returns season 1. Only real, dated TV seasons are
     kept: a "NEO EGOIST LEAGUE" style side entry has no start date and used
     to sort to the front, where it stole season 1. */
  function tvSeasons(root, wantSeason) {
    if (!root) return Promise.resolve([]);
    var seen = {};
    var nodes = [];
    function collect(m) {
      if (!m || !m.id || seen[m.id]) return false;
      seen[m.id] = 1;
      var isTv = m.format === 'TV';
      var dated = !!(m.startDate && m.startDate.year);
      var real = m.episodes > 0 || m.status === 'RELEASING' || m.status === 'FINISHED';
      if (isTv && dated && real) nodes.push(m);
      return true;
    }
    collect(root);
    if (!root.relations) return Promise.resolve(nodes);
    var front = [];
    function enqueue(m) {
      ((m && m.relations && m.relations.edges) || []).forEach(function (e) {
        if (!e || !e.node || !e.node.id || seen[e.node.id]) return;
        if (e.relationType !== 'SEQUEL' && e.relationType !== 'PREQUEL' && e.relationType !== 'PARENT') return;
        front.push(e.node.id);
      });
    }
    enqueue(root);
    function walk(round) {
      if (!front.length || round > 8) return Promise.resolve(nodes);
      var ids = front.splice(0, front.length);
      return fetchJson(ANILIST, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ query: CHAIN_QUERY, variables: { ids: ids } })
      }, 12000).then(function (json) {
        var page = json && json.data && json.data.Page;
        ((page && page.media) || []).forEach(function (m) {
          if (!collect(m)) return;
          enqueue(m);
        });
        return walk(round + 1);
      }).catch(function () { return nodes; });
    }
    return walk(1).then(function (all) {
      all.sort(function (a, b) { return dateValue(a.startDate) - dateValue(b.startDate); });
      return all;
    });
  }

  /* (season resolution happens inside episode() so the franchise TV list is
     only fetched once) */

  /* ─────────────────────────────────────────────── TVMaze */
  function pickShow(shows, title, year) {
    var best = null, bestScore = -1;
    (shows || []).forEach(function (row) {
      var show = row && row.show;
      if (!show) return;
      var s = similarity(show.name, title) * 100;
      if (s <= 0) return;
      if (year && show.premiered) {
        var y = parseInt(String(show.premiered).slice(0, 4), 10);
        if (y === year) s += 35;
        else if (Math.abs(y - year) <= 1) s += 15;
      }
      s += Math.min(20, (show.weight || 0) / 5);
      if (s > bestScore) { bestScore = s; best = show; }
    });
    return best;
  }

  function tvmazeSearch(title, year) {
    var key = 'tm:search:' + norm(title) + ':' + (year || '');
    var cached = cacheGet(key, TTL_SEARCH);
    if (cached) return Promise.resolve(cached);
    return once(key, function () {
      return fetchJson(TVMAZE + '/search/shows?q=' + encodeURIComponent(title), { headers: { Accept: 'application/json' } }, 10000)
        .then(function (list) {
          var show = pickShow(list, title, year);
          if (show) cacheSet(key, show);
          return show;
        });
    });
  }

  function tvmazeEpisodes(showId) {
    var key = 'tm:eps:' + showId;
    var cached = cacheGet(key, TTL_EPISODE);
    if (cached) return Promise.resolve(cached);
    return once(key, function () {
      return fetchJson(TVMAZE + '/shows/' + showId + '/episodes', { headers: { Accept: 'application/json' } }, 14000)
        .then(function (list) {
          var rows = (list || []).map(function (e) {
            return {
              season: e.season,
              number: e.number,
              name: e.name || '',
              airdate: e.airdate || '',
              summary: stripHtml(e.summary || ''),
              image: (e.image && e.image.medium) || ''
            };
          });
          cacheSet(key, rows);
          return rows;
        });
    });
  }

  function findTvEpisode(rows, season, episode, absolute) {
    if (!rows || !rows.length) return null;
    var s = parseInt(season, 10) || 1;
    var ep = parseInt(episode, 10) || 1;
    var exact = rows.filter(function (e) { return Number(e.season) === s && Number(e.number) === ep; })[0];
    if (exact) return exact;
    /* TVMaze numbers a year-spanning show by year (One Piece: season 1999,
       season 2000 …), so an AniList "season 1" will never match. When the
       requested season is absent from the rows, the episode number is the
       absolute position in the show. */
    var hasSeason = rows.some(function (e) { return Number(e.season) === s; });
    if (absolute || !hasSeason) {
      /* a single AniList season (One Piece, Detective Conan …) - the visitor
         means the episode's absolute position in the show. Sort by the
         broadcast season/number, never by airdate: an announced episode with
         no airdate would otherwise sort to the front and steal episode 1. */
      var sorted = rows.slice().sort(function (a, b) {
        var sa = Number(a.season) || 0, sb = Number(b.season) || 0;
        if (sa !== sb) return sa - sb;
        return (Number(a.number) || 0) - (Number(b.number) || 0);
      });
      if (sorted[ep - 1]) return sorted[ep - 1];
    }
    return rows.filter(function (e) { return Number(e.season) === 1 && Number(e.number) === ep; })[0] || null;
  }

  /* ─────────────────────────────────────────────── Jikan (MAL) */
  function jikanEpisodes(idMal) {
    if (!idMal) return Promise.resolve([]);
    /* Jikan is blocked on some networks (it refuses the connection). One
       failure is enough: for the next ten minutes every call returns at once
       instead of making each fresh episode wait for the same timeout. */
    if (jikanDownUntil > Date.now()) return Promise.resolve([]);
    var key = 'jk:eps:' + idMal;
    var cached = cacheGet(key, TTL_EPISODE);
    if (cached) return Promise.resolve(cached);
    return once(key, function () {
      var out = [];
      function page(n) {
        return fetchJson(JIKAN + '/anime/' + idMal + '/episodes?page=' + n, { headers: { Accept: 'application/json' } }, 2500)
          .then(function (json) {
            var rows = (json && json.data) || [];
            rows.forEach(function (e) {
              out.push({
                number: e.mal_id,
                name: e.title || e.title_romaji || e.title_english || '',
                nameJa: e.title_japanese || '',
                airdate: e.aired ? String(e.aired).slice(0, 10) : '',
                filler: !!e.filler,
                recap: !!e.recap
              });
            });
            var last = json && json.pagination && json.pagination.last_visible_page;
            if (last && n < last && n < 4) return page(n + 1);
            return out;
          });
      }
      return page(1).then(function (list) {
        jikanDownUntil = 0;
        cacheSet(key, list);
        return list;
      }).catch(function () {
        jikanDownUntil = Date.now() + 10 * 60 * 1000;
        return [];
      });
    });
  }

  /* ─────────────────────────────────────────────── Kitsu */
  function kitsuSearch(title, kind) {
    var key = 'kt:' + (kind || 'anime') + ':' + norm(title);
    var cached = cacheGet(key, TTL_SEARCH);
    if (cached) return Promise.resolve(cached);
    return once(key, function () {
      var url = KITSU + '/' + (kind === 'manga' ? 'manga' : 'anime') + '?filter[text]=' +
        encodeURIComponent(title) + '&page[limit]=8';
      return fetchJson(url, { headers: { Accept: 'application/vnd.api+json' } }, 8000)
        .then(function (json) {
          var list = ((json && json.data) || []).map(function (d) {
            return {
              id: d.id,
              title: (d.attributes && d.attributes.canonicalTitle) || '',
              subtype: d.attributes && d.attributes.subtype,
              episodes: d.attributes && d.attributes.episodeCount,
              chapters: d.attributes && d.attributes.chapterCount,
              volumes: d.attributes && d.attributes.volumeCount,
              startDate: d.attributes && d.attributes.startDate
            };
          });
          var best = null, bestScore = -1;
          list.forEach(function (m) {
            var s = similarity(m.title, title) * 100;
            if (s > bestScore) { bestScore = s; best = m; }
          });
          if (best) cacheSet(key, best);
          return best;
        }).catch(function () { return null; });
    });
  }

  function kitsuEpisode(mediaId, number) {
    if (!mediaId) return Promise.resolve(null);
    var key = 'kt:ep:' + mediaId + ':' + number;
    var cached = cacheGet(key, TTL_EPISODE);
    if (cached !== null) return Promise.resolve(cached);
    return once(key, function () {
      var url = KITSU + '/episodes?filter[mediaId]=' + mediaId + '&filter[number]=' + number + '&page[limit]=3';
      return fetchJson(url, { headers: { Accept: 'application/vnd.api+json' } }, 7000)
        .then(function (json) {
          var row = (json && json.data && json.data[0]) || null;
          var out = row ? {
            title: (row.attributes && (row.attributes.canonicalTitle || row.attributes.titles && (row.attributes.titles.en || row.attributes.titles.en_jp))) || '',
            synopsis: (row.attributes && row.attributes.synopsis) || '',
            airdate: (row.attributes && row.attributes.airdate) || ''
          } : null;
          cacheSet(key, out);
          return out;
        }).catch(function () { return null; });
    });
  }

  /* ─────────────────────────────────────────────── Wikipedia
     The season pages ("Blue Lock season 1", "Jujutsu Kaisen season 2") carry
     a ShortSummary for every episode, which is exactly the detailed plot the
     explain feature needs. The list page ("List of … episodes") is the
     fallback for shows that only have one. */
  var wikiMem = {};

  function wikiToText(raw) {
    var t = String(raw || '');
    for (var i = 0; i < 4; i++) t = t.replace(/\{\{[^{}]*\}\}/g, ' ');
    t = t
      .replace(/<ref[^>]*>[\s\S]*?<\/ref>/gi, ' ')
      .replace(/<ref[^>]*\/>/gi, ' ')
      .replace(/\[\[(?:[^\]|]*\|)?([^\]]+)\]\]/g, '$1')
      .replace(/\[https?:\/\/[^\s\]]+\s+([^\]]+)\]/g, '$1')
      .replace(/'''?/g, '')
      .replace(/<[^>]+>/g, ' ');
    return stripHtml(t).replace(/\s+/g, ' ').trim();
  }

  function wikiField(block, name) {
    var re = new RegExp('\\|\\s*' + name + '\\s*=\\s*([\\s\\S]*?)(?=\\n\\s*\\|\\s*[A-Za-z0-9_]+\\s*=|\\}\\}\\s*$|$)', 'i');
    var m = re.exec(block);
    return m ? m[1] : '';
  }

  function parseWikiEpisodes(wikitext) {
    var chunks = String(wikitext || '').split(/\{\{\s*Episode list/i);
    var rows = [];
    for (var i = 1; i < chunks.length; i++) {
      var block = chunks[i];
      var n1 = parseInt(String(wikiField(block, 'EpisodeNumber')).replace(/\D+/g, ''), 10);
      var n2 = parseInt(String(wikiField(block, 'EpisodeNumber2')).replace(/\D+/g, ''), 10);
      var title = wikiToText(wikiField(block, 'Title'));
      var summary = wikiToText(wikiField(block, 'ShortSummary') || wikiField(block, 'Summary'));
      if (!n1 && !n2 && !title && !summary) continue;
      rows.push({
        n1: isNaN(n1) ? null : n1,
        n2: isNaN(n2) ? null : n2,
        title: title,
        summary: summary
      });
    }
    return rows;
  }

  function wikiPage(title) {
    if (wikiMem[title] !== undefined) return Promise.resolve(wikiMem[title]);
    var url = WIKI + '?action=parse&page=' + encodeURIComponent(title) +
      '&prop=wikitext&format=json&origin=*&redirects=1';
    return fetchJson(url, { headers: { Accept: 'application/json' } }, 12000).then(function (json) {
      var text = json && json.parse && json.parse.wikitext && json.parse.wikitext['*'];
      var rows = text ? parseWikiEpisodes(text) : [];
      var out = { title: (json && json.parse && json.parse.title) || title, rows: rows, text: text || '' };
      wikiMem[title] = out;
      return out;
    }).catch(function () {
      wikiMem[title] = null;
      return null;
    });
  }

  function wikiBase(title) {
    return String(title || '')
      .replace(/\s+(?:season|part|cour)\s+\d+.*$/i, '')
      .replace(/\s+\(?(?:tv|anime)\)?$/i, '')
      .trim();
  }

  /* AniList's English titles are often shouted ("BLUE LOCK"), while Wikipedia
     pages are title case ("Blue Lock season 1"). Keep both spellings and try
     the readable one first. */
  function niceTitle(t) {
    t = String(t || '').trim();
    if (!t) return '';
    if (t === t.toUpperCase() && /\s/.test(t) && /[A-Z]{2}/.test(t) && !/[×]/.test(t)) {
      return t.toLowerCase().replace(/(^|[\s:(\-])([a-z])/g, function (m, a, b) { return a + b.toUpperCase(); });
    }
    return t;
  }

  function wikiEpisode(title, season, episode, altTitle) {
    var s = parseInt(season, 10) || 1;
    var ep = parseInt(episode, 10) || 1;
    var bases = [];
    [title, altTitle].forEach(function (t) {
      var b = wikiBase(t);
      if (!b) return;
      [niceTitle(b), b].forEach(function (x) {
        if (x && bases.map(norm).indexOf(norm(x)) === -1) bases.push(x);
      });
    });
    if (!bases.length) return Promise.resolve(null);
    var base = bases[0];
    var key = 'wiki:' + norm(base) + ':' + s + ':' + ep;
    var cached = cacheGet(key, TTL_EPISODE);
    if (cached !== null) return Promise.resolve(cached || null);

    var pages = [];
    bases.forEach(function (b) {
      var shortBase = b.split(':')[0].trim();
      [
        b + ' season ' + s,
        b + ' (season ' + s + ')',
        'List of ' + b + ' episodes',
        'List of ' + shortBase + ' episodes'
      ].forEach(function (p) {
        if (p && pages.map(norm).indexOf(norm(p)) === -1) pages.push(p);
      });
    });

    function fromRows(page, rows) {
      if (!rows || !rows.length) return null;
      var hit = rows.filter(function (r) { return r.n1 === ep || r.n2 === ep; })[0] || null;
      /* season pages number the episodes from 1, so the index is a safe
         fallback when the template only carries an overall number */
      if (!hit && /season\s*\d+/i.test(page) && rows[ep - 1]) hit = rows[ep - 1];
      return hit ? { page: page, title: hit.title || '', summary: hit.summary || '' } : null;
    }

    function tryPage(i) {
      if (i >= pages.length) return Promise.resolve(null);
      return wikiPage(pages[i]).then(function (pageData) {
        if (pageData && pageData.rows && pageData.rows.length) {
          var hit = fromRows(pages[i], pageData.rows);
          if (hit) return hit;
        }
        return tryPage(i + 1);
      });
    }

    return tryPage(0).then(function (hit) {
      cacheSet(key, hit || false);
      return hit;
    }).catch(function () { return null; });
  }

  /* Manga counts are the one field AniList and Kitsu often leave empty for an
     ongoing series. Wikipedia fills the gap: the article lead carries the
     volume count ("41 volumes as of November 2026") and the chapter-list page
     numbers every chapter, so the highest number is the current chapter.
     Nothing here is guessed — a field stays null when no page states it. */
  function wikiManga(title, altTitle) {
    var bases = [];
    [title, altTitle].forEach(function (t) {
      var b = wikiBase(t);
      if (!b) return;
      [niceTitle(b), b].forEach(function (x) {
        if (x && bases.map(norm).indexOf(norm(x)) === -1) bases.push(x);
      });
    });
    if (!bases.length) return Promise.resolve(null);
    var key = 'wikimanga:' + norm(bases[0]);
    var cached = cacheGet(key, TTL_SEARCH);
    if (cached !== null) return Promise.resolve(cached || null);

    var mainPages = [], listPages = [];
    bases.forEach(function (b) {
      var shortBase = b.split(':')[0].trim();
      if (mainPages.map(norm).indexOf(norm(b)) === -1) mainPages.push(b);
      ['List of ' + b + ' chapters', 'List of ' + shortBase + ' chapters'].forEach(function (p) {
        if (listPages.map(norm).indexOf(norm(p)) === -1) listPages.push(p);
      });
    });

    function firstPage(list) {
      var i = 0;
      function next() {
        if (i >= list.length) return Promise.resolve(null);
        var page = list[i++];
        return wikiPage(page).then(function (p) {
          return (p && p.text) ? p : next();
        });
      }
      return next();
    }

    return Promise.all([firstPage(mainPages), firstPage(listPages)]).then(function (pair) {
      var main = pair[0], list = pair[1];
      var volumes = null, chapters = null, asOf = '';

      function volumeFrom(text) {
        var t = String(text || '');
        var found = null, date = '';
        function take(n, d) {
          n = parseInt(n, 10);
          if (!isNaN(n) && n > 0 && found === null) found = n;
          if (!date && d) date = d;
        }
        function monthYear(num, year) {
          var names = ['January', 'February', 'March', 'April', 'May', 'June',
            'July', 'August', 'September', 'October', 'November', 'December'];
          return (names[num - 1] || '') + ' ' + year;
        }
        var m;
        /* "41 {{Transliteration|ja|[[tankōbon]]}} volumes as of November 2026" */
        m = t.match(/(\d{1,3})\s+{{[^}]*tank[oō]bon[^}]*}}\s+volumes\s+(?:as of\s+)?([A-Z][a-z]+\s+\d{4})/i);
        if (m) take(m[1], m[2]);
        /* "115 {{Transliteration|ja|[[tankōbon]]}} volumes {{as of|2026|7|lc=y}}" */
        m = t.match(/(\d{1,3})\s+{{[^}]*tank[oō]bon[^}]*}}\s+volumes\s*{{as of\|(\d{4})\|(\d{1,2})/i);
        if (m) take(m[1], monthYear(+m[3], +m[2]));
        /* "41 volumes have been released as of November 17, 2026" */
        m = t.match(/(\d{1,3})\s+volumes\s+have been released(?:\s+as of\s+([A-Z][a-z]+\s+\d{1,2},?\s+\d{4}))?/i);
        if (m) take(m[1], m[2] || '');
        /* "As of November 17, 2026, 41 volumes…" */
        m = t.match(/as of\s+([A-Z][a-z]+\s+\d{1,2},?\s+\d{4})\s*,?\s+(\d{1,3})\s+volumes/i);
        if (m) take(m[2], m[1]);
        /* "collected in 41 tankōbon volumes" */
        m = t.match(/collected (?:its chapters )?in(?:to)?\s+(\d{1,3})\s+(?:tank[oō]bon\s+)?volumes/i);
        if (m) take(m[1], '');
        if (date) asOf = date;
        return found;
      }

      function chapterFrom(text, pageTitle, volumeCount) {
        var t = String(text || '');
        /* "Lists of X chapters" is an index of separate volume pages, not a
           numbered chapter list — reading it would undercount badly. */
        if (/^lists of /i.test(String(pageTitle || ''))) return null;
        /* Only the main series — a spin-off section restarts its numbering. */
        var cut = t.split(/==\s*''?[^=\n]*(?:episode nagi|spin[- ]?off)[^=\n]*''?\s*==/i)[0];
        var best = null;
        function take(n) {
          n = parseInt(n, 10);
          if (!isNaN(n) && n > 0 && n < 5000 && (best === null || n > best)) best = n;
        }
        var re = /\*\s*(\d{1,4})\.\s*(?:\{\{\s*nihongo|\{\{\s*Nihongo|")/g, m;
        while ((m = re.exec(cut))) take(m[1]);
        var re2 = /\|\s*(?:Number|ChapterNumber)\s*=\s*(\d{1,4})/g;
        while ((m = re2.exec(cut))) take(m[1]);
        var re3 = /\bChapter\s+(\d{1,4})\b/g;
        while ((m = re3.exec(cut))) take(m[1]);
        /* A manga has several chapters per volume; a number below 4× the
           volume count means the page was not the full chapter list. */
        if (best != null && volumeCount != null && best < volumeCount * 4) return null;
        return best;
      }

      if (main) volumes = volumeFrom(main.text);
      if (list) {
        if (volumes === null) volumes = volumeFrom(list.text);
        chapters = chapterFrom(list.text, list.title, volumes);
      }
      if (!main && !list) return null;
      var out = {
        volumes: volumes,
        chapters: chapters,
        asOf: asOf,
        page: (list && list.title) || (main && main.title) || '',
        sources: ['Wikipedia']
      };
      cacheSet(key, out);
      return out;
    }).catch(function () { return null; });
  }

  /* ─────────────────────────────────────────────── episode facts */
  function episodeHeading(info) {
    if (!info) return '';
    var name = info.episodeTitle || ('Episode ' + info.episode);
    var series = niceTitle(info.title || info.requestedTitle || '');
    var line = '**' + name + '**';
    if (series) line += ' — ' + series;
    line += ' · Season ' + info.season + ', Episode ' + info.episode;
    return line;
  }

  function cleanAirDate(s) {
    if (!s) return '';
    return String(s).slice(0, 10);
  }

  function episode(title, season, number) {
    var s = parseInt(season, 10) || 1;
    var ep = parseInt(number, 10) || 0;
    var key = 'ep:' + norm(title) + ':' + s + ':' + ep;
    var cached = cacheGet(key, TTL_EPISODE);
    if (cached) return Promise.resolve(cached);

    return once(key, function () {
      /* an ongoing show's episode count changes every week, so the episode
         path refuses a search result older than an hour */
      return searchAniList(title, 'ANIME', { maxAge: TTL_EPISODE_SEARCH }).then(function (root) {
        if (!root) {
          return { found: false, requestedTitle: title, season: s, episode: ep, reason: 'no-match' };
        }
        return tvSeasons(root, s).then(function (all) {
          var media = (s > 1) ? ((all || [])[s - 1] || null) : ((all && all[0]) || root);
          if (!media) {
            return { found: false, requestedTitle: title, season: s, episode: ep, reason: 'no-season' };
          }
          var seriesTitle = titleOf(media) || titleOf(root) || title;
          var seasonCount = Math.max(1, (all || []).length);
          var single = seasonCount === 1;
          var totalEpisodes = media.episodes || 0;
          if (totalEpisodes && ep > totalEpisodes) {
            return {
              found: false, requestedTitle: title, title: seriesTitle, season: s, episode: ep,
              totalEpisodes: totalEpisodes, seasonCount: seasonCount, reason: 'out-of-range'
            };
          }

          var tvPromise = withTimeout(tvmazeSearch(titleOf(root) || title, root.startDate && root.startDate.year)
            .then(function (show) {
              if (!show) return { show: null, rows: [] };
              return tvmazeEpisodes(show.id).then(function (rows) { return { show: show, rows: rows }; });
            }).catch(function () { return { show: null, rows: [] }; }), 6000, { show: null, rows: [] });

          var jkPromise = withTimeout(jikanEpisodes(media.idMal), 3000, []);
          var ktPromise = withTimeout(kitsuSearch(seriesTitle, 'anime').then(function (k) {
            return kitsuEpisode(k && k.id, ep);
          }), 4500, null);
          var wpPromise = withTimeout(wikiEpisode(titleOf(root) || title, s, ep, (root.title && root.title.romaji) || title), 6500, null);

          return Promise.all([tvPromise, jkPromise, ktPromise, wpPromise]).then(function (bundle) {
            var tv = bundle[0] || {};
            var jk = bundle[1] || [];
            var kt = bundle[2] || null;
            var wp = bundle[3] || null;
            var tvRow = findTvEpisode(tv.rows, s, ep, single);
            var jkRow = jk.filter(function (x) { return Number(x.number) === ep; })[0] || null;

            /* cross-check the episode title: two sources agreeing is the
               signal the UI shows as "verified" */
            var names = [];
            if (tvRow && tvRow.name) names.push(tvRow.name);
            if (jkRow && jkRow.name) names.push(jkRow.name);
            if (kt && kt.title) names.push(kt.title);
            if (wp && wp.title) names.push(wp.title);
            var counts = {};
            names.forEach(function (n) { var k = norm(n); if (k) counts[k] = (counts[k] || 0) + 1; });
            var winner = '', winnerCount = 0;
            Object.keys(counts).forEach(function (k) { if (counts[k] > winnerCount) { winner = k; winnerCount = counts[k]; } });
            var episodeTitle = '';
            if (winner) {
              if (tvRow && norm(tvRow.name) === winner) episodeTitle = tvRow.name;
              else if (jkRow && norm(jkRow.name) === winner) episodeTitle = jkRow.name;
              else if (wp && norm(wp.title) === winner) episodeTitle = wp.title;
              else episodeTitle = kt.title;
            } else if (names.length) {
              episodeTitle = names[0];
            }
            /* AniList's streaming episode list is a fifth, independent title
               source — but it is often only the latest episodes, so an entry
               is usable only when its own number matches this episode. */
            var streaming = (media.streamingEpisodes || [])[ep - 1] || null;
            if (streaming && streaming.title) {
              var streamTitle = String(streaming.title);
              var streamMatch = streamTitle.match(/^\s*episode\s*(\d+)\s*[-–:]\s*(.*)$/i);
              if (streamMatch && parseInt(streamMatch[1], 10) !== ep) {
                streaming = null;
              } else if (!episodeTitle) {
                episodeTitle = (streamMatch ? (streamMatch[2] || streamTitle) : streamTitle).trim();
              }
            }

            /* The Wikipedia ShortSummary is the long, scene-by-scene plot.
               TVMaze's is shorter but often more current; give the writer
               both when they exist, clearly labelled. */
            var tvSummary = (tvRow && tvRow.summary) || '';
            var wikiSummary = (wp && wp.summary) || '';
            var summary = wikiSummary || tvSummary || (kt && kt.synopsis) || '';
            var summarySource = wikiSummary ? 'Wikipedia' : (tvSummary ? 'TVMaze' : (kt && kt.synopsis ? 'Kitsu' : ''));
            var aired = cleanAirDate((tvRow && tvRow.airdate) || (jkRow && jkRow.airdate) || (kt && kt.airdate));

            var prev = null, next = null;
            if (tv.rows && tv.rows.length) {
              var cur = findTvEpisode(tv.rows, s, ep, single);
              var nxt = findTvEpisode(tv.rows, s, ep + 1, single);
              var prv = ep > 1 ? findTvEpisode(tv.rows, s, ep - 1, single) : null;
              if (nxt && nxt !== cur) next = { number: ep + 1, title: nxt.name || '', summary: nxt.summary || '' };
              if (prv && prv !== cur) prev = { number: ep - 1, title: prv.name || '', summary: prv.summary || '' };
            }
            if (!next && jk.length) {
              var jn = jk.filter(function (x) { return Number(x.number) === ep + 1; })[0];
              if (jn) next = { number: ep + 1, title: jn.name || '', summary: '' };
            }
            if (!prev && jk.length) {
              var jp = jk.filter(function (x) { return Number(x.number) === ep - 1; })[0];
              if (jp) prev = { number: ep - 1, title: jp.name || '', summary: '' };
            }

            var sources = ['AniList'];
            if (tvRow) sources.push('TVMaze');
            if (jkRow) sources.push('Jikan');
            if (kt && kt.title) sources.push('Kitsu');
            if (wp) sources.push('Wikipedia');

            var info = {
              found: true,
              title: seriesTitle,
              requestedTitle: title,
              season: s,
              episode: ep,
              episodeTitle: episodeTitle,
              episodeTitleAlt: (jkRow && jkRow.name) || (tvRow && tvRow.name) || (wp && wp.title) || '',
              episodeTitleJapanese: (jkRow && jkRow.nameJa) || '',
              episodeTitleWikipedia: (wp && wp.title) || '',
              aired: aired,
              summary: summary,
              summaryWiki: wikiSummary,
              summaryTv: tvSummary,
              summarySource: summarySource,
              seriesSynopsis: stripHtml(media.description || ''),
              genres: media.genres || [],
              totalEpisodes: totalEpisodes,
              seasonCount: seasonCount,
              next: next,
              prev: prev,
              image: (tvRow && tvRow.image) || (media.coverImage && media.coverImage.large) || '',
              anilistId: media.id,
              idMal: media.idMal || null,
              wikipediaPage: (wp && wp.page) || '',
              sources: sources,
              verified: winnerCount >= 2,
              checkedAt: Date.now()
            };
            /* A just-aired episode often has no summary yet. Do not freeze
               that empty answer: ask the databases again next time so the
               summary can appear. */
            if (info.summary) cacheSet(key, info);
            return info;
          });
        });
      }).catch(function () {
        return { found: false, requestedTitle: title, season: s, episode: ep, reason: 'network' };
      });
    });
  }

  /* ─────────────────────────────────────────────── anime facts */
  function anime(title) {
    var key = 'anime:' + norm(title);
    var cached = cacheGet(key, TTL_SEARCH);
    if (cached) return Promise.resolve(cached);
    return searchAniList(title, 'ANIME').then(function (media) {
      if (!media) return null;
      var out = {
        title: titleOf(media),
        romaji: (media.title && media.title.romaji) || '',
        format: media.format || '',
        episodes: media.episodes || null,
        status: media.status || '',
        seasonYear: media.startDate && media.startDate.year ? media.startDate.year : null,
        score: media.averageScore || null,
        genres: media.genres || [],
        synopsis: stripHtml(media.description || ''),
        studio: (media.studios && media.studios.nodes && media.studios.nodes[0] && media.studios.nodes[0].name) || '',
        anilistId: media.id,
        idMal: media.idMal || null,
        matchScore: similarity(titleOf(media), title),
        sources: ['AniList']
      };
      cacheSet(key, out);
      return out;
    }).catch(function () { return null; });
  }

  /* ─────────────────────────────────────────────── manga facts
     AniList is the primary source; Kitsu and Wikipedia are asked too and the
     caller can see when they agree (verified). A missing chapter count stays
     null — it is never replaced with a guess. */
  function manga(title) {
    var key = 'manga:' + norm(title);
    var cached = cacheGet(key, TTL_MANGA);
    if (cached) return Promise.resolve(cached);
    return Promise.all([
      searchAniList(title, 'MANGA', { maxAge: TTL_MANGA }),
      withTimeout(kitsuSearch(title, 'manga'), 4500, null),
      withTimeout(wikiManga(title), 6500, null)
    ]).then(function (bundle) {
      var media = bundle[0];
      var kt = bundle[1];
      var wm = bundle[2] || {};
      var wmChapters = wm.chapters != null ? wm.chapters : null;
      var wmVolumes = wm.volumes != null ? wm.volumes : null;
      if (!media && !kt && wmChapters == null && wmVolumes == null) return null;

      var alChapters = media && media.chapters != null ? media.chapters : null;
      var alVolumes = media && media.volumes != null ? media.volumes : null;
      var ktChapters = kt && kt.chapters != null ? kt.chapters : null;
      var ktVolumes = kt && kt.volumes != null ? kt.volumes : null;

      var chapters = alChapters != null ? alChapters : (ktChapters != null ? ktChapters : wmChapters);
      var volumes = alVolumes != null ? alVolumes : (ktVolumes != null ? ktVolumes : wmVolumes);
      var chaptersSource = alChapters != null ? 'AniList' : (ktChapters != null ? 'Kitsu' : (wmChapters != null ? 'Wikipedia' : ''));
      var volumesSource = alVolumes != null ? 'AniList' : (ktVolumes != null ? 'Kitsu' : (wmVolumes != null ? 'Wikipedia' : ''));
      var chapterVotes = [alChapters, ktChapters, wmChapters].filter(function (v) { return v != null; });
      var volumeVotes = [alVolumes, ktVolumes, wmVolumes].filter(function (v) { return v != null; });
      var chaptersAgree = chapterVotes.length >= 2 ? chapterVotes.every(function (v) { return v === chapterVotes[0]; }) : null;
      var volumesAgree = volumeVotes.length >= 2 ? volumeVotes.every(function (v) { return v === volumeVotes[0]; }) : null;

      var out = {
        title: media ? titleOf(media) : (kt && kt.title) || title,
        chapters: chapters,
        volumes: volumes,
        chaptersSource: chaptersSource,
        volumesSource: volumesSource,
        chaptersAsOf: chaptersSource === 'Wikipedia' ? (wm.asOf || '') : '',
        volumesAsOf: volumesSource === 'Wikipedia' ? (wm.asOf || '') : '',
        countsAsOf: wm.asOf || '',
        status: (media && media.status) || '',
        score: (media && media.averageScore) || null,
        startYear: media && media.startDate && media.startDate.year ? media.startDate.year : null,
        genres: (media && media.genres) || [],
        synopsis: stripHtml((media && media.description) || ''),
        anilistId: media && media.id ? media.id : null,
        idMal: media && media.idMal ? media.idMal : null,
        matchScore: similarity(media ? titleOf(media) : (kt && kt.title) || title, title),
        chaptersAgree: chaptersAgree,
        volumesAgree: volumesAgree,
        wikipediaPage: wm.page || '',
        sources: []
      };
      if (media) out.sources.push('AniList');
      if (kt) out.sources.push('Kitsu');
      if (wmChapters != null || wmVolumes != null || wm.page) out.sources.push('Wikipedia');
      out.verified = (chapters != null && chaptersAgree === true) ||
        (volumes != null && volumesAgree === true) ||
        (out.sources.length >= 2 && (chapters != null || volumes != null));
      cacheSet(key, out);
      return out;
    }).catch(function () { return null; });
  }

  /* ─────────────────────────────────────────────── intent parsing */
  var EXPLAIN_RE = /\b(explain|explained|explanation|summar(?:y|ise|ize|ised|ized)|recap|describe|breakdown|what happens|what happened|what will happen|tell me (?:what happens|about)|details?)\b/i;
  var BANGLA_EXPLAIN_RE = /ব্যাখ্যা|বুঝিয়ে|বুঝাই|কি হয়|কী হয়|কী ঘটে|কি ঘটে|পর্ব|এপিসোড|বিস্তারিত/;

  function stripNoise(text) {
    var t = asciiDigits(text)
      .replace(/\b(?:s|season)\s*\d+\s*[,·-]?\s*(?:e|ep|episode)?\s*\d+\b/ig, ' ')
      .replace(/\b(?:season|part)\s*\d+\b/ig, ' ')
      .replace(/\b(?:episode|ep)\s*\d+\b/ig, ' ')
      .replace(/\bepisode\s*(?:number\s*)?\d+\b/ig, ' ')
      .replace(/\b(?:please|pls|kindly|bro|bruh|senpai|bhai|vai)\b/ig, ' ')
      .replace(/\b(?:can you|could you|would you|will you)\b/ig, ' ')
      .replace(/\b(?:explain|explanation|summar(?:y|ise|ize|ised|ized)|recap|describe|breakdown|details?|in more detail|in detail|full|whole|entire|spoiler[- ]?free|spoilers?)\b/ig, ' ')
      .replace(/\b(?:what happens|what happened|tell me about|tell me|show me|give me)\b/ig, ' ')
      .replace(/\bin more\b/ig, ' ')
      .replace(/\b(?:anime|episode|ep|season|series)\b/ig, ' ')
      .replace(/ব্যাখ্যা|বুঝিয়ে|বুঝাই|কি হয়|কী হয়|কী ঘটে|কি ঘটে|পর্ব|এপিসোড|বিস্তারিত|করো|কর|দাও|আমাকে/g, ' ')
      .replace(/[।!?.,:;"'“”‘’()\[\]]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    /* drop leading / trailing glue words but never a title's own words */
    t = t.replace(/^(?:of|for|about|on|in|the|a|an)\s+/i, '').replace(/\s+(?:of|for|about|on|in)$/i, '').trim();
    return t;
  }

  function meaningfulTitle(t) {
    var left = norm(t).replace(/\b(?:in|more|less|detail|details|next|previous|prev|last|the|a|an|ep|episode|season|series|part|explain|please|of|for|about)\b/g, '').trim();
    return left.length >= 2;
  }

  function parseExplain(message, last, opts) {
    opts = opts || {};
    var raw = String(message || '');
    var text = asciiDigits(raw);
    if (!text.trim()) return null;

    var isExplain = EXPLAIN_RE.test(text) || BANGLA_EXPLAIN_RE.test(text);
    if (!isExplain) return null;

    var english = /\b(?:in english|english (?:please|version|language))\b|ইংরেজি(?:তে|য়)?|ইংলিশে/i.test(text);
    var depth = /\b(?:more details?|in more details?|in details?|deep|detailed|full details?)\b|আরও বিস্তারিত|বিস্তারিত(?:ভাবে)?|ডিটেইল/i.test(text) ? 2 : 1;

    var season = 0, ep = 0;
    var m;

    /* s1e13 / S01E013 */
    m = text.match(/\bs\s*(\d{1,2})\s*[x\-–]?\s*e\s*(\d{1,4})\b/i);
    if (m) { season = parseInt(m[1], 10); ep = parseInt(m[2], 10); }

    /* season 1 episode 13 / season 1, ep 13 */
    if (!ep) {
      m = text.match(/\b(?:season|part)\s*(\d{1,2})[^\d]{0,16}(?:episode|ep|e)\s*(\d{1,4})\b/i);
      if (m) { season = parseInt(m[1], 10); ep = parseInt(m[2], 10); }
    }

    /* episode 13 of season 1 / episode 13 season 1 */
    if (!ep) {
      m = text.match(/\b(?:episode|ep|e)\s*(\d{1,4})[^\d]{0,20}(?:season|part)\s*(\d{1,2})\b/i);
      if (m) { ep = parseInt(m[1], 10); season = parseInt(m[2], 10); }
    }

    /* just episode 13 */
    if (!ep) {
      m = text.match(/\b(?:episode|ep)\s*(\d{1,4})\b/i);
      if (m) ep = parseInt(m[1], 10);
    }

    /* "explain episode 13" can also be written as "ep 13" */
    if (!ep) {
      m = text.match(/\be\s*(\d{1,4})\b/i);
      if (m && /\bepisode\b|\bep\b|explain|summary|recap/i.test(text)) ep = parseInt(m[1], 10);
    }

    var wantsNext = /\bnext\s+(?:ep|episode)\b|what will happen|what happens next|পরের\s*(?:পর্ব|এপ)|পরবর্তী\s*(?:পর্ব|এপ)/i.test(text);
    var wantsPrev = /\b(?:previous|prev|last)\s+(?:ep|episode)\b|আগের\s*(?:পর্ব|এপ)/i.test(text);

    if (!ep) {
      if (!last) return null;
      if (wantsNext) {
        ep = (parseInt(last.episode, 10) || 1) + 1;
        season = last.season || 1;
      } else if (wantsPrev) {
        ep = Math.max(1, (parseInt(last.episode, 10) || 1) - 1);
        season = last.season || 1;
      } else if (depth >= 2) {
        ep = parseInt(last.episode, 10) || 1;
        season = last.season || 1;
      } else {
        return null;
      }
    }

    var title = '';
    if (typeof opts.resolveTitle === 'function') {
      try { title = opts.resolveTitle(text) || ''; } catch (e) { title = ''; }
    }

    /* A card title can be shorter than what the API already resolved, so keep
       the exact title the previous answer used for the same show. */
    if (title && last && norm(title) === norm(last.title)) {
      title = last.title;
    }
    var followUp = wantsNext || wantsPrev || depth >= 2;
    if (!title || !meaningfulTitle(title)) {
      var cleaned = stripNoise(text);
      if (followUp && last) title = last.title;
      else if (cleaned && meaningfulTitle(cleaned)) title = cleaned;
      else if (last) title = last.title;
      else if (cleaned) title = cleaned;
    }

    if (!title) return null;

    if (!season) {
      var sameShow = !!(last && norm(title) === norm(last.title));
      season = (sameShow && last.season) ? last.season : 1;
    }

    /* "explain" of a whole show has no episode — leave that to the normal chat */
    return {
      title: title,
      season: season,
      episode: ep,
      depth: depth,
      english: english,
      next: wantsNext,
      prev: wantsPrev
    };
  }

  window.AnimeData = {
    episode: episode,
    anime: anime,
    manga: manga,
    parseExplain: parseExplain,
    episodeHeading: episodeHeading,
    titleOf: titleOf,
    normalise: norm,
    stripHtml: stripHtml,
    cleanTitle: stripNoise
  };
})();
