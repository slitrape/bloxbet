/* ============================================================
   BLOXBET — REWARDS ENGINE (one-time unlock)
   Play 3+ wager games per day for 7 consecutive Pacific days.
   Once unlocked → claim 100 RC once. Forever.
   ============================================================ */

const crypto = require('crypto');

/* ------------------------------------------------------------
   CONFIG
   ------------------------------------------------------------ */
const REWARD_RC = 100;
const UNLOCK_DAYS = 7;
const UNLOCK_MIN_GAMES = 3;

/* ------------------------------------------------------------
   PACIFIC TIME — day boundary helper
   ------------------------------------------------------------ */
function pacificDayKey(ts){
  const d = new Date(ts || Date.now());
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Los_Angeles',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  });
  return fmt.format(d);
}

function previousDayKey(dayKey){
  const parts = dayKey.split('-');
  const d = new Date(Date.UTC(+parts[0], +parts[1] - 1, +parts[2], 12, 0, 0));
  d.setUTCDate(d.getUTCDate() - 1);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return y + '-' + m + '-' + day;
}

function nextPacificMidnight(ts){
  const now = new Date(ts || Date.now());
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Los_Angeles',
    hour: 'numeric',
    minute: 'numeric',
    second: 'numeric',
    hour12: false
  });
  const parts = fmt.formatToParts(now);
  const h = parseInt(parts.find(p => p.type === 'hour').value, 10);
  const m = parseInt(parts.find(p => p.type === 'minute').value, 10);
  const s = parseInt(parts.find(p => p.type === 'second').value, 10);
  const elapsedToday = ((h * 60) + m) * 60 + s;
  const remaining = (24 * 60 * 60) - elapsedToday;
  return now.getTime() + remaining * 1000;
}

/* ------------------------------------------------------------
   STREAK TRACKING
   Called on every wagered game event.
   ------------------------------------------------------------ */
/**
 * @param user  full user row
 * @param now   Date.now() by default
 * @returns { gamble_streak, last_played_day, today_play_count, reward_unlocked_at, newly_unlocked }
 */
function updateGambleStreak(user, now){
  now = now || Date.now();

  // If the reward is already claimed, nothing matters anymore — reward is done
  if(user.reward_claimed_at){
    return {
      gamble_streak: user.gamble_streak || 0,
      last_played_day: user.last_played_day || null,
      today_play_count: user.today_play_count || 0,
      reward_unlocked_at: user.reward_unlocked_at || 0,
      newly_unlocked: false
    };
  }

  const todayPT = pacificDayKey(now);
  const yesterdayPT = previousDayKey(todayPT);

  let streak = user.gamble_streak || 0;
  let lastDay = user.last_played_day || null;
  let todayCount = user.today_play_count || 0;
  let unlockedAt = user.reward_unlocked_at || 0;
  let newlyUnlocked = false;

  if(lastDay === todayPT){
    // Same day — just bump today's count
    todayCount += 1;
  } else if(lastDay === yesterdayPT){
    // Consecutive day — extend streak
    streak += 1;
    todayCount = 1;
    lastDay = todayPT;
  } else {
    // Gap or first play — start over
    streak = 1;
    todayCount = 1;
    lastDay = todayPT;
  }

  // Check unlock condition
  if(!unlockedAt && streak >= UNLOCK_DAYS && todayCount >= UNLOCK_MIN_GAMES){
    unlockedAt = now;
    newlyUnlocked = true;
  }

  return {
    gamble_streak: streak,
    last_played_day: lastDay,
    today_play_count: todayCount,
    reward_unlocked_at: unlockedAt,
    newly_unlocked: newlyUnlocked
  };
}

module.exports = {
  REWARD_RC: REWARD_RC,
  UNLOCK_DAYS: UNLOCK_DAYS,
  UNLOCK_MIN_GAMES: UNLOCK_MIN_GAMES,
  pacificDayKey: pacificDayKey,
  previousDayKey: previousDayKey,
  nextPacificMidnight: nextPacificMidnight,
  updateGambleStreak: updateGambleStreak
};