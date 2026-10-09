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