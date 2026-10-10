/* ============================================================
   BLOXBET — CRASH CLIENT
   Connects to server WebSocket, draws canvas, handles bets.
   ============================================================ */

(function(){
  if(typeof Auth === 'undefined'){ console.error('[crash] Auth missing'); return; }
  if(!Auth.isLoggedIn()){ Auth.safeRedirect('login'); return; }

  var me = Auth.getUser();
  var navAvatar = document.getElementById('navAvatar');
  if(navAvatar && typeof renderAvatar === 'function') renderAvatar(navAvatar, me);

  /* ============================================================
     DOM
     ============================================================ */
  var canvas        = document.getElementById('crashCanvas');
  var ctx           = canvas.getContext('2d');
  var bigMult       = document.getElementById('bigMult');
  var bigMultLabel  = document.getElementById('bigMultLabel');
  var stateBadge    = document.getElementById('stateBadge');
  var stateBadgeText= document.getElementById('stateBadgeText');
  var countdown     = document.getElementById('crashCountdown');
  var countdownNum  = document.getElementById('countdownNum');
  var crashedFlash  = document.getElementById('crashedFlash');
  var banner        = document.getElementById('crashBanner');
  var roundInfo     = document.getElementById('crashRoundInfo');

  var betInput      = document.getElementById('crashBetInput');
  var autoInput     = document.getElementById('crashAutoInput');
  var betBtn        = document.getElementById('betBtn');
  var cashoutBtn    = document.getElementById('cashoutBtn');
  var cashoutMain   = cashoutBtn.querySelector('.main-line');
  var cashoutSub    = cashoutBtn.querySelector('.sub-line');
  var cancelBtn     = document.getElementById('cancelBtn');

  var playersList   = document.getElementById('playersList');
  var playerCount   = document.getElementById('playerCount');
  var historyStrip  = document.getElementById('historyStrip');
  var myHistory     = document.getElementById('myHistory');

  var infoEdge      = document.getElementById('infoEdge');
  var infoTier      = document.getElementById('infoTier');
  var infoAutoOffset= document.getElementById('infoAutoOffset');
  var infoDelay     = document.getElementById('infoDelay');
  var infoFee       = document.getElementById('infoFee');
  var infoSeedHash  = document.getElementById('infoSeedHash');

  /* ============================================================
     STATE
     ============================================================ */
  var state = {
    roundId: null,
    roundNumber: 0,
    phase: 'waiting',
    stateStartedAt: 0,
    waitingMs: 7000,
    startingMs: 500,
    crashedMs: 4000,
    currentMultiplier: 1.0,
    serverCrashPoint: 0,
    elapsedMs: 0,
    myBet: null,
    playerBets: [],
    config: null,
    crashedMult: null
  };

  // Local animation interpolation
  var localStartMs = 0;
  var localMult = 1.0;
  var crashedMult = null;
  var phaseChangeAt = 0;

  /* ============================================================
     CANVAS
     ============================================================ */
  function resizeCanvas(){
    var rect = canvas.getBoundingClientRect();
    var dpr = window.devicePixelRatio || 1;
    canvas.width = Math.floor(rect.width * dpr);
    canvas.height = Math.floor(rect.height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  resizeCanvas();
  window.addEventListener('resize', resizeCanvas);

  
  function drawSky(w, h){
    // Deep galaxy background
    var sky = ctx.createRadialGradient(w * 0.55, h * 0.35, 0, w * 0.5, h * 0.5, Math.max(w, h) * 0.85);
    sky.addColorStop(0, '#1a0a3a');
    sky.addColorStop(0.25, '#0d0a28');
    sky.addColorStop(0.55, '#08061a');
    sky.addColorStop(1, '#03010c');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, w, h);

    // Nebula washes
    var neb1 = ctx.createRadialGradient(w * 0.2, h * 0.25, 0, w * 0.2, h * 0.25, w * 0.45);
    neb1.addColorStop(0, 'rgba(124,58,237,0.22)');
    neb1.addColorStop(0.5, 'rgba(88,28,135,0.08)');
    neb1.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = neb1;
    ctx.fillRect(0, 0, w, h);

    var neb2 = ctx.createRadialGradient(w * 0.85, h * 0.55, 0, w * 0.85, h * 0.55, w * 0.4);
    neb2.addColorStop(0, 'rgba(59,130,246,0.14)');
    neb2.addColorStop(0.55, 'rgba(37,99,235,0.05)');
    neb2.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = neb2;
    ctx.fillRect(0, 0, w, h);

    var neb3 = ctx.createRadialGradient(w * 0.55, h * 0.85, 0, w * 0.55, h * 0.9, w * 0.5);
    neb3.addColorStop(0, 'rgba(168,85,247,0.12)');
    neb3.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = neb3;
    ctx.fillRect(0, 0, w, h);

    // Star field
    var seed = 13;
    for(var i = 0; i < 90; i++){
      seed = (seed * 16807 + 11) % 2147483647;
      var sx = (seed % 1000) / 1000 * w;
      seed = (seed * 16807 + 11) % 2147483647;
      var sy = (seed % 1000) / 1000 * h;
      seed = (seed * 16807 + 11) % 2147483647;
      var r = 0.4 + (seed % 4) * 0.35;
      var a = 0.25 + (seed % 60) / 100;
      ctx.fillStyle = 'rgba(255,255,255,' + a + ')';
      ctx.beginPath();
      ctx.arc(sx, sy, r, 0, Math.PI * 2);
      ctx.fill();
      if(i % 11 === 0){
        ctx.strokeStyle = 'rgba(200,180,255,' + (a * 0.55) + ')';
        ctx.lineWidth = 0.6;
        ctx.beginPath();
        ctx.moveTo(sx - r * 3, sy);
        ctx.lineTo(sx + r * 3, sy);
        ctx.moveTo(sx, sy - r * 3);
        ctx.lineTo(sx, sy + r * 3);
        ctx.stroke();
      }
    }

    // Soft bottom vignette
    var vg = ctx.createLinearGradient(0, h * 0.55, 0, h);
    vg.addColorStop(0, 'rgba(0,0,0,0)');
    vg.addColorStop(1, 'rgba(2,0,12,0.55)');
    ctx.fillStyle = vg;
    ctx.fillRect(0, h * 0.55, w, h * 0.45);
  }

  function drawRocket(x, y, crashed){
    ctx.save();
    ctx.translate(x, y);
    // Slight tilt toward flight path (bottom-left → top-right)
    ctx.rotate(crashed ? 0.15 : -0.55);
    ctx.scale(1.85, 1.85);

    // Purple exhaust beam (behind body)
    if(!crashed){
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      var beam = ctx.createLinearGradient(0, 10, 0, 95);
      beam.addColorStop(0, 'rgba(232,180,255,0.95)');
      beam.addColorStop(0.15, 'rgba(168,85,247,0.85)');
      beam.addColorStop(0.45, 'rgba(124,58,237,0.45)');
      beam.addColorStop(1, 'rgba(76,29,149,0)');
      ctx.fillStyle = beam;
      ctx.beginPath();
      ctx.moveTo(-7, 12);
      ctx.lineTo(7, 12);
      ctx.lineTo(18, 95);
      ctx.lineTo(-18, 95);
      ctx.closePath();
      ctx.fill();

      // Hot core
      var core = ctx.createLinearGradient(0, 10, 0, 70);
      core.addColorStop(0, 'rgba(255,255,255,0.95)');
      core.addColorStop(0.25, 'rgba(216,180,254,0.8)');
      core.addColorStop(1, 'rgba(167,139,250,0)');
      ctx.fillStyle = core;
      ctx.beginPath();
      ctx.moveTo(-2.8, 12);
      ctx.lineTo(2.8, 12);
      ctx.lineTo(6, 70);
      ctx.lineTo(-6, 70);
      ctx.closePath();
      ctx.fill();
      ctx.restore();

      // Soft glow under rocket
      var glow = ctx.createRadialGradient(0, 18, 0, 0, 18, 28);
      glow.addColorStop(0, 'rgba(168,85,247,0.45)');
      glow.addColorStop(1, 'rgba(168,85,247,0)');
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(0, 18, 28, 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.fillStyle = 'rgba(239,68,68,0.5)';
      ctx.beginPath();
      ctx.arc(0, 4, 20, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = 'rgba(251,146,60,0.55)';
      ctx.beginPath();
      ctx.arc(-9, 2, 11, 0, Math.PI * 2);
      ctx.arc(10, 8, 13, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.35)';
      ctx.beginPath();
      ctx.arc(2, 0, 6, 0, Math.PI * 2);
      ctx.fill();
    }

    // 3D body with side shading
    var bodyGrad = ctx.createLinearGradient(-12, 0, 12, 0);
    if(crashed){
      bodyGrad.addColorStop(0, '#475569');
      bodyGrad.addColorStop(0.5, '#94a3b8');
      bodyGrad.addColorStop(1, '#64748b');
    } else {
      bodyGrad.addColorStop(0, '#94a3b8');
      bodyGrad.addColorStop(0.35, '#f1f5f9');
      bodyGrad.addColorStop(0.65, '#e2e8f0');
      bodyGrad.addColorStop(1, '#64748b');
    }
    ctx.fillStyle = bodyGrad;
    ctx.beginPath();
    ctx.moveTo(0, -30);
    ctx.quadraticCurveTo(13, -12, 12, 14);
    ctx.lineTo(-12, 14);
    ctx.quadraticCurveTo(-13, -12, 0, -30);
    ctx.closePath();
    ctx.fill();

    // Nose highlight
    ctx.fillStyle = crashed ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.45)';
    ctx.beginPath();
    ctx.moveTo(0, -28);
    ctx.quadraticCurveTo(5, -14, 4, -2);
    ctx.lineTo(-1, -2);
    ctx.quadraticCurveTo(-2, -14, 0, -28);
    ctx.closePath();
    ctx.fill();

    // Window (3D glass)
    var win = ctx.createRadialGradient(-1, -7, 0.5, 0, -6, 5.5);
    win.addColorStop(0, '#e0f2fe');
    win.addColorStop(0.55, '#38bdf8');
    win.addColorStop(1, '#0369a1');
    ctx.fillStyle = win;
    ctx.beginPath();
    ctx.arc(0, -6, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.55)';
    ctx.lineWidth = 1.2;
    ctx.stroke();

    // Fins with depth
    ctx.fillStyle = crashed ? '#94a3b8' : '#a855f7';
    ctx.beginPath();
    ctx.moveTo(-12, 2);
    ctx.lineTo(-22, 18);
    ctx.lineTo(-11, 14);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = crashed ? '#64748b' : '#7c3aed';
    ctx.beginPath();
    ctx.moveTo(12, 2);
    ctx.lineTo(22, 18);
    ctx.lineTo(11, 14);
    ctx.closePath();
    ctx.fill();

    // Engine nozzle
    var nozzle = ctx.createLinearGradient(0, 14, 0, 20);
    nozzle.addColorStop(0, '#1e293b');
    nozzle.addColorStop(1, '#0f172a');
    ctx.fillStyle = nozzle;
    ctx.beginPath();
    ctx.moveTo(-9, 14);
    ctx.lineTo(9, 14);
    ctx.lineTo(7, 20);
    ctx.lineTo(-7, 20);
    ctx.closePath();
    ctx.fill();

    // Accent stripe
    if(!crashed){
      ctx.strokeStyle = 'rgba(168,85,247,0.75)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(-8, 6);
      ctx.lineTo(8, 6);
      ctx.stroke();
    }

    ctx.restore();
  }

  function drawCurve(w, h, progress, mult, crashed){
    var expectedMaxSeconds = 50;
    var points = 120;
    var curvePts = [];
    var maxElapsed = Math.max(progress * expectedMaxSeconds, 0.001);

    for(var i = 0; i <= points; i++){
      var t = (i / points) * maxElapsed;
      var m = Math.exp(0.06 * t);
      if(m > mult && i > 0) m = mult;
      curvePts.push({ t: t, m: m });
      if(m >= mult) break;
    }

    // Diagonal path: bottom-left (1x) -> top-right (high mult)
    var padL = 40, padR = 50, padB = 40, padT = 50;
    var xMax = Math.max(maxElapsed, 4) * 1.05;
    var yMax = Math.max(mult * 1.15, 2.5);

    function px(t){ return padL + (t / xMax) * (w - padL - padR); }
    function py(m){ return (h - padB) - ((m - 1) / (yMax - 1)) * (h - padB - padT); }

    // Trail glow under path
    var grad = ctx.createLinearGradient(0, 0, 0, h);
    if(crashed){
      grad.addColorStop(0, 'rgba(239,68,68,0.28)');
      grad.addColorStop(1, 'rgba(239,68,68,0)');
    } else {
      grad.addColorStop(0, 'rgba(168,85,247,0.28)');
      grad.addColorStop(1, 'rgba(124,58,237,0)');
    }

    ctx.beginPath();
    ctx.moveTo(px(0), py(1));
    for(var k = 0; k < curvePts.length; k++){
      ctx.lineTo(px(curvePts[k].t), py(curvePts[k].m));
    }
    var last = curvePts[curvePts.length - 1];
    ctx.lineTo(px(last.t), h - 36);
    ctx.lineTo(px(0), h - 36);
    ctx.closePath();
    ctx.fillStyle = grad;
    ctx.fill();

    // Path line
    ctx.beginPath();
    ctx.moveTo(px(0), py(1));
    for(var k2 = 0; k2 < curvePts.length; k2++){
      ctx.lineTo(px(curvePts[k2].t), py(curvePts[k2].m));
    }
    ctx.strokeStyle = crashed ? '#ef4444' : '#c084fc';
    ctx.lineWidth = 2.5;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.shadowColor = crashed ? 'rgba(239,68,68,0.55)' : 'rgba(125,211,252,0.55)';
    ctx.shadowBlur = 14;
    ctx.stroke();
    ctx.shadowBlur = 0;

    // Rocket at tip
    var tipX = px(last.t);
    var tipY = py(last.m);
    drawRocket(tipX, tipY, crashed);
  }

  function drawGrid(w, h){
    // Kept for compatibility — sky drawn in animate instead
    drawSky(w, h);
  }

function animate(){
    var rect = canvas.getBoundingClientRect();
    var w = rect.width;
    var h = rect.height;

    if(!w || !h){
      requestAnimationFrame(animate);
      return;
    }

    drawGrid(w, h);

    // Compute local progress
    var now = Date.now();
    var displayMult = 1.0;

    if(state.phase === 'running'){
      var elapsed = (now - localStartMs);
      displayMult = Math.exp(0.06 * (elapsed / 1000));
      // Cap at crashed point if we've crashed
      if(crashedMult !== null){
        displayMult = crashedMult;
      }
    } else if(state.phase === 'crashed'){
      displayMult = crashedMult || state.currentMultiplier;
    } else {
      displayMult = 1.0;
    }

    displayMult = Math.floor(displayMult * 100) / 100;

    // Update big display
    if(state.phase === 'crashed'){
      bigMult.textContent = displayMult.toFixed(2) + 'x';
      bigMult.className = 'value state-crashed';
      bigMultLabel.textContent = 'Crashed';
    } else if(state.phase === 'running'){
      bigMult.textContent = displayMult.toFixed(2) + 'x';
      bigMult.className = 'value state-running';
      bigMultLabel.textContent = 'Multiplier';
    } else {
      bigMult.textContent = '1.00x';
      bigMult.className = 'value state-waiting';
      bigMultLabel.textContent = state.phase === 'starting' ? 'Get ready…' : 'Waiting for players';
    }

    // Draw curve
    if(state.phase === 'running' || state.phase === 'crashed'){
      var prog = Math.min(1, ((now - localStartMs) / 1000) / 30);
      drawCurve(w, h, prog, displayMult, state.phase === 'crashed');
    } else {
      // Idle: draw a flat line at 1.00x
      drawCurve(w, h, 0.001, 1.0, false);
    }

    // Update cashout button sub-line with live multiplier
    if(state.myBet && !state.myBet.cashedOut && state.phase === 'running'){
      var potentialPayout = Math.floor(state.myBet.bet * displayMult);
      var fee = 0;
      // Approximate fee from config bands if available
      if(state.config && state.config.feeBands){
        for(var i = 0; i < state.config.feeBands.length; i++){
          var b = state.config.feeBands[i];
          if(displayMult >= b.min && displayMult < b.max){
            fee = b.fee;
            break;
          }
        }
      }
      var netPayout = potentialPayout - Math.floor(potentialPayout * fee);
      cashoutSub.textContent = netPayout.toLocaleString() + ' RC';
    }

    requestAnimationFrame(animate);
  }
  requestAnimationFrame(animate);

  /* ============================================================
     UI HELPERS
     ============================================================ */
  function setStateBadge(phase, customText){
    stateBadge.className = 'crash-state-badge ' + phase;
    var labels = {
      waiting: 'Waiting',
      starting: 'Starting',
      running: 'Live',
      crashed: 'Crashed'
    };
    stateBadgeText.textContent = customText || labels[phase] || 'Waiting';
  }

  function showBanner(text, type){
    banner.className = 'crash-banner show ' + type;
    banner.textContent = text;
    setTimeout(function(){
      banner.classList.remove('show');
    }, 2600);
  }

  function updateRoundInfo(){
    if(!state.roundNumber){
      roundInfo.textContent = 'Round —';
      return;
    }
    roundInfo.textContent = 'Round #' + state.roundNumber;
  }

  function renderPlayers(){
    playerCount.textContent = state.playerBets.length;

    if(state.playerBets.length === 0){
      playersList.innerHTML = '<div class="crash-players-empty">No bets yet.</div>';
      return;
    }

    var meId = String(Auth.getUser().id);

    playersList.innerHTML = '';
    // Sort: cashed out first (by cashout value desc), then active by bet desc
    var sorted = state.playerBets.slice().sort(function(a, b){
      if(a.cashedOut && !b.cashedOut) return -1;
      if(!a.cashedOut && b.cashedOut) return 1;
      if(a.cashedOut && b.cashedOut){
        return (b.cashoutValue || 0) - (a.cashoutValue || 0);
      }
      return b.bet - a.bet;
    });

    sorted.forEach(function(p){
      var row = document.createElement('div');
      row.className = 'crash-player-row' + (p.cashedOut ? ' cashed' : '');

      var _av = (typeof resolveAvatarUrl === 'function') ? resolveAvatarUrl(p) : (p.avatar || null);
      var _let = (p.username || 'U')[0].toUpperCase();
      var avatarHtml = _av
        ? '<div class="avatar"><img src="' + _av + '" alt="" draggable="false" referrerpolicy="no-referrer" onerror="this.style.display=\'none\';this.parentNode.textContent=\'' + _let + '\'"></div>'
        : '<div class="avatar">' + _let + '</div>';

      var name = p.username + (String(p.userId) === meId ? ' (you)' : '');

      var right = '';
      if(p.cashedOut){
        right = '<span class="cashout-tag">' + (p.cashoutMultiplier || 0).toFixed(2) + 'x</span>';
      } else {
        right = '<span class="bet-amount">' + p.bet.toLocaleString() + ' RC</span>';
      }

      row.innerHTML =
        '<div data-user-id="' + (p.userId||p.id||'') + '">' + avatarHtml + '</div>' +
        '<span class="name">' + name + '</span>' +
        right;

      playersList.appendChild(row);
    });
  }

  function renderConfigInfo(){
    if(!state.config) return;
    var cfg = state.config;

    infoEdge.textContent = (cfg.baseEdge * 100).toFixed(1) + '%';
    infoAutoOffset.textContent = '-' + cfg.autoCashoutOffset.toFixed(2) + 'x';
    infoDelay.textContent = cfg.cashoutDelayMs + ' ms';

    // Fee bands
    var feeLines = cfg.feeBands.map(function(b){
      var min = b.min === 0 ? '' : b.min + 'x';
      var max = b.max === Infinity || b.max > 10000 ? '+' : b.max + 'x';
      var range = b.min === 0 ? ('under ' + b.max + 'x') : (min + ' - ' + (b.max > 10000 ? '∞' : max));
      return range + ': ' + (b.fee * 100).toFixed(0) + '%';
    }).join(' · ');
    infoFee.textContent = feeLines;

    // Current tier — computed from the current bet input
    updateTierInfo();
  }

  function updateTierInfo(){
    if(!state.config) return;
    var bet = parseInt(betInput.value, 10) || 0;
    var edge = state.config.baseEdge;
    for(var i = 0; i < state.config.edgeTiers.length; i++){
      if(bet <= state.config.edgeTiers[i].maxBet){
        edge = state.config.edgeTiers[i].edge;
        break;
      }
    }
    infoTier.textContent = (edge * 100).toFixed(1) + '% @ ' + bet.toLocaleString() + ' RC';
  }

  betInput.addEventListener('input', updateTierInfo);

  /* ============================================================
     BUTTON LOGIC
     ============================================================ */

  function updateButtonVisibility(){
    var hasBet = !!state.myBet;
    var cashedOut = hasBet && state.myBet.cashedOut;
    var isRunning = state.phase === 'running';
    var isWaiting = state.phase === 'waiting';

    // If we have a live bet that hasn't cashed out yet
    if(hasBet && !cashedOut){
      betBtn.style.display = 'none';
      cancelBtn.style.display = isWaiting ? '' : 'none';
      cashoutBtn.style.display = (isRunning || isWaiting) ? '' : 'none';

      if(isWaiting){
        cashoutBtn.disabled = true;
        cashoutMain.textContent = 'Waiting…';
        cashoutSub.textContent = '—';
      } else if(isRunning){
        cashoutBtn.disabled = false;
        cashoutMain.textContent = 'Cash Out';
        cashoutSub.textContent = '—';
      } else {
        cashoutBtn.disabled = true;
      }
    } else {
      // No bet or already cashed out
      betBtn.style.display = '';
      cancelBtn.style.display = 'none';
      cashoutBtn.style.display = 'none';
      betBtn.disabled = !isWaiting;
      betBtn.innerHTML = isWaiting
        ? '<img src="icons/coin.png" alt="" class="ico" draggable="false"><span>Place Bet</span>'
        : '<img src="icons/coin.png" alt="" class="ico" draggable="false"><span>Wait for next round</span>';
    }

    // Disable inputs when in a bet
    betInput.disabled = hasBet || !isWaiting;
    autoInput.disabled = hasBet || !isWaiting;
    document.querySelectorAll('.crash-quick-btn').forEach(function(b){
      b.disabled = hasBet || !isWaiting;
    });
  }

  /* ============================================================
     BET / CASHOUT
     ============================================================ */
  betBtn.addEventListener('click', async function(){
    if(state.phase !== 'waiting') return;

    var bet = parseInt(betInput.value, 10);
    if(!Number.isFinite(bet) || bet < 10){
      Toast.error('Invalid bet', 'Minimum is 10 RC.');
      return;
    }

    var autoRaw = autoInput.value.trim();
    var autoCashout = autoRaw === '' ? null : parseFloat(autoRaw);
    if(autoCashout !== null && (!Number.isFinite(autoCashout) || autoCashout < 1.01)){
      Toast.error('Invalid auto', 'Auto must be 1.01x or higher.');
      return;
    }

    betBtn.disabled = true;
    betBtn.innerHTML = '<div class="spinner"></div><span>Placing…</span>';

    try {
      var res = await Auth.api('/crash/bet', {
        method: 'POST',
        body: JSON.stringify({ bet: bet, autoCashout: autoCashout })
      });
      if(!res.ok){
        var err = 'BET_FAILED';
        try { var j = await res.json(); err = j.error || err; } catch(e){}
        var msg = {
          INVALID_BET: 'Invalid bet.',
          INVALID_AUTO: 'Invalid auto cashout.',
          INSUFFICIENT_BALANCE: 'Not enough RC.',
          ALREADY_BET: 'You already placed a bet this round.',
          NOT_WAITING: 'Betting is closed.'
        }[err] || err;
        throw new Error(msg);
      }
      var data = await res.json();

      if(typeof data.balance === 'number'){
        Auth.updateUser({ balance: data.balance });
        document.querySelectorAll('[data-balance]').forEach(function(el){
          el.textContent = Number(data.balance).toLocaleString();
          el.dataset.balance = data.balance;
        });
      }

      state.myBet = {
        bet: bet,
        autoCashout: autoCashout,
        cashedOut: false,
        cashoutMultiplier: null,
        cashoutValue: null,
        fee: 0,
        net: 0
      };

      updateButtonVisibility();
      showBanner('Bet placed · ' + bet.toLocaleString() + ' RC', 'info');

      // Refresh state
      loadState();

    } catch(err){
      Toast.error('Could not bet', err.message || 'Try again.');
      betBtn.disabled = false;
      updateButtonVisibility();
    }
  });

  cashoutBtn.addEventListener('click', async function(){
    if(!state.myBet || state.myBet.cashedOut) return;
    if(state.phase !== 'running') return;

    cashoutBtn.disabled = true;
    cashoutBtn.classList.add('pending');
    cashoutMain.textContent = 'Cashing out…';

    try {
      var res = await Auth.api('/crash/cashout', { method: 'POST' });
      var data = await res.json();

      if(!res.ok || !data.ok){
        // Too late / already cashed out / etc.
        var errCode = data.error || 'FAILED';
        if(errCode === 'TOO_LATE'){
          showBanner('Crashed before you cashed out!', 'lose');
        } else if(errCode === 'ALREADY_CASHED_OUT'){
          // Ignore
        } else {
          Toast.error('Could not cash out', errCode);
        }
        cashoutBtn.classList.remove('pending');
        cashoutBtn.disabled = false;
        return;
      }

      // Success
      state.myBet.cashedOut = true;
      state.myBet.cashoutMultiplier = data.multiplier;
      state.myBet.cashoutValue = data.payout;
      state.myBet.fee = data.fee || 0;
      state.myBet.net = data.net || 0;

      if(typeof data.balance === 'number'){
        Auth.updateUser({ balance: data.balance });
        document.querySelectorAll('[data-balance]').forEach(function(el){
          el.textContent = Number(data.balance).toLocaleString();
          el.dataset.balance = data.balance;
        });
      }

      showBanner('Cashed out at ' + data.multiplier.toFixed(2) + 'x · +' + data.net.toLocaleString() + ' RC', 'win');

      if(data.unlocked && data.unlocked.length){
        data.unlocked.forEach(function(a){
          setTimeout(function(){
            Toast.info('Achievement unlocked', a.name + ' — ' + a.desc);
          }, 500);
        });
      }

      cashoutBtn.classList.remove('pending');
      updateButtonVisibility();
      loadHistory();

    } catch(err){
      Toast.error('Could not cash out', err.message || 'Try again.');
      cashoutBtn.classList.remove('pending');
      cashoutBtn.disabled = false;
    }
  });

  cancelBtn.addEventListener('click', async function(){
    // Cancel isn't supported server-side; we just inform the player
    // their bet is locked. (Real crash games don't allow cancelling
    // inside the betting window once placed — this is intentional.)
    Toast.info('Bet locked', 'You cannot cancel after placing. Wait for the round.');
  });

  /* ============================================================
     STATE LOADING
     ============================================================ */
  async function loadState(){
    try {
      var res = await Auth.api('/crash/state');
      if(!res.ok) return;
      var data = await res.json();
      if(!data.ok || !data.state) return;

      var s = data.state;
      state.roundId = s.roundId;
      state.roundNumber = s.roundNumber;
      state.stateStartedAt = s.stateStartedAt;
      state.waitingMs = s.waitingMs;
      state.startingMs = s.startingMs;
      state.crashedMs = s.crashedMs;
      state.currentMultiplier = s.currentMultiplier;
      state.playerBets = s.playerBets || [];
      state.myBet = s.myBet || null;
      state.config = s.config || state.config;

      // Track phase change to reset the local animation clock
      if(state.phase !== s.state){
        phaseChangeAt = Date.now();
        state.phase = s.state;
        if(s.state === 'running'){
          localStartMs = Date.now() - (s.elapsed || 0);
          crashedMult = null;
        } else if(s.state === 'crashed'){
          crashedMult = s.currentMultiplier || 1.0;
        } else {
          crashedMult = null;
        }
      }

      // Always sync running elapsed from server for accuracy
      if(s.state === 'running' && typeof s.elapsed === 'number'){
        localStartMs = Date.now() - s.elapsed;
      }

      updateRoundInfo();
      setStateBadge(state.phase);
      renderConfigInfo();
      renderPlayers();
      updateButtonVisibility();

      // Seed hash
      infoSeedHash.textContent = (s.seedHash || '—').slice(0, 16);
      if(s.seedHash) infoSeedHash.title = s.seedHash;

    } catch(e){}
  }

  async function loadHistory(){
    try {
      var res = await Auth.api('/crash/history');
      if(!res.ok) return;
      var data = await res.json();
      var rounds = (data.rounds || []).slice(0, 24);

      if(rounds.length === 0){
        historyStrip.innerHTML = '<span class="crash-players-empty" style="padding:.5rem 0;font-size:.7rem">No rounds yet.</span>';
        return;
      }

      historyStrip.innerHTML = '';
      rounds.forEach(function(r){
        var chip = document.createElement('span');
        var cls = 'crash-history-chip';
        var cp = r.crashPoint;
        if(cp >= 10) cls += ' mega';
        else if(cp >= 3) cls += ' high';
        else if(cp >= 1.5) cls += ' mid';
        else cls += ' low';
        chip.className = cls;
        chip.textContent = cp.toFixed(2) + 'x';
        chip.title = 'Round #' + r.roundNumber;
        historyStrip.appendChild(chip);
      });
    } catch(e){}
  }

  async function loadMyHistory(){
    try {
      var res = await Auth.api('/crash/mine');
      if(!res.ok) return;
      var data = await res.json();
      var rows = (data.history || []).slice(0, 10);

      if(rows.length === 0){
        myHistory.innerHTML = '<div class="crash-players-empty">No rounds played yet.</div>';
        return;
      }

      myHistory.innerHTML = '';
      rows.forEach(function(r){
        var row = document.createElement('div');
        row.className = 'crash-player-row' + (r.cashedOut ? ' cashed' : '');

        var betLine = r.bet.toLocaleString() + ' RC';
        var netText = r.net > 0
          ? '+' + r.net.toLocaleString()
          : (r.net < 0 ? r.net.toLocaleString() : '—');

        row.innerHTML =
          '<div class="avatar" style="font-size:.6rem">' + (r.cashedOut ? '✓' : '✗') + '</div>' +
          '<span class="name">@' + r.crashPoint.toFixed(2) + 'x</span>' +
          '<span class="' + (r.net > 0 ? 'cashout-tag' : 'bet-amount') + '">' +
            netText +
          '</span>';

        myHistory.appendChild(row);
      });
    } catch(e){}
  }

  /* ============================================================
     COUNTDOWN TICKER
     ============================================================ */
  setInterval(function(){
    if(state.phase === 'waiting'){
      var elapsed = Date.now() - state.stateStartedAt;
      var remaining = Math.max(0, (state.waitingMs - elapsed) / 1000);
      countdown.style.display = '';
      countdownNum.textContent = remaining.toFixed(1);
    } else if(state.phase === 'starting'){
      countdown.style.display = '';
      countdownNum.textContent = '0.0';
    } else {
      countdown.style.display = 'none';
    }
  }, 100);

  /* ============================================================
     LIVE POLLING (fallback for state)
     ============================================================ */
  setInterval(loadState, 1000);

  /* ============================================================
     WEBSOCKET (primary)
     ============================================================ */
    var socket = Auth.connectSocket(null, 'crash');

  if(socket){
    socket.onmessage = function(ev){
      try {
        var msg = JSON.parse(ev.data);

        if(msg.type === 'crash_round_start'){
          state.roundId = msg.round.id;
          state.roundNumber = msg.round.number;
          state.stateStartedAt = msg.round.stateStartedAt;
          state.waitingMs = msg.round.waitingMs || state.waitingMs;
          state.startingMs = msg.round.startingMs || state.startingMs;
          state.crashedMs = msg.round.crashedMs || state.crashedMs;
          state.phase = 'waiting';
          state.currentMultiplier = 1.0;
          state.myBet = null;
          state.playerBets = [];
          crashedMult = null;

          if(msg.round.seedHash){
            infoSeedHash.textContent = msg.round.seedHash.slice(0, 16);
            infoSeedHash.title = msg.round.seedHash;
          }

          updateRoundInfo();
          setStateBadge('waiting');
          renderPlayers();
          updateButtonVisibility();

          // Refresh config on new round
          loadState();
          loadHistory();
        }

        else if(msg.type === 'crash_phase_starting'){
          state.phase = 'starting';
          setStateBadge('starting', 'Starting…');
          updateButtonVisibility();
        }

        else if(msg.type === 'crash_phase_running'){
          state.phase = 'running';
          state.stateStartedAt = msg.stateStartedAt;
          localStartMs = Date.now();
          crashedMult = null;
          setStateBadge('running');
          updateButtonVisibility();
        }

        else if(msg.type === 'crash_tick'){
          state.currentMultiplier = msg.multiplier;
        }

        else if(msg.type === 'crash_bet_placed'){
          // Add to player list if not already
          var exists = state.playerBets.some(function(p){ return p.userId === msg.userId; });
          if(!exists){
            state.playerBets.push({
              userId: msg.userId,
              username: msg.username,
              avatar: msg.avatar,
              bet: msg.bet,
              cashedOut: false,
              cashoutMultiplier: null,
              cashoutValue: null
            });
            renderPlayers();
          }
          // If it's me, mark my bet
          if(String(msg.userId) === String(Auth.getUser().id)){
            state.myBet = {
              bet: msg.bet,
              autoCashout: msg.autoCashout || null,
              cashedOut: false,
              cashoutMultiplier: null,
              cashoutValue: null,
              fee: 0,
              net: 0
            };
            updateButtonVisibility();
          }
        }

        else if(msg.type === 'crash_cashout'){
          // Update player list
          var p = state.playerBets.find(function(x){ return x.userId === msg.userId; });
          if(p){
            p.cashedOut = true;
            p.cashoutMultiplier = msg.multiplier;
            p.cashoutValue = msg.payout;
            renderPlayers();
          }
          // If it's me, mark my bet
          if(String(msg.userId) === String(Auth.getUser().id) && state.myBet){
            state.myBet.cashedOut = true;
            state.myBet.cashoutMultiplier = msg.multiplier;
            state.myBet.cashoutValue = msg.payout;
            state.myBet.fee = msg.fee || 0;
            state.myBet.net = msg.net || 0;
            updateButtonVisibility();
          }
        }

        else if(msg.type === 'crash_crashed'){
          state.phase = 'crashed';
          crashedMult = msg.crashPoint;
          state.currentMultiplier = msg.crashPoint;
          setStateBadge('crashed', 'Crashed at ' + msg.crashPoint.toFixed(2) + 'x');

          // Flash overlay
          crashedFlash.classList.add('show');
          setTimeout(function(){ crashedFlash.classList.remove('show'); }, 900);

          // Banner
          var myId = String(Auth.getUser().id);
          var iWon = state.myBet && state.myBet.cashedOut;
          if(state.myBet && !state.myBet.cashedOut){
            showBanner('Crashed · Lost ' + state.myBet.bet.toLocaleString() + ' RC', 'lose');
          } else if(state.myBet && state.myBet.cashedOut){
            showBanner('Cashed out · +' + (state.myBet.net || 0).toLocaleString() + ' RC', 'win');
          }

          updateButtonVisibility();
          loadHistory();
          loadMyHistory();

          // Sync balance from server after crash resolves
          setTimeout(function(){
            Auth.refreshUser().then(function(fresh){
              if(!fresh) return;
              document.querySelectorAll('[data-balance]').forEach(function(el){
                el.textContent = Number(fresh.balance).toLocaleString();
                el.dataset.balance = fresh.balance;
              });
            });
          }, 400);
        }

        else if(msg.type === 'balance' && typeof msg.balance === 'number'){
          Auth.updateUser({ balance: msg.balance });
          document.querySelectorAll('[data-balance]').forEach(function(el){
            el.textContent = Number(msg.balance).toLocaleString();
            el.dataset.balance = msg.balance;
          });
        }

      } catch(e){}
    };
  }

  /* ============================================================
     QUICK BET BUTTONS
     ============================================================ */
  document.querySelectorAll('.crash-quick-btn').forEach(function(btn){
    btn.addEventListener('click', function(){
      if(btn.disabled) return;
      var v = btn.dataset.bet;
      if(v === 'max'){
        var u = Auth.getUser();
        betInput.value = Math.max(10, Math.floor(u.balance || 0));
      } else {
        betInput.value = v;
      }
      updateTierInfo();
    });
  });

  /* ============================================================
     INIT
     ============================================================ */
  loadState();
  loadHistory();
  loadMyHistory();

  // Refresh history occasionally
  setInterval(loadHistory, 15000);
  setInterval(loadMyHistory, 20000);

})();