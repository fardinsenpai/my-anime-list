/* ================================================================
   EMAIL CODE SIGN-IN
   ---------------------------------------------------------------
   The email path no longer uses a password. It uses a 6-digit code
   that our own Supabase Edge Function mails out (through Resend),
   and Cloudflare Turnstile makes sure a human is asking.

   Free stack:  Supabase Edge Functions + Resend free + Turnstile free.
   The function lives at  <supabase-url>/functions/v1/auth-otp

   Google / GitHub sign-in is untouched - those providers already
   confirm the address, so those accounts count as verified.
   ================================================================ */
(function () {
  'use strict';

  var CF_SITE_KEY = '1x00000000000000000000AA';   // Turnstile test key (always passes)
  // swap for the real site key from dashboard.cloudflare.com > Turnstile
  var CF_SCRIPT = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';

  var OTP = {
    step: 'email',        // 'email' -> 'code'
    email: '',
    token: '',            // the Turnstile token for the next send
    resendAt: 0,
    timer: null,
    loading: false,
    probed: false,              // has the code service been asked if it exists?
    passwordFallback: false   // set when the code service is not reachable
  };

  function byId(id) { return document.getElementById(id); }
  function supabaseUrl() {
    if (typeof AUTH_URL !== 'undefined' && AUTH_URL) return AUTH_URL;
    return 'https://ldzlefdklcgvqcbqibtt.supabase.co';
  }
  function functionUrl() { return supabaseUrl() + '/functions/v1/auth-otp'; }

  /* ---------------------------------------------------- turnstile */
  var turnstileLoaded = false;
  function loadTurnstile(cb) {
    if (turnstileLoaded) { cb(); return; }
    var s = document.createElement('script');
    s.src = CF_SCRIPT;
    s.async = true;
    s.onload = function () { turnstileLoaded = true; cb(); };
    s.onerror = function () { cb(); };
    document.head.appendChild(s);
  }

  function paintTurnstile() {
    var host = byId('lgOtpTurn');
    if (!host) return;
    if (!window.turnstile) { loadTurnstile(function () { paintTurnstile(); }); return; }
    if (OTP.widgetId) { try { window.turnstile.remove(OTP.widgetId); } catch (e) {} OTP.widgetId = null; }
    host.innerHTML = '';
    try {
      OTP.widgetId = window.turnstile.render(host, {
        sitekey: CF_SITE_KEY,
        theme: 'dark',
        size: 'flexible',
        callback: function (t) { OTP.token = t || ''; },
        'expired-callback': function () { OTP.token = ''; },
        'error-callback': function () { OTP.token = ''; },
      });
    } catch (e) {
      host.innerHTML = '<div class="lg-otp-captcha">The human check could not load - use Google or GitHub for now.</div>';
    }
  }

  /* ------------------------------------------------------ the ui */
  // The code service may not be deployed yet. If it is not answering we keep
  // the old password sign-in, so the site never loses a way in.
  function probeService() {
    if (OTP.probed) return;
    OTP.probed = true;
    var settled = false;
    var timer = setTimeout(function () {
      if (settled) return;
      settled = true;
      OTP.passwordFallback = true;
      paintPasswordVisibility();
    }, 5000);
    try {
      fetch(functionUrl(), { method: 'OPTIONS' }).then(function (r) {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        if (!r.ok) { OTP.passwordFallback = true; paintPasswordVisibility(); }
      }).catch(function () {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        OTP.passwordFallback = true;
        paintPasswordVisibility();
      });
    } catch (e) {
      settled = true;
      clearTimeout(timer);
      OTP.passwordFallback = true;
    }
  }

  function boxes() {
    var out = [];
    for (var i = 0; i < 6; i++) out.push(byId('lgOtp' + i));
    return out;
  }

  function showEmailStep() {
    OTP.step = 'email';
    var st = byId('lgOtpStep');
    if (st) st.hidden = true;
    var gate = byId('lgOtpGate');
    if (gate) gate.hidden = false;
    paintPasswordVisibility();
    paintTurnstile();
  }

  function showCodeStep(email) {
    OTP.step = 'code';
    OTP.email = email;
    var st = byId('lgOtpStep');
    if (st) st.hidden = false;
    var gate = byId('lgOtpGate');
    if (gate) gate.hidden = true;
    var m = byId('lgOtpMail');
    if (m) m.textContent = email;
    var sub = byId('lgSubmit');
    if (sub) sub.textContent = 'Verify code';
    var bs = boxes();
    for (var i = 0; i < bs.length; i++) if (bs[i]) bs[i].value = '';
    if (bs[0]) { try { bs[0].focus(); } catch (e) {} }
    startResendCountdown();
  }

  function isPhoneMode() {
    var ident = String((byId('lgIdent') || {}).value || '').trim();
    if (!ident) return false;
    if (ident.indexOf('@') > -1) return false;
    var d = ident.replace(/\D/g, '');
    return d.length >= 8;
  }

  function paintPasswordVisibility() {
    var phone = isPhoneMode();
    // the first time somebody types an email, find out whether the code
    // service is there at all (it is quiet until then, so the page stays clean)
    if (!phone) probeService();
    var usePassword = phone || OTP.passwordFallback;
    var pf = byId('lgPassField');
    if (pf) pf.hidden = !usePassword;        // an email signs in with a code, not a password
    var p2f = byId('lgPass2Field');
    if (p2f && phone) p2f.hidden = true;      // the confirm-password box belongs to the phone flow
    var gate = byId('lgOtpGate');
    if (gate) gate.hidden = usePassword || OTP.step === 'code';
    var sub = byId('lgSubmit');
    if (sub) sub.textContent = usePassword ? 'Log in' : (OTP.step === 'code' ? 'Verify code' : 'Send code');
  }

  function startResendCountdown() {
    var btn = byId('lgOtpResend');
    var note = byId('lgOtpNote');
    if (OTP.timer) { clearInterval(OTP.timer); OTP.timer = null; }
    var left = 60;
    var tick = function () {
      if (left <= 0) {
        if (OTP.timer) { clearInterval(OTP.timer); OTP.timer = null; }
        if (btn) { btn.disabled = false; btn.textContent = 'Resend code'; }
        if (note) note.textContent = '';
        return;
      }
      if (btn) { btn.disabled = true; btn.textContent = 'Resend in ' + left + 's'; }
      if (note) note.textContent = 'Code sent to ' + OTP.email + ' - it expires in 10 minutes.';
      left--;
    };
    tick();
    OTP.timer = setInterval(tick, 1000);
  }

  /* ---------------------------------------------------- the network */
  function post(body) {
    // the function's gateway checks the project key - the anon key is public,
    // so this is not a secret, it just proves the call comes from this project
    var key = (typeof AUTH_ANON !== 'undefined' && AUTH_ANON) ? AUTH_ANON : '';
    return fetch(functionUrl(), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': key,
        'Authorization': 'Bearer ' + key
      },
      body: JSON.stringify(body),
    }).then(function (r) {
      return r.json().catch(function () { return { ok: false, message: 'No answer from the server.' }; });
    });
  }

  function sendCode(ctx) {
    if (OTP.loading) return;
    if (!OTP.token) {
      ctx.setMsg('Please tick the "I am human" box first.', 'bad');
      paintTurnstile();
      return;
    }
    OTP.loading = true;
    ctx.busy(true);
    post({
      action: 'send',
      email: ctx.email,
      first: ctx.first,
      last: ctx.last,
      turnstileToken: OTP.token,
    }).then(function (res) {
      OTP.loading = false;
      ctx.busy(false);
      if (!res || !res.ok) {
        ctx.setMsg((res && res.message) || 'The code could not be sent. Please try again.', 'bad');
        // a fresh human check is needed for the next attempt
        OTP.token = '';
        paintTurnstile();
        return;
      }
      OTP.token = '';
      paintTurnstile();
      showCodeStep(ctx.email);
      ctx.setMsg(res.message || 'Code sent.', 'good');
    }).catch(function () {
      OTP.loading = false;
      ctx.busy(false);
      // the code service is not reachable (not deployed yet?) - fall back to
      // the old password sign-in so nobody is locked out
      OTP.passwordFallback = true;
      paintPasswordVisibility();
      ctx.setMsg('Code sign-in is not reachable right now - please use a password for now, or Google/GitHub.', 'bad');
    });
  }

  function codeValue() {
    var bs = boxes();
    var out = '';
    for (var i = 0; i < bs.length; i++) out += String((bs[i] && bs[i].value) || '').replace(/\D/g, '');
    return out;
  }

  function verifyCode(ctx) {
    var code = codeValue();
    if (code.length !== 6) {
      ctx.setMsg('Please type all 6 digits of the code.', 'bad');
      return;
    }
    if (OTP.loading) return;
    OTP.loading = true;
    ctx.busy(true);
    post({ action: 'verify', email: ctx.email, code: code, first: ctx.first, last: ctx.last })
      .then(function (res) {
        if (!res || !res.ok) {
          OTP.loading = false;
          ctx.busy(false);
          ctx.setMsg((res && res.message) || 'That code is not right.', 'bad');
          var bs = boxes();
          for (var i = 0; i < bs.length; i++) if (bs[i]) bs[i].value = '';
          if (bs[0]) { try { bs[0].focus(); } catch (e) {} }
          return;
        }
        return exchange(res.token_hash).then(function () {
          OTP.loading = false;
          ctx.busy(false);
          ctx.setMsg('You are in.', 'good');
        }).catch(function (e) {
          OTP.loading = false;
          ctx.busy(false);
          ctx.setMsg((e && e.message) || 'Sign-in failed. Please try again.', 'bad');
        });
      })
      .catch(function () {
        OTP.loading = false;
        ctx.busy(false);
        ctx.setMsg('Code sign-in is not reachable right now - please use Google or GitHub for now.', 'bad');
      });
  }

  // the function hands back a token hash; the public anon key turns it into
  // a normal session - the service key never comes near the browser
  function exchange(tokenHash) {
    var c = (typeof authClient === 'function') ? authClient() : null;
    if (!c) return Promise.reject(new Error('Sign-in is not available right now.'));
    return c.auth.verifyOtp({ token_hash: tokenHash, type: 'email' })
      .catch(function () { return c.auth.verifyOtp({ token_hash: tokenHash, type: 'magiclink' }); })
      .then(function (res) {
        if (res && res.error) throw new Error(res.error.message);
        return res;
      });
  }

  /* ---------------------------------------------- the entry point */
  // script.js calls this before the old password flow; returning true means
  // "handled, stop here".
  function intercept(ctx) {
    if (ctx.phone) return false;                 // phones keep the old flow
    if (OTP.passwordFallback) return false;      // the code service is down - old flow
    if (OTP.step === 'code') { verifyCode(ctx); return true; }
    sendCode(ctx);
    return true;
  }

  function wire() {
    var ident = byId('lgIdent');
    if (ident) {
      ident.addEventListener('input', function () {
        if (OTP.step === 'code') showEmailStep();
        paintPasswordVisibility();
      });
    }

    var resend = byId('lgOtpResend');
    if (resend) resend.addEventListener('click', function () {
      if (OTP.timer) { clearInterval(OTP.timer); OTP.timer = null; }
      var btn = byId('lgOtpResend');
      if (btn) { btn.disabled = true; btn.textContent = 'Resend in 60s'; }
      var ctx = {
        email: OTP.email,
        first: String((byId('lgFirst') || {}).value || '').trim(),
        last: String((byId('lgLast') || {}).value || '').trim(),
        setMsg: function (m, k) { if (typeof lgSetMsg === 'function') lgSetMsg(m, k); },
        busy: function (b) { if (typeof lgBusy === 'function') lgBusy(b); },
      };
      // a resend needs a fresh human check
      if (!OTP.token) {
        paintTurnstile();
        if (typeof lgSetMsg === 'function') lgSetMsg('Tick the "I am human" box, then press Resend again.', 'bad');
        return;
      }
      sendCode(ctx);
    });

    var change = byId('lgOtpChange');
    if (change) change.addEventListener('click', function () {
      showEmailStep();
      var i = byId('lgIdent');
      if (i) { try { i.focus(); } catch (e) {} }
    });

    // six boxes: auto-advance, backspace, and paste the whole code
    var bs = boxes();
    for (var i = 0; i < bs.length; i++) {
      (function (idx, el) {
        if (!el) return;
        el.addEventListener('input', function () {
          el.value = String(el.value || '').replace(/\D/g, '').slice(-1);
          if (el.value && idx < 5) { try { bs[idx + 1].focus(); } catch (e) {} }
        });
        el.addEventListener('keydown', function (e) {
          if (e.key === 'Backspace' && !el.value && idx > 0) {
            try { bs[idx - 1].focus(); } catch (err) {}
          }
          if (e.key === 'ArrowLeft' && idx > 0) { try { bs[idx - 1].focus(); } catch (err) {} }
          if (e.key === 'ArrowRight' && idx < 5) { try { bs[idx + 1].focus(); } catch (err) {} }
        });
        el.addEventListener('paste', function (e) {
          var txt = (e.clipboardData || window.clipboardData).getData('text') || '';
          var digits = txt.replace(/\D/g, '').slice(0, 6);
          if (!digits) return;
          e.preventDefault();
          for (var k = 0; k < 6; k++) if (bs[k]) bs[k].value = digits.charAt(k) || '';
          try { bs[Math.min(5, digits.length)].focus(); } catch (err) {}
        });
      })(i, bs[i]);
    }
  }

  if (document.readyState === 'complete' || document.readyState === 'interactive') wire();
  else document.addEventListener('DOMContentLoaded', wire);

  // the public handle used by script.js
  window.otpAuth = {
    intercept: intercept,
    showEmailStep: showEmailStep,
    paintPasswordVisibility: paintPasswordVisibility,
    isCodeStep: function () { return OTP.step === 'code'; },
  };
})();
