/* BloxBet global preferences — applied on every page */
(function(){
  function pref(key, def){
    try {
      var v = localStorage.getItem(key);
      if(v === null || v === undefined) return def;
      return v;
    } catch(e){ return def; }
  }
  function on(key, defOn){
    var v = pref(key, defOn ? '1' : '0');
    return v === '1' || v === 'true';
  }

  window.BBPrefs = {
    get: pref,
    isOn: on,
    soundEnabled: function(){ return on('bb_pref_sound', true); },
    confirmLargeBets: function(){ return on('bb_pref_confirm', true); },
    reduceMotion: function(){ return on('bb_pref_reduce_motion', false); },
    hideOnline: function(){ return on('bb_pref_hide_online', false); },
    privateProfile: function(){ return on('bb_pref_private', false); },
    notifMatch: function(){ return on('bb_pref_notif_match', true); },
    notifReward: function(){ return on('bb_pref_notif_reward', true); },
    notifChat: function(){ return on('bb_pref_notif_chat', true); },
    lang: function(){ return pref('bb_pref_lang', 'en'); },
    nameColor: function(){ return pref('bb_pref_name_color', ''); },
    badge: function(){ return pref('bb_pref_badge_style', ''); },
    ring: function(){ return pref('bb_pref_ring', ''); },
    shouldConfirmBet: function(amount){
      if(!this.confirmLargeBets()) return true;
      var a = Number(amount)||0;
      if(a < 500) return true;
      return confirm('Place bet of ' + a.toLocaleString() + ' RC?');
    },
    play: function(audio){
      if(!this.soundEnabled() || !audio) return;
      try { audio.currentTime = 0; audio.play().catch(function(){}); } catch(e){}
    }
  };

  // Apply body classes
  function apply(){
    var rm = BBPrefs.reduceMotion();
    document.body.classList.toggle('reduce-motion', rm);
    document.documentElement.classList.toggle('reduce-motion', rm);
    document.body.classList.toggle('private-profile', BBPrefs.privateProfile());
    document.body.classList.toggle('hide-online', BBPrefs.hideOnline());
    document.documentElement.lang = BBPrefs.lang() || 'en';

    // Cosmetics on own avatar / name if present
    var color = BBPrefs.nameColor();
    document.querySelectorAll('[data-me-name], .nav-logo-text, #setName, #pfName').forEach(function(el){
      el.classList.remove('name-gold','name-ice','name-neon');
      if(color) el.classList.add('name-' + color);
    });
    var ring = BBPrefs.ring();
    document.querySelectorAll('#navAvatar, #setAvatar, #pfAvatar').forEach(function(el){
      el.classList.remove('ring-ember');
      if(ring) el.classList.add('ring-' + ring);
    });
  }

  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', apply);
  else apply();
  window.addEventListener('storage', function(e){
    if(e.key && e.key.indexOf('bb_pref_') === 0) apply();
  });

  // Wrap Toast for notification prefs
  function hookToasts(){
    if(!window.Toast || Toast.__prefHooked) return;
    Toast.__prefHooked = true;
    ['success','error','info'].forEach(function(k){
      if(typeof Toast[k] !== 'function') return;
      var orig = Toast[k].bind(Toast);
      Toast[k] = function(title, msg){
        var t = String(title||'').toLowerCase();
        var m = String(msg||'').toLowerCase();
        if((t.indexOf('reward')>=0 || m.indexOf('rake')>=0 || m.indexOf('streak')>=0 || m.indexOf('code')>=0) && !BBPrefs.notifReward()) return;
        if((t.indexOf('match')>=0 || m.indexOf('1v1')>=0 || m.indexOf('invite')>=0) && !BBPrefs.notifMatch()) return;
        if((t.indexOf('chat')>=0 || m.indexOf('mention')>=0) && !BBPrefs.notifChat()) return;
        return orig(title, msg);
      };
    });
  }
  hookToasts();
  setTimeout(hookToasts, 500);

  // Language dictionary (light)
  var I18N = {
    en: {},
    es: { 'Home':'Inicio', 'Rewards':'Recompensas', 'Leaderboard':'Clasificación', 'Settings':'Ajustes', 'Wallet':'Cartera', 'Chat':'Chat', 'Originals':'Originales' },
    pt: { 'Home':'Início', 'Rewards':'Recompensas', 'Leaderboard':'Ranking', 'Settings':'Configurações', 'Wallet':'Carteira', 'Chat':'Chat', 'Originals':'Originais' },
    fr: { 'Home':'Accueil', 'Rewards':'Récompenses', 'Leaderboard':'Classement', 'Settings':'Paramètres', 'Wallet':'Portefeuille', 'Chat':'Chat', 'Originals':'Originaux' },
    de: { 'Home':'Start', 'Rewards':'Belohnungen', 'Leaderboard':'Rangliste', 'Settings':'Einstellungen', 'Wallet':'Wallet', 'Chat':'Chat', 'Originals':'Originale' }
  };
  function applyLang(){
    var lang = BBPrefs.lang();
    var dict = I18N[lang] || {};
    document.querySelectorAll('.side-nav-item span, .chat-rail-title, .wallet-btn, .nav-lb-link').forEach(function(el){
      var raw = el.getAttribute('data-i18n-src') || el.textContent.trim();
      if(!el.getAttribute('data-i18n-src')) el.setAttribute('data-i18n-src', raw);
      if(dict[raw]) el.textContent = dict[raw];
      else el.textContent = el.getAttribute('data-i18n-src');
    });
  }
  window.BBPrefs.applyLang = applyLang;
  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', applyLang);
  else applyLang();
})();
