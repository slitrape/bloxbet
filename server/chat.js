/* ============================================================
   BLOXBET — GLOBAL CHAT MODULE
   ============================================================ */

const BAD_WORDS = [
  'fuck','shit','bitch','asshole','cunt','dick','pussy','nigger','nigga',
  'faggot','retard','whore','slut','bastard','damn','crap'
];

const RATE_LIMIT_WINDOW_MS = 60 * 1000;   // 1 minute
const RATE_LIMIT_MAX = 10;                // 10 messages/min
const MAX_LENGTH = 200;
const DELETE_WINDOW_MS = 60 * 1000;       // users can delete their own for 60s

function censor(text){
  let out = text;
  for(const word of BAD_WORDS){
    const re = new RegExp('\\b' + word + '\\b', 'gi');
    out = out.replace(re, function(m){ return '*'.repeat(m.length); });
  }
  return out;
}

function sanitize(text){
  let t = String(text || '').trim();
  if(t.length > MAX_LENGTH) t = t.slice(0, MAX_LENGTH);
  t = censor(t);
  return t;
}

module.exports = {
  BAD_WORDS,
  RATE_LIMIT_WINDOW_MS,
  RATE_LIMIT_MAX,
  MAX_LENGTH,
  DELETE_WINDOW_MS,
  censor,
  sanitize
};