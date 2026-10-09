/* ============================================================
   BLOXBET — CASE BATTLES LOBBY
   ============================================================ */

(function(){
  if(typeof Auth === 'undefined'){ console.error('[cb] Auth missing'); return; }
  if(!Auth.isLoggedIn()){ Auth.safeRedirect('login'); return; }

  var me = Auth.getUser();
  var navAvatar = document.getElementById('navAvatar');
  if(navAvatar && typeof renderAvatar === 'function') renderAvatar(navAvatar, me);

  var selectedCaseId = '';
  var selectedSlots = 2;
  var casesList = [];

  var caseGrid = document.getElementById('caseGrid');
  var caseSelect = document.getElementById('createCaseSelect');
  var battleList = document.getElementById('battleList');
  var recentBattles = document.getElementById('recentBattles');
  var createBtn = document.getElementById('createBattleBtn');
  var refreshBtn = document.getElementById('refreshBattlesBtn');
  var slotPicker = document.getElementById('slotPicker');
  var createHint = document.getElementById('createHint');
  var caseCount = document.getElementById('caseCount');

  /* ---------- Load cases ---------- */
  async function loadCases(){
    try {
      var res = await Auth.api('/cases');
      if(!res.ok) throw new Error();
      var data = await res.json();
      casesList = data.cases || [];
      if(caseCount) caseCount.textContent = casesList.length + ' available';
      renderCases();
      renderCaseSelect();
    } catch(e){
      caseGrid.innerHTML = '<div class="side-empty">Could not load cases.</div>';
    }
  }

  function renderCases(){
    caseGrid.innerHTML = '';
    if(casesList.length === 0){
      caseGrid.innerHTML = '<div class="side-empty">No cases configured.</div>';
      return;
    }
    casesList.forEach(function(c){
      var el = document.createElement('div');
      el.className = 'cb-case-card';
      el.dataset.caseId = c.id;
      el.style.setProperty('--case-theme', c.theme || 'transparent');

      var img = document.createElement('img');
      img.src = c.image;
      img.alt = '';
      img.draggable = false;
      img.onerror = function(){
        this.onerror = null;
        this.src = 'icons/gift.png';
      };

      var art = document.createElement('div');
      art.className = 'cb-case-art';
      art.appendChild(img);

      var name = document.createElement('div');
      name.className = 'cb-case-name';
      name.textContent = c.name;

      var price = document.createElement('div');
      price.className = 'cb-case-price';
      price.innerHTML = c.price.toLocaleString() + '<span class="rc">RC</span>';

      el.appendChild(art);
      el.appendChild(name);
      el.appendChild(price);

      el.addEventListener('click', function(){
        document.querySelectorAll('.cb-case-card').forEach(function(x){ x.classList.remove('selected'); });
        el.classList.add('selected');
        selectedCaseId = c.id;
        caseSelect.value = c.id;
        updateCreateBtn();
      });

      caseGrid.appendChild(el);
    });
  }

  function renderCaseSelect(){
    caseSelect.innerHTML = '<option value="">Choose a case</option>';
    casesList.forEach(function(c){
      var opt = document.createElement('option');
      opt.value = c.id;
      opt.textContent = c.name + ' — ' + c.price.toLocaleString() + ' RC';
      caseSelect.appendChild(opt);
    });
  }

  caseSelect.addEventListener('change', function(){
    selectedCaseId = caseSelect.value;
    document.querySelectorAll('.cb-case-card').forEach(function(x){
      x.classList.toggle('selected', x.dataset.caseId === selectedCaseId);
    });
    updateCreateBtn();
  });

  /* ---------- Slot picker ---------- */
  slotPicker.addEventListener('click', function(e){
    var btn = e.target.closest('.cb-slot-btn');
    if(!btn) return;
    slotPicker.querySelectorAll('.cb-slot-btn').forEach(function(b){ b.classList.remove('active'); });
    btn.classList.add('active');
    selectedSlots = parseInt(btn.dataset.slots, 10);
    updateCreateBtn();
  });

  function updateCreateBtn(){
    var c = casesList.find(function(x){ return x.id === selectedCaseId; });
    if(!c || !selectedCaseId){
      createBtn.disabled = true;
      createHint.textContent = 'Pick a case and slot count.';
      return;
    }
    createBtn.disabled = false;
    createHint.textContent = c.name + ' · ' + selectedSlots + ' slots · ' + c.price.toLocaleString() + ' RC entry';
  }

  /* ---------- Create battle ---------- */
  createBtn.addEventListener('click', async function(){
    if(!selectedCaseId) return;
    createBtn.disabled = true;
    createBtn.innerHTML = '<div class="spinner"></div><span>Creating…</span>';

    try {
      var res = await Auth.api('/case-battles', {
        method: 'POST',
        body: JSON.stringify({ caseId: selectedCaseId, slots: selectedSlots })
      });
      if(!res.ok){
        var err = 'CREATE_FAILED';
        try { var j = await res.json(); err = j.error || err; } catch(e){}
        var msg = {
          INSUFFICIENT_BALANCE: 'Not enough RoCoins.',
          INVALID_SLOTS: 'Invalid slot count.',
          CASE_NOT_FOUND: 'Case not found.'
        }[err] || err;
        throw new Error(msg);
      }
      var data = await res.json();
      if(data.balance !== undefined){
        Auth.updateUser({ balance: data.balance });
        document.querySelectorAll('[data-balance]').forEach(function(el){
          el.textContent = Number(data.balance).toLocaleString();
          el.dataset.balance = data.balance;
        });
      }
      location.href = '/casebattle.html?id=' + data.battle.id;
    } catch(err){
      Toast.error('Could not create battle', err.message || 'Try again.');
      createBtn.disabled = false;
      createBtn.innerHTML = '<img src="icons/coin.png" alt="" class="ico" draggable="false"><span>Create Battle</span>';
    }
  });

  /* ---------- Load open battles ---------- */
  async function loadBattles(){
    try {
      var res = await Auth.api('/case-battles');
      if(!res.ok) throw new Error();
      var data = await res.json();
      renderBattles(data.battles || []);
    } catch(e){
      battleList.innerHTML = '<div class="side-empty">Could not load battles.</div>';
    }
  }

  function renderBattles(battles){
    if(battles.length === 0){
      battleList.innerHTML = '<div class="cb-waiting">No open battles. Create one to start.</div>';
      return;
    }
    battleList.innerHTML = '';
    battles.forEach(function(b){
      var row = document.createElement('div');
      row.className = 'cb-battle-row';

      var slotDots = '';
      for(var i = 0; i < b.slots; i++){
        var p = b.players[i];
        if(p){
          slotDots +=
            '<div class="cb-slot-dot filled">' +
              (function(){
                var u = (typeof resolveAvatarUrl === 'function') ? resolveAvatarUrl(p) : p.avatar;
                var L = (p.username || 'U')[0].toUpperCase();
                return u ? '<img src="' + u + '" alt="" draggable="false" referrerpolicy="no-referrer" onerror="this.style.display=\'none\';this.parentNode.textContent=\'' + L + '\'">' : L;
              })()) +
            '</div>';
        } else {
          slotDots += '<div class="cb-slot-dot">+</div>';
        }
      }

      var actionHtml = '';
      var isCreator = b.creatorId === String(Auth.getUser().id);
      var joined = b.players.some(function(p){ return p.userId === String(Auth.getUser().id); });
      if(isCreator || joined){
        actionHtml = '<button class="btn btn-secondary btn-sm cb-open-btn">View</button>';
      } else {
        actionHtml = '<button class="btn btn-primary btn-sm cb-join-btn">Join</button>';
      }

      var caseImg = document.createElement('img');
      caseImg.src = 'icons/gift.png';
      caseImg.alt = '';
      caseImg.draggable = false;

      row.innerHTML =
        '<div class="cb-battle-thumb"></div>' +
        '<div class="cb-battle-info">' +
          '<div class="cb-battle-name">' + b.caseName + '</div>' +
          '<div class="cb-battle-meta">' + b.entryPrice.toLocaleString() + ' RC · ' + b.creatorUsername + '</div>' +
        '</div>' +
        '<div class="cb-battle-slots">' + slotDots + '</div>' +
        '<div class="cb-battle-actions">' + actionHtml + '</div>';

      row.querySelector('.cb-battle-thumb').appendChild(caseImg);

      var openBtn = row.querySelector('.cb-open-btn');
      if(openBtn) openBtn.addEventListener('click', function(){
        location.href = '/casebattle.html?id=' + b.id;
      });

      var joinBtn = row.querySelector('.cb-join-btn');
      if(joinBtn) joinBtn.addEventListener('click', async function(ev){
        ev.stopPropagation();
        joinBtn.disabled = true;
        joinBtn.innerHTML = '<div class="spinner"></div>';
        try {
          var r = await Auth.api('/case-battles/' + b.id + '/join', { method: 'POST' });
          if(!r.ok){
            var e = 'JOIN_FAILED';
            try { var jj = await r.json(); e = jj.error || e; } catch(err){}
            var m = {
              INSUFFICIENT_BALANCE: 'Not enough RoCoins.',
              BATTLE_FULL: 'Battle is full.',
              ALREADY_IN_BATTLE: 'You are already in this battle.',
              BATTLE_NOT_OPEN: 'Battle already started.'
            }[e] || e;
            throw new Error(m);
          }
          var dd = await r.json();
          if(dd.balance !== undefined){
            Auth.updateUser({ balance: dd.balance });
            document.querySelectorAll('[data-balance]').forEach(function(el){
              el.textContent = Number(dd.balance).toLocaleString();
              el.dataset.balance = dd.balance;
            });
          }
          location.href = '/casebattle.html?id=' + b.id;
        } catch(err){
          Toast.error('Could not join', err.message || 'Try again.');
          joinBtn.disabled = false;
          joinBtn.innerHTML = 'Join';
        }
      });

      battleList.appendChild(row);
    });
  }

  /* ---------- Recent battles ---------- */
  async function loadRecent(){
    try {
      var res = await Auth.api('/case-battles/recent');
      if(!res.ok) throw new Error();
      var data = await res.json();
      var list = data.battles || [];
      if(list.length === 0){
        recentBattles.innerHTML = '<div class="side-empty">No recent battles.</div>';
        return;
      }
      recentBattles.innerHTML = '';
      list.forEach(function(b){
        var row = document.createElement('div');
        row.className = 'cb-battle-row';
        var winner = b.players.find(function(p){ return p.userId === b.winnerId; });
        var winnerName = winner ? winner.username : 'Unknown';

        var caseImg = document.createElement('img');
        caseImg.src = 'icons/gift.png';
        caseImg.alt = '';
        caseImg.draggable = false;

        row.innerHTML =
          '<div class="cb-battle-thumb"></div>' +
          '<div class="cb-battle-info">' +
            '<div class="cb-battle-name">' + b.caseName + '</div>' +
            '<div class="cb-battle-meta">Won by ' + winnerName + ' · ' + (b.totalValue || 0).toLocaleString() + ' RC</div>' +
          '</div>' +
          '<div class="cb-battle-price">' + b.entryPrice.toLocaleString() + ' RC</div>' +
          '<div></div>';

        row.querySelector('.cb-battle-thumb').appendChild(caseImg);

        row.addEventListener('click', function(){
          location.href = '/casebattle.html?id=' + b.id;
        });
        recentBattles.appendChild(row);
      });
    } catch(e){
      recentBattles.innerHTML = '<div class="side-empty">Could not load.</div>';
    }
  }

  refreshBtn.addEventListener('click', function(){
    refreshBtn.disabled = true;
    Promise.all([loadBattles(), loadRecent()]).finally(function(){
      refreshBtn.disabled = false;
    });
  });

  /* ---------- WebSocket — live battle updates ---------- */
  var socket = Auth.connectSocket();
  if(socket){
    socket.onmessage = function(ev){
      try {
        var msg = JSON.parse(ev.data);
        if(msg.type === 'case_battle_created' || msg.type === 'case_battle_cancelled'){
          loadBattles();
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

  /* ---------- Init ---------- */
  loadCases();
  loadBattles();
  loadRecent();

  setInterval(loadBattles, 8000);
  setInterval(loadRecent, 20000);

})();