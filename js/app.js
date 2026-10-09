/* ============================================================
   BLOXBET — APP LOGIC
   Nav, sidebar, dropdowns, count-up, avatars.
   ============================================================ */

/* ---------- Global avatar helper ---------- */
function headshotUrlFromId(id){
  if(!id || id === 'demo') return null;
  // Same-origin proxy → real rbxcdn headshot
  return '/api/avatar/' + id;
}

function resolveAvatarUrl(user){
  if(!user) return null;
  if(typeof user === 'string' || typeof user === 'number'){
    return headshotUrlFromId(user);
  }
  // Prefer id-based proxy (always works). Skip broken www.roblox.com headshot links.
  var id = user.id || user.userId || user.creatorId || user.joinerId || user.robloxId || user.uid || null;
  if(id && String(id) !== 'demo'){
    return headshotUrlFromId(id);
  }
  var url = user.avatar || user.creatorAvatar || user.joinerAvatar || user.uavatar || null;
  if(url && /^https?:\/\//i.test(String(url)) && String(url).indexOf('www.roblox.com/headshot') === -1){
    return String(url);
  }
  return null;
}

function isAvatarSrc(url){
  if(!url) return false;
  url = String(url);
  if(url.indexOf('/api/avatar/') === 0) return true;
  if(/^https?:\/\//i.test(url) && url.indexOf('www.roblox.com/headshot') === -1) return true;
  return false;
}

function avatarLetter(user){
  var n = (user && (user.avatarLetter || user.displayName || user.username || user.creatorUsername || user.name)) || 'U';
  return String(n).charAt(0).toUpperCase();
}

function avatarHtml(user, sizeClass){
  sizeClass = sizeClass || 'avatar-sm';
  var letter = avatarLetter(user);
  var url = resolveAvatarUrl(user);
  if(!url){
    return '<div class="avatar ' + sizeClass + '">' + letter + '</div>';
  }
  return '<div class="avatar ' + sizeClass + '">' +
    '<img src="' + url + '" alt="" draggable="false" referrerpolicy="no-referrer" ' +
    'onerror="this.onerror=null;this.style.display=\'none\';if(this.parentNode)this.parentNode.textContent=\'' + letter + '\'">' +
    '</div>';
}

function renderAvatar(el, user, opts){
  if(!el) return;
  opts = opts || {};
  var letter = avatarLetter(user);
  var url = resolveAvatarUrl(user);

  if(url){
    el.innerHTML = '';
    var img = document.createElement('img');
    img.src = url;
    img.alt = (user && (user.displayName || user.username)) || 'Avatar';
    img.draggable = false;
    img.referrerPolicy = 'no-referrer';
    img.onerror = function(){
      el.innerHTML = '';
      el.textContent = letter;
    };
    el.appendChild(img);
  } else {
    el.textContent = letter;
  }
}

document.addEventListener('DOMContentLoaded', () => {

  /* ---------- Balance + avatar (every page, survives refresh) ---------- */
  function paintBalance(bal){
    var n = Number(bal);
    if(!Number.isFinite(n)) n = 0;
    var formatted = n.toLocaleString();
    document.querySelectorAll('[data-balance]').forEach(function(el){
      el.textContent = formatted;
      el.setAttribute('data-balance', String(n));
      if(el.dataset) el.dataset.balance = String(n);
    });
  }

  window.paintBalance = paintBalance;

  const me = (typeof Auth !== 'undefined' && Auth.getUser) ? Auth.getUser() : null;
  if(me){
    // Immediate paint from localStorage so refresh keeps balance
    if(me.balance !== undefined && me.balance !== null){
      paintBalance(me.balance);
    }

    const welcomeH1 = document.querySelector('.welcome h1');
    if(welcomeH1) welcomeH1.textContent = 'Welcome back, ' + (me.displayName || me.username);

    const navAvatar = document.getElementById('navAvatar');
    if(navAvatar){
      renderAvatar(navAvatar, me);
    }

    // Re-sync from server so every page has current balance + profile
    if(typeof Auth.refreshUser === 'function'){
      Auth.refreshUser().then(function(fresh){
        if(!fresh) return;
        if(fresh.balance !== undefined) paintBalance(fresh.balance);
        if(navAvatar) renderAvatar(navAvatar, fresh);
      }).catch(function(){});
    }
  }

  /* ---------- Sidebar toggle ---------- */
  const sidebar = document.querySelector('.sidebar');
  const main    = document.querySelector('.main');
  const toggle  = document.querySelector('.sidebar-toggle');
  const menuBtn = document.querySelector('.menu-btn');

  if(toggle && sidebar && main){
    toggle.addEventListener('click', () => {
      sidebar.classList.toggle('collapsed');
      main.classList.toggle('expanded');
      localStorage.setItem('bb_sidebar', sidebar.classList.contains('collapsed') ? '1' : '0');
    });
    if(localStorage.getItem('bb_sidebar') === '1'){
      sidebar.classList.add('collapsed');
      main.classList.add('expanded');
    }
  }
  if(menuBtn && sidebar){
    menuBtn.addEventListener('click', () => {
      sidebar.classList.toggle('open');
    });
    document.addEventListener('click', e => {
      if(window.innerWidth <= 900 &&
         sidebar.classList.contains('open') &&
         !sidebar.contains(e.target) &&
         !menuBtn.contains(e.target)){
        sidebar.classList.remove('open');
      }
    });
  }

  /* ---------- Active nav link ---------- */
  const path = location.pathname.split('/').pop() || 'index.html';
  document.querySelectorAll('.nav-link, .side-item, .bn-item').forEach(el => {
    const href = el.getAttribute('data-href') || el.getAttribute('href');
    if(href && href === path){
      el.classList.add('active');
    }
  });


  /* ---------- Settings link in account menus ---------- */
  document.querySelectorAll('.dropdown-menu').forEach(function(menu){
    var hasProfile = menu.querySelector('a[href="profile.html"]');
    if(!hasProfile) return;
    var existing = menu.querySelector('a[href="settings.html"]');
    if(existing) return;
    // Replace "Settings" coming-soon items
    menu.querySelectorAll('.dropdown-item').forEach(function(item){
      if((item.textContent || '').trim() === 'Settings'){
        item.setAttribute('href', 'settings.html');
        item.onclick = null;
        item.removeAttribute('onclick');
      }
    });
    if(!menu.querySelector('a[href="settings.html"]')){
      var s = document.createElement('a');
      s.className = 'dropdown-item';
      s.href = 'settings.html';
      s.textContent = 'Settings';
      hasProfile.parentNode.insertBefore(s, hasProfile.nextSibling);
    }
  });


  /* ---------- settings.html sidebar ---------- */
  (function(){
    var sidebar = document.querySelector('.sidebar');
    if(!sidebar) return;
    var existing = sidebar.querySelector('a[href="settings.html"], a[data-href="settings.html"]');
    if(existing){
      existing.setAttribute('href','settings.html');
      existing.setAttribute('data-href','settings.html');
      existing.onclick = null;
      return;
    }
    var account = null;
    sidebar.querySelectorAll('.sidebar-section').forEach(function(s){
      if((s.textContent||'').trim().toLowerCase()==='account') account = s;
    });
    var item = document.createElement('a');
    item.className = 'side-item';
    item.href = 'settings.html';
    item.setAttribute('data-href','settings.html');
    item.innerHTML = '<span class="icon"><img src="icons/settings.png" alt="" class="ico" draggable="false"></span><span class="label">Settings</span>';
    var toggle = sidebar.querySelector('.sidebar-toggle');
    if(account && account.nextElementSibling){
      // insert after profile if possible
      var profile = sidebar.querySelector('a[href="profile.html"]');
      if(profile && profile.parentNode === sidebar) profile.after(item);
      else if(toggle) sidebar.insertBefore(item, toggle);
      else sidebar.appendChild(item);
    } else if(toggle) sidebar.insertBefore(item, toggle);
    else sidebar.appendChild(item);
  })();


  /* ---------- Foldable sidebar groups ---------- */
  (function(){
    var sidebar = document.getElementById('appSidebar') || document.querySelector('.sidebar');
    if(!sidebar) return;
    var key = 'bb_side_groups';
    var saved = {};
    try { saved = JSON.parse(localStorage.getItem(key) || '{}') || {}; } catch(e){}
    sidebar.querySelectorAll('.side-group').forEach(function(g){
      var id = g.getAttribute('data-group');
      if(id && saved[id] === false) g.classList.remove('open');
      if(id && saved[id] === true) g.classList.add('open');
      var btn = g.querySelector('.side-group-toggle');
      if(!btn) return;
      btn.addEventListener('click', function(){
        g.classList.toggle('open');
        btn.setAttribute('aria-expanded', g.classList.contains('open') ? 'true' : 'false');
        if(id){
          try {
            var cur = JSON.parse(localStorage.getItem(key) || '{}') || {};
            cur[id] = g.classList.contains('open');
            localStorage.setItem(key, JSON.stringify(cur));
          } catch(e){}
        }
      });
    });
    var collapseBtn = sidebar.querySelector('.sidebar-collapse-btn');
    if(collapseBtn){
      collapseBtn.addEventListener('click', function(){
        sidebar.classList.toggle('collapsed');
        var main = document.querySelector('.main');
        if(main) main.classList.toggle('expanded');
        localStorage.setItem('bb_sidebar', sidebar.classList.contains('collapsed') ? '1' : '0');
      });
    }
  })();

  /* ---------- Ensure centered balance chip ---------- */
  (function(){
    var center = document.getElementById('navCenter');
    if(!center) return;
    if(!document.getElementById('navBalanceChip')){
      center.innerHTML =
        '<div class="balance-chip" id="navBalanceChip">' +
          '<div><div class="label">Balance</div>' +
          '<div class="value"><span data-balance data-balance="0">0</span><span class="unit">RC</span></div></div>' +
          '<button class="add" data-tip="Add funds" onclick="Modal.open(\'m-deposit\')">' +
          '<img src="icons/plus.png" alt="" class="ico" draggable="false"></button></div>';
    }
    var me = (typeof Auth !== 'undefined' && Auth.getUser) ? Auth.getUser() : null;
    if(me && me.balance !== undefined && typeof window.paintBalance === 'function'){
      window.paintBalance(me.balance);
    }
    if(typeof Auth !== 'undefined' && Auth.refreshUser){
      Auth.refreshUser().then(function(u){
        if(u && typeof window.paintBalance === 'function') window.paintBalance(u.balance);
      }).catch(function(){});
    }
  })();

  /* ---------- Dropdowns ---------- */
  document.querySelectorAll('.dropdown').forEach(dd => {
    const trigger = dd.querySelector('[data-dropdown]');
    if(!trigger) return;
    trigger.addEventListener('click', e => {
      e.stopPropagation();
      dd.classList.toggle('open');
    });
    document.addEventListener('click', e => {
      if(!dd.contains(e.target)) dd.classList.remove('open');
    });
  });

  /* ---------- Card mouse glow ---------- */
  document.querySelectorAll('.card').forEach(card => {
    card.addEventListener('mousemove', e => {
      const r = card.getBoundingClientRect();
      card.style.setProperty('--mx', (e.clientX - r.left) + 'px');
      card.style.setProperty('--my', (e.clientY - r.top) + 'px');
    });
  });

  /* ---------- Count-up ---------- */
  document.querySelectorAll('[data-count]').forEach(el => {
    const target = parseFloat(el.dataset.count);
    const dur = 900;
    const start = performance.now();
    const fmt = el.dataset.format || 'plain';
    function tick(now){
      const p = Math.min(1, (now - start) / dur);
      const eased = 1 - Math.pow(1 - p, 3);
      const val = target * eased;
      if(fmt === 'int') el.textContent = Math.floor(val).toLocaleString();
      else if(fmt === 'pct') el.textContent = val.toFixed(1) + '%';
      else if(fmt === 'rank') el.textContent = '#' + Math.floor(val);
      else el.textContent = val.toFixed(0);
      if(p < 1) requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  });

  /* ---------- Simulated live activity ---------- */
  const activityList = document.querySelector('[data-live-activity]');
  if(activityList && typeof BB !== 'undefined'){
    setInterval(() => {
      const u = BB.online[Math.floor(Math.random()*BB.online.length)];
      const actions = ['won a Coin Flip','lost a Coin Flip','cashed out on Crash','hit a mine','reached Tower floor 5','spun Roulette'];
      const action = actions[Math.floor(Math.random()*actions.length)];
      const win = Math.random() > .45;
      const amt = Math.floor(Math.random()*4000) + 100;
      const row = document.createElement('div');
      row.className = 'activity-row enter';
      row.innerHTML = `
        <div class="avatar avatar-sm">${u.avatar}</div>
        <div class="activity-user"><span class="name">${u.name}</span></div>
        <div class="activity-action">${action}</div>
        <div class="activity-time">just now</div>
        <div class="activity-result ${win?'result-win':'result-loss'}">${win?'+':'-'}${amt.toLocaleString()}</div>
      `;
      activityList.prepend(row);
      if(activityList.children.length > 10){
        activityList.removeChild(activityList.lastChild);
      }
    }, 4000);
  }
});

/* ---------- Player profile sheet (click any headshot) ---------- */
window.PlayerSheet = (function(){
  var overlay = null;

  function ensure(){
    if(overlay) return overlay;
    overlay = document.createElement('div');
    overlay.className = 'ps-overlay';
    overlay.id = 'playerSheet';
    overlay.innerHTML =
      '<div class="ps-sheet" role="dialog" aria-modal="true">' +
        '<button type="button" class="ps-close" aria-label="Close">&times;</button>' +
        '<div class="ps-banner" id="psBanner"></div>' +
        '<div class="ps-top">' +
          '<div class="ps-avatar" id="psAvatar">?</div>' +
          '<div class="ps-meta">' +
            '<div class="ps-name" id="psName">—</div>' +
            '<div class="ps-handle" id="psHandle">@—</div>' +
            '<div class="ps-badges" id="psBadges"></div>' +
          '</div>' +
        '</div>' +
        '<div class="ps-stats" id="psStats"></div>' +
        '<div class="ps-foot" id="psFoot"></div>' +
      '</div>';
    document.body.appendChild(overlay);
    overlay.addEventListener('click', function(e){
      if(e.target === overlay) close();
    });
    overlay.querySelector('.ps-close').addEventListener('click', close);
    document.addEventListener('keydown', function(e){
      if(e.key === 'Escape' && overlay.classList.contains('open')) close();
    });
    return overlay;
  }

  function fmt(n){ return Number(n||0).toLocaleString(); }

  function close(){
    if(!overlay) return;
    overlay.classList.remove('open');
  }

  async function open(userId){
    if(!userId || userId === 'demo') return;
    ensure();
    overlay.classList.add('open');
    document.getElementById('psName').textContent = 'Loading…';
    document.getElementById('psHandle').textContent = '';
    document.getElementById('psBadges').innerHTML = '';
    document.getElementById('psStats').innerHTML = '<div class="ps-loading">Fetching stats…</div>';
    document.getElementById('psFoot').innerHTML = '';
    document.getElementById('psAvatar').textContent = '?';

    try {
      if(typeof Auth === 'undefined' || !Auth.api) throw new Error('Auth missing');
      var res = await Auth.api('/users/' + encodeURIComponent(userId) + '/public');
      if(!res.ok) throw new Error('not found');
      var data = await res.json();
      var u = data.user;
      var ban = document.getElementById('psBanner');
      if(ban){
        ban.style.backgroundImage = '';
        ban.className = 'ps-banner';
        var pb = u.profileBanner || '';
        if(/^https?:\/\//i.test(pb) || pb.indexOf('data:image/') === 0){
          ban.style.backgroundImage = 'url(' + JSON.stringify(pb).slice(1,-1) + ')';
        } else if(pb){
          // preset tint
          if(pb.indexOf('ember') !== -1) ban.style.background = 'linear-gradient(135deg,#3b1208,#1a0a05)';
          else if(pb.indexOf('aurora') !== -1) ban.style.background = 'linear-gradient(135deg,#0a1a2e,#0d0805)';
          else if(pb.indexOf('void') !== -1) ban.style.background = 'linear-gradient(135deg,#0a0a12,#050508)';
          else if(pb.indexOf('grid') !== -1) ban.style.background = 'linear-gradient(135deg,#1a1520,#0d0805)';
        }
      }
      if(typeof renderAvatar === 'function') renderAvatar(document.getElementById('psAvatar'), u);
      document.getElementById('psName').textContent = u.displayName || u.username;
      document.getElementById('psHandle').textContent = '@' + (u.username || '');
      var badges = document.getElementById('psBadges');
      badges.innerHTML = '';
      if(u.rank) badges.innerHTML += '<span class="ps-badge">'+u.rank+'</span>';
      badges.innerHTML += '<span class="ps-badge">Lvl '+(u.level||1)+'</span>';
      if(u.hasVerifiedBadge) badges.innerHTML += '<span class="ps-badge verified">Verified</span>';

      var winRate = u.gamesPlayed > 0 ? Math.round((u.gamesWon / u.gamesPlayed) * 100) : 0;
      document.getElementById('psStats').innerHTML =
        '<div class="ps-stat"><div class="ps-stat-val">'+fmt(u.balance)+'</div><div class="ps-stat-lbl">Balance</div></div>' +
        '<div class="ps-stat"><div class="ps-stat-val">'+fmt(u.totalWagered)+'</div><div class="ps-stat-lbl">Wagered</div></div>' +
        '<div class="ps-stat"><div class="ps-stat-val">'+fmt(u.totalWon)+'</div><div class="ps-stat-lbl">Won</div></div>' +
        '<div class="ps-stat"><div class="ps-stat-val">'+fmt(u.biggestWin)+'</div><div class="ps-stat-lbl">Biggest win</div></div>' +
        '<div class="ps-stat"><div class="ps-stat-val">'+fmt(u.gamesPlayed)+'</div><div class="ps-stat-lbl">Games</div></div>' +
        '<div class="ps-stat"><div class="ps-stat-val">'+winRate+'%</div><div class="ps-stat-lbl">Win rate</div></div>';

      var since = u.memberSince ? new Date(u.memberSince).toLocaleDateString() : '—';
      document.getElementById('psFoot').innerHTML =
        '<span>Member since '+since+'</span>' +
        '<span>PvP '+fmt(u.pvpWins)+'W / '+fmt(u.pvpLosses)+'L</span>';
    } catch (err) {
      document.getElementById('psName').textContent = 'Unavailable';
      document.getElementById('psStats').innerHTML = '<div class="ps-loading">Could not load this player.</div>';
    }
  }

  // Delegate clicks on avatars / lb rows with data-user-id
  document.addEventListener('click', function(e){
    var t = e.target.closest('[data-user-id]');
    if(!t) return;
    // don't open when clicking real links/buttons inside except pure avatar
    if(t.closest('a[href]') && t.tagName !== 'A') return;
    var id = t.getAttribute('data-user-id');
    if(id) {
      e.preventDefault();
      e.stopPropagation();
      open(id);
    }
  });

  return { open: open, close: close };
})();
