/* ============================================================
   BLOXBET — ADMIN LINK INJECTOR
   Injects "Admin" into sidebar + account dropdown on every page
   for users with isAdmin === true.
   ============================================================ */

(function(){
  if(typeof Auth === 'undefined') return;

  function ready(fn){
    if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', fn);
    else fn();
  }

  ready(function(){
    var me = Auth.getUser();
    if(!me || !me.isAdmin) return;

    // Skip if already on admin page
    var path = (location.pathname.split('/').pop() || 'index.html').toLowerCase();
    if(path === 'admin.html') return;

    // ---------- 1. Sidebar entry ----------
    var sidebar = document.querySelector('.sidebar');
    if(sidebar && !sidebar.querySelector('.side-item[data-href="admin.html"]')){
      // Insert after "Profile" in the Account section if present,
      // otherwise append before the sidebar-toggle
      var toggle = sidebar.querySelector('.sidebar-toggle');
      var item = document.createElement('a');
      item.className = 'side-item';
      item.setAttribute('data-href', 'admin.html');
      item.setAttribute('href', 'admin.html');
      item.innerHTML =
        '<span class="icon">' +
          '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="opacity:.85">' +
            '<path d="M12 2l8 4v6c0 5-3.5 9-8 10-4.5-1-8-5-8-10V6l8-4z"/>' +
            '<path d="M9 12l2 2 4-4"/>' +
          '</svg>' +
        '</span>' +
        '<span class="label">Admin</span>';

      if(toggle) sidebar.insertBefore(item, toggle);
      else sidebar.appendChild(item);
    }

    // ---------- 2. Account dropdown entry ----------
    var dropdowns = document.querySelectorAll('.dropdown-menu');
    dropdowns.forEach(function(menu){
      // Only touch the one that contains a link to profile.html (the account menu)
      var hasProfile = menu.querySelector('a[href="profile.html"]');
      if(!hasProfile) return;
      if(menu.querySelector('a[href="admin.html"]')) return;

      var admin = document.createElement('a');
      admin.className = 'dropdown-item';
      admin.href = 'admin.html';
      admin.textContent = 'Admin';
      // Insert right after the Profile link
      hasProfile.parentNode.insertBefore(admin, hasProfile.nextSibling);
    });

    // ---------- 3. Bottom-nav (mobile) — optional spot if you want it ----------
    // Intentionally left out. Sidebar and dropdown cover both desktop and mobile
    // since the sidebar slides in on mobile via the menu button.
  });
})();