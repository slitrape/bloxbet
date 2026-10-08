/* ============================================================
   BLOXBET — MODALS
   ============================================================ */

const Modal = (() => {
  function open(id){
    const m = document.getElementById(id);
    if(!m) return;
    m.classList.add('show');
    document.body.style.overflow = 'hidden';
  }
  function close(id){
    const m = document.getElementById(id);
    if(!m) return;
    m.classList.remove('show');
    document.body.style.overflow = '';
  }
  document.addEventListener('click', e => {
    if(e.target.classList && e.target.classList.contains('modal-overlay')){
      e.target.classList.remove('show');
      document.body.style.overflow = '';
    }
  });
  document.addEventListener('keydown', e => {
    if(e.key === 'Escape'){
      document.querySelectorAll('.modal-overlay.show').forEach(m => {
        m.classList.remove('show');
        document.body.style.overflow = '';
      });
    }
  });
  return { open, close };
})();