/* ============================================================
   BLOXBET — AUTH MODULE (v7)
   ============================================================ */

const Auth = (() => {

  // set window.__BLOXBET_API__ = 'https://your-backend.example/api' before this script if frontend is on a different host
  const API_BASE    = (typeof window !== 'undefined' && window.__BLOXBET_API__) ? window.__BLOXBET_API__.replace(/\/$/, '') : '/api';
  const TOKEN_KEY   = 'bb_token';
  const USER_KEY    = 'bb_user';
  const SESSION_KEY = 'bb_pending_session';
  const DEMO_KEY    = 'bb_demo_mode';
  const REDIRECT_KEY = 'bb_redirecting';

  function getToken(){ try { return localStorage.getItem(TOKEN_KEY); } catch { return null; } }

  function getUser(){
    try {
      const raw = localStorage.getItem(USER_KEY);
      if(!raw) return null;
      const parsed = JSON.parse(raw);
      if(!parsed || typeof parsed !== 'object' || !parsed.username) return null;
      return parsed;
    } catch { return null; }
  }

  function setSession(token, user){
    if(!token || !user) return;
    localStorage.setItem(TOKEN_KEY, token);
    localStorage.setItem(USER_KEY, JSON.stringify(user));
  }

  function updateUser(partial){
    const current = getUser() || {};
    const merged = Object.assign({}, current, partial);
    localStorage.setItem(USER_KEY, JSON.stringify(merged));
    return merged;
  }

  function clearSession(){
    try {
      localStorage.removeItem(TOKEN_KEY);
      localStorage.removeItem(USER_KEY);
      localStorage.removeItem(SESSION_KEY);
      localStorage.removeItem(DEMO_KEY);
    } catch {}
  }

  function isLoggedIn(){
    const token = getToken();
    const user = getUser();
    if(!token || !user){
      if(token || user) clearSession();
      return false;
    }
    return true;
  }

  function currentPage(){
    let p = location.pathname.replace(/^\/+/, '').replace(/\/+$/, '');
    if(p === '' || p === 'index.html' || p === 'index') return 'index';
    return p.replace(/\.html$/, '');
  }

  function safeRedirect(target){
    let t = String(target).replace(/^\/+/, '').replace(/\.html$/, '');
    if(t === '' || t === 'index') t = 'index';
    const current = currentPage();
    if(current === t) return;
    if(sessionStorage.getItem(REDIRECT_KEY) === t){
      sessionStorage.removeItem(REDIRECT_KEY);
      return;
    }
    sessionStorage.setItem(REDIRECT_KEY, t);
    setTimeout(() => sessionStorage.removeItem(REDIRECT_KEY), 800);
    location.replace('/' + t + '.html');
  }

  function requireAuth(){
    if(!isLoggedIn()){ safeRedirect('login'); return false; }
    return true;
  }

  function redirectIfLoggedIn(){
    if(isLoggedIn()){ safeRedirect('index'); return true; }
    return false;
  }

  function isDemoMode(){ try { return localStorage.getItem(DEMO_KEY) === '1'; } catch { return false; } }
  function enableDemoMode(){ try { localStorage.setItem(DEMO_KEY, '1'); } catch {} }
  function disableDemoMode(){ try { localStorage.removeItem(DEMO_KEY); } catch {} }

  const DEMO_ADJ = ['iron','silent','hollow','amber','broken','frozen','distant','crooked','velvet','ashen','ancient','quiet'];
  const DEMO_N1  = ['brook','cove','tower','vale','harbor','river','stone','ember','lantern','crown','vault','field'];
  const DEMO_PRP = ['near','beyond','beneath','above','inside','outside','toward','past','under','over'];
  const DEMO_N2  = ['cove','vale','harbor','river','stone','tower','field','forest','bridge','gate','shore','cliff'];
  const pick = (arr) => arr[Math.floor(Math.random()*arr.length)];
  function generateDemoPhrase(){
    const adj = pick(DEMO_ADJ), n1 = pick(DEMO_N1), prep = pick(DEMO_PRP);
    let n2 = pick(DEMO_N2), tries = 0;
    while(n2 === n1 && tries < 8){ n2 = pick(DEMO_N2); tries++; }
    return adj + ' ' + n1 + ' ' + prep + ' the ' + n2 + ' \u00b7 ' + (1000 + Math.floor(Math.random()*1100));
  }

  async function tryFetch(path, opts = {}){
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);
      const res = await fetch(API_BASE + path, { ...opts, signal: controller.signal });
      clearTimeout(timeout);
      return res;
    } catch { return null; }
  }

  async function startLogin(username){
    const clean = String(username).trim();
    const res = await tryFetch('/auth/start', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: clean })
    });
    if(res){
      if(!res.ok){
        let msg = 'Could not start login.';
        try {
          const j = await res.json();
          if(j.error === 'USER_NOT_FOUND') msg = 'That Roblox username does not exist.';
          else if(j.error === 'INVALID_USERNAME') msg = 'Invalid username format.';
          else if(j.error === 'RATE_LIMITED') msg = 'Too many attempts. Wait a minute.';
          else if(j.error) msg = j.error;
        } catch {}
        throw new Error(msg);
      }
      const data = await res.json();
      sessionStorage.setItem(SESSION_KEY, JSON.stringify({
        phrase: data.phrase, sessionId: data.sessionId, username: clean,
        user: data.user || null, startedAt: Date.now(), demo: false
      }));
      disableDemoMode();
      return data;
    }
    const phrase = generateDemoPhrase();
    const sessionId = 'demo-' + Date.now();
    const demoUser = { id: 'demo', username: clean, displayName: clean, avatar: null, hasVerifiedBadge: false };
    sessionStorage.setItem(SESSION_KEY, JSON.stringify({
      phrase, sessionId, username: clean, user: demoUser, startedAt: Date.now(), demo: true
    }));
    enableDemoMode();
    return { phrase, sessionId, user: demoUser, demo: true };
  }

  function getPendingSession(){
    try {
      const raw = sessionStorage.getItem(SESSION_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch { return null; }
  }

  async function verifyBio(){
    const pending = getPendingSession();
    if(!pending) throw new Error('No pending login session. Start over.');

    if(pending.demo){
      await new Promise(r => setTimeout(r, 900));
      const user = {
        username: pending.username, displayName: pending.username,
        avatar: null, avatarLetter: (pending.username || 'U')[0].toUpperCase(),
        hasVerifiedBadge: false, balance: 12480, level: 1, rank: 'Bronze', demo: true
      };
      setSession('demo-token-' + Date.now(), user);
      sessionStorage.removeItem(SESSION_KEY);
      return user;
    }

    const res = await tryFetch('/auth/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId: pending.sessionId, username: pending.username })
    });
    if(!res) throw new Error('Backend unreachable.');
    let data = {};
    try { data = await res.json(); } catch {}
    if(!res.ok || !data.ok){
      const map = {
        PHRASE_NOT_FOUND: 'Phrase not found in your Roblox bio. Add it and try again.',
        SESSION_EXPIRED:  'This session expired. Start over.',
        RATE_LIMITED:     'Too many attempts. Wait a minute.',
        USER_NOT_FOUND:   'That Roblox username does not exist.'
      };
      throw new Error(map[data.error] || data.error || 'Verification failed.');
    }
    setSession(data.token, data.user);
    sessionStorage.removeItem(SESSION_KEY);
    return data.user;
  }

  function logout(){
    clearSession();
    location.replace('/login.html');
  }

  async function api(path, opts = {}){
    const headers = { ...(opts.headers || {}) };
    const token = getToken();
    if(token) headers['Authorization'] = 'Bearer ' + token;
    if(opts.body && !headers['Content-Type']) headers['Content-Type'] = 'application/json';
    const res = await fetch(API_BASE + path, { ...opts, headers });
    if(res.status === 401){
      clearSession();
      location.replace('/login.html');
      throw new Error('Session expired');
    }
    return res;
  }

  async function refreshUser(){
    try {
      const res = await api('/auth/me');
      if(!res.ok) return null;
      const data = await res.json();
      if(data && data.user){
        updateUser(data.user);
        return data.user;
      }
    } catch {}
    return null;
  }

  /* ---------- WebSocket helper ---------- */
  function connectSocket(matchId, page){
    const token = getToken();
    if(!token) return null;
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    const url = proto + '://' + location.host + '?token=' + encodeURIComponent(token)
              + (matchId ? '&match=' + encodeURIComponent(matchId) : '')
              + (page ? '&page=' + encodeURIComponent(page) : '');
    try {
      const ws = new WebSocket(url);
      ws.onopen = () => {
        // Heartbeat every 25s
        ws._hb = setInterval(() => {
          if(ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'ping' }));
        }, 25000);
      };
      ws.onclose = () => { if(ws._hb) clearInterval(ws._hb); };
      return ws;
    } catch { return null; }
  }

  return {
    getToken, getUser, updateUser, isLoggedIn, currentPage,
    requireAuth, redirectIfLoggedIn, safeRedirect,
    startLogin, getPendingSession, verifyBio,
    logout, api, refreshUser,
    isDemoMode, enableDemoMode, disableDemoMode,
    clearSession, generateDemoPhrase,
    connectSocket
  };
})();