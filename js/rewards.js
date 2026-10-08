/* ============================================================
   BLOXBET — REWARDS PAGE
   7-day unlock tracker. One-time 100 RC claim.
   ============================================================ */

(function(){
  if(typeof Auth === 'undefined'){ console.error('[rewards] Auth missing'); return; }
  if(!Auth.isLoggedIn()){ Auth.safeRedirect('login'); return; }

  var me = Auth.getUser();
  var navAvatar = document.getElementById('navAvatar');
  if(navAvatar && typeof renderAvatar === 'function') renderAvatar(navAvatar, me);

  /* ---------- DOM ---------- */
  var hero         = document.getElementById('hero');
  var heroBadge    = document.getElementById('heroBadge');
  var heroBadgeText= document.getElementById('heroBadgeText');
  var heroValue    = document.getElementById('heroValue');
  var heroSub      = document.getElementById('heroSub');
  var progressWrap = document.getElementById('progressWrap');
  var progressCount= document.getElementById('progressCount');
  var progressSteps= document.getElementById('progressSteps');
  var todayWrap    = document.getElementById('todayWrap');
  var todayValue   = document.getElementById('todayValue');
  var todayFill    = document.getElementById('todayFill');
  var claimBtn     = document.getElementById('claimBtn');
  var claimBtnText = document.getElementById('claimBtnText');
  var resetTime    = document.getElementById('resetTime');

  var state = {
    unlocked: false,
    claimed: false,
    reward: 100,
    progress: {
      streak: 0,
      days_needed: 7,
      days_remaining: 7,
      today_count: 0,
      games_needed_today: 3,
      games_remaining_today: 3,
      today_key: null,
      last_played_day: null
    },
    resetsAt: 0
  };

  /* ============================================================
     LOAD STATUS
     ============================================================ */
  async function loadStatus(){
    try {
      var res = await Auth.api('/rewards/status');
      if(!res.ok) throw new Error('bad status');
      var data = await res.json();
      if(!data.ok) throw new Error('bad payload');

      state.unlocked = !!data.unlocked;
      state.claimed = !!data.claimed;
      state.reward = data.reward || 100;
      state.progress = data.progress || state.progress;
      state.resetsAt = data.resetsAt || 0;

      render();

    } catch(e){
      console.error('[rewards] load failed', e);
      heroSub.textContent = 'Could not load rewards status. Refresh to try again.';
    }
  }

  /* ============================================================
     RENDER
     ============================================================ */
  function render(){
    // ---- Big value ----
    heroValue.textContent = state.reward;

    // ---- Badge + hero state class ----
    hero.classList.remove('locked','unlocked','claimed');

    if(state.claimed){
      hero.classList.add('claimed');
      heroBadge.className = 'rw-badge claimed';
      heroBadgeText.textContent = 'Claimed';
      heroSub.textContent = 'You already claimed this reward. Enjoy the RC.';
    } else if(state.unlocked){
      hero.classList.add('unlocked');
      heroBadge.className = 'rw-badge unlocked';
      heroBadgeText.textContent = 'Unlocked';
      heroSub.textContent = 'You hit 7 days in a row. Claim your reward.';
    } else {
      hero.classList.add('locked');
      heroBadge.className = 'rw-badge';
      heroBadgeText.textContent = 'Locked';
      var daysLeft = state.progress.days_remaining;
      var gamesLeft = state.progress.games_remaining_today;
      if(gamesLeft > 0){
        heroSub.textContent = 'Play ' + gamesLeft + ' more game' + (gamesLeft === 1 ? '' : 's') + ' today to keep your streak. ' + daysLeft + ' day' + (daysLeft === 1 ? '' : 's') + ' left to unlock.';
      } else {
        heroSub.textContent = daysLeft + ' more day' + (daysLeft === 1 ? '' : 's') + ' in a row to unlock. Today is complete.';
      }
    }

    // ---- Progress steps ----
    renderSteps();

    // ---- Today ----
    var todayCount = state.progress.today_count || 0;
    var todayNeeded = state.progress.games_needed_today || 3;
    var pct = Math.min(100, Math.round((todayCount / todayNeeded) * 100));

    todayValue.textContent = todayCount + ' / ' + todayNeeded + ' games';
    todayFill.style.width = pct + '%';
    todayFill.classList.toggle('complete', todayCount >= todayNeeded);

    // If already claimed, hide the today panel entirely
    if(state.claimed){
      progressWrap.style.display = '';
      todayWrap.style.display = 'none';
    } else {
      progressWrap.style.display = '';
      todayWrap.style.display = '';
    }

    // ---- Claim button ----
    renderClaimBtn();

    // ---- Reset timer ----
    startResetTimer();
  }

  function renderSteps(){
    var streak = state.progress.streak || 0;
    var daysNeeded = state.progress.days_needed || 7;
    var claimed = state.claimed;

    progressCount.textContent = streak + ' / ' + daysNeeded;

    progressSteps.innerHTML = '';
    for(var i = 1; i <= daysNeeded; i++){
      var el = document.createElement('div');
      el.className = 'rw-step';

      var isDone = claimed || i <= streak;
      var isCurrent = !claimed && i === streak + 1;

      if(isDone) el.classList.add('done');
      if(isCurrent) el.classList.add('current');

      if(isDone){
        el.innerHTML = '<img src="icons/check.png" alt="" class="check" draggable="false">';
      } else {
        el.innerHTML = '<span class="num">' + i + '</span>';
      }

      progressSteps.appendChild(el);
    }
  }

  function renderClaimBtn(){
    claimBtn.className = 'rw-claim';
    claimBtn.disabled = true;

    if(state.claimed){
      claimBtn.classList.add('claimed');
      claimBtnText.textContent = 'Claimed';
      claimBtn.querySelector('.ico').src = 'icons/check.png';
    } else if(state.unlocked){
      claimBtn.classList.add('ready');
      claimBtnText.textContent = 'Claim ' + state.reward + ' RC';
      claimBtn.querySelector('.ico').src = 'icons/coin.png';
      claimBtn.disabled = false;
    } else {
      claimBtn.classList.add('locked');
      claimBtnText.textContent = 'Locked';
      claimBtn.querySelector('.ico').src = 'icons/close.png';
    }
  }

  /* ============================================================
     CLAIM
     ============================================================ */
  claimBtn.addEventListener('click', async function(){
    if(state.claimed || !state.unlocked) return;

    claimBtn.disabled = true;
    claimBtnText.textContent = 'Claiming…';

    try {
      var res = await Auth.api('/rewards/claim', { method: 'POST' });
      var data = {};
      try { data = await res.json(); } catch(e){}

      if(!res.ok || !data.ok){
        var errCode = data.error || 'FAILED';
        var msg = {
          ALREADY_CLAIMED: 'Already claimed.',
          NOT_UNLOCKED: 'Not unlocked yet.',
          RATE_LIMITED: 'Slow down a moment.'
        }[errCode] || errCode;
        throw new Error(msg);
      }

      // Success
      state.claimed = true;
      state.unlocked = true;

      if(typeof data.balance === 'number'){
        Auth.updateUser({ balance: data.balance });
        document.querySelectorAll('[data-balance]').forEach(function(el){
          el.textContent = Number(data.balance).toLocaleString();
          el.dataset.balance = data.balance;
        });
      }

      // Celebration
      hero.classList.add('claimed-pulse');
      setTimeout(function(){ hero.classList.remove('claimed-pulse'); }, 800);

      spawnFloaters('+' + state.reward + ' RC');

      Toast.success('Reward claimed', '+' + state.reward + ' RC added to your balance.');

      if(data.unlocked && data.unlocked.length){
        data.unlocked.forEach(function(a){
          setTimeout(function(){
            Toast.info('Achievement unlocked', a.name + ' — ' + a.desc);
          }, 500);
        });
      }

      render();

    } catch(err){
      Toast.error('Could not claim', err.message || 'Try again.');
      render();
    }
  });

  function spawnFloaters(text){
    for(var i = 0; i < 6; i++){
      var el = document.createElement('div');
      el.className = 'rw-floaty';
      el.textContent = text;
      el.style.left = (20 + Math.random() * 60) + '%';
      el.style.top = '40%';
      el.style.animationDelay = (i * 90) + 'ms';
      hero.appendChild(el);
      (function(node){
        setTimeout(function(){ if(node.parentNode) node.parentNode.removeChild(node); }, 2200);
      })(el);
    }
  }

  /* ============================================================
     RESET TIMER
     ============================================================ */
  var resetInterval = null;

  function startResetTimer(){
    if(resetInterval) clearInterval(resetInterval);

    function tick(){
      if(!state.resetsAt){
        resetTime.textContent = '—';
        return;
      }
      var remaining = state.resetsAt - Date.now();
      if(remaining <= 0){
        // day has rolled over — refresh status
        resetTime.textContent = 'now';
        loadStatus();
        return;
      }
      var h = Math.floor(remaining / 3600000);
      var m = Math.floor((remaining % 3600000) / 60000);
      var s = Math.floor((remaining % 60000) / 1000);
      var pad = function(n){ return n < 10 ? '0' + n : '' + n; };
      resetTime.textContent = pad(h) + ':' + pad(m) + ':' + pad(s);
    }

    tick();
    resetInterval = setInterval(tick, 1000);
  }

  /* ============================================================
     WEBSOCKET (live updates when unlock happens mid-session)
     ============================================================ */
  var socket = Auth.connectSocket();
  if(socket){
    socket.onmessage = function(ev){
      try {
        var msg = JSON.parse(ev.data);

        if(msg.type === 'reward_unlocked'){
          Toast.success('Reward unlocked!', 'You can now claim ' + msg.reward + ' RC.');
          loadStatus();
        }

        if(msg.type === 'balance' && typeof msg.balance === 'number'){
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
     INIT
     ============================================================ */
  loadStatus();

  // Poll every 30s in case the user is playing in another tab
  setInterval(loadStatus, 30000);

})();