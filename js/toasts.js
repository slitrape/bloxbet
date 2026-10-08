/* ============================================================
   BLOXBET — TOASTS
   ============================================================ */

const Toast = (() => {
  const icons = { success:"check", error:"alert", info:"info", warning:"alert" };

  function show(type, title, msg, duration = 3800){
    let wrap = document.querySelector('.toasts');
    if(!wrap){
      wrap = document.createElement('div');
      wrap.className = 'toasts';
      document.body.appendChild(wrap);
    }
    const el = document.createElement('div');
    el.className = 'toast ' + type;
    el.innerHTML = `
      <div class="toast-icon"><img src="icons/${icons[type]||'info'}.png" alt="" draggable="false"></div>
      <div class="toast-body">
        <div class="toast-title">${title}</div>
        ${msg ? `<div class="toast-msg">${msg}</div>` : ''}
      </div>
    `;
    wrap.appendChild(el);
    const t = setTimeout(() => dismiss(el), duration);
    el.addEventListener('click', () => { clearTimeout(t); dismiss(el); });
  }

  function dismiss(el){
    el.classList.add('out');
    setTimeout(() => el.remove(), 220);
  }

  return {
    success: (t,m,d) => show('success',t,m,d),
    error:   (t,m,d) => show('error',t,m,d),
    info:    (t,m,d) => show('info',t,m,d),
    warning: (t,m,d) => show('warning',t,m,d)
  };
})();