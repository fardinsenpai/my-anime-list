/* =====================================================================
   SUB-PAGE PERFORMANCE GUARD
   ---------------------------------------------------------------------
   When the visitor is on a sub-page (not the main hub), heavy effects
   (thunder, sakura, 3D mascot, card tilts) are turned off to keep the
   page fast. The main page keeps everything.
   ===================================================================== */
(function () {
  'use strict';
  var path = (location.pathname || '').toLowerCase();
  var isMain = /\/(index\.html)?$/.test(path) || path === '/' || path.endsWith('/my-anime-list') || path.endsWith('/my-anime-list/');
  if (isMain) return; // keep full experience on the hub
  document.documentElement.classList.add('subpage');
  // remove heavy canvases
  function strip() {
    ['lightningCanvas', 'sakuraCanvas'].forEach(function (id) {
      var el = document.getElementById(id);
      if (el && el.parentNode) el.parentNode.removeChild(el);
    });
    document.body.classList.add('perf-low');
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', strip);
  else strip();
})();
