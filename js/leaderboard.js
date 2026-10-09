/* ============================================================
   BLOXBET — LEADERBOARD (real data from /api/leaderboard)
   ============================================================ */

(function(){
  if(typeof Auth === 'undefined') return;
  if(!Auth.isLoggedIn()){ Auth.safeRedirect('login'); return; }

  let sortMode = 'wagered';
  let cachedEntries = [];

  function fmt(n){
    if(n >= 1e6) return (n/1e6).toFixed(2) + 'M';
    if(n >= 1e3) return (n/1e3).toFixed(1) + 'K';
    return Number(n).toLocaleString();
  }

  function escapeHtml(s){
    return String(s).replace(/[&<>"']/g, (c) => ({
      '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
    }[c]));
  }

  function renderAvatar(username, avatar, hasVerifiedBadge, userId){
    const letter = (username || 'U')[0].toUpperCase();
    const initial = '<div class="avatar avatar-sm" style="background:linear-gradient(135deg,var(--accent),var(--accent-2))">' + letter + '</div>';
    var url = (typeof resolveAvatarUrl === 'function')
      ? resolveAvatarUrl({ avatar: avatar, id: userId })
      : avatar;
    if((!url || !/^https?:\/\//i.test(url)) && userId && userId !== 'demo'){
      url = '/api/avatar/' + userId;
    }
    if(url && /^https?:\/\//i.test(url)){
      return '<div class="avatar avatar-sm"><img src="' + url + '" alt="" draggable="false" referrerpolicy="no-referrer" onerror="this.style.display=\'none\';this.parentNode.textContent=\'' + letter + '\'"></div>';
    }
    return initial;
  }

  async function loadLeaderboard(){
    try {
      const res = await Auth.api('/leaderboard?sort=' + sortMode);
      if(!res.ok) return;
      const data = await res.json();
      cachedEntries = data.entries || [];
      renderLeaderboard();
      loadMyRank();
    } catch (e) {
      console.error('[leaderboard]', e);
    }
  }

  async function loadMyRank(){
    try {
      const res = await Auth.api('/leaderboard/me');
      if(!res.ok) return;
      const data = await res.json();
      const container = document.getElementById('myRankPanel');
      if(!container) return;
      if(!data.rank){
        container.innerHTML = '<div class="side-empty">Play a game to enter the leaderboard.</div>';
        return;
      }
      container.innerHTML =
        '<div class="lb-row" style="background:rgba(79,140,255,.05)">' +
          '<div class="lb-rank" style="color:var(--accent)">#' + data.rank + '</div>' +
          '<div class="lb-user">' +
            renderAvatar(data.user.displayName || data.user.username, data.user.avatar, data.user.hasVerifiedBadge, data.user.id) +
            '<span class="name">' + escapeHtml(data.user.displayName || data.user.username) + '</span>' +
          '</div>' +
          '<div class="lb-score">' + fmt(data.user.balance) + '</div>' +
          '<div class="lb-delta">of ' + data.total + '</div>' +
        '</div>';
    } catch {}
  }

  function renderLeaderboard(){
    const container = document.getElementById('lbFull');
    if(!container) return;
    if(cachedEntries.length === 0){
      container.innerHTML = '<div class="side-empty" style="padding:2rem">No players yet. Be the first.</div>';
      return;
    }

    let valueLabel = 'Wagered';
    if(sortMode === 'balance') valueLabel = 'Balance';
    else if(sortMode === 'won') valueLabel = 'Total Won';
    else if(sortMode === 'biggest') valueLabel = 'Biggest Win';

    container.innerHTML = '';
    cachedEntries.forEach((u) => {
      const cls = u.rank === 1 ? 'top1' : u.rank === 2 ? 'top2' : u.rank === 3 ? 'top3' : '';
      let value = u.totalWagered;
      if(sortMode === 'balance') value = u.balance;
      else if(sortMode === 'won') value = u.totalWon;
      else if(sortMode === 'biggest') value = u.biggestWin;

      const el = document.createElement('div');
      el.className = 'lb-row';
      el.innerHTML =
        '<div class="lb-rank ' + cls + '">#' + u.rank + '</div>' +
        '<div class="lb-user">' +
          renderAvatar(u.username, u.avatar, u.hasVerifiedBadge, u.id) +
          '<span class="name">' + escapeHtml(u.username) + '</span>' +
          '<span class="chip" style="margin-left:.4rem;font-size:.65rem">' + u.rankName + '</span>' +
        '</div>' +
        '<div class="lb-score" title="' + valueLabel + '">' + fmt(value) + '</div>' +
        '<div class="lb-delta" style="width:auto;color:var(--text-3);font-size:.7rem">' + valueLabel + '</div>';
      container.appendChild(el);
    });
  }

  document.querySelectorAll('#lbFilter button').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('#lbFilter button').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      sortMode = btn.dataset.filter === 'weekly' ? 'wagered'
               : btn.dataset.filter === 'monthly' ? 'won'
               : 'balance';
      loadLeaderboard();
    });
  });

  loadLeaderboard();
  setInterval(loadLeaderboard, 30000);
})();