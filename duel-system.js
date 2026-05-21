// duel-system.js — COMPLETE FILE

(function (window, document) {
  'use strict';

  // ─── Guard ───────────────────────────────────────────────
  if (window.__DUEL_LOADED__) return;
  window.__DUEL_LOADED__ = true;
  // ─────────────────────────────────────────────────────────

  console.log('⚔️ Anime Duel System initializing...');

  /* ── STATE ─────────────────────────────────────────── */
  const DuelState = {
    isActive     : false,
    selectedCards: [],
    selectedAnime: [],
    animeDatabase: [],
    isAnimating  : false,
  };

  /* ── DATA LOADING ──────────────────────────────────── */
  async function loadAnimeDatabase() {
    try {
      const res  = await fetch('anime-ratings.json');
      if (!res.ok) throw new Error(res.status);
      const data = await res.json();
      DuelState.animeDatabase = Array.isArray(data) ? data : Object.values(data);
      console.log(`✅ Duel System: ${DuelState.animeDatabase.length}টা Anime লোড হয়েছে।`);
    } catch (e) {
      console.error('❌ Database load failed:', e);
      DuelState.animeDatabase = [];
    }
  }

  function injectDuelSidebarLink() {
    // ─── Already exists check ───────────────────────────
    // HTML-এ manually আছে কিনা দেখো
    const existingLink = document.getElementById('duel-nav-link');
    
    if (existingLink) {
      // Link already আছে — শুধু event listener attach করো
      console.log('✅ Duel nav link found in HTML — attaching event...');
      
      // পুরানো listener remove করে নতুন দাও (duplicate এড়াতে)
      const newLink = existingLink.cloneNode(true);
      existingLink.parentNode.replaceChild(newLink, existingLink);
      
      document.getElementById('duel-nav-link')
              .addEventListener('click', e => { 
                e.preventDefault(); 
                toggleDuelMode(); 
              });
      return; // inject করার দরকার নেই
    }

    // ─── না থাকলে নতুন inject করো ──────────────────────
    const sideNav = document.querySelector('nav.side-nav')
                 || document.querySelector('.side-nav');
                 
    if (!sideNav) { 
      console.warn('⚠️ .side-nav পাওয়া যায়নি'); 
      return; 
    }

    const li = document.createElement('li');
    li.id    = 'duel-nav-item';
    li.innerHTML = `
      <a href="#" id="duel-nav-link" class="duel-nav-link"
         aria-label="Anime Duel Mode" role="button" aria-pressed="false">
        <span class="duel-nav-icon">⚔️</span>
        <span class="duel-nav-text">Anime Duel</span>
        <span class="duel-status-badge" id="duel-status-badge">OFF</span>
      </a>`;
    sideNav.appendChild(li);

    document.getElementById('duel-nav-link')
            .addEventListener('click', e => { 
              e.preventDefault(); 
              toggleDuelMode(); 
            });
            
    console.log('✅ Duel nav link injected!');
  }

  function activateDuelMode() {
    DuelState.isActive = true;
    document.body.classList.add('duel-mode-active');

    const link  = document.getElementById('duel-nav-link');
    const badge = document.getElementById('duel-status-badge');
    link ?.classList.add('duel-link--active');
    link ?.setAttribute('aria-pressed', 'true');
    if (badge) { badge.textContent = 'ON'; badge.classList.add('badge--active'); }

    // Chat bubble hide
const bubble = document.querySelector('.chat-bubble');
if (bubble) bubble.style.display = 'none';

// Genre filter + Counter hide
const filterSection = document.querySelector('.filter-section');
const counterContainer = document.querySelector('.counter-container');

if (filterSection) filterSection.style.display = 'none';
if (counterContainer) counterContainer.style.display = 'none';

    showDuelModeIndicator();
    showDuelToast('⚔️ Duel Mode চালু!', 'দুইটা Anime card select করো।', 'info');
}  // ← এখানে বন্ধ হবে

  function toggleDuelMode() {
  // ⬇️ Sidebar auto-close করো
  closeSidebar();
  
  DuelState.isActive ? deactivateDuelMode() : activateDuelMode();
}

/**
 * Sidebar বন্ধ করা — multiple selectors try করে
 */
function closeSidebar() {
  // Sidebar element খুঁজে বের করা
  const sidebar = document.getElementById('sideMenu') 
               || document.querySelector('.sidemenu')
               || document.querySelector('.sidebar');
  
  if (!sidebar) {
    console.warn('⚠️ Sidebar element পাওয়া যায়নি');
    return;
  }
  
  // Method 1: Common class names remove করো
  sidebar.classList.remove('open', 'active', 'show', 'visible', 'expanded');
  
  // Method 2: Common class names add করো (closed state)
  sidebar.classList.add('closed', 'hidden');
  
  // Method 3: যদি menu toggle button থাকে — click trigger করো
  const menuBtn = document.querySelector('.menu-btn')
              || document.querySelector('.hamburger')
              || document.querySelector('.menu-toggle')
              || document.querySelector('[data-menu-toggle]');
  
  // যদি sidebar এখনো open আছে, তাহলে toggle button click করো
  if (menuBtn && sidebar.classList.contains('open')) {
    menuBtn.click();
  }
  
  // Method 4: Backdrop/overlay click trigger
  const backdrop = document.querySelector('.sidebar-backdrop')
                || document.querySelector('.menu-overlay')
                || document.querySelector('.backdrop');
  if (backdrop) backdrop.click();
  
  console.log('🚪 Sidebar closed');
}

  function deactivateDuelMode() {
    DuelState.isActive = false;
    document.body.classList.remove('duel-mode-active');

    const link  = document.getElementById('duel-nav-link');
    const badge = document.getElementById('duel-status-badge');
    link ?.classList.remove('duel-link--active');
    link ?.setAttribute('aria-pressed', 'false');
    if (badge) { badge.textContent = 'OFF'; badge.classList.remove('badge--active'); }
    
    // Chat bubble show
const bubble = document.querySelector('.chat-bubble');
if (bubble) bubble.style.display = 'flex';

// Genre filter + Counter show
const filterSection = document.querySelector('.filter-section');
const counterContainer = document.querySelector('.counter-container');

if (filterSection) filterSection.style.display = '';
if (counterContainer) counterContainer.style.display = '';

    resetDuelSelection();
    hideDuelModeIndicator();
    showDuelToast('🔕 Duel Mode বন্ধ।', '', 'warning');
  }

  /* ── CARD INTERCEPTION ─────────────────────────────── */
  function handleCardClick(e) {
    if (!DuelState.isActive) return;

    const card = e.target.closest('.card');
    if (!card) return;

    e.stopPropagation();
    e.preventDefault();

    if (DuelState.isAnimating) {
      showDuelToast('⏳ অপেক্ষা করো...', 'Battle চলছে!', 'warning');
      return;
    }

    if (card.classList.contains('selected-for-duel')) {
      deselectCard(card); return;
    }

    if (DuelState.selectedCards.length >= 2) {
      showDuelToast('⚠️ ইতিমধ্যে ২টা selected!', 'Reset করো।', 'warning');
      return;
    }

    selectCard(card);
  }

  function selectCard(card) {
  const title = extractTitle(card);
  if (!title) return;

  const anime = findAnime(title, extractRank(card));
  if (!anime) {
    showDuelToast('❌ Data পাওয়া যায়নি!', `"${title}" database-এ নেই।`, 'error');
    return;
  }

  // ⬇️ Card থেকে সব data extract করে anime object enrich করা
  enrichAnimeFromCard(anime, card);

  DuelState.selectedCards.push(card);
  DuelState.selectedAnime.push(anime);

  const n = DuelState.selectedCards.length;
  card.classList.add('selected-for-duel');
  card.setAttribute('data-duel-player', n === 1 ? 'P1' : 'P2');
  addSelectionBadge(card, n);
  updateIndicatorCount();

  if (n === 1) {
    showDuelToast('⚡ Anime 1 Selected!', `"${anime.title}"`, 'success');
  } else {
    showDuelToast('🔥 Anime 2 Selected!', `"${anime.title}"`, 'success');
    setTimeout(initiateBattle, 600);
  }
}

/**
 * Card থেকে image, episode info ইত্যাদি extract করে 
 * anime object এ inject করা
 */
function enrichAnimeFromCard(anime, card) {
  // 🖼️ Poster image extract
  const posterImg = card.querySelector('.poster-wrap img')
                 || card.querySelector('.card-front img')
                 || card.querySelector('img');
  
  if (posterImg && posterImg.src) {
    anime.image = posterImg.src;
    anime._cardImage = posterImg.src; // backup
  }

  // 📺 Back side থেকে episodes
  const episodesEl = card.querySelector('.back-episodes');
  if (episodesEl) {
    const match = episodesEl.textContent.match(/\d+/);
    if (match) anime.episodes = match[0];
  }

  // 🌸 Season info
  const seasonEl = card.querySelector('.back-season');
  if (seasonEl) {
    anime.season = seasonEl.textContent.replace(/🌸/g, '').trim();
  }

  // 🔢 Number/rank
  const numberEl = card.querySelector('.number, .badge');
  if (numberEl) {
    const match = numberEl.textContent.match(/\d+/);
    if (match) anime.cardNumber = match[0];
  }

  console.log('✅ Enriched anime:', anime);
}

  function deselectCard(card) {
    const i = DuelState.selectedCards.indexOf(card);
    if (i > -1) { DuelState.selectedCards.splice(i,1); DuelState.selectedAnime.splice(i,1); }
    card.classList.remove('selected-for-duel');
    card.removeAttribute('data-duel-player');
    card.querySelector('.duel-selection-badge')?.remove();
    updateIndicatorCount();
    showDuelToast('↩️ Selection সরানো হয়েছে।', '', 'info');
  }

  /* ── DATA HELPERS ──────────────────────────────────── */
  function extractTitle(card) {
    const selectors = ['.card-title','.anime-title','h3','h4','.title','.card-front h3'];
    for (const s of selectors) {
      const el = card.querySelector(s);
      if (el) return el.getAttribute('data-title') || el.textContent.trim();
    }
    return card.getAttribute('data-anime') || card.getAttribute('data-title') || null;
  }

  function extractRank(card) {
    const b = card.querySelector('.badge,.rank-badge,[data-rank]');
    if (b) { const n = parseInt(b.textContent || b.getAttribute('data-rank')); return isNaN(n)?null:n; }
    return null;
  }

  function findAnime(title, rank) {
    const db = DuelState.animeDatabase;
    let found = db.find(a => a.title?.toLowerCase() === title?.toLowerCase());
    if (!found) found = db.find(a =>
      a.title?.toLowerCase().includes(title?.toLowerCase()) ||
      title?.toLowerCase().includes(a.title?.toLowerCase())
    );
    if (!found && rank) found = db.find(a => a.rank===rank || a.id===rank);
    return found || null;
  }

  /* ============================================================
   🎭 GENRE MATCHING SYSTEM
   ============================================================ */

/**
 * একটা anime এর rank নিয়ে তার সব genres বের করা
 * @param {number} rank — anime এর rank number
 * @returns {string[]} — array of genre names
 */
function getAnimeGenres(rank) {
  if (!rank) return [];
  
  // GENRES data access করো
  const genresData = window.ANIME_GENRES || GENRES_FALLBACK;
  if (!genresData) {
    console.warn('⚠️ GENRES data not found!');
    return [];
  }
  
  const matchedGenres = [];
  
  // প্রতিটা genre এর nums Set এ search করো
  for (const [genreName, genreInfo] of Object.entries(genresData)) {
    if (genreName === 'All') continue;
    if (genreName === 'Movie') continue; // Movie is format, not genre
    
    if (genreInfo.nums && genreInfo.nums.has(rank)) {
      matchedGenres.push({
        name: genreName,
        icon: genreInfo.icon
      });
    }
  }
  
  return matchedGenres;
}

/**
 * দুইটা anime এর genres compare করে common genres বের করা
 * @param {Object} anime1
 * @param {Object} anime2
 * @returns {Object} — { canFight, commonGenres, anime1Genres, anime2Genres }
 */
function checkGenreCompatibility(anime1, anime2) {
  // দুইটার rank বের করো
  const rank1 = anime1.rank || anime1.id || anime1.number;
  const rank2 = anime2.rank || anime2.id || anime2.number;
  
  const genres1 = getAnimeGenres(rank1);
  const genres2 = getAnimeGenres(rank2);
  
  // Common genres খোঁজা
  const genres2Names = new Set(genres2.map(g => g.name));
  const commonGenres = genres1.filter(g => genres2Names.has(g.name));
  
  console.log('🎭 Genre Check:', {
    anime1: anime1.title,
    anime1Genres: genres1.map(g => g.name),
    anime2: anime2.title,
    anime2Genres: genres2.map(g => g.name),
    common: commonGenres.map(g => g.name)
  });
  
  return {
    canFight: commonGenres.length > 0,
    commonGenres,
    anime1Genres: genres1,
    anime2Genres: genres2,
  };
}

  /* ── POWER SCORE ───────────────────────────────────── */
  function calcPower(anime) {
    const mal   = parseFloat(anime.malScore    || anime.mal_score    || 0);
    const story = parseFloat(anime.storyRating || anime.story_rating || 0);
    const anim  = parseFloat(anime.animRating  || anime.anim_rating  || anime.animationRating || 0);
    return parseFloat(((mal * 0.4) + (story * 0.4) + (anim * 0.2)).toFixed(3));
  }

  function getWinner(a1, a2) {
    const s1 = calcPower(a1), s2 = calcPower(a2);
    const isDraw = Math.abs(s1 - s2) < 0.001;
    return {
      winner: isDraw ? null : (s1 > s2 ? a1 : a2),
      loser : isDraw ? null : (s1 > s2 ? a2 : a1),
      isDraw,
      scores: { anime1: s1, anime2: s2 },
    };
  }

  /* ── BATTLE ────────────────────────────────────────── */
  function initiateBattle() {
    if (DuelState.selectedAnime.length < 2) return;
    DuelState.isAnimating = true;

    const [a1, a2] = DuelState.selectedAnime;
    const result   = getWinner(a1, a2);
    const overlay  = buildOverlay(a1, a2, result);

    document.body.appendChild(overlay);
    requestAnimationFrame(() => requestAnimationFrame(() =>
      overlay.classList.add('duel-overlay--visible')
    ));

    setTimeout(() => clashAnimation(overlay),          400);
    setTimeout(() => revealStats(overlay, a1, a2, result), 2200);
    setTimeout(() => { announceWinner(overlay, result); DuelState.isAnimating = false; }, 3800);
  }

  /* ── OVERLAY BUILD ─────────────────────────────────── */
  function buildOverlay(a1, a2, result) {
  const ov = document.createElement('div');
  ov.id        = 'duel-overlay';
  ov.className = 'duel-overlay';
  ov.setAttribute('role', 'dialog');
  ov.setAttribute('aria-modal', 'true');

  ov.innerHTML = `
    <div class="duel-bg-effect" aria-hidden="true">
      <div class="duel-particles" id="duel-particles"></div>
    </div>

    <div class="duel-arena">

      <!-- CLOSE BTN -->
      <button class="duel-close-btn" id="duel-close-btn" aria-label="Close">✕</button>

      <!-- HEADER -->
      <div class="duel-header">
        <div class="duel-header__title">
          <span>⚔️</span>
          <h2 class="duel-header__text">ANIME DUEL ARENA</h2>
          <span>⚔️</span>
        </div>
      </div>

      <!-- FIGHTERS -->
      <div class="duel-fighters" id="duel-fighters">

        <!-- P1 -->
        <div class="duel-fighter duel-fighter--p1" id="duel-fighter-p1">
          <div class="duel-fighter__label duel-fighter__label--p1">⚡ ANIME 1</div>
          <div class="duel-fighter__poster">
            ${(a1.image||a1.poster||a1.img)
              ? `<img src="${a1.image||a1.poster||a1.img}" alt="${a1.title}" onerror="this.style.display='none'">`
              : '<span class="duel-fighter__poster-fallback">🎌</span>'}
          </div>
          <div class="duel-fighter__info">
            <h3 class="duel-fighter__name">${a1.title||'Unknown'}</h3>
            <div class="duel-fighter__genre">${a1.genre||''}</div>
          </div>
          <div class="duel-fighter__power-preview duel-fighter__power-preview--p1">
            <span>POWER</span>
            <strong id="power-value-p1">??</strong>
          </div>
        </div>

        <!-- VS -->
        <div class="duel-vs-center" id="duel-vs-center">
          <div class="duel-vs__ring">
            <span class="duel-vs__text">VS</span>
          </div>
          <div class="duel-vs__spark" id="duel-vs-spark" aria-hidden="true">
            <div class="spark spark--1"></div>
            <div class="spark spark--2"></div>
            <div class="spark spark--3"></div>
            <div class="spark spark--4"></div>
          </div>
        </div>

        <!-- P2 -->
        <div class="duel-fighter duel-fighter--p2" id="duel-fighter-p2">
          <div class="duel-fighter__label duel-fighter__label--p2">🔥 ANIME 2</div>
          <div class="duel-fighter__poster">
            ${(a2.image||a2.poster||a2.img)
              ? `<img src="${a2.image||a2.poster||a2.img}" alt="${a2.title}" onerror="this.style.display='none'">`
              : '<span class="duel-fighter__poster-fallback">🎌</span>'}
          </div>
          <div class="duel-fighter__info">
            <h3 class="duel-fighter__name">${a2.title||'Unknown'}</h3>
            <div class="duel-fighter__genre">${a2.genre||''}</div>
          </div>
          <div class="duel-fighter__power-preview duel-fighter__power-preview--p2">
            <span>POWER</span>
            <strong id="power-value-p2">??</strong>
          </div>
        </div>
      </div>

      <!-- STATS -->
      <div class="duel-stats-section" id="duel-stats-section">
        <h3 class="duel-stats__heading">📊 BATTLE STATS COMPARISON</h3>
        ${statRowHTML('mal',   '⭐ MAL Score', '/10')}
        ${statRowHTML('story', '📖 Story',     '/10')}
        ${statRowHTML('anim',  '🎨 Animation', '/10')}
        <div class="duel-power-total" id="duel-power-total">
          <div class="duel-power-total__p1" id="total-p1">
            <span class="power-label">POWER</span>
            <span class="power-value" id="total-val-p1">0.000</span>
          </div>
          <div class="duel-power-total__label">⚡ TOTAL POWER ⚡</div>
          <div class="duel-power-total__p2" id="total-p2">
            <span class="power-label">POWER</span>
            <span class="power-value" id="total-val-p2">0.000</span>
          </div>
        </div>
      </div>

      <!-- WINNER -->
      <div class="duel-winner-section" id="duel-winner-section">
        <div class="duel-winner__content" id="duel-winner-content"></div>
      </div>

      <!-- ACTIONS -->
      <div class="duel-actions" id="duel-actions">
        <button class="duel-btn duel-btn--reset" id="duel-reset-btn">🔄 Reset</button>
        <button class="duel-btn duel-btn--exit"  id="duel-exit-btn">🚪 Exit</button>
      </div>
    </div>`;

  ov.querySelector('#duel-close-btn').addEventListener('click', () => closeOverlay(ov));
  ov.querySelector('#duel-reset-btn').addEventListener('click', () => {
    closeOverlay(ov); resetDuelSelection();
    showDuelToast('🔄 Reset!', 'নতুন করে select করো।', 'info');
  });
  ov.querySelector('#duel-exit-btn').addEventListener('click', () => {
    closeOverlay(ov); deactivateDuelMode();
  });
  ov.addEventListener('click', e => { if (e.target === ov) closeOverlay(ov); });
  document.addEventListener('keydown', function esc(e) {
    if (e.key === 'Escape') { closeOverlay(ov); document.removeEventListener('keydown', esc); }
  });

  generateParticles(ov.querySelector('#duel-particles'));
  return ov;
}

  function fighterHTML(anime, id, label) {
  // সব সম্ভাব্য ইমেজ ফিল্ড চেক করা
  const imgSrc = anime.image || anime.poster || anime.banner || anime.cover || anime.img || '';

  return `
    <div class="duel-fighter duel-fighter--${id}" id="duel-fighter-${id}">
      <div class="duel-fighter__label">${label}</div>
      
      <div class="duel-fighter__poster">
        ${imgSrc 
          ? `<img src="${imgSrc}" alt="${anime.title}" onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';">` 
          : ''
        }
        <div class="duel-fighter__poster-fallback" ${imgSrc ? 'style="display:none"' : ''}>
          <span>🎌</span>
        </div>
      </div>

      <h3 class="duel-fighter__name">${anime.title || 'Unknown'}</h3>
      <div class="duel-fighter__genre">${anime.genre || ''}</div>

      <div class="duel-fighter__power-preview" id="power-preview-${id}">
        <span></span>
        <strong id="power-value-${id}">??</strong>
      </div>
    </div>
  `;
}

  function statRowHTML(key, label, sub) {
    return `
      <div class="duel-stat-row">
        <div class="duel-stat__bar-wrap duel-stat__bar-wrap--left">
          <div class="duel-stat__bar duel-stat__bar--p1" id="bar-p1-${key}">
            <div class="duel-stat__fill" style="width:0%"></div>
          </div>
          <span class="duel-stat__value" id="val-p1-${key}">0</span>
        </div>
        <div class="duel-stat__label"><span>${label}</span><small>${sub}</small></div>
        <div class="duel-stat__bar-wrap duel-stat__bar-wrap--right">
          <span class="duel-stat__value" id="val-p2-${key}">0</span>
          <div class="duel-stat__bar duel-stat__bar--p2" id="bar-p2-${key}">
            <div class="duel-stat__fill" style="width:0%"></div>
          </div>
        </div>
      </div>`;
  }

  /* ── ANIMATIONS ────────────────────────────────────── */
  function clashAnimation(ov) {
    const p1 = ov.querySelector('#duel-fighter-p1');
    const p2 = ov.querySelector('#duel-fighter-p2');
    const vs = ov.querySelector('#duel-vs-center');

    p1?.classList.add('fighter--clash-in-left');
    p2?.classList.add('fighter--clash-in-right');

    setTimeout(() => {
      vs?.classList.add('vs--pulse');
      ov.querySelector('#duel-vs-spark')?.classList.add('spark--active');
      screenFlash(ov);
    }, 600);

    setTimeout(() => {
      vs?.classList.add('vs--impact');
      p1?.classList.add('fighter--clash-impact');
      p2?.classList.add('fighter--clash-impact');
    }, 900);

    setTimeout(() => {
      p1?.classList.remove('fighter--clash-impact');
      p2?.classList.remove('fighter--clash-impact');
    }, 1200);
  }

  function revealStats(ov, a1, a2, result) {
    const section = ov.querySelector('#duel-stats-section');
    if (!section) return;
    section.classList.add('stats--visible');

    const s1 = getStats(a1), s2 = getStats(a2);

const pp1 = ov.querySelector('#power-value-p1');
const pp2 = ov.querySelector('#power-value-p2');
if (pp1) pp1.textContent = result.scores.anime1.toFixed(3);
if (pp2) pp2.textContent = result.scores.anime2.toFixed(3);

    setTimeout(() => animateBar(ov, 'mal',   s1.malScore,    s2.malScore,    10), 300);
    setTimeout(() => animateBar(ov, 'story', s1.storyRating, s2.storyRating, 10), 700);
    setTimeout(() => animateBar(ov, 'anim',  s1.animRating,  s2.animRating,  10), 1100);

    setTimeout(() => {
      ov.querySelector('#duel-power-total')?.classList.add('power-total--visible');
      animCounter(ov.querySelector('#total-val-p1'), 0, result.scores.anime1, 800, 3);
      animCounter(ov.querySelector('#total-val-p2'), 0, result.scores.anime2, 800, 3);

      if (!result.isDraw) {
        const isP1 = result.winner === a1;
        ov.querySelector(`#total-${isP1 ? 'p1' : 'p2'}`)?.classList.add('power--winner');
      }
    }, 1500);
  }

  function animateBar(ov, key, v1, v2, max) {
    const pct1 = Math.min((v1/max)*100, 100);
    const pct2 = Math.min((v2/max)*100, 100);

    const f1 = ov.querySelector(`#bar-p1-${key} .duel-stat__fill`);
    const f2 = ov.querySelector(`#bar-p2-${key} .duel-stat__fill`);
    const t1 = ov.querySelector(`#val-p1-${key}`);
    const t2 = ov.querySelector(`#val-p2-${key}`);

    if (f1) { f1.style.transition='width 0.9s ease'; f1.style.width=`${pct1}%`; }
    if (f2) { f2.style.transition='width 0.9s ease'; f2.style.width=`${pct2}%`; }

    animCounter(t1, 0, v1, 900, 1);
    animCounter(t2, 0, v2, 900, 1);

    if (v1 !== v2) {
      setTimeout(() => {
        ov.querySelector(`#bar-p1-${key}`)?.classList.toggle('bar--winner', v1 > v2);
        ov.querySelector(`#bar-p2-${key}`)?.classList.toggle('bar--winner', v2 > v1);
      }, 950);
    }
  }

  function announceWinner(ov, result) {
  const section = ov.querySelector('#duel-winner-section');
  const content = ov.querySelector('#duel-winner-content');
  if (!section || !content) return;

  const [a1, a2] = DuelState.selectedAnime;
  const p1 = ov.querySelector('#duel-fighter-p1');
  const p2 = ov.querySelector('#duel-fighter-p2');

  if (result.isDraw) {
    content.innerHTML = `
      <div class="winner-result draw">
        <h2>🤝 IT'S A DRAW!</h2>
      </div>`;
  } else {
    const isP1Winner = result.winner === a1;

    // দুই পাশেই কার্ড থাকবে
    if (isP1Winner) {
      p1?.classList.add('fighter--victory');
      p2?.classList.add('fighter--defeat');
    } else {
      p2?.classList.add('fighter--victory');
      p1?.classList.add('fighter--defeat');
    }

    // নিচে শুধু Winner ঘোষণা করবো
    content.innerHTML = `
      <div class="winner-result">
        <div class="winner-crown">👑</div>
        <div class="winner-badge ${isP1Winner ? 'p1' : 'p2'}">
          ${isP1Winner ? 'ANIME 1 WINS!' : 'ANIME 2 WINS!'}
        </div>
        <h2 class="winner-name">${result.winner.title}</h2>
        <div class="winner-score">
          Total Score: <strong>${(isP1Winner ? result.scores.anime1 : result.scores.anime2).toFixed(3)}</strong>
        </div>
      </div>
    `;
  }


  
  section.classList.add('winner--visible');
  ov.querySelector('#duel-actions')?.classList.add('actions--visible');

  

}



  /* ── VISUAL EFFECTS ────────────────────────────────── */
  function generateParticles(container) {
    if (!container) return;
    for (let i = 0; i < 30; i++) {
      const p = document.createElement('div');
      p.className = 'duel-particle';
      p.style.cssText = `
        left:${Math.random()*100}%;
        animation-delay:${Math.random()*3}s;
        animation-duration:${2+Math.random()*3}s;
        width:${2+Math.random()*4}px;
        height:${2+Math.random()*4}px;`;
      container.appendChild(p);
    }
  }

  function screenFlash(ov) {
    const f = document.createElement('div');
    f.className = 'duel-screen-flash';
    ov.appendChild(f);
    requestAnimationFrame(() => f.classList.add('flash--active'));
    setTimeout(() => f.remove(), 500);
  }

  function confetti(ov) {
    const colors = ['#00d4ff','#ffcc00','#ff6b6b','#00ff88','#ff00ff'];
    for (let i = 0; i < 50; i++) {
      setTimeout(() => {
        const c = document.createElement('div');
        c.className = 'duel-confetti';
        c.style.cssText = `
          left:${Math.random()*100}%;
          background:${colors[Math.floor(Math.random()*colors.length)]};
          transform:rotate(${Math.random()*360}deg);
          animation-delay:${Math.random()*1000}ms;`;
        ov.appendChild(c);
        setTimeout(() => c.remove(), 3000);
      }, i * 30);
    }
  }

  /* ── UTILITY ───────────────────────────────────────── */
  function getStats(anime) {
    return {
      malScore:    parseFloat(anime.malScore    || anime.mal_score    || 0),
      storyRating: parseFloat(anime.storyRating || anime.story_rating || 0),
      animRating:  parseFloat(anime.animRating  || anime.anim_rating  || anime.animationRating || 0),
    };
  }

  function animCounter(el, from, to, dur, dec) {
    if (!el) return;
    const start = performance.now();
    (function tick(now) {
      const p = Math.min((now - start) / dur, 1);
      el.textContent = (from + (to - from) * (1 - Math.pow(1-p, 3))).toFixed(dec);
      if (p < 1) requestAnimationFrame(tick);
    })(start);
  }

  function addSelectionBadge(card, n) {
    card.querySelector('.duel-selection-badge')?.remove();
    const b = document.createElement('div');
    b.className = `duel-selection-badge duel-selection-badge--p${n}`;
    b.innerHTML = n === 1 ? '<span>⚡</span><span>P1</span>' : '<span>🔥</span><span>P2</span>';
    card.appendChild(b);
  }

  function resetDuelSelection() {
    DuelState.selectedCards.forEach(c => {
      c.classList.remove('selected-for-duel');
      c.removeAttribute('data-duel-player');
      c.querySelector('.duel-selection-badge')?.remove();
    });
    DuelState.selectedCards = [];
    DuelState.selectedAnime = [];
    DuelState.isAnimating   = false;
    updateIndicatorCount();
  }

  function closeOverlay(ov) {
    ov.classList.remove('duel-overlay--visible');
    ov.classList.add('duel-overlay--hiding');
    setTimeout(() => ov.remove(), 500);
  }

  function showDuelToast(title, msg, type) {
    document.querySelector('.duel-toast')?.remove();
    const icons = { info:'ℹ️', success:'✅', warning:'⚠️', error:'❌' };
    const t = document.createElement('div');
    t.className = `duel-toast duel-toast--${type}`;
    t.innerHTML = `
      <div class="toast-icon">${icons[type]||'ℹ️'}</div>
      <div class="toast-content">
        <strong class="toast-title">${title}</strong>
        ${msg ? `<span class="toast-message">${msg}</span>` : ''}
      </div>
      <button class="toast-close" aria-label="Close">✕</button>`;
    document.body.appendChild(t);
    t.querySelector('.toast-close').addEventListener('click', () => {
      t.classList.add('toast--hiding'); setTimeout(() => t.remove(), 300);
    });
    setTimeout(() => { if (t.parentNode) { t.classList.add('toast--hiding'); setTimeout(()=>t.remove(),300); } }, 3500);
    requestAnimationFrame(() => requestAnimationFrame(() => t.classList.add('toast--visible')));
  }

  function showDuelModeIndicator() {
    let ind = document.getElementById('duel-mode-indicator');
    if (!ind) {
      ind = document.createElement('div');
      ind.id        = 'duel-mode-indicator';
      ind.className = 'duel-mode-indicator';
      ind.innerHTML = `
        <div class="indicator__pulse"></div>
        <span class="indicator__icon">⚔️</span>
        <span class="indicator__text">DUEL MODE</span>
        <span class="indicator__sub"><span id="duel-selection-count">0</span>/2 Selected</span>`;
      document.body.appendChild(ind);
    }
    ind.classList.add('indicator--visible');
  }

  function hideDuelModeIndicator() {
    document.getElementById('duel-mode-indicator')?.classList.remove('indicator--visible');
  }

  function updateIndicatorCount() {
    const el = document.getElementById('duel-selection-count');
    if (el) el.textContent = DuelState.selectedCards.length;
  }

  /* ── INIT ──────────────────────────────────────────── */
  async function initDuelSystem() {
    await loadAnimeDatabase();
    injectDuelSidebarLink();
    // Capture phase দিয়ে card click intercept করা
    document.addEventListener('click', handleCardClick, true);
    console.log('✅ Duel System ready!');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initDuelSystem);
  } else {
    initDuelSystem();
  }

  // Global expose
  window.DuelSystem = { state: DuelState, toggle: toggleDuelMode, reset: resetDuelSelection };

}(window, document));
// ← IIFE শেষ — এর বাইরে কোনো variable নেই!

