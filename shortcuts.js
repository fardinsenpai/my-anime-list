/* =====================================================================
   KEYBOARD SHORTCUTS + FEATURES POPUP
   --------------------------------------------------------------------- */
(function () {
  'use strict';

  function openFeaturesPopup() {
    if (document.getElementById('featuresPopup')) return;
    var ov = document.createElement('div');
    ov.id = 'featuresPopup';
    ov.className = 'fp-overlay';
    ov.innerHTML =
      '<div class="fp-panel" role="dialog" aria-modal="true" aria-label="Website features">' +
        '<div class="fp-head">' +
          '<span class="fp-title">Website Features</span>' +
          '<button type="button" class="fp-x" aria-label="Close">✕</button>' +
        '</div>' +
        '<div class="fp-body">' +
          '<div class="fp-item"><b>🏠 Home</b><span>Browse the full anime collection. Filter by genre, search instantly.</span></div>' +
          '<div class="fp-item"><b>🔍 Search (Ctrl+F)</b><span>Jump to the main search box and filter cards live.</span></div>' +
          '<div class="fp-item"><b>💬 AI Chat</b><span>Ask about any anime or episode. Explanations are spoiler-free first.</span></div>' +
          '<div class="fp-item"><b>🎮 Games</b><span>Guess the anime, character, true/false, emoji and more.</span></div>' +
          '<div class="fp-item"><b>🌸 Waifus</b><span>Browse the waifu gallery.</span></div>' +
          '<div class="fp-item"><b>💖 Wish List</b><span>Save titles and track watch status.</span></div>' +
          '<div class="fp-item"><b>⚔️ Duel / Tournament</b><span>Compare anime head-to-head or run a bracket.</span></div>' +
          '<div class="fp-item"><b>🧭 Quest</b><span>Trivia runs with saved titles.</span></div>' +
          '<div class="fp-item"><b>🅢 Tier List</b><span>Rank anime S→D, rename tiers, auto-rank, export PNG, share.</span></div>' +
          '<div class="fp-item"><b>📡 Airing Now</b><span>Next episodes with local-time countdowns.</span></div>' +
          '<div class="fp-item"><b>⚖️ Taste Match</b><span>Compare your wish list with Fardin.</span></div>' +
          '<div class="fp-item"><b>🎯 Tour (Ctrl+T)</b><span>Guided walkthrough of every feature.</span></div>' +
          '<div class="fp-item"><b>⌨️ Shortcuts</b><span>Ctrl+F search · Ctrl+K this popup · Ctrl+T tour · Esc close.</span></div>' +
        '</div>' +
      '</div>';
    document.body.appendChild(ov);
    ov.querySelector('.fp-x').addEventListener('click', closeFeaturesPopup);
    ov.addEventListener('click', function (e) { if (e.target === ov) closeFeaturesPopup(); });
  }
  function closeFeaturesPopup() {
    var ov = document.getElementById('featuresPopup');
    if (ov) ov.remove();
  }

  document.addEventListener('keydown', function (e) {
    var key = e.key.toLowerCase();
    if (e.ctrlKey && !e.metaKey) {
      if (key === 'f') {
        e.preventDefault();
        var box = document.getElementById('searchBox');
        if (box) { box.focus(); box.select(); }
        return;
      }
      if (key === 'k') {
        e.preventDefault();
        if (document.getElementById('featuresPopup')) closeFeaturesPopup();
        else openFeaturesPopup();
        return;
      }
      if (key === 't') {
        e.preventDefault();
        if (typeof startTour === 'function') startTour();
        else if (document.getElementById('tourBtn')) document.getElementById('tourBtn').click();
        return;
      }
    }
    if (key === 'escape') {
      closeFeaturesPopup();
    }
  });
})();
