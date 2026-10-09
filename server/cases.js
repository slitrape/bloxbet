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
   Cases — ~80 roster
   All images use placeholder path; frontend falls back to icons/gift.png
   ------------------------------------------------------------ */
const CASES = [
  // ── entry (500 – 5k) ──────────────────────────────────────
  { id: 'bronze',       name: 'Bronze Case',         price: 500,    image: 'icons/cases/placeholder.png', theme: '#b45309', minValue: 100,    maxValue: 5000    },
  { id: 'rusted',       name: 'Rusted Crate',        price: 750,    image: 'icons/cases/placeholder.png', theme: '#a16207', minValue: 100,    maxValue: 6000    },
  { id: 'street',       name: 'Street Drop',         price: 1200,   image: 'icons/cases/placeholder.png', theme: '#64748b', minValue: 200,    maxValue: 10000   },
  { id: 'alley',        name: 'Alley Cache',         price: 1600,   image: 'icons/cases/placeholder.png', theme: '#475569', minValue: 250,    maxValue: 12000   },
  { id: 'scrap',        name: 'Scrap Bin',           price: 2000,   image: 'icons/cases/placeholder.png', theme: '#78716c', minValue: 300,    maxValue: 15000   },
  { id: 'silver',       name: 'Silver Case',         price: 2500,   image: 'icons/cases/placeholder.png', theme: '#94a3b8', minValue: 500,    maxValue: 25000   },
  { id: 'copper',       name: 'Copper Chest',        price: 3000,   image: 'icons/cases/placeholder.png', theme: '#c2410c', minValue: 500,    maxValue: 28000   },
  { id: 'tin',          name: 'Tin Box',             price: 3500,   image: 'icons/cases/placeholder.png', theme: '#a8a29e', minValue: 600,    maxValue: 30000   },
  { id: 'iron',         name: 'Iron Locker',         price: 4200,   image: 'icons/cases/placeholder.png', theme: '#57534e', minValue: 700,    maxValue: 35000   },
  { id: 'slate',        name: 'Slate Case',          price: 4800,   image: 'icons/cases/placeholder.png', theme: '#334155', minValue: 800,    maxValue: 40000   },

  // ── low-mid (5k – 15k) ────────────────────────────────────
  { id: 'madness',      name: 'Madness Case',        price: 6083,   image: 'icons/cases/placeholder.png', theme: '#dc2626', minValue: 500,    maxValue: 60000   },
  { id: 'horn',         name: 'Horn Case',           price: 7696,   image: 'icons/cases/placeholder.png', theme: '#06b6d4', minValue: 800,    maxValue: 80000   },
  { id: 'fog',          name: 'Fog Vault',           price: 8500,   image: 'icons/cases/placeholder.png', theme: '#94a3b8', minValue: 1000,   maxValue: 90000   },
  { id: 'ash',          name: 'Ash Crate',           price: 9200,   image: 'icons/cases/placeholder.png', theme: '#78716c', minValue: 1200,   maxValue: 95000   },
  { id: 'gold',         name: 'Gold Case',           price: 10000,  image: 'icons/cases/placeholder.png', theme: '#f59e0b', minValue: 2500,   maxValue: 150000  },
  { id: 'amber',        name: 'Amber Drop',          price: 10800,  image: 'icons/cases/placeholder.png', theme: '#d97706', minValue: 1500,   maxValue: 110000  },
  { id: 'pinkface',     name: 'Pink Face Case',      price: 11655,  image: 'icons/cases/placeholder.png', theme: '#ec4899', minValue: 1500,   maxValue: 120000  },
  { id: 'jade',         name: 'Jade Case',           price: 12500,  image: 'icons/cases/placeholder.png', theme: '#10b981', minValue: 1800,   maxValue: 125000  },
  { id: 'cobalt',       name: 'Cobalt Case',         price: 13200,  image: 'icons/cases/placeholder.png', theme: '#2563eb', minValue: 2000,   maxValue: 135000  },
  { id: 'frostbite',    name: 'Frostbite',           price: 14200,  image: 'icons/cases/placeholder.png', theme: '#38bdf8', minValue: 2200,   maxValue: 145000  },
  { id: 'toxic',        name: 'Toxic Case',          price: 15912,  image: 'icons/cases/placeholder.png', theme: '#22c55e', minValue: 2000,   maxValue: 160000  },
  { id: 'sparkle',      name: 'Sparkle Case',        price: 16801,  image: 'icons/cases/placeholder.png', theme: '#3b82f6', minValue: 2500,   maxValue: 175000  },
  { id: 'ember',        name: 'Ember Vault',         price: 17500,  image: 'icons/cases/placeholder.png', theme: '#f97316', minValue: 2800,   maxValue: 180000  },
  { id: 'purple',       name: 'Purple Case',         price: 18382,  image: 'icons/cases/placeholder.png', theme: '#a855f7', minValue: 3000,   maxValue: 190000  },
  { id: 'king',         name: 'King Case',           price: 18605,  image: 'icons/cases/placeholder.png', theme: '#eab308', minValue: 3000,   maxValue: 200000  },
  { id: 'neon',         name: 'Neon Pulse',          price: 19800,  image: 'icons/cases/placeholder.png', theme: '#22d3ee', minValue: 3200,   maxValue: 200000  },

  // ── mid (20k – 40k) ───────────────────────────────────────
  { id: 'crimson',      name: 'Crimson Case',        price: 20500,  image: 'icons/cases/placeholder.png', theme: '#be123c', minValue: 3500,   maxValue: 210000  },
  { id: 'azure',        name: 'Azure Case',          price: 21200,  image: 'icons/cases/placeholder.png', theme: '#0ea5e9', minValue: 3500,   maxValue: 220000  },
  { id: 'purpleface',   name: 'Purple Face Case',    price: 22167,  image: 'icons/cases/placeholder.png', theme: '#7c3aed', minValue: 3500,   maxValue: 240000  },
  { id: 'domrev',       name: 'Dominus Revolution',  price: 23221,  image: 'icons/cases/placeholder.png', theme: '#10b981', minValue: 4000,   maxValue: 250000  },
  { id: 'doge',         name: 'Doge Case',           price: 23952,  image: 'icons/cases/placeholder.png', theme: '#facc15', minValue: 4000,   maxValue: 260000  },
  { id: 'onyx',         name: 'Onyx Case',           price: 24800,  image: 'icons/cases/placeholder.png', theme: '#1c1917', minValue: 4200,   maxValue: 265000  },
  { id: 'ivory',        name: 'Ivory Chest',         price: 25600,  image: 'icons/cases/placeholder.png', theme: '#f5f5f4', minValue: 4300,   maxValue: 270000  },
  { id: 'shadowfang',   name: 'Shadowfang',          price: 26800,  image: 'icons/cases/placeholder.png', theme: '#4c1d95', minValue: 4500,   maxValue: 280000  },
  { id: 'smoke',        name: 'Smoke Cache',         price: 27500,  image: 'icons/cases/placeholder.png', theme: '#6b7280', minValue: 4600,   maxValue: 285000  },
  { id: 'bloodmoon',    name: 'Bloodmoon',           price: 29500,  image: 'icons/cases/placeholder.png', theme: '#991b1b', minValue: 5000,   maxValue: 310000  },
  { id: 'glacier',      name: 'Glacier Case',        price: 30200,  image: 'icons/cases/placeholder.png', theme: '#bae6fd', minValue: 5200,   maxValue: 315000  },
  { id: 'voidwalker',   name: 'Voidwalker',          price: 31200,  image: 'icons/cases/placeholder.png', theme: '#312e81', minValue: 5500,   maxValue: 330000  },
  { id: 'antler',       name: 'Antler Case',         price: 33055,  image: 'icons/cases/placeholder.png', theme: '#ef4444', minValue: 6000,   maxValue: 350000  },
  { id: 'thunder',      name: 'Thunder Case',        price: 34500,  image: 'icons/cases/placeholder.png', theme: '#eab308', minValue: 6200,   maxValue: 360000  },
  { id: 'mist',         name: 'Mist Vault',          price: 35800,  image: 'icons/cases/placeholder.png', theme: '#a5b4fc', minValue: 6500,   maxValue: 370000  },
  { id: 'blaze',        name: 'Blaze Case',          price: 37200,  image: 'icons/cases/placeholder.png', theme: '#ea580c', minValue: 6800,   maxValue: 385000  },
  { id: 'hollow',       name: 'Hollow Drop',         price: 38800,  image: 'icons/cases/placeholder.png', theme: '#44403c', minValue: 7000,   maxValue: 400000  },

  // ── high (40k – 70k) ──────────────────────────────────────
  { id: 'bucket',       name: 'Bucket Flip',         price: 44500,  image: 'icons/cases/placeholder.png', theme: '#ec4899', minValue: 8000,   maxValue: 450000  },
  { id: 'obsidian',     name: 'Obsidian',            price: 48200,  image: 'icons/cases/placeholder.png', theme: '#1e293b', minValue: 8500,   maxValue: 480000  },
  { id: 'diamond',      name: 'Diamond Case',        price: 50000,  image: 'icons/cases/placeholder.png', theme: '#4f8cff', minValue: 10000,  maxValue: 800000  },
  { id: 'valk',         name: 'Valk Case',           price: 53144,  image: 'icons/cases/placeholder.png', theme: '#06b6d4', minValue: 9000,   maxValue: 550000  },
  { id: 'periastron',   name: 'Periastron Case',     price: 56457,  image: 'icons/cases/placeholder.png', theme: '#8b5cf6', minValue: 10000,  maxValue: 600000  },
  { id: 'crypt',        name: 'Crypt Case',          price: 58200,  image: 'icons/cases/placeholder.png', theme: '#3f3f46', minValue: 10500,  maxValue: 620000  },
  { id: 'icecrown',     name: 'Ice Crown',           price: 61200,  image: 'icons/cases/placeholder.png', theme: '#bae6fd', minValue: 11000,  maxValue: 650000  },
  { id: 'relic',        name: 'Relic Case',          price: 63800,  image: 'icons/cases/placeholder.png', theme: '#a78bfa', minValue: 11500,  maxValue: 680000  },
  { id: 'phantom',      name: 'Phantom Relic',       price: 67800,  image: 'icons/cases/placeholder.png', theme: '#c4b5fd', minValue: 12000,  maxValue: 720000  },
  { id: 'sanctum',      name: 'Sanctum Case',        price: 69500,  image: 'icons/cases/placeholder.png', theme: '#6366f1', minValue: 12500,  maxValue: 740000  },

  // ── premium (70k – 150k) ──────────────────────────────────
  { id: 'solar',        name: 'Solar Flare',         price: 72400,  image: 'icons/cases/placeholder.png', theme: '#fbbf24', minValue: 13000,  maxValue: 780000  },
  { id: 'throne',       name: 'Throne Case',         price: 75800,  image: 'icons/cases/placeholder.png', theme: '#ca8a04', minValue: 13500,  maxValue: 800000  },
  { id: 'abyss',        name: 'Abyss Case',          price: 78200,  image: 'icons/cases/placeholder.png', theme: '#0f172a', minValue: 14000,  maxValue: 850000  },
  { id: 'chronos',      name: 'Chronos Vault',       price: 81500,  image: 'icons/cases/placeholder.png', theme: '#818cf8', minValue: 14000,  maxValue: 880000  },
  { id: 'storm',        name: 'Storm Case',          price: 84200,  image: 'icons/cases/placeholder.png', theme: '#64748b', minValue: 14500,  maxValue: 900000  },
  { id: 'horizon',      name: 'Horizon Case',        price: 89000,  image: 'icons/cases/placeholder.png', theme: '#0ea5e9', minValue: 14800,  maxValue: 920000  },
  { id: 'eclipse',      name: 'Eclipse Case',        price: 118000, image: 'icons/cases/placeholder.png', theme: '#1e293b', minValue: 19000,  maxValue: 1300000 },
  { id: 'radiant',      name: 'Radiant Case',        price: 165000, image: 'icons/cases/placeholder.png', theme: '#fde68a', minValue: 29000,  maxValue: 2300000 },

  { id: 'federation',   name: 'Federation Case',     price: 94210,  image: 'icons/cases/placeholder.png', theme: '#10b981', minValue: 15000,  maxValue: 1000000 },
  { id: 'crown',        name: 'Crown Case',          price: 98500,  image: 'icons/cases/placeholder.png', theme: '#f59e0b', minValue: 16000,  maxValue: 1050000 },
  { id: 'scepter',      name: 'Scepter Case',        price: 105000, image: 'icons/cases/placeholder.png', theme: '#d946ef', minValue: 17000,  maxValue: 1100000 },
  { id: 'temple',       name: 'Temple Case',         price: 112000, image: 'icons/cases/placeholder.png', theme: '#f97316', minValue: 18000,  maxValue: 1200000 },
  { id: 'apex',         name: 'Apex Dominion',       price: 125000, image: 'icons/cases/placeholder.png', theme: '#f43f5e', minValue: 20000,  maxValue: 1500000 },
  { id: 'shrine',       name: 'Shrine Case',         price: 132000, image: 'icons/cases/placeholder.png', theme: '#c026d3', minValue: 22000,  maxValue: 1600000 },
  { id: 'stellar',      name: 'Stellar Core',        price: 148000, image: 'icons/cases/placeholder.png', theme: '#e0f2fe', minValue: 25000,  maxValue: 2000000 },

  // ── elite (150k+) ─────────────────────────────────────────
  { id: 'midnight',     name: 'Midnight Case',       price: 155000, image: 'icons/cases/placeholder.png', theme: '#1e1b4b', minValue: 28000,  maxValue: 2200000 },
  { id: 'inferno',      name: 'Inferno Case',        price: 168000, image: 'icons/cases/placeholder.png', theme: '#dc2626', minValue: 30000,  maxValue: 2400000 },
  { id: 'void',         name: 'Void Case',           price: 182000, image: 'icons/cases/placeholder.png', theme: '#0c0a09', minValue: 35000,  maxValue: 2600000 },
  { id: 'mythic',       name: 'Mythic Vault',        price: 195000, image: 'icons/cases/placeholder.png', theme: '#ef4444', minValue: 40000,  maxValue: 3000000 },
  { id: 'legacy',       name: 'Legacy Case',         price: 210000, image: 'icons/cases/placeholder.png', theme: '#b45309', minValue: 45000,  maxValue: 3500000 },
  { id: 'omega',        name: 'Omega Case',          price: 235000, image: 'icons/cases/placeholder.png', theme: '#7c3aed', minValue: 50000,  maxValue: 4000000 },
  { id: 'prime',        name: 'Prime Case',          price: 250000, image: 'icons/cases/placeholder.png', theme: '#f59e0b', minValue: 55000,  maxValue: 4500000 },
  { id: 'ascension',    name: 'Ascension',           price: 275000, image: 'icons/cases/placeholder.png', theme: '#38bdf8', minValue: 60000,  maxValue: 5000000 },
  { id: 'dominion',     name: 'Dominion Case',       price: 300000, image: 'icons/cases/placeholder.png', theme: '#10b981', minValue: 75000,  maxValue: 6000000 },
  { id: 'eternal',      name: 'Eternal Case',        price: 350000, image: 'icons/cases/placeholder.png', theme: '#e0e7ff', minValue: 100000, maxValue: 8000000 },
  { id: 'godtier',      name: 'Godtier Case',        price: 420000, image: 'icons/cases/placeholder.png', theme: '#fbbf24', minValue: 150000, maxValue: 10000000},
  { id: 'unbound',      name: 'Unbound Case',        price: 500000, image: 'icons/cases/placeholder.png', theme: '#f43f5e', minValue: 200000, maxValue: 15000000}
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
