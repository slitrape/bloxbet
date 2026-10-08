/* ============================================================
   BLOXBET — GAME CATALOG
   The single source of truth for the games list.
   Frontend reads whatever this returns.
   ============================================================ */

const GAMES = [
  {
    id: 'flip',
    name: 'Coin Flip',
    desc: 'Heads or tails. 1.96x payout on win.',
    icon: 'coin',
    route: '/coinflip.html',
    available: true,
    launchedAt: 1704067200000,
    sortOrder: 1
  },
  {
    id: 'casebattles',
    name: 'Case Battles',
    desc: 'Open cases with players. Highest total wins everything.',
    icon: 'gift',
    route: '/casebattles.html',
    available: true,
    launchedAt: 1735689600000,
    sortOrder: 2
  },
  {
    id: 'mines',
    name: 'Mines',
    desc: 'Find gems. Dodge bombs. Cash out.',
    icon: 'bomb',
    route: '/mines.html',
    available: true,
    launchedAt: 1738368000000,
    sortOrder: 3
  },
  {
    id: 'crash',
    name: 'Crash',
    desc: 'Cash out before the curve eats you.',
    icon: 'chart',
    route: '/crash.html',
    available: true,
    launchedAt: 1738454400000,
    sortOrder: 4
  }
];

/* ------------------------------------------------------------
   Compute the live game list for a user
   Pulls real player counts from the DB.
   ------------------------------------------------------------ */
function buildGameList(db){
  const ACTIVE_WINDOW_MS = 5 * 60 * 1000;
  const now = Date.now();
  const cutoff = now - ACTIVE_WINDOW_MS;

  function countFlipPlayers(){
    try {
      const row = db.prepare(`
        SELECT COUNT(DISTINCT user_id) as c
        FROM flips
        WHERE created_at > ?
      `).get(cutoff);
      return row ? row.c : 0;
    } catch (e) { return 0; }
  }

  function countCaseBattlePlayers(){
    try {
      const row = db.prepare(`
        SELECT COUNT(DISTINCT user_id) as c
        FROM case_battle_players
        WHERE created_at > ?
      `).get(cutoff);
      return row ? row.c : 0;
    } catch (e) { return 0; }
  }

  function countMinesPlayers(){
    try {
      const row = db.prepare(`
        SELECT COUNT(DISTINCT user_id) as c
        FROM mines_history
        WHERE created_at > ?
      `).get(cutoff);
      return row ? row.c : 0;
    } catch (e) { return 0; }
  }

  function countCrashPlayers(){
    try {
      const row = db.prepare(`
        SELECT COUNT(DISTINCT user_id) as c
        FROM crash_bets
        WHERE created_at > ?
      `).get(cutoff);
      return row ? row.c : 0;
    } catch (e) { return 0; }
  }

  function totalGamesPlayed(){
    let total = 0;
    try { total += db.prepare('SELECT COUNT(*) as c FROM flips').get().c || 0; } catch (e) {}
    try { total += db.prepare("SELECT COUNT(*) as c FROM case_battles WHERE status = 'resolved'").get().c || 0; } catch (e) {}
    try { total += db.prepare('SELECT COUNT(*) as c FROM mines_history').get().c || 0; } catch (e) {}
    try { total += db.prepare('SELECT COUNT(*) as c FROM crash_bets').get().c || 0; } catch (e) {}
    return total;
  }

  const activeByGame = {
    flip: countFlipPlayers(),
    casebattles: countCaseBattlePlayers(),
    mines: countMinesPlayers(),
    crash: countCrashPlayers()
  };

  const totalPlays = totalGamesPlayed();

  let popularGame = null;
  if(totalPlays >= 10){
    let max = 0;
    for(const id in activeByGame){
      if(activeByGame[id] > max){
        max = activeByGame[id];
        popularGame = id;
      }
    }
    if(popularGame === null || max === 0){
      let bestId = null;
      let bestCount = 0;
      try {
        const flipCount = db.prepare('SELECT COUNT(*) as c FROM flips').get().c || 0;
        if(flipCount > bestCount){ bestCount = flipCount; bestId = 'flip'; }
      } catch (e) {}
      try {
        const cbCount = db.prepare("SELECT COUNT(*) as c FROM case_battles WHERE status = 'resolved'").get().c || 0;
        if(cbCount > bestCount){ bestCount = cbCount; bestId = 'casebattles'; }
      } catch (e) {}
      try {
        const minesCount = db.prepare('SELECT COUNT(*) as c FROM mines_history').get().c || 0;
        if(minesCount > bestCount){ bestCount = minesCount; bestId = 'mines'; }
      } catch (e) {}
      try {
        const crashCount = db.prepare('SELECT COUNT(*) as c FROM crash_bets').get().c || 0;
        if(crashCount > bestCount){ bestCount = crashCount; bestId = 'crash'; }
      } catch (e) {}
      popularGame = bestId;
    }
  }

  let newestGame = null;
  let newestTime = 0;
  for(const g of GAMES){
    if(g.available && g.launchedAt > newestTime){
      newestTime = g.launchedAt;
      newestGame = g.id;
    }
  }

  const list = GAMES.map(function(g){
    const active = activeByGame[g.id] || 0;

    let badge = null;
    if(g.id === popularGame && totalPlays >= 10){
      badge = 'popular';
    } else if(g.id === newestGame && g.launchedAt > 0){
      badge = 'new';
    }

    return {
      id: g.id,
      name: g.name,
      desc: g.desc,
      icon: g.icon,
      route: g.route,
      available: g.available,
      badge: badge,
      players: active
    };
  });

  list.sort(function(a, b){
    const ga = GAMES.find(function(x){ return x.id === a.id; });
    const gb = GAMES.find(function(x){ return x.id === b.id; });
    return ((ga && ga.sortOrder) || 0) - ((gb && gb.sortOrder) || 0);
  });

  return list;
}

module.exports = {
  GAMES: GAMES,
  buildGameList: buildGameList
};