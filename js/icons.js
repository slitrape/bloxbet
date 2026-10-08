/* ============================================================
   BLOXBET — ICON HELPER
   Usage: Icon('home')  →  <img src="icons/home.png" class="ico">
   Usage: Icon('home','ico-lg')
   All icons live in /icons/*.png
   ============================================================ */

const Icon = (name, cls = '') => {
  return `<img src="icons/${name}.png" alt="" class="ico ${cls}" draggable="false">`;
};