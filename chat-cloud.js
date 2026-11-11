/* ══════════════════════════════════════════════════════════════════════
   CHAT HISTORY IN THE CLOUD
   Signed-in visitors keep their AI chat in Supabase, so the conversation
   follows them to another device. Guests keep the local copy only.

   Table: chat_messages (see supabase-schema.sql)
   ══════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  var SB_URL = 'https://ldzlefdklcgvqcbqibtt.supabase.co';
  var SB_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxkemxlZmRrbGNndnFjYnFpYnR0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODEwMzk1OTAsImV4cCI6MjA5NjYxNTU5MH0.X3TGuLIpjrnPXMgCv4ZKIIjB6pItPgkdebf4JPdhuYs';
  var TABLE = 'chat_messages';
  var LOAD_LIMIT = 80;
  var MAX_LEN = 4000;

  var pending = [];
  var flushing = false;
  var loadedFor = null;

  function userId() {
    try { return (window.AUTH_USER && window.AUTH_USER.id) || null; } catch (e) { return null; }
  }

  function token() {
    return new Promise(function (resolve) {
      try {
        var c = (typeof window.authClient === 'function') ? window.authClient() : null;
        if (!c) return resolve('');
        c.auth.getSession().then(function (r) {
          resolve((r && r.data && r.data.session && r.data.session.access_token) || '');
        }).catch(function () { resolve(''); });
      } catch (e) { resolve(''); }
    });
  }

  function api(path, opts) {
    opts = opts || {};
    return token().then(function (t) {
      var headers = Object.assign({
        apikey: SB_KEY,
        Authorization: 'Bearer ' + (t || SB_KEY),
        'Content-Type': 'application/json',
        Prefer: 'return=minimal'
      }, opts.headers || {});
      return fetch(SB_URL + '/rest/v1/' + path, Object.assign({}, opts, { headers: headers }));
    });
  }

  /* ── write ── */
  function push(role, content) {
    var uid = userId();
    if (!uid) return;
    var text = String(content || '').slice(0, MAX_LEN);
    if (!text) return;
    pending.push({ user_id: uid, role: role, content: text, created_at: new Date().toISOString() });
    flush();
  }

  function flush() {
    if (flushing || !pending.length) return;
    flushing = true;
    var rows = pending.splice(0, pending.length);
    api(TABLE, { method: 'POST', body: JSON.stringify(rows) })
      .then(function () { flushing = false; if (pending.length) flush(); })
      .catch(function () { flushing = false; });
  }

  /* ── read ── */
  function load() {
    var uid = userId();
    if (!uid) return Promise.resolve([]);
    var q = TABLE + '?select=role,content,created_at&user_id=eq.' + encodeURIComponent(uid) +
      '&order=created_at.desc&limit=' + LOAD_LIMIT;
    return api(q, { method: 'GET', headers: { Prefer: 'return=representation' } })
      .then(function (r) { return r.ok ? r.json() : []; })
      .then(function (rows) { return (rows || []).slice().reverse(); })
      .catch(function () { return []; });
  }

  /* Put the cloud history into the chat (only when the local copy is
     older or empty, so a live conversation is never overwritten). */
  function sync() {
    var uid = userId();
    if (!uid) { loadedFor = null; return Promise.resolve(false); }
    if (loadedFor === uid) return Promise.resolve(false);
    return load().then(function (rows) {
      loadedFor = uid;
      if (!rows || !rows.length) return false;
      try {
        if (typeof chatHistory === 'undefined' || !Array.isArray(chatHistory)) return false;
        var localCount = chatHistory.filter(function (m) { return m.role === 'user' || m.role === 'assistant'; }).length;
        if (localCount >= rows.length) return false;   /* the local chat is newer */
        var system = chatHistory[0] && chatHistory[0].role === 'system' ? chatHistory[0] : null;
        chatHistory = system ? [system] : [];
        var host = document.getElementById('chatMessages');
        if (host) host.innerHTML = '';
        rows.forEach(function (r) {
          var role = r.role === 'user' ? 'user' : 'assistant';
          chatHistory.push({ role: role, content: r.content });
          if (typeof addMessage === 'function') addMessage(r.content, role === 'user' ? 'user' : 'bot', false);
        });
        try { if (typeof saveChatToStorage === 'function') saveChatToStorage(); } catch (e) {}
        return true;
      } catch (e) { return false; }
    });
  }

  window.ChatCloud = { push: push, load: load, sync: sync, flush: flush };

  /* sign in / sign out */
  document.addEventListener('fardin:auth-changed', function () {
    if (userId()) sync();
    else loadedFor = null;
  });

  /* also try once on boot, in case the session was restored silently */
  window.addEventListener('load', function () {
    setTimeout(function () { if (userId()) sync(); }, 2500);
  });
})();
