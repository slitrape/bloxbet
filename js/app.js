/* ============================================================
   BLOXBET — APP LOGIC
   Nav, sidebar, dropdowns, count-up, avatars.
   ============================================================ */

/* ---------- Global avatar helper ---------- */
function headshotUrlFromId(id){
  if(!id || id === 'demo') return null;
  return 'https://www.roblox.com/headshot-thumbnail/image?userId=' + id + '&width=150&height=150&format=png';
}

function resolveAvatarUrl(user){
  if(!user) return null;
  if(typeof user === 'string' || typeof user === 'number'){
    return headshotUrlFromId(user);
  }
  var url = user.avatar || user.creatorAvatar || user.joinerAvatar || user.uavatar || null;
  if(url && /^https?:\/\//i.test(String(url))) return String(url);
  var id = user.id || user.userId || user.creatorId || user.joinerId || user.robloxId || user.uid || null;
  return headshotUrlFromId(id);
}

function avatarLetter(user){
  var n = (user && (user.avatarLetter || user.displayName || user.username || user.creatorUsername || user.name)) || 'U';
  return String(n).charAt(0).toUpperCase();
}

/** HTML snippet for any user object — headshot for everyone when an id exists */
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
      if(!img.dataset.triedAlt){
        img.dataset.triedAlt = '1';
        var id = user && (user.id || user.userId || user.creatorId);
        if(id && id !== 'demo'){
          img.src = 'https://thumbnails.roblox.com/v1/users/avatar-headshot?userIds=' + id + '&size=150x150&format=Png&isCircular=false';
          return;
        }
      }
      el.innerHTML = '';
      el.textContent = letter;
    };
    el.appendChild(img);
  } else {
    el.textContent = letter;
  }
}

document.addEventListener('DOMContentLoaded', () => {

  /* ---------- User greeting + avatar ---------- */
  const me = (typeof Auth !== 'undefined' && Auth.getUser) ? Auth.getUser() : null;
  if(me){
    const welcomeH1 = document.querySelector('.welcome h1');
    if(welcomeH1) welcomeH1.textContent = 'Welcome back, ' + (me.displayName || me.username);

    // Nav avatar
    const navAvatar = document.getElementById('navAvatar');
    if(navAvatar){
      renderAvatar(navAvatar, me);
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