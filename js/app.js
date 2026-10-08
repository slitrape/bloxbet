/* ============================================================
   BLOXBET — APP LOGIC
   Nav, sidebar, dropdowns, count-up, avatars.
   ============================================================ */

/* ---------- Global avatar helper ---------- */
function renderAvatar(el, user, opts){
  if(!el) return;
  opts = opts || {};
  var size = opts.size || 'md';
  var fallbackLetter = (user && (user.avatarLetter || user.displayName || user.username)) || 'U';
  fallbackLetter = String(fallbackLetter).charAt(0).toUpperCase();

  var url = user && user.avatar ? user.avatar : null;
  // Only accept http(s) URLs
  if(url && !/^https?:\/\//i.test(url)) url = null;

  if(url){
    el.innerHTML = '';
    var img = document.createElement('img');
    img.src = url;
    img.alt = (user && (user.displayName || user.username)) || 'Avatar';
    img.draggable = false;
    img.onerror = function(){
      el.innerHTML = '';
      el.textContent = fallbackLetter;
    };
    el.appendChild(img);
  } else {
    el.textContent = fallbackLetter;
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