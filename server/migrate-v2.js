/* ============================================================
   BLOXBET — v1.9 → v2.0 MIGRATION
   Run once:  node migrate-v2.js
   Idempotent — safe to re-run.
   ============================================================ */

const path = require('path');
const { DatabaseSync } = require('node:sqlite');

const DB_PATH = path.join(__dirname, 'bloxbet.db');
const db = new DatabaseSync(DB_PATH);

function hasTable(name){
  return !!db.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name=?`).get(name);
}

function hasColumn(table, col){
  if(!hasTable(table)) return false;
  const rows = db.prepare(`PRAGMA table_info(${table})`).all();
  return rows.some(r => r.name === col);
}

function addColumn(table, col, def){
  if(!hasTable(table)){
    console.log(`[skip] ${table} does not exist`);
    return false;
  }
  if(hasColumn(table, col)){
    console.log(`[ok]   ${table}.${col} exists`);
    return false;
  }
  db.exec(`ALTER TABLE ${table} ADD COLUMN ${col} ${def}`);
  console.log(`[add]  ${table}.${col} ${def}`);
  return true;
}

console.log('');
console.log('[migrate] BloxBet v1.9 -> v2.0');
console.log('[migrate] DB:', DB_PATH);
console.log('');

/* ---------- users: social / referral / cosmetic columns ---------- */
const userCols = [
  ['referral_code',       'TEXT'],
  ['referred_by',         'TEXT'],
  ['referral_count',      'INTEGER DEFAULT 0'],
  ['referral_earnings',   'INTEGER DEFAULT 0'],
  ['name_color',          'TEXT'],
  ['avatar_ring',         'TEXT'],
  ['profile_banner',      'TEXT'],
  ['chat_badge',          'TEXT'],
];
for(const [col, def] of userCols){
  addColumn('users', col, def);
}

/* ---------- chat table rename ---------- */
if(hasTable('chat_messages') && !hasTable('pvp_chat_messages')){
  db.exec('ALTER TABLE chat_messages RENAME TO pvp_chat_messages');
  console.log('[rename] chat_messages -> pvp_chat_messages');
} else if(hasTable('pvp_chat_messages')){
  console.log('[ok]   pvp_chat_messages exists');
} else {
  console.log('[skip] no legacy chat table to rename');
}

/* ---------- create any missing v2.0 tables ---------- */
db.exec(`
  CREATE TABLE IF NOT EXISTS global_chat_messages (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    username TEXT NOT NULL,
    avatar TEXT,
    name_color TEXT,
    chat_badge TEXT,
    message TEXT NOT NULL,
    deleted INTEGER DEFAULT 0,
    created_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_gchat_created ON global_chat_messages(created_at DESC);

  CREATE TABLE IF NOT EXISTS chat_rate (
    user_id TEXT PRIMARY KEY,
    window_start INTEGER NOT NULL,
    count INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS referrals (
    id TEXT PRIMARY KEY,
    referrer_id TEXT NOT NULL,
    referred_id TEXT NOT NULL UNIQUE,
    bonus_paid INTEGER DEFAULT 0,
    bonus_amount INTEGER DEFAULT 0,
    created_at INTEGER NOT NULL,
    paid_at INTEGER
  );
  CREATE INDEX IF NOT EXISTS idx_ref_referrer ON referrals(referrer_id, created_at DESC);

  CREATE TABLE IF NOT EXISTS user_items (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    item_id TEXT NOT NULL,
    category TEXT NOT NULL,
    purchased_at INTEGER NOT NULL,
    UNIQUE (user_id, item_id)
  );
  CREATE INDEX IF NOT EXISTS idx_ui_user ON user_items(user_id, category);

  CREATE TABLE IF NOT EXISTS follows (
    id TEXT PRIMARY KEY,
    follower_id TEXT NOT NULL,
    followed_id TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    UNIQUE (follower_id, followed_id)
  );
  CREATE INDEX IF NOT EXISTS idx_follows_follower ON follows(follower_id, created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_follows_followed ON follows(followed_id, created_at DESC);
`);

/* ---------- backfill referral_code for every existing user ---------- */
const crypto = require('crypto');
function codeForUser(userId){
  const h = crypto.createHash('sha256').update('bloxbet-ref:' + String(userId)).digest('hex');
  return h.slice(0, 8);
}

const usersWithoutCode = db.prepare(
  `SELECT id FROM users WHERE referral_code IS NULL OR referral_code = ''`
).all();

if(usersWithoutCode.length > 0){
  const upd = db.prepare(`UPDATE users SET referral_code = ?, updated_at = ? WHERE id = ?`);
  const now = Date.now();
  for(const u of usersWithoutCode){
    upd.run(codeForUser(u.id), now, u.id);
  }
  console.log(`[backfill] ${usersWithoutCode.length} user(s) got a referral_code`);
} else {
  console.log('[ok]   all users have a referral_code');
}

/* ---------- referral_code index (safe now that column exists) ---------- */
db.exec(`CREATE INDEX IF NOT EXISTS idx_users_referral_code ON users(referral_code)`);
console.log('[ok]   idx_users_referral_code');

console.log('');
console.log('[migrate] Done. Start the server: node server.js');
console.log('');