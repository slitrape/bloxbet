/* ============================================================
   BLOXBET — CRASH ENGINE
   Passive by default — no rounds fire until a viewer arrives.
   ============================================================ */

const crypto = require('crypto');

const CONFIG = {
  baseEdge: 0.04,

  edgeTiers: [
    { maxBet: 100,      edge: 0.06 },
    { maxBet: 10000,    edge: 0.05 },
    { maxBet: Infinity, edge: 0.04 }
  ],

  cashoutDelayMs: 80,
  autoCashoutOffset: 0.02,

  feeBands: [
    { min: 0,    max: 5,         fee: 0.00 },
    { min: 5,    max: 10,        fee: 0.01 },
    { min: 10,   max: 50,        fee: 0.02 },
    { min: 50,   max: Infinity,  fee: 0.03 }
  ],

  waitingMs:       10000,
  startingMs:      2000,
  crashedMs:       4000,

  // Grace period after last viewer leaves before pausing the loop
  idleGraceMs:     15000,

  growthPerSecond: 0.06,
  tickMs: 100,

  minBet: 10,
  maxBet: Number.MAX_SAFE_INTEGER,

  seedRotationRounds: 100
};

function hashSeed(seed){
  return crypto.createHash('sha256').update(seed).digest('hex');
}

function generateSeed(){
  return crypto.randomBytes(32).toString('hex');
}

function computeCrashPoint(seed, roundId, edge){
  const hmac = crypto.createHmac('sha256', seed);
  hmac.update('crash:' + roundId);
  const hash = hmac.digest('hex');

  const int = parseInt(hash.slice(0, 13), 16);
  const raw = int / 0x10000000000000;

  const effectiveEdge = 1 - edge;

  if(raw >= effectiveEdge){
    return { crashPoint: 1.00, roll: raw };
  }

  const denom = effectiveEdge - raw;
  if(denom <= 0) return { crashPoint: 1.00, roll: raw };

  let m = effectiveEdge / denom;
  m = Math.floor(m * 100) / 100;

  if(m > 10000) m = 10000;
  if(m < 1.00) m = 1.00;

  return { crashPoint: m, roll: raw };
}

function multiplierAt(elapsedMs){
  const seconds = elapsedMs / 1000;
  const m = Math.exp(CONFIG.growthPerSecond * seconds);
  return Math.floor(m * 100) / 100;
}

function timeToReachMultiplier(m){
  if(m <= 1) return 0;
  return Math.log(m) / CONFIG.growthPerSecond * 1000;
}

function edgeForBet(bet){
  for(const tier of CONFIG.edgeTiers){
    if(bet <= tier.maxBet) return tier.edge;
  }
  return CONFIG.baseEdge;
}

function feeForMultiplier(mult){
  for(const band of CONFIG.feeBands){
    if(mult >= band.min && mult < band.max){
      return band.fee;
    }
  }
  return 0;
}

module.exports = {
  CONFIG,
  hashSeed,
  generateSeed,
  computeCrashPoint,
  multiplierAt,
  timeToReachMultiplier,
  edgeForBet,
  feeForMultiplier
};