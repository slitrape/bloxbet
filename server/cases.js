/* ============================================================
   BLOXBET — CASE BATTLES ENGINE
   ============================================================ */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

/* ------------------------------------------------------------
   Load item pool
   ------------------------------------------------------------ */
const ITEMS_PATH = path.join(__dirname, 'caseitems.json');
let ITEMS = [];

try {
  const raw = fs.readFileSync(ITEMS_PATH, 'utf8');
  const parsed = JSON.parse(raw);
  ITEMS = parsed.items || [];
  console.log('[cases] Loaded ' + ITEMS.length + ' items from caseitems.json');
} catch (err) {
  console.error('[cases] Could not load caseitems.json:', err.message);
  ITEMS = [];
}

/* ------------------------------------------------------------
   Rarities
   ------------------------------------------------------------ */
const RARITIES = {
  common:    { weight: 600,  label: 'Common',    color: '#94a3b8', range: [100,    500] },
  uncommon:  { weight: 250,  label: 'Uncommon',  color: '#4f8cff', range: [500,   2000] },
  rare:      { weight: 100,  label: 'Rare',      color: '#a855f7', range: [2000, 10000] },
  epic:      { weight: 40,   label: 'Epic',      color: '#ec4899', range: [10000, 50000] },
  legendary: { weight: 9,    label: 'Legendary', color: '#f59e0b', range: [50000, 500000] },
  mythic:    { weight: 1,    label: 'Mythic',    color: '#ef4444', range: [500000, 100000000] }
};

/* ------------------------------------------------------------
   Cases — 19 total
   ------------------------------------------------------------ */
const CASES = [
  { id: 'bronze',     name: 'Bronze Case',        price: 500,   image: 'icons/cases/bronze.png',     theme: '#b45309', minValue: 100,   maxValue: 5000     },
  { id: 'madness',    name: 'Madness Case',       price: 6083,  image: 'icons/cases/madness.png',    theme: '#dc2626', minValue: 500,   maxValue: 60000    },
  { id: 'horn',       name: 'Horn Case',          price: 7696,  image: 'icons/cases/horn.png',       theme: '#06b6d4', minValue: 800,   maxValue: 80000    },
  { id: 'silver',     name: 'Silver Case',        price: 2500,  image: 'icons/cases/silver.png',     theme: '#94a3b8', minValue: 500,   maxValue: 25000    },
  { id: 'pinkface',   name: 'Pink Face Case',     price: 11655, image: 'icons/cases/pinkface.png',   theme: '#ec4899', minValue: 1500,  maxValue: 120000   },
  { id: 'toxic',      name: 'Toxic Case',         price: 15912, image: 'icons/cases/toxic.png',      theme: '#22c55e', minValue: 2000,  maxValue: 160000   },
  { id: 'gold',       name: 'Gold Case',          price: 10000, image: 'icons/cases/gold.png',       theme: '#f59e0b', minValue: 2500,  maxValue: 150000   },
  { id: 'sparkle',    name: 'Sparkle Case',       price: 16801, image: 'icons/cases/sparkle.png',    theme: '#3b82f6', minValue: 2500,  maxValue: 175000   },
  { id: 'purple',     name: 'Purple Case',        price: 18382, image: 'icons/cases/purple.png',     theme: '#a855f7', minValue: 3000,  maxValue: 190000   },
  { id: 'king',       name: 'King Case',          price: 18605, image: 'icons/cases/king.png',       theme: '#eab308', minValue: 3000,  maxValue: 200000   },
  { id: 'purpleface', name: 'Purple Face Case',   price: 22167, image: 'icons/cases/purpleface.png', theme: '#7c3aed', minValue: 3500,  maxValue: 240000   },
  { id: 'domrev',     name: 'Dominus Revolution', price: 23221, image: 'icons/cases/domrev.png',     theme: '#10b981', minValue: 4000,  maxValue: 250000   },
  { id: 'doge',       name: 'Doge Case',          price: 23952, image: 'icons/cases/doge.png',       theme: '#facc15', minValue: 4000,  maxValue: 260000   },
  { id: 'antler',     name: 'Antler Case',        price: 33055, image: 'icons/cases/antler.png',     theme: '#ef4444', minValue: 6000,  maxValue: 350000   },
  { id: 'bucket',     name: 'Bucket Flip',        price: 44500, image: 'icons/cases/bucket.png',     theme: '#ec4899', minValue: 8000,  maxValue: 450000   },
  { id: 'valk',       name: 'Valk Case',          price: 53144, image: 'icons/cases/valk.png',       theme: '#06b6d4', minValue: 9000,  maxValue: 550000   },
  { id: 'diamond',    name: 'Diamond Case',       price: 50000, image: 'icons/cases/diamond.png',    theme: '#4f8cff', minValue: 10000, maxValue: 800000   },
  { id: 'periastron', name: 'Periastron Case',    price: 56457, image: 'icons/cases/periastron.png', theme: '#8b5cf6', minValue: 10000, maxValue: 600000   },
  { id: 'federation', name: 'Federation Case',    price: 94210, image: 'icons/cases/federation.png', theme: '#10b981', minValue: 15000, maxValue: 1000000  }
];

/* ------------------------------------------------------------
   Helpers
   ------------------------------------------------------------ */
function getCase(caseId){
  return CASES.find(c => c.id === caseId) || null;
}

function itemsForCase(caseId){
  const c = getCase(caseId);
  if(!c) return [];
  return ITEMS.filter(it => it.value >= c.minValue && it.value <= c.maxValue);
}

/* ------------------------------------------------------------
   Rarity roll
   ------------------------------------------------------------ */
function rollRarity(rand){
  const total = Object.values(RARITIES).reduce((s, r) => s + r.weight, 0);
  let roll = rand * total;
  for(const [key, r] of Object.entries(RARITIES)){
    roll -= r.weight;
    if(roll <= 0) return key;
  }
  return 'common';
}

function pickItemForRarity(caseId, rarity, rand){
  const pool = itemsForCase(caseId);
  if(pool.length === 0) return null;

  let candidates = pool.filter(it => it.rarity === rarity);

  if(candidates.length === 0){
    const order = ['common','uncommon','rare','epic','legendary','mythic'];
    let idx = order.indexOf(rarity);
    while(candidates.length === 0 && idx >= 0){
      candidates = pool.filter(it => it.rarity === order[idx]);
      idx--;
    }
    if(candidates.length === 0) candidates = pool;
  }

  const pick = Math.floor(rand * candidates.length);
  return candidates[pick];
}

/* ------------------------------------------------------------
   Deterministic roll
   ------------------------------------------------------------ */
function deterministicRoll(seed, battleId, playerId, round){
  const hmac = crypto.createHmac('sha256', seed);
  hmac.update(battleId + ':' + playerId + ':' + round);
  const hash = hmac.digest('hex');
  const int = parseInt(hash.slice(0, 8), 16);
  return int / 0xffffffff;
}

function rollItemForPlayer(caseId, battleSeed, battleId, playerId, round){
  const r1 = deterministicRoll(battleSeed, battleId, playerId, round + ':rarity');
  const r2 = deterministicRoll(battleSeed, battleId, playerId, round + ':item');

  const rarity = rollRarity(r1);
  const item = pickItemForRarity(caseId, rarity, r2);

  if(!item) return null;

  return {
    itemId: item.id,
    name: item.name,
    image: item.image,
    rarity: item.rarity,
    value: item.value
  };
}

function generateBattleSeed(){
  return crypto.randomBytes(32).toString('hex');
}

function hashSeed(seed){
  return crypto.createHash('sha256').update(seed).digest('hex');
}

function buildReel(caseId, resultItem, seed){
  const pool = itemsForCase(caseId);
  if(pool.length === 0) return [resultItem];

  const reel = [];
  const REEL_LENGTH = 40;

  for(let i = 0; i < REEL_LENGTH - 1; i++){
    const h = crypto.createHash('sha256').update(seed + ':' + i).digest();
    const pick = h[0] / 255;
    const item = pool[Math.floor(pick * pool.length)];
    reel.push({
      itemId: item.id,
      name: item.name,
      image: item.image,
      rarity: item.rarity,
      value: item.value
    });
  }

  reel.push(resultItem);
  return reel;
}

module.exports = {
  RARITIES,
  CASES,
  ITEMS,
  getCase,
  itemsForCase,
  rollRarity,
  pickItemForRarity,
  rollItemForPlayer,
  generateBattleSeed,
  hashSeed,
  buildReel
};