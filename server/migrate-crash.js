const path = require('path');
const { DatabaseSync } = require('node:sqlite');
const db = new DatabaseSync(path.join(__dirname, 'bloxbet.db'));

function has(table, col){
  const rows = db.prepare(`PRAGMA table_info(${table})`).all();
  return rows.some(r => r.name === col);
}
function add(table, col, def){
  if(has(table, col)) return console.log(`[migrate] ${table}.${col} exists`);
  db.exec(`ALTER TABLE ${table} ADD COLUMN ${col} ${def}`);
  console.log(`[migrate] Added ${table}.${col}`);
}

add('users', 'crash_played', 'INTEGER DEFAULT 0');
add('users', 'crash_won',    'INTEGER DEFAULT 0');

db.exec(`
  CREATE TABLE IF NOT EXISTS crash_rounds (
    id TEXT PRIMARY KEY,
    round_number INTEGER NOT NULL,
    server_seed TEXT NOT NULL,
    server_seed_hash TEXT NOT NULL,
    crash_point REAL NOT NULL,
    status TEXT NOT NULL DEFAULT 'waiting',
    total_bets INTEGER DEFAULT 0,
    total_wagered INTEGER DEFAULT 0,
    total_paid INTEGER DEFAULT 0,
    started_at INTEGER NOT NULL,
    crashed_at INTEGER,
    ended_at INTEGER
  );
  CREATE INDEX IF NOT EXISTS idx_crash_rounds_num ON crash_rounds(round_number DESC);
  CREATE INDEX IF NOT EXISTS idx_crash_rounds_status ON crash_rounds(status, round_number DESC);

  CREATE TABLE IF NOT EXISTS crash_bets (
    id TEXT PRIMARY KEY,
    round_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    username TEXT NOT NULL,
    bet INTEGER NOT NULL,
    edge REAL NOT NULL,
    auto_cashout REAL,
    cashed_out INTEGER DEFAULT 0,
    cashout_multiplier REAL,
    cashout_value INTEGER,
    fee REAL DEFAULT 0,
    net INTEGER DEFAULT 0,
    created_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_crash_bets_round ON crash_bets(round_id);
  CREATE INDEX IF NOT EXISTS idx_crash_bets_user ON crash_bets(user_id, created_at DESC);

  CREATE TABLE IF NOT EXISTS crash_history (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    round_id TEXT NOT NULL,
    round_number INTEGER NOT NULL,
    bet INTEGER NOT NULL,
    crash_point REAL NOT NULL,
    cashed_out INTEGER NOT NULL,
    cashout_multiplier REAL,
    payout INTEGER,
    net INTEGER,
    balance_after INTEGER,
    created_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_crash_hist_user ON crash_history(user_id, created_at DESC);
`);

console.log('[migrate] Done.');