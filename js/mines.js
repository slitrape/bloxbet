/* ============================================================
   BLOXBET — MINES
   Server-authoritative. Client plays the animations.
   ============================================================ */

(function(){
  if(typeof Auth === 'undefined'){ console.error('[mines] Auth missing'); return; }
  if(!Auth.isLoggedIn()){ Auth.safeRedirect('login'); return; }

  var me = Auth.getUser();
  var navAvatar = document.getElementById('navAvatar');
  if(navAvatar && typeof renderAvatar === 'function') renderAvatar(navAvatar, me);

  /* ---------- DOM ---------- */
  var grid            = document.getElementById('minesGrid');
  var playBtn         = document.getElementById('minesPlayBtn');
  var cashoutBtn      = document.getElementById('minesCashoutBtn');
  var betInput        = document.getElementById('minesBetInput');
  var countGrid       = document.getElementById('minesCountGrid');
  var ladder          = document.getElementById('minesLadder');
  var ladderCount     = document.getElementById('ladderCount');
  var seedHashEl      = document.getElementById('minesSeedHash');
  var barBet          = document.getElementById('barBet');
  var barMultiplier   = document.getElementById('barMultiplier');
  var barPayout       = document.getElementById('barPayout');
  function setBarPayout(v){ if(!barPayout) return; if(barPayout.tagName==='INPUT') barPayout.value=v; else barPayout.textContent=v; }

  var banner          = document.getElementById('minesBanner');
  var setupPanel      = document.getElementById('setupPanel');
  var minesSlider     = document.getElementById('minesSlider');
  var minesSliderVal  = document.getElementById('minesSliderVal');
  var gemsCountEl     = document.getElementById('gemsCount');
  var randomBtn       = document.getElementById('minesRandomBtn');


  /* ---------- State ---------- */
  var activeGame = null;      // { id, bet, mineCount, picks, multiplier, revealed, multiplierTable }
  var gameActive = false;     // true when grid is live and clickable
  var currentBet = 100;
  var currentMines = 3;

  var MINE_OPTIONS = [1, 2, 3, 5, 8, 10, 12, 15, 18, 20, 22, 24];
  var GRID_SIZE = 25;

  /* ---------- Setup UI ---------- */
  function buildCountGrid(){
    if(!countGrid) return;
    countGrid.innerHTML = '';
    MINE_OPTIONS.forEach(function(n){
      var btn = document.createElement('button');
      btn.className = 'mines-count-btn' + (n === currentMines ? ' active' : '');
      btn.textContent = n;
      btn.dataset.mines = n;
      btn.addEventListener('click', function(){
        if(gameActive) return;
        currentMines = n;
        countGrid.querySelectorAll('.mines-count-btn').forEach(function(b){
          b.classList.toggle('active', parseInt(b.dataset.mines, 10) === n);
        });
      });
      countGrid.appendChild(btn);
    });
  }

  document.querySelectorAll('.mines-quick button').forEach(function(btn){
    btn.addEventListener('click', function(){
      if(gameActive) return;
      var v = btn.dataset.bet;
      if(v === 'max'){
        var u = Auth.getUser();
        betInput.value = Math.max(10, Math.floor(u.balance || 0));
      } else {
        betInput.value = v;
      }
    });
  });

  function setBanner(text, type){
    if(!banner) return;
    banner.className = 'mines-banner show ' + type;
    banner.textContent = text;
    setTimeout(function(){
      banner.classList.remove('show');
    }, 2600);
  }

  /* ---------- Bar ---------- */
  function updateBar(){
    if(!activeGame){
      if(barBet) if(barBet) barBet.textContent = '—';
      if(barMultiplier) if(barMultiplier) barMultiplier.textContent = '1.00';
      setBarPayout('0.00');
      return;
    }
    if(barBet) barBet.textContent = activeGame.bet.toLocaleString() + ' RC';
    if(barMultiplier) barMultiplier.textContent = activeGame.multiplier.toFixed(2) + 'x';
    var potential = Math.floor(activeGame.bet * activeGame.multiplier);
    setBarPayout(potential.toLocaleString() + ' RC');

    barMultiplier.className = 'value ' + (activeGame.picks > 0 ? 'accent' : '');
  }

  /* ---------- Grid build ---------- */
  function buildGrid(){
    grid.innerHTML = '';
    for(var i = 0; i < GRID_SIZE; i++){
      var tile = document.createElement('button');
      tile.className = 'mines-tile disabled';
      tile.dataset.index = i;
      var img = document.createElement('img');
      img.src = 'icons/diamond.png';
      img.alt = '';
      img.draggable = false;
      img.onerror = function(){
        this.onerror = null;
        this.src = 'icons/coin.png';
      };
      tile.appendChild(img);
      tile.addEventListener('click', onTileClick);
      grid.appendChild(tile);
    }
  }

  /* ---------- Tile click ---------- */
  function onTileClick(e){
    if(!gameActive || !activeGame) return;
    var tile = e.currentTarget;
    var idx = parseInt(tile.dataset.index, 10);
    if(isNaN(idx)) return;
    if(activeGame.revealed.indexOf(idx) !== -1) return;

    revealTile(idx);
  }

  async function revealTile(idx){
    // Optimistic local reveal to feel snappy
    var tile = grid.querySelector('.mines-tile[data-index="' + idx + '"]');
    if(tile){
      tile.classList.add('revealed');
      tile.classList.add('gem');
      tile.classList.remove('disabled');
    }

    try {
      var res = await Auth.api('/mines/' + activeGame.id + '/reveal', {
        method: 'POST',
        body: JSON.stringify({ tile: idx })
      });

      if(!res.ok){
        var err = 'REVEAL_FAILED';
        try { var j = await res.json(); err = j.error || err; } catch(e){}
        var msg = {
          INVALID_TILE: 'Invalid tile.',
          GAME_ENDED: 'Game already ended.',
          NOT_YOUR_GAME: 'Not your game.',
          ALREADY_REVEALED: 'Already revealed.'
        }[err] || err;
        // Revert optimistic
        if(tile){
          tile.classList.remove('revealed');
          tile.classList.remove('gem');
          tile.classList.add('disabled');
        }
        throw new Error(msg);
      }

      var data = await res.json();

      if(data.result === 'mine'){
        await handleLoss(data);
      } else {
        handleGem(data);
      }

    } catch(err){
      Toast.error('Could not reveal', err.message || 'Try again.');
    }
  }

  function handleGem(data){
    // Update local state
    activeGame.revealed = data.revealed;
    activeGame.picks = data.picks;
    activeGame.multiplier = data.multiplier;

    // Mark tile with a gem image
    var tile = grid.querySelector('.mines-tile[data-index="' + data.tile + '"]');
    if(tile){
      var img = tile.querySelector('img');
      if(img){
        img.src = 'icons/diamond.png';
        img.onerror = function(){ this.onerror = null; this.src = 'icons/coin.png'; };
      }
      tile.classList.remove('disabled');
    }

    // Enable cashout
    cashoutBtn.disabled = false;

    // Update display
    updateBar();
    renderLadder(data.picks);
  }

  async function handleLoss(data){
    gameActive = false;

    // Reveal the entire grid
    var fullRevealed = data.revealed || [data.grid ? data.grid.length : 0];
    var grid_data = data.grid || [];

    // Mark the tile that was clicked as a mine
    grid.querySelectorAll('.mines-tile').forEach(function(tile){
      var idx = parseInt(tile.dataset.index, 10);
      tile.classList.add('disabled');
      var img = tile.querySelector('img');
      var isMine = grid_data[idx] === 'mine';
      var wasRevealed = (data.revealed || []).indexOf(idx) !== -1;

      if(isMine){
        if(idx === parseInt(data.revealed[0], 10) || wasRevealed){
          // This is the tile that was clicked (or any mine now shown)
          tile.classList.add('revealed','mine');
          tile.classList.add('reveal-mine-on-loss');
          if(img){
            img.src = 'icons/bomb.png';
            img.onerror = function(){ this.onerror = null; this.src = 'icons/coin.png'; };
            img.style.opacity = 1;
            img.style.filter = 'none';
          }
        } else if(wasRevealed){
          // Shouldn't happen but just in case
        }
      } else {
        // Safe tiles — reveal as gems
        if(!wasRevealed){
          tile.classList.add('revealed','gem');
          if(img){
            img.src = 'icons/diamond.png';
            img.onerror = function(){ this.onerror = null; this.src = 'icons/coin.png'; };
            img.style.opacity = 1;
            img.style.filter = 'none';
          }
        }
      }
    });

    // Flash grid
    grid.classList.add('shake');
    setTimeout(function(){ grid.classList.remove('shake'); }, 450);

    // Update bar
    if(barMultiplier) barMultiplier.textContent = '0.00x';
    
    setBarPayout('-' + activeGame.bet.toLocaleString() + ' RC');
    

    // Disable cashout
    cashoutBtn.disabled = true;

    // Show banner
    setBanner('Hit a mine — lost ' + activeGame.bet.toLocaleString() + ' RC', 'lose');

    // Balance
    if(typeof data.balance === 'number'){
      Auth.updateUser({ balance: data.balance });
      document.querySelectorAll('[data-balance]').forEach(function(el){
        el.textContent = Number(data.balance).toLocaleString();
        el.dataset.balance = data.balance;
      });
    }

    // Achievements
    (data.unlocked || []).forEach(function(a){
      setTimeout(function(){
        Toast.info('Achievement unlocked', a.name + ' — ' + a.desc);
      }, 500);
    });

    // Reset after a beat
    setTimeout(resetAfterLoss, 2400);
  }

  function resetAfterLoss(){
    activeGame = null;
    gameActive = false;
    if(setupPanel) setupPanel.style.opacity = '1';
    if(setupPanel) setupPanel.style.pointerEvents = 'auto';
    playBtn.disabled = false;
    playBtn.innerHTML = '<img src="icons/bomb.png" alt="" class="ico" draggable="false"><span>Play</span>';
    cashoutBtn.disabled = true;
    if(seedHashEl) seedHashEl.textContent = '—';
    if(barBet) barBet.textContent = '—';
    if(barMultiplier) barMultiplier.textContent = '1.00x';
    if(barMultiplier && barMultiplier.classList) { /* skip */ }
    setBarPayout('—');
    
    if(ladder) ladder.innerHTML = '<div class="mines-empty">Start a game to see the ladder.</div>';
    if(ladderCount) ladderCount.textContent = '—';
    buildGrid();
    markGridDisabled();
  }

  /* ---------- Cash out ---------- */
  cashoutBtn.addEventListener('click', async function(){
    if(!activeGame) return;
    cashoutBtn.disabled = true;

    try {
      var res = await Auth.api('/mines/' + activeGame.id + '/cashout', { method: 'POST' });
      if(!res.ok){
        var err = 'CASHOUT_FAILED';
        try { var j = await res.json(); err = j.error || err; } catch(e){}
        throw new Error(err);
      }
      var data = await res.json();

      gameActive = false;

      // Show all tiles
      var grid_data = data.grid || [];
      var revealed = data.revealed || [];
      grid.querySelectorAll('.mines-tile').forEach(function(tile){
        var idx = parseInt(tile.dataset.index, 10);
        tile.classList.add('disabled');
        tile.classList.remove('revealed','mine','gem');
        var img = tile.querySelector('img');

        if(revealed.indexOf(idx) !== -1){
          tile.classList.add('revealed','gem');
        }
        if(grid_data[idx] === 'mine' && revealed.indexOf(idx) === -1){
          tile.classList.add('revealed','mine');
          if(img){
            img.src = 'icons/bomb.png';
            img.onerror = function(){ this.onerror = null; this.src = 'icons/coin.png'; };
          }
        }
        if(img){
          img.style.opacity = 1;
          img.style.filter = 'none';
        }
      });

      // Update bar
      if(barMultiplier) barMultiplier.textContent = data.multiplier.toFixed(2) + 'x';
      
      setBarPayout('+' + data.net.toLocaleString() + ' RC');
      

      setBanner('Cashed out — ' + data.multiplier.toFixed(2) + 'x · +' + data.payout.toLocaleString() + ' RC', 'win');

      if(typeof data.balance === 'number'){
        Auth.updateUser({ balance: data.balance });
        document.querySelectorAll('[data-balance]').forEach(function(el){
          el.textContent = Number(data.balance).toLocaleString();
          el.dataset.balance = data.balance;
        });
      }

      (data.unlocked || []).forEach(function(a){
        setTimeout(function(){
          Toast.info('Achievement unlocked', a.name + ' — ' + a.desc);
        }, 500);
      });

      setTimeout(resetAfterLoss, 2600);

    } catch(err){
      Toast.error('Could not cash out', err.message || 'Try again.');
      cashoutBtn.disabled = false;
    }
  });

  /* ---------- Start game ---------- */
  
  function syncMinesFromSlider(){
    if(!minesSlider) return;
    var n = parseInt(minesSlider.value, 10) || 3;
    if(n < 1) n = 1;
    if(n > 24) n = 24;
    if(minesSliderVal) minesSliderVal.textContent = String(n);
    if(gemsCountEl) gemsCountEl.textContent = String(25 - n);
    // keep selectedMines in sync with existing UI state
    currentMines = n;
    // click matching count button if present
    if(countGrid){
      countGrid.querySelectorAll('button').forEach(function(b){
        b.classList.toggle('active', parseInt(b.dataset.mines || b.textContent, 10) === n);
      });
    }
  }
  if(minesSlider){
    minesSlider.addEventListener('input', syncMinesFromSlider);
    syncMinesFromSlider();
  }
  document.querySelectorAll('[data-bet-mod]').forEach(function(btn){
    btn.addEventListener('click', function(){
      var v = parseInt(betInput.value, 10) || 0;
      if(btn.getAttribute('data-bet-mod') === 'half') betInput.value = Math.max(10, Math.floor(v / 2));
      else betInput.value = Math.max(10, v * 2);
    });
  });
  if(randomBtn){
    randomBtn.addEventListener('click', function(){
      if(!grid) return;
      var tiles = Array.from(grid.querySelectorAll('.mines-tile:not(.revealed):not(.disabled)'));
      if(!tiles.length) return;
      var t = tiles[Math.floor(Math.random() * tiles.length)];
      t.click();
    });
  }

  playBtn.addEventListener('click', async function(){
    if(gameActive) return;

    var bet = parseInt(betInput.value, 10);
    if(!Number.isFinite(bet) || bet < 10){
      Toast.error('Invalid bet', 'Minimum is 10 RC.');
      return;
    }

    var u = Auth.getUser();
    if(u && bet > u.balance){
      Toast.error('Not enough RC', 'You have ' + u.balance.toLocaleString() + '.');
      return;
    }

    playBtn.disabled = true;
    playBtn.innerHTML = '<div class="spinner"></div><span>Starting…</span>';

    try {
      var res = await Auth.api('/mines/start', {
        method: 'POST',
        body: JSON.stringify({ bet: bet, mines: currentMines })
      });

      if(!res.ok){
        var err = 'START_FAILED';
        try { var j = await res.json(); err = j.error || err; } catch(e){}
        var msg = {
          INVALID_BET: 'Invalid bet.',
          INVALID_MINES: 'Invalid mine count.',
          INSUFFICIENT_BALANCE: 'Not enough RC.',
          ALREADY_ACTIVE: 'You already have an active game.'
        }[err] || err;
        throw new Error(msg);
      }

      var data = await res.json();

      activeGame = {
        id: data.game.id,
        bet: data.game.bet,
        mineCount: data.game.mineCount,
        picks: 0,
        multiplier: 1.0,
        revealed: [],
        multiplierTable: data.game.multiplierTable
      };

      gameActive = true;

      // Balance
      if(typeof data.balance === 'number'){
        Auth.updateUser({ balance: data.balance });
        document.querySelectorAll('[data-balance]').forEach(function(el){
          el.textContent = Number(data.balance).toLocaleString();
          el.dataset.balance = data.balance;
        });
      }

      // Build grid fresh
      buildGrid();
      grid.querySelectorAll('.mines-tile').forEach(function(tile){
        tile.classList.remove('disabled');
      });

      // Bar
      updateBar();

      // Seed hash
      if(seedHashEl) seedHashEl.textContent = data.game.serverSeedHash.slice(0, 16) + '…';
      seedHashEl.title = data.game.serverSeedHash;

      // Ladder
      renderLadder(0, data.game.multiplierTable);

      // Buttons
      playBtn.disabled = true;
      playBtn.innerHTML = '<span>In Progress…</span>';
      cashoutBtn.disabled = true;

      // Dim setup
      if(setupPanel) setupPanel.style.opacity = '.5';
      if(setupPanel) setupPanel.style.pointerEvents = 'none';

      setBanner('Game started — pick a tile', 'win');

    } catch(err){
      Toast.error('Could not start', err.message || 'Try again.');
      playBtn.disabled = false;
      playBtn.innerHTML = '<img src="icons/bomb.png" alt="" class="ico" draggable="false"><span>Play</span>';
    }
  });

  /* ---------- Ladder ---------- */
  function renderLadder(currentPicks, table){
    if(!activeGame) return;
    var t = table || activeGame.multiplierTable;
    if(!t) return;

    if(ladder) ladder.innerHTML = '';
    if(ladderCount) ladderCount.textContent = (t.length - 1) + ' tiers';

    for(var i = 1; i < t.length; i++){
      var row = document.createElement('div');
      row.className = 'mines-ladder-row';
      if(i < currentPicks) row.classList.add('done');
      else if(i === currentPicks) row.classList.add('current');

      row.innerHTML =
        '<span class="picks">' + i + ' pick' + (i === 1 ? '' : 's') + '</span>' +
        '<span class="mult">' + t[i].toFixed(2) + 'x</span>';
      ladder.appendChild(row);
    }

    // Scroll current into view
    var curr = ladder.querySelector('.mines-ladder-row.current');
    if(curr && curr.scrollIntoView){
      curr.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
  }

  function markGridDisabled(){
    grid.querySelectorAll('.mines-tile').forEach(function(tile){
      tile.classList.add('disabled');
    });
  }

  /* ---------- Resume active game on load ---------- */
  (async function resumeActive(){
    try {
      var res = await Auth.api('/mines/active');
      if(!res.ok) return;
      var data = await res.json();
      if(!data.game) return;

      var g = data.game;
      activeGame = {
        id: g.id,
        bet: g.bet,
        mineCount: g.mineCount,
        picks: g.picks,
        multiplier: g.multiplier,
        revealed: g.revealed || [],
        multiplierTable: g.multiplierTable
      };
      gameActive = true;

      // Build grid
      buildGrid();
      grid.querySelectorAll('.mines-tile').forEach(function(tile){
        var idx = parseInt(tile.dataset.index, 10);
        tile.classList.remove('disabled');
        if(activeGame.revealed.indexOf(idx) !== -1){
          tile.classList.add('revealed','gem');
          var img = tile.querySelector('img');
          if(img){
            img.src = 'icons/diamond.png';
            img.onerror = function(){ this.onerror = null; this.src = 'icons/coin.png'; };
            img.style.opacity = 1;
            img.style.filter = 'none';
          }
        }
      });

      // Bar
      if(barBet) barBet.textContent = activeGame.bet.toLocaleString() + ' RC';
      if(barMultiplier) barMultiplier.textContent = activeGame.multiplier.toFixed(2) + 'x';
      barMultiplier.className = 'value ' + (activeGame.picks > 0 ? 'accent' : '');
      var potential = Math.floor(activeGame.bet * activeGame.multiplier);
      setBarPayout(potential.toLocaleString() + ' RC');

      // Seed
      if(seedHashEl) seedHashEl.textContent = g.serverSeedHash.slice(0, 16) + '…';
      seedHashEl.title = g.serverSeedHash;

      // Ladder
      renderLadder(g.picks, g.multiplierTable);

      // Buttons
      playBtn.disabled = true;
      playBtn.innerHTML = '<span>In Progress…</span>';
      cashoutBtn.disabled = (activeGame.picks === 0);

      // Dim setup
      if(setupPanel) setupPanel.style.opacity = '.5';
      if(setupPanel) setupPanel.style.pointerEvents = 'none';

      Toast.info('Game resumed', 'You have an active game.');

    } catch(e){}
  })();

  /* ---------- WebSocket balance ---------- */
  var socket = Auth.connectSocket();
  if(socket){
    socket.onmessage = function(ev){
      try {
        var msg = JSON.parse(ev.data);
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
  buildGrid();
  markGridDisabled();
  if(countGrid) buildCountGrid();
  if(ladder) ladder.innerHTML = '<div class="mines-empty">Start a game to see the ladder.</div>';

})();