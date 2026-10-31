/* ============================================================================
   anime-fetch.js — the admin panel's "FETCH DATA" button.

   The admin types an anime name, presses FETCH DATA, and this fills the whole
   ADD form (title, poster, season, episodes, rating, MAL, genres, studio, OTT)
   from AniList, so nothing has to be typed by hand.

   Sources
     · AniList GraphQL  — title, poster, episodes, air season, score, genres,
                          tags, studios, streaming links. CORS-friendly.
     · Jikan (MAL API)  — the real MAL score, when the host is reachable.
     · MAL page         — the same real score read straight off
                          myanimelist.net through the r.jina.ai reader, used
                          when Jikan is blocked by the network.
     · Local fit        — if both of the above fail, MAL is estimated from the
                          AniList score with the line fitted on this site's own
                          anime-ratings.json (0.0725 * score + 2.2649, R² 0.72)
                          and is clearly labelled as an estimate.

   The form field ids are the same in index.html (in-page panel) and admin.html,
   so one implementation serves both.
   ============================================================================ */
(function () {
  'use strict';

  var ANILIST_URL = 'https://graphql.anilist.co';
  var JIKAN_URL = 'https://api.jikan.moe/v4/anime/';
  var MAL_FIT = { slope: 0.0725, intercept: 2.2649 };

  /* AniList's SEARCH_MATCH alone happily returns a special or a recap for a
     well known title, so we ask for ten results and rank them ourselves. */
  var SEARCH_QUERY = [
    'query ($search: String) {',
    '  Page(perPage: 10) {',
    '    media(search: $search, type: ANIME, sort: SEARCH_MATCH) {',
    '      id',
    '      idMal',
    '      format',
    '      popularity',
    '      title { english romaji }',
    '      synonyms',
    '      startDate { year month }',
    '      episodes',
    '      averageScore',
    '      coverImage { extraLarge large }',
    '      genres',
    '      tags { name rank }',
    '      studios(isMain: true) { nodes { name } }',
    '      externalLinks { site }',
    '    }',
    '  }',
    '}'
  ].join('\n');

  /* The site's own filter vocabulary — anything else is dropped, because the
     genre filters only know these buckets. */
  var GENRE_VOCAB = [
    'Action', 'Adventure', 'Comedy', 'Sports', 'Isekai', 'High School',
    'Sci-Fi', 'Dark / Horror', 'Romcom', 'Slice of Life', 'Historical',
    'Psychological'
  ];

  /* AniList streaming link name -> the names used in OTT_DATA */
  var OTT_MAP = {
    'crunchyroll': 'Crunchyroll',
    'hulu': 'Hulu',
    'netflix': 'Netflix',
    'tubi tv': 'Tubi',
    'tubi': 'Tubi',
    'youtube': 'YouTube',
    'amazon prime video': 'Amazon Prime',
    'amazon prime': 'Amazon Prime',
    'hidive': 'HiDive',
    'beta series': 'Beta Series'
  };

  function seasonOf(startDate) {
    if (!startDate || !startDate.year) return '';
    var month = startDate.month || 1;
    var name = month <= 3 ? 'Winter' : month <= 6 ? 'Spring' : month <= 9 ? 'Summer' : 'Fall';
    return name + ' ' + startDate.year;
  }

  function mapGenres(media) {
    var genres = (media.genres || []).map(function (g) { return String(g).toLowerCase(); });
    var tags = {};
    (media.tags || []).forEach(function (t) {
      if (t && t.rank >= 50) tags[String(t.name).toLowerCase()] = true;
    });

    var out = [];
    function add(name) { if (out.indexOf(name) === -1) out.push(name); }
    function has(name) { return genres.indexOf(name) !== -1; }

    var romance = has('romance');
    if (has('action')) add('Action');
    if (has('adventure')) add('Adventure');
    if (has('comedy') && romance) add('Romcom');
    else if (has('comedy')) add('Comedy');
    else if (romance) add('Romcom');
    if (has('sports')) add('Sports');
    if (has('slice of life')) add('Slice of Life');
    if (has('sci-fi')) add('Sci-Fi');
    if (has('horror') || has('thriller')) add('Dark / Horror');
    if (has('mystery')) add('Psychological');
    if (has('fantasy')) add('Adventure');
    if (tags.isekai) add('Isekai');
    if (tags.school) add('High School');
    if (tags.psychological) add('Psychological');
    if (tags.historical) add('Historical');
    if (!out.length && (tags.revenge || tags.tragedy || tags.crime || tags.death || tags.gore || tags.survival)) {
      add('Dark / Horror');
    }

    return out.filter(function (g) { return GENRE_VOCAB.indexOf(g) !== -1; });
  }

  function mapOtt(links) {
    var out = [];
    (links || []).forEach(function (link) {
      var name = OTT_MAP[String(link.site || '').toLowerCase()];
      if (name && out.indexOf(name) === -1) out.push(name);
    });
    return out;
  }

  function fetchJson(url, options, timeoutMs) {
    if (typeof AbortController !== 'function') return fetch(url, options).then(function (r) { return r.json(); });
    var controller = new AbortController();
    var timer = setTimeout(function () { controller.abort(); }, timeoutMs || 8000);
    var opts = options || {};
    opts.signal = controller.signal;
    return fetch(url, opts).then(function (r) {
      clearTimeout(timer);
      return r.json();
    }, function (e) {
      clearTimeout(timer);
      throw e;
    });
  }

  /* "Frieren: Beyond Journey's End" -> "frieren beyond journey s end" */
  function normalise(text) {
    return String(text || '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function titleOf(media) {
    var english = media.title && media.title.english;
    var romaji = media.title && media.title.romaji;
    /* some listings mask spoiler titles with dots/squares — never put that on a card */
    var masked = function (t) { return !t || /[●◯□■*]{2,}/.test(t); };
    return masked(english) ? (romaji || english || '') : english;
  }

  /* Rank candidates: best title match first, then TV over specials, then popularity. */
  function pickBest(mediaList, query) {
    var q = normalise(query);
    var yearMatch = String(query).match(/\b(19|20)\d{2}\b/);
    var queryYear = yearMatch ? parseInt(yearMatch[0]) : null;
    if (queryYear) q = normalise(String(query).replace(String(queryYear), ''));

    var best = null;
    var bestScore = -1;

    mediaList.forEach(function (media) {
      var names = [media.title && media.title.english, media.title && media.title.romaji]
        .concat(media.synonyms || [])
        .filter(Boolean)
        .map(normalise);

      var similarity = 0;
      names.forEach(function (name) {
        var value = 0;
        if (name === q) value = 3;
        else if (q && (name.indexOf(q) === 0 || q.indexOf(name) === 0)) value = 2.5;
        else if (q && name.indexOf(q) !== -1) value = 2;
        else if (q && q.indexOf(name) !== -1) value = 1.5;
        if (value > similarity) similarity = value;
      });

      var formatBonus = media.format === 'TV' ? 30
        : media.format === 'TV_SHORT' ? 20
        : media.format === 'MOVIE' ? 10
        : media.format === 'OVA' || media.format === 'ONA' ? 5 : 0;
      var yearBonus = queryYear && media.startDate && media.startDate.year === queryYear ? 40 : 0;
      var score = similarity * 100 + formatBonus + yearBonus + Math.min(20, (media.popularity || 0) / 2000);

      if (score > bestScore) { bestScore = score; best = media; }
    });

    return best;
  }

  /* Where the last successful MAL score came from ("Jikan" or "MAL"). */
  var malSource = '';

  /* Scores are stable for months, so remember what we already fetched: a
     repeat FETCH DATA for the same anime then fills MAL instantly instead of
     waiting on the network. "↻ MAL" bypasses this on purpose. */
  var MAL_CACHE_KEY = 'mal_score_cache_v1';
  var MAL_CACHE_TTL = 30 * 24 * 60 * 60 * 1000;

  function readMalCache() {
    try {
      var raw = localStorage.getItem(MAL_CACHE_KEY);
      var map = raw ? JSON.parse(raw) : {};
      return map && typeof map === 'object' ? map : {};
    } catch (e) { return {}; }
  }

  function writeMalCache(idMal, score, source) {
    try {
      var map = readMalCache();
      map[idMal] = { s: score, src: source, t: Date.now() };
      var keys = Object.keys(map);
      if (keys.length > 300) {
        keys.sort(function (a, b) { return map[a].t - map[b].t; });
        keys.slice(0, keys.length - 300).forEach(function (k) { delete map[k]; });
      }
      localStorage.setItem(MAL_CACHE_KEY, JSON.stringify(map));
    } catch (e) { /* private mode / quota — caching is optional */ }
  }

  /* Same as fetchJson, for endpoints that answer with text (the MAL page
     reader returns markdown, not JSON). */
  function fetchText(url, options, timeoutMs) {
    if (typeof AbortController !== 'function') return fetch(url, options).then(function (r) { return r.text(); });
    var controller = new AbortController();
    var timer = setTimeout(function () { controller.abort(); }, timeoutMs || 8000);
    var opts = options || {};
    opts.signal = controller.signal;
    return fetch(url, opts).then(function (r) {
      clearTimeout(timer);
      return r.text();
    }, function (e) {
      clearTimeout(timer);
      throw e;
    });
  }

  /* "Score:6.30" in the statistics block of the MAL page. */
  function parseMalScore(text) {
    if (!text) return null;
    var match = String(text).match(/Score:\s*([0-9]+(?:\.[0-9]+)?)/);
    if (!match) return null;
    var value = parseFloat(match[1]);
    return value > 0 && value <= 10 ? Math.round(value * 100) / 100 : null;
  }

  /* The real MAL score, over two independent routes raced against each other:
       1. Jikan (api.jikan.moe) — fast and clean, but blocked on some networks.
       2. The MAL page itself, read through r.jina.ai — a different host and a
          different data source, so it still answers when Jikan refuses the
          connection. Confirmed working from the live site's origin.
     Both carry the same official score, so whichever answers first wins and a
     blocked Jikan no longer costs the fetch a multi-second timeout.
     Returns null only when both routes fail. */
  function malScore(idMal, force) {
    malSource = '';
    if (!idMal) return Promise.resolve(null);

    if (!force) {
      var cached = readMalCache()[idMal];
      if (cached && cached.s > 0 && (Date.now() - cached.t) < MAL_CACHE_TTL) {
        malSource = cached.src || 'MAL';
        return Promise.resolve(cached.s);
      }
    }

    return new Promise(function (resolve) {
      var pending = 2;
      var settled = false;

      function win(score, source) {
        if (settled || score === null) return;
        settled = true;
        malSource = source;
        writeMalCache(idMal, score, source);
        resolve(score);
      }
      function miss() {
        if (settled) return;
        if (--pending === 0) { settled = true; resolve(null); }
      }

      fetchJson(JIKAN_URL + idMal + '?sfw', { headers: { Accept: 'application/json' } }, 5000)
        .then(function (json) {
          var score = json && json.data && json.data.score;
          if (typeof score === 'number' && score > 0) win(Math.round(score * 100) / 100, 'Jikan');
          else miss();
        })
        .catch(miss);

      fetchText('https://r.jina.ai/https://myanimelist.net/anime/' + idMal, { headers: { Accept: 'text/plain' } }, 12000)
        .then(function (text) {
          var score = parseMalScore(text);
          if (score !== null) win(score, 'MAL');
          else miss();
        })
        .catch(miss);
    });
  }

  function searchAniList(name) {
    return fetchJson(ANILIST_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ query: SEARCH_QUERY, variables: { search: name } })
    }, 12000).then(function (json) {
      var page = json && json.data && json.data.Page;
      var list = (page && page.media) || [];
      if (!list.length) return null;
      var media = pickBest(list, name);
      if (!media) return null;

      var studio = '';
      if (media.studios && media.studios.nodes && media.studios.nodes.length) {
        studio = media.studios.nodes[0].name || '';
      }
      var score = typeof media.averageScore === 'number' ? media.averageScore : null;
      var data = {
        id: media.id,
        idMal: media.idMal,
        title: titleOf(media) || name,
        image: (media.coverImage && (media.coverImage.extraLarge || media.coverImage.large)) || '',
        season: seasonOf(media.startDate),
        episodes: media.episodes || '',
        rating: score,
        mal: null,
        malEstimated: false,
        genres: mapGenres(media),
        studio: studio,
        ott: mapOtt(media.externalLinks)
      };
      return malScore(media.idMal).then(function (real) {
        if (real !== null) {
          data.mal = real;
          data.malSource = malSource;
        } else if (score !== null) {
          data.mal = Math.round((MAL_FIT.slope * score + MAL_FIT.intercept) * 100) / 100;
          data.malEstimated = true;
        }
        return data;
      });
    });
  }

  function setValue(id, value) {
    var el = document.getElementById(id);
    if (!el || value === undefined || value === null || value === '') return;
    el.value = value;
  }

  function setStatus(text, kind) {
    var el = document.getElementById('adminFetchStatus');
    if (!el) return;
    el.textContent = text;
    el.style.color = kind === 'ok' ? '#00ff41' : kind === 'err' ? '#ff3355' : '#8b93a7';
  }

  function applyPills(data) {
    /* the two panels each keep their own selection arrays as globals */
    if (typeof _selectedGenre === 'undefined' || typeof _selectedOtt === 'undefined') return false;
    _selectedGenre = data.genres.slice();
    _selectedOtt = data.ott.slice();
    _selectedStudio = data.studio ? [data.studio] : [];
    if (typeof renderPills === 'function') {
      renderPills('genre', '');
      renderPills('ott', '');
      renderPills('studio', '');
    }
    if (typeof renderSelectedPills === 'function') renderSelectedPills();
    return true;
  }

  function applyToForm(data) {
    setValue('adminAddTitle', data.title);
    setValue('adminAddImg', data.image);
    setValue('adminAddSeason', data.season);
    setValue('adminAddEps', data.episodes);
    setValue('adminAddRating', data.rating);
    setValue('adminAddMal', data.mal);
    var seasonLabel = document.getElementById('adminAddSeasonLabel');
    if (seasonLabel && !seasonLabel.value.trim()) seasonLabel.value = 'Season-1';
    applyPills(data);
  }

  function summary(data) {
    var bits = [data.title];
    bits.push(data.season || 'season ?');
    bits.push((data.episodes || '?') + ' eps');
    bits.push('AniList ' + (data.rating === null ? '?' : data.rating));
    if (data.mal === null) bits.push('MAL n/a');
    else bits.push('MAL ' + data.mal + (data.malEstimated ? ' (est.)' : ' (' + (data.malSource || 'MAL') + ')'));
    bits.push(data.genres.length ? data.genres.join(' · ') : 'no genre matched — pick one');
    return bits.join(' | ');
  }

  /* Re-fetch just the MAL score for the currently typed title — runs the full
     Jikan → MAL-page chain again (useful when the first FETCH DATA was
     rate-limited or Jikan was blocked). */
  window.refetchMal = function () {
    var input = document.getElementById('adminAddTitle');
    var malField = document.getElementById('adminAddMal');
    var status = document.getElementById('adminFetchStatus');
    var name = input ? input.value.trim() : '';

    if (!name) {
      if (status) { status.textContent = 'Type an anime name first.'; status.style.color = '#ff3355'; }
      if (input) input.focus();
      return;
    }

    if (status) { status.textContent = 'Re-fetching MAL score for "' + name + '"…'; status.style.color = '#8b93a7'; }

    searchAniList(name).then(function (data) {
      if (!data || !data.idMal) {
        if (status) { status.textContent = 'No AniList match — cannot re-fetch MAL.'; status.style.color = '#ff3355'; }
        return;
      }
      return malScore(data.idMal, true).then(function (real) {
        if (real !== null && malField) {
          malField.value = real;
          if (status) { status.textContent = 'MAL re-fetched: ' + real + ' (' + (malSource || 'MAL') + ')'; status.style.color = '#00ff41'; }
        } else if (data.rating !== null && malField) {
          var est = Math.round((MAL_FIT.slope * data.rating + MAL_FIT.intercept) * 100) / 100;
          malField.value = est;
          if (status) { status.textContent = 'MAL re-fetched: ' + est + ' (est.) — both Jikan and the MAL page were unreachable'; status.style.color = '#ffa500'; }
        } else {
          if (status) { status.textContent = 'Could not get MAL score.'; status.style.color = '#ff3355'; }
        }
      });
    }).catch(function (err) {
      if (status) { status.textContent = 'Re-fetch failed: ' + ((err && err.message) || 'network error'); status.style.color = '#ff3355'; }
    });
  };

  window.fetchAnimeData = function () {
    var input = document.getElementById('adminAddTitle');
    var button = document.getElementById('adminFetchBtn');
    var name = input ? input.value.trim() : '';

    if (!name) {
      setStatus('Type an anime name first, then press FETCH DATA.', 'err');
      if (input) input.focus();
      return;
    }

    if (button) { button.disabled = true; button.textContent = 'SEARCHING…'; }
    setStatus('Searching AniList for "' + name + '"…', 'info');

    searchAniList(name).then(function (data) {
      if (!data) {
        setStatus('No AniList match for "' + name + '". Try the romanised title or add the year.', 'err');
        return;
      }
      applyToForm(data);
      setStatus('Filled from: ' + summary(data), 'ok');
    }).catch(function (err) {
      setStatus('Fetch failed (' + (err && err.message ? err.message : 'network error') + '). Fill it manually.', 'err');
    }).then(function () {
      if (button) { button.disabled = false; button.textContent = 'FETCH DATA'; }
    });
  };
})();
