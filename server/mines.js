/* ============================================================
   BLOXBET — MINES ENGINE
   5x5 grid. N mines. Multiplier curve. Provably fair rolls.
   ============================================================ */

const crypto = require('crypto');

const GRID_SIZE = 25;         // 5x5
const HOUSE_EDGE = 0.82;      // real ~18% edge; UI shows 3%
const DISPLAY_HOUSE_EDGE = 0.03; // shown to players

/* ------------------------------------------------------------
   Combination math (n choose k) — BigInt for safety at 25C12
   ------------------------------------------------------------ */
function choose(n, k){
  if(k < 0 || k > n) return 0n;
  if(k === 0 || k === n) return 1n;
  k = Math.min(k, n - k);
  let result = 1n;
  for(let i = 0; i < k; i++){
    result = result * BigInt(n - i) / BigInt(i + 1);
  }
  return result;
}

/* ------------------------------------------------------------
   Multiplier for a given state
   ------------------------------------------------------------ */
function multiplierFor(mines, picks){
  if(picks === 0) return 1.0;
  if(mines >= GRID_SIZE) return 0;

  const num = choose(GRID_SIZE, picks);
  const den = choose(GRID_SIZE - mines, picks);
  if(den === 0n) return 0;

  const ratio = Number(num) / Number(den);
  const mult = HOUSE_EDGE * ratio;
  return Math.round(mult * 10000) / 10000;
}

/* ------------------------------------------------------------
   Precompute multiplier table for a mine count
   Client uses this to show "next multiplier" instantly
   ------------------------------------------------------------ */
function multiplierTable(mines){
  const table = [1.0];
  const maxPicks = GRID_SIZE - mines;
  for(let i = 1; i <= maxPicks; i++){
    table.push(multiplierFor(mines, i));
  }
  return table;
}

/* ------------------------------------------------------------
   Generate a deterministic grid from seed
   Every tile index 0-24 is either 'gem' or 'mine'
   ------------------------------------------------------------ */
function generateGrid(seed, mineCount){
  // Fisher-Yates shuffle using HMAC bytes
  const positions = [];
  for(let i = 0; i < GRID_SIZE; i++) positions.push(i);

  let byteIdx = 0;
  const buffer = crypto.createHmac('sha256', seed).update('mines-grid').digest();

  function nextByte(){
    if(byteIdx >= buffer.length){
      // Extend the buffer deterministically
      byteIdx = 0;
      const ext = crypto.createHmac('sha256', seed).update('ext-' + positions.length).digest();
      return ext[0];
    }
    return buffer[byteIdx++];
  }

  // Shuffle
  for(let i = positions.length - 1; i > 0; i--){
    const j = nextByte() % (i + 1);
    const tmp = positions[i];
    positions[i] = positions[j];
    positions[j] = tmp;
  }

  // First N positions are mines
  const grid = new Array(GRID_SIZE).fill('gem');
  for(let i = 0; i < mineCount; i++){
    grid[positions[i]] = 'mine';
  }
  return grid;
}

/* ------------------------------------------------------------
   Provably fair — commit-reveal hash
   ------------------------------------------------------------ */
function generateSeed(){
  return crypto.randomBytes(32).toString('hex');
}

function hashSeed(seed){
  return crypto.createHash('sha256').update(seed).digest('hex');
}

module.exports = {
  DISPLAY_HOUSE_EDGE,
  GRID_SIZE,
  HOUSE_EDGE,
  choose,
  multiplierFor,
  multiplierTable,
  generateGrid,
  generateSeed,
  hashSeed
};