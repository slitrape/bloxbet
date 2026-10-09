/* ============================================================
   BLOXBET — CASE BATTLE ROOM
   Fetches battle, opens WebSocket, spins reels, resolves.
   ============================================================ */

(function(){
  if(typeof Auth === 'undefined'){ console.error('[cb-room] Auth missing'); return; }
  if(!Auth.isLoggedIn()){ Auth.safeRedirect('login'); return; }

  var me = Auth.getUser();
  var navAvatar = document.getElementById('navAvatar');
  if(navAvatar && typeof renderAvatar === 'function') renderAvatar(navAvatar, me);

  var params = new URLSearchParams(location.search);
  var battleId = params.get('id');
  if(!battleId){
    location.href = 'casebattles.html';
    return;
  }

  var reelArea    = document.getElementById('reelArea');
  var caseTitle   = document.getElementById('caseTitle');
  var casePrice   = document.getElementById('casePrice');
  var caseImage   = document.getElementById('caseImageWrap').querySelector('img');
  var roomStatus  = document.getElementById('roomStatus');
  var roomStatusText = document.getElementById('roomStatusText');
  var infoCase    = document.getElementById('infoCase');
  var infoEntry   = document.getElementById('infoEntry');
  var infoSlots   = document.getElementById('infoSlots');
  var infoPlayers = document.getElementById('infoPlayers');
  var infoPot     = document.getElementById('infoPot');
  var fairPanel   = document.getElementById('fairPanel');
  var fairSeed    = document.getElementById('fairSeed');
  var winnerPanel = document.getElementById('winnerPanel');
  var winnerBody  = document.getElementById('winnerBody');
  var actionsPanel = document.getElementById('actionsPanel');
  var actionsBody  = document.getElementById('actionsBody');

  var currentBattle = null;
  var reelsResolved = false;

  /* ============================================================
     RENDER
     ============================================================ */

  function renderBattle(battle){
    currentBattle = battle;

    caseTitle.textContent = battle.caseName;
    casePrice.textContent = battle.entryPrice.toLocaleString() + ' RC entry';
    infoCase.textContent  = battle.caseName;
    infoEntry.textContent = battle.entryPrice.toLocaleString() + ' RC';
    infoSlots.textContent = battle.slots;
    infoPlayers.textContent = battle.players.length + ' / ' + battle.slots;
    infoPot.textContent = (battle.entryPrice * battle.players.length).toLocaleString() + ' RC';

    if(battle.battleSeedHash){
      fairPanel.style.display = '';
      fairSeed.textContent = battle.battleSeedHash.slice(0, 16) + '…';
      fairSeed.title = battle.battleSeedHash;
    } else {
      fairPanel.style.display = 'none';
    }

    // Status
    roomStatus.classList.remove('waiting','live','done');
    if(battle.status === 'open'){
      roomStatus.classList.add('waiting');
      roomStatusText.textContent = 'Waiting';
    } else if(battle.status === 'in_progress'){
      roomStatus.classList.add('live');
      roomStatusText.textContent = 'Live';
    } else if(battle.status === 'resolved'){
      roomStatus.classList.add('done');
      roomStatusText.textContent = 'Finished';
    } else {
      roomStatusText.textContent = battle.status;
    }

    renderReels(battle);
    renderActions(battle);
    renderWinnerIfResolved(battle);
  }

  function renderReels(battle){
    // Keep existing reel DOM if reels already resolved — don't rerender
    if(reelsResolved && reelArea.querySelector('.cb-player-reel')){
      // Just update value states
      battle.players.forEach(function(p){
        var el = reelArea.querySelector('.cb-player-reel[data-user="' + p.userId + '"]');
        if(!el) return;
        if(battle.winnerId){
          el.classList.toggle('winner', p.userId === battle.winnerId);
          el.classList.toggle('loser', p.userId !== battle.winnerId);
        }
      });
      return;
    }

    reelArea.innerHTML = '';

    // If battle hasn't started, we render placeholder slots for empty ones
    var totalSlots = battle.slots;
    for(var i = 0; i < totalSlots; i++){
      var p = battle.players[i];
      var reel = document.createElement('div');
      reel.className = 'cb-player-reel';
      if(p) reel.dataset.user = p.userId;

      if(!p){
        reel.innerHTML =
          '<div class="cb-reel-head">' +
            '<div class="avatar avatar-sm" style="background:var(--surface-3)">?</div>' +
            '<div class="cb-reel-name">Waiting for player…</div>' +
          '</div>' +
          '<div class="cb-reel" style="display:grid;place-items:center;color:var(--text-3);font-size:.75rem">Empty slot</div>';
        reelArea.appendChild(reel);
        continue;
      }

      var _av = (typeof resolveAvatarUrl === 'function') ? resolveAvatarUrl(p) : (p.avatar || null);
      var _let = (p.username || 'U')[0].toUpperCase();
      var avatarHtml = _av
        ? '<div class="avatar avatar-sm"><img src="' + _av + '" alt="" draggable="false" referrerpolicy="no-referrer" onerror="this.style.display=\'none\';this.parentNode.textContent=\'' + _let + '\'"></div>'
        : '<div class="avatar avatar-sm">' + _let + '</div>';

      reel.innerHTML =
        '<div class="cb-reel-head">' +
          avatarHtml +
          '<div class="cb-reel-name">' + p.username + '</div>' +
          '<div class="cb-reel-value">—</div>' +
        '</div>' +
        '<div class="cb-reel">' +
          '<div class="cb-reel-strip">' +
            '<div class="cb-reel-item" style="border-color:transparent"></div>' +
          '</div>' +
          '<div class="cb-reel-fade-r"></div>' +
        '</div>' +
        '<div class="cb-reel-info" style="display:none">' +
          '<span class="rarity-tag"></span>' +
          '<span class="cb-reel-name-result"></span>' +
        '</div>';
      reelArea.appendChild(reel);
    }
  }

  function renderActions(battle){
    actionsPanel.style.display = 'none';
    actionsBody.innerHTML = '';

    if(battle.status === 'open'){
      var isCreator = battle.creatorId === String(Auth.getUser().id);
      if(isCreator){
        actionsPanel.style.display = '';
        var btn = document.createElement('button');
        btn.className = 'btn btn-ghost';
        btn.style.width = '100%';
        btn.innerHTML = '<img src="icons/close.png" alt="" class="ico" draggable="false"><span>Cancel Battle</span>';
        btn.addEventListener('click', cancelBattle);
        actionsBody.appendChild(btn);
      }
    } else if(battle.status === 'resolved'){
      actionsPanel.style.display = '';
      var again = document.createElement('a');
      again.className = 'btn btn-primary';
      again.href = 'casebattles.html';
      again.style.width = '100%';
      again.innerHTML = '<span>Play Again</span>';
      actionsBody.appendChild(again);
    }
  }

  function renderWinnerIfResolved(battle){
    if(battle.status !== 'resolved' || !battle.winnerId) return;
    var winner = battle.players.find(function(p){ return p.userId === battle.winnerId; });
    if(!winner) return;
    winnerPanel.style.display = '';
    winnerBody.innerHTML =
      '<div class="cb-winner-banner">' +
        '<div class="crown">👑</div>' +
        '<div class="name">' + winner.username + '</div>' +
        '<div class="value">+' + (battle.totalValue || 0).toLocaleString() + ' RC</div>' +
        '<div class="sub">won the entire pot</div>' +
      '</div>';
  }

  /* ============================================================
     REEL SPINNING
     ============================================================ */

  function buildReelHTML(reelData){
    var html = '';
    reelData.forEach(function(item, idx){
      var isResult = idx === reelData.length - 1;
      html +=
        '<div class="cb-reel-item rarity-' + item.rarity + (isResult ? ' result' : '') + '">' +
          '<img src="' + item.image + '" alt="" draggable="false">' +
        '</div>';
    });
    return html;
  }

  function spinReel(player, spinDuration){
    return new Promise(function(resolve){
      var reelEl = reelArea.querySelector('.cb-player-reel[data-user="' + player.userId + '"]');
      if(!reelEl){ resolve(); return; }

      reelEl.classList.add('active');

      var strip = reelEl.querySelector('.cb-reel-strip');
      var info = reelEl.querySelector('.cb-reel-info');
      var valueEl = reelEl.querySelector('.cb-reel-value');

      strip.innerHTML = buildReelHTML(player.reel);

      // Each item is 72px wide + 8px gap = 80px pitch
      var PITCH = 80;
      var CONTAINER_CENTER = 0;

      // Start position: first item at 0, we translateX negatively to scroll
      // To land on the last item at center, translate = -(count - 1) * PITCH
      var itemCount = player.reel.length;
      var finalTranslate = -((itemCount - 1) * PITCH);

      // Start at 0
      strip.style.transition = 'none';
      strip.style.transform = 'translateX(0)';
      void strip.offsetWidth;

      // Spin
      strip.classList.add('spinning');
      strip.style.setProperty('--spin-dur', spinDuration + 'ms');
      requestAnimationFrame(function(){
        strip.style.transform = 'translateX(' + finalTranslate + 'px)';
      });

      setTimeout(function(){
        reelEl.classList.remove('active');
        valueEl.textContent = player.item.value.toLocaleString() + ' RC';

        var tag = info.querySelector('.rarity-tag');
        tag.className = 'rarity-tag rarity-' + player.item.rarity;
        tag.textContent = player.item.rarity;

        info.querySelector('.cb-reel-name-result').textContent = player.item.name;
        info.style.display = '';

        resolve();
      }, spinDuration + 100);
    });
  }

  async function playSpins(battle){
    reelsResolved = true;

    // Play each player's reel one at a time
    for(var i = 0; i < battle.players.length; i++){
      var p = battle.players[i];
      if(!p.reel || p.reel.length === 0) continue;
      await spinReel(p, 3000);
      // Small pause between players for drama
      await new Promise(function(r){ setTimeout(r, 200); });
    }
  }

  /* ============================================================
     CANCEL
     ============================================================ */
  async function cancelBattle(){
    if(!currentBattle) return;
    try {
      var res = await Auth.api('/case-battles/' + currentBattle.id + '/cancel', { method: 'POST' });
      if(!res.ok) throw new Error();
      Toast.info('Battle cancelled','Entry fee refunded.');
      setTimeout(function(){ location.href = 'casebattles.html'; }, 800);
    } catch(e){
      Toast.error('Could not cancel','Try again.');
    }
  }

  /* ============================================================
     WEBSOCKET
     ============================================================ */
  var socket = Auth.connectSocket(battleId);
  if(socket){
    socket.onmessage = function(ev){
      try {
        var msg = JSON.parse(ev.data);

        if(msg.type === 'case_battle_updated'){
          if(msg.battle && msg.battle.id === battleId){
            renderBattle(msg.battle);
          }
        }

        else if(msg.type === 'case_battle_started'){
          if(msg.battleId !== battleId) return;
          // Server sent the full player reels
          currentBattle.status = 'in_progress';
          currentBattle.players = msg.players;
          roomStatus.classList.remove('waiting');
          roomStatus.classList.add('live');
          roomStatusText.textContent = 'Live';
          playSpins(currentBattle);
        }

        else if(msg.type === 'case_battle_resolved'){
          if(!msg.battle || msg.battle.id !== battleId) return;
          // Update winner panel, mark winners on reels
          currentBattle = msg.battle;
          renderWinnerIfResolved(msg.battle);
          renderReels(msg.battle);
          roomStatus.classList.remove('live');
          roomStatus.classList.add('done');
          roomStatusText.textContent = 'Finished';

          var myId = String(Auth.getUser().id);
          if(msg.winnerId === myId){
            Toast.success('You won!', '+' + msg.totalValue.toLocaleString() + ' RC');
          } else {
            Toast.info('Battle over','Better luck next time.');
          }

          Auth.refreshUser().then(function(fresh){
            if(!fresh) return;
            document.querySelectorAll('[data-balance]').forEach(function(el){
              el.textContent = Number(fresh.balance).toLocaleString();
              el.dataset.balance = fresh.balance;
            });
          });

          (msg.unlocked || []).forEach(function(a){
            setTimeout(function(){
              Toast.info('Achievement unlocked', a.name + ' — ' + a.desc);
            }, 600);
          });

          if(actionsPanel) renderActions(msg.battle);
        }

        else if(msg.type === 'case_battle_cancelled'){
          if(msg.battleId === battleId){
            Toast.info('Battle cancelled','Redirecting…');
            setTimeout(function(){ location.href = 'casebattles.html'; }, 800);
          }
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
     INITIAL LOAD
     ============================================================ */
  (async function(){
    try {
      var res = await Auth.api('/case-battles/' + battleId);
      if(!res.ok) throw new Error();
      var data = await res.json();
      renderBattle(data.battle);

      // If the battle already started before we joined, replay the spins
      if(data.battle.status === 'in_progress' && data.battle.players[0] && data.battle.players[0].reel){
        playSpins(data.battle);
      }
    } catch(e){
      reelArea.innerHTML = '<div class="cb-waiting">Battle not found.</div>';
    }
  })();

})();