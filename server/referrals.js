/* ============================================================
   BLOXBET — REFERRAL SYSTEM
   ============================================================ */

const crypto = require('crypto');

const REFERRER_BONUS = 150;      // RC to the person who invited
const REFERRED_BONUS = 50;       // RC to the new user on signup
const REFERRER_UNLOCK_GAMES = 5; // referred user must play this many games before referrer gets paid
const MAX_SUCCESSFUL_REFERRALS = 10;

/**
 * Generate a unique referral code from a user id + salt.
 * Deterministic per user — one code per account forever.
 */
function codeForUser(userId){
  const h = crypto.createHash('sha256').update('bloxbet-ref:' + String(userId)).digest('hex');
  return h.slice(0, 8);
}

module.exports = {
  REFERRER_BONUS,
  REFERRED_BONUS,
  REFERRER_UNLOCK_GAMES,
  MAX_SUCCESSFUL_REFERRALS,
  codeForUser
};