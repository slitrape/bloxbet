/* ============================================================
   BLOXBET — FULL BACKEND v2.1
   Auth + Games + Rewards + Social + Chat + Referrals + Shop + Admin
   ============================================================
   Install:  npm install
   Run:      node server.js
   ============================================================ */

const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const fetch = (...args) => import('node-fetch').then(({default: f}) => f(...args));
const rateLimit = require('express-rate-limit');
const crypto = require('crypto');
const path = require('path');
const http = require('http');
const { DatabaseSync } = require('node:sqlite');
const { v4: uuidv4 } = require('uuid');
const WebSocket = require('ws');

const cases = require('./cases');
const minesEngine = require('./mines');
const crashEngine = require('./crash');
const gamesCatalog = require('./games');
const rewards = require('./rewards');
const chatModule = require('./chat');
const referrals = require('./referrals');
const shop = require('./shop');
const social = require('./social');

const app = express();
app.set('trust proxy', 1);
const server = http.createServer(app);
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'change-this-in-production-bloxbet';
const ADMIN_USERNAMES = new Set(
  (process.env.ADMIN_USERNAMES || 'mournvlad')
    .split(',')
    .map(s => s.trim().toLowerCase())
    .filter(Boolean)
);
const DISCORD_WEBHOOK = process.env.DISCORD_WEBHOOK || '';
const ROOT = path.join(__dirname, '..');
const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'bloxbet.db');

app.use(cors());
app.use(express.json({ limit: '1mb' }));

/* Discord OAuth + guild join */
const DISCORD_CLIENT_ID = process.env.DISCORD_CLIENT_ID || '';
const DISCORD_CLIENT_SECRET = process.env.DISCORD_CLIENT_SECRET || '';
const DISCORD_BOT_TOKEN = process.env.DISCORD_BOT_TOKEN || '';
const DISCORD_GUILD_ID = process.env.DISCORD_GUILD_ID || '';
const DISCORD_REDIRECT = process.env.DISCORD_REDIRECT || '';

function discordRedirectUri(req){
  // Always absolute site-root callback — never relative to /settings.html etc.
  if(DISCORD_REDIRECT && /^https?:\/\//i.test(DISCORD_REDIRECT) && DISCORD_REDIRECT.indexOf('/settings.html') === -1){
    return DISCORD_REDIRECT.replace(/\/$/, '');
  }
  const host = req.get('x-forwarded-host') || req.get('host') || 'localhost:3000';
  const proto = (req.get('x-forwarded-proto') || req.protocol || 'https').split(',')[0].trim();
  return proto + '://' + host + '/api/discord/callback';
}

app.get('/api/discord/oauth-url', requireAuth, (req, res) => {
  if(!DISCORD_CLIENT_ID){
    return res.json({
      ok: false,
      configured: false,
      invite: 'https://discord.gg/bloxbet',
      message: 'Discord app not configured. Set DISCORD_CLIENT_ID, DISCORD_CLIENT_SECRET, DISCORD_BOT_TOKEN, DISCORD_GUILD_ID.'
    });
  }
  const redirect = discordRedirectUri(req);
  const state = Buffer.from(JSON.stringify({ uid: req.userId, t: Date.now() })).toString('base64url');
  const url = 'https://discord.com/api/oauth2/authorize?client_id=' + encodeURIComponent(DISCORD_CLIENT_ID)
    + '&redirect_uri=' + encodeURIComponent(redirect)
    + '&response_type=code&scope=' + encodeURIComponent('identify guilds.join')
    + '&state=' + encodeURIComponent(state);
  res.json({ ok: true, configured: true, url, redirect });
});

app.get('/api/discord/callback', async (req, res) => {
  try {
    const code = String(req.query.code || '');
    const stateRaw = String(req.query.state || '');
    if(!code || !DISCORD_CLIENT_ID || !DISCORD_CLIENT_SECRET){
      return res.redirect('/profile.html?discord=error');
    }
    let uid = null;
    try { uid = JSON.parse(Buffer.from(stateRaw, 'base64url').toString()).uid; } catch(e){}
    const redirect = discordRedirectUri(req);
    const body = new URLSearchParams({
      client_id: DISCORD_CLIENT_ID,
      client_secret: DISCORD_CLIENT_SECRET,
      grant_type: 'authorization_code',
      code,
      redirect_uri: redirect
    });
    const tokenRes = await fetch('https://discord.com/api/oauth2/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body
    });
    if(!tokenRes.ok) return res.redirect('/profile.html?discord=token_fail');
    const tokenData = await tokenRes.json();
    const access = tokenData.access_token;
    const meRes = await fetch('https://discord.com/api/users/@me', {
      headers: { Authorization: 'Bearer ' + access }
    });
    if(!meRes.ok) return res.redirect('/profile.html?discord=user_fail');
    const me = await meRes.json();
    try { addCol('users', 'discord_id', 'TEXT'); } catch(e){}
    try { addCol('users', 'discord_username', 'TEXT'); } catch(e){}
    if(uid){
      db.prepare('UPDATE users SET discord_id = ?, discord_username = ?, updated_at = ? WHERE id = ?')
        .run(String(me.id), me.username || me.global_name || '', Date.now(), String(uid));
    }
    // Auto-add to guild
    if(DISCORD_BOT_TOKEN && DISCORD_GUILD_ID && access){
      try {
        await fetch('https://discord.com/api/guilds/' + DISCORD_GUILD_ID + '/members/' + me.id, {
          method: 'PUT',
          headers: {
            Authorization: 'Bot ' + DISCORD_BOT_TOKEN,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ access_token: access })
        });
      } catch(e){ console.error('[discord join]', e); }
    }
    res.redirect('/profile.html?discord=linked');
  } catch (err) {
    console.error('[discord/callback]', err);
    res.redirect('/profile.html?discord=error');
  }
});


app.post('/api/discord/unlink', requireAuth, (req, res) => {
  try {
    try { addCol('users', 'discord_id', 'TEXT'); } catch(e){}
    try { addCol('users', 'discord_username', 'TEXT'); } catch(e){}
    db.prepare('UPDATE users SET discord_id = NULL, discord_username = NULL, updated_at = ? WHERE id = ?')
      .run(Date.now(), String(req.userId));
    res.json({ ok: true, linked: false });
  } catch (err) {
    console.error('[discord/unlink]', err);
    res.status(500).json({ error: 'SERVER_ERROR' });
  }
});

app.get('/api/discord/status', requireAuth, (req, res) => {
  try {
    try { addCol('users', 'discord_id', 'TEXT'); } catch(e){}
    try { addCol('users', 'discord_username', 'TEXT'); } catch(e){}
    const u = db.prepare('SELECT discord_id, discord_username FROM users WHERE id = ?').get(String(req.userId));
    res.json({
      linked: !!(u && u.discord_id),
      discordId: u && u.discord_id || null,
      discordUsername: u && u.discord_username || null,
      configured: !!(DISCORD_CLIENT_ID && DISCORD_BOT_TOKEN && DISCORD_GUILD_ID)
    });
  } catch (err) {
    res.json({ linked: false, configured: false });
  }
});


app.get('/api/auth/ban-status', (req, res) => {
  try {
    const auth = req.headers.authorization || '';
    if(!auth.startsWith('Bearer ')) return res.json({ banned: false });
    let payload;
    try { payload = jwt.verify(auth.slice(7), JWT_SECRET); } catch { return res.json({ banned: false }); }
    const u = db.prepare('SELECT banned, ban_until, ban_reason FROM users WHERE id = ?').get(String(payload.sub));
    if(!u) return res.json({ banned: false });
    const now = Date.now();
    const active = !!u.banned || (u.ban_until && u.ban_until > now);
    if(!active){
      // auto clear expired temp ban
      if(u.ban_until && u.ban_until <= now && u.banned){
        try { db.prepare('UPDATE users SET banned = 0, ban_until = NULL, ban_reason = NULL WHERE id = ?').run(String(payload.sub)); } catch(e){}
      }
      return res.json({ banned: false });
    }
    res.json({
      banned: true,
      banUntil: u.ban_until || null,
      permanent: !u.ban_until && !!u.banned,
      reason: u.ban_reason || null
    });
  } catch (err) {
    res.json({ banned: false });
  }
});


app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
  next();
});

/* ============================================================
   SQLITE
   ============================================================ */
const db = new DatabaseSync(DB_PATH);
db.exec(`
  CREATE TABLE IF NOT EXISTS login_events (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    ip TEXT,
    user_agent TEXT,
    created_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_login_events_user ON login_events(user_id, created_at DESC);
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS admin_logs (
    id TEXT PRIMARY KEY,
    admin_id TEXT,
    admin_username TEXT,
    action TEXT NOT NULL,
    target_id TEXT,
    target_username TEXT,
    detail TEXT,
    ip TEXT,
    created_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_admin_logs_created ON admin_logs(created_at DESC);
`);

db.exec(`
  PRAGMA journal_mode = WAL;

  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    username TEXT NOT NULL,
    display_name TEXT,
    avatar TEXT,
    has_verified_badge INTEGER DEFAULT 0,
    balance INTEGER DEFAULT 0,
    level INTEGER DEFAULT 1,
    xp INTEGER DEFAULT 0,
    total_wagered INTEGER DEFAULT 0,
    total_won INTEGER DEFAULT 0,
    total_lost INTEGER DEFAULT 0,
    biggest_win INTEGER DEFAULT 0,
    games_played INTEGER DEFAULT 0,
    games_won INTEGER DEFAULT 0,
    pvp_wins INTEGER DEFAULT 0,
    pvp_losses INTEGER DEFAULT 0,
    case_battles_played INTEGER DEFAULT 0,
    case_battles_won INTEGER DEFAULT 0,
    mines_played INTEGER DEFAULT 0,
    mines_won INTEGER DEFAULT 0,
    crash_played INTEGER DEFAULT 0,
    crash_won INTEGER DEFAULT 0,
    gamble_streak INTEGER DEFAULT 0,
    last_played_day TEXT,
    today_play_count INTEGER DEFAULT 0,
    reward_unlocked_at INTEGER DEFAULT 0,
    reward_claimed_at INTEGER DEFAULT 0,
    referral_code TEXT,
    referred_by TEXT,
    referral_count INTEGER DEFAULT 0,
    referral_earnings INTEGER DEFAULT 0,
    name_color TEXT,
    avatar_ring TEXT,
    profile_banner TEXT,
    chat_badge TEXT,
    is_admin INTEGER DEFAULT 0,
    rank TEXT DEFAULT 'Bronze',
    server_seed TEXT NOT NULL,
    server_seed_hash TEXT NOT NULL,
    nonce INTEGER DEFAULT 0,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_users_referral_code ON users(referral_code);

  CREATE TABLE IF NOT EXISTS roblox_links (
    user_id TEXT PRIMARY KEY,
    roblox_user_id TEXT NOT NULL,
    roblox_username TEXT NOT NULL,
    cookie TEXT NOT NULL,
    inventory_public INTEGER DEFAULT 0,
    limiteds_json TEXT DEFAULT '[]',
    last_validated_at INTEGER NOT NULL,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS limited_flips (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    opponent_id TEXT,
    asset_id TEXT NOT NULL,
    asset_name TEXT,
    asset_rap INTEGER DEFAULT 0,
    choice TEXT NOT NULL,
    result TEXT,
    status TEXT NOT NULL DEFAULT 'open',
    winner_id TEXT,
    created_at INTEGER NOT NULL,
    resolved_at INTEGER
  );

  CREATE INDEX IF NOT EXISTS idx_limited_flips_status ON limited_flips(status, created_at DESC);

  CREATE TABLE IF NOT EXISTS flips (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    bet INTEGER NOT NULL,
    choice TEXT NOT NULL,
    result TEXT NOT NULL,
    win INTEGER NOT NULL,
    payout INTEGER NOT NULL,
    net INTEGER NOT NULL,
    balance_after INTEGER NOT NULL,
    client_seed TEXT NOT NULL,
    server_seed_hash TEXT NOT NULL,
    nonce INTEGER NOT NULL,
    hash TEXT NOT NULL,
    mode TEXT DEFAULT 'house',
    match_id TEXT,
    opponent_id TEXT,
    created_at INTEGER NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_flips_user ON flips(user_id, created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_flips_match ON flips(match_id);

  CREATE TABLE IF NOT EXISTS pvp_matches (
    id TEXT PRIMARY KEY,
    creator_id TEXT NOT NULL,
    creator_username TEXT NOT NULL,
    creator_avatar TEXT,
    creator_choice TEXT NOT NULL,
    bet INTEGER NOT NULL,
    status TEXT NOT NULL DEFAULT 'open',
    joiner_id TEXT,
    joiner_username TEXT,
    joiner_avatar TEXT,
    result TEXT,
    winner_id TEXT,
    loser_id TEXT,
    payout INTEGER,
    created_at INTEGER NOT NULL,
    resolved_at INTEGER
  );

  CREATE INDEX IF NOT EXISTS idx_matches_status ON pvp_matches(status, created_at DESC);

  CREATE TABLE IF NOT EXISTS pvp_chat_messages (
    id TEXT PRIMARY KEY,
    match_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    username TEXT NOT NULL,
    avatar TEXT,
    message TEXT NOT NULL,
    created_at INTEGER NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_pvp_chat_match ON pvp_chat_messages(match_id, created_at DESC);

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

  CREATE TABLE IF NOT EXISTS achievements (
    id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    unlocked_at INTEGER NOT NULL,
    PRIMARY KEY (id, user_id)
  );

  CREATE TABLE IF NOT EXISTS transactions (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    type TEXT NOT NULL,
    amount INTEGER NOT NULL,
    balance_after INTEGER NOT NULL,
    meta TEXT,
    created_at INTEGER NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_tx_user ON transactions(user_id, created_at DESC);

  CREATE TABLE IF NOT EXISTS case_battles (
    id TEXT PRIMARY KEY,
    case_id TEXT NOT NULL,
    case_name TEXT NOT NULL,
    entry_price INTEGER NOT NULL,
    slots INTEGER NOT NULL,
    status TEXT NOT NULL DEFAULT 'open',
    creator_id TEXT NOT NULL,
    creator_username TEXT NOT NULL,
    battle_seed TEXT,
    battle_seed_hash TEXT,
    winner_id TEXT,
    total_value INTEGER,
    created_at INTEGER NOT NULL,
    started_at INTEGER,
    resolved_at INTEGER
  );

  CREATE INDEX IF NOT EXISTS idx_cb_status ON case_battles(status, created_at DESC);

  CREATE TABLE IF NOT EXISTS case_battle_players (
    id TEXT PRIMARY KEY,
    battle_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    username TEXT NOT NULL,
    avatar TEXT,
    slot INTEGER NOT NULL,
    rolled_item_id TEXT,
    rolled_item_name TEXT,
    rolled_item_image TEXT,
    rolled_item_rarity TEXT,
    rolled_item_value INTEGER,
    reel_json TEXT,
    created_at INTEGER NOT NULL,
    UNIQUE (battle_id, user_id)
  );

  CREATE INDEX IF NOT EXISTS idx_cbp_battle ON case_battle_players(battle_id);
  CREATE INDEX IF NOT EXISTS idx_cbp_user_created ON case_battle_players(user_id, created_at DESC);

  CREATE TABLE IF NOT EXISTS mines_games (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    bet INTEGER NOT NULL,
    mine_count INTEGER NOT NULL,
    status TEXT NOT NULL DEFAULT 'active',
    server_seed TEXT NOT NULL,
    server_seed_hash TEXT NOT NULL,
    grid_json TEXT NOT NULL,
    revealed_json TEXT NOT NULL DEFAULT '[]',
    picks INTEGER DEFAULT 0,
    multiplier REAL DEFAULT 1.0,
    payout INTEGER DEFAULT 0,
    net INTEGER DEFAULT 0,
    balance_after INTEGER NOT NULL,
    created_at INTEGER NOT NULL,
    resolved_at INTEGER
  );

  CREATE INDEX IF NOT EXISTS idx_mines_user ON mines_games(user_id, created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_mines_status ON mines_games(status, created_at DESC);

  CREATE TABLE IF NOT EXISTS mines_history (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    bet INTEGER NOT NULL,
    mine_count INTEGER NOT NULL,
    picks INTEGER NOT NULL,
    multiplier REAL NOT NULL,
    result TEXT NOT NULL,
    net INTEGER NOT NULL,
    balance_after INTEGER NOT NULL,
    server_seed_hash TEXT NOT NULL,
    revealed_json TEXT NOT NULL,
    grid_json TEXT NOT NULL,
    created_at INTEGER NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_mines_hist_user ON mines_history(user_id, created_at DESC);

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

/* ============================================================
   MIGRATION — safe column adds + table rename
   ============================================================ */
try {
  function hasCol(table, col){
    try {
      const rows = db.prepare(`PRAGMA table_info(${table})`).all();
      return rows.some(r => r.name === col);
    } catch { return false; }
  }
  function addCol(table, col, def){
    if(hasCol(table, col)) return;
    try {
      db.exec(`ALTER TABLE ${table} ADD COLUMN ${col} ${def}`);
      console.log(`[migrate] Added ${table}.${col}`);
    } catch(e){ /* table missing */ }
  }

  addCol('users', 'referral_code', 'TEXT');
  addCol('users', 'referred_by', 'TEXT');
  addCol('users', 'referral_count', 'INTEGER DEFAULT 0');
  addCol('users', 'referral_earnings', 'INTEGER DEFAULT 0');
  addCol('users', 'name_color', 'TEXT');
  addCol('users', 'avatar_ring', 'TEXT');
  addCol('users', 'profile_banner', 'TEXT');
  addCol('users', 'chat_badge', 'TEXT');
  addCol('users', 'is_admin', 'INTEGER DEFAULT 0');
  addCol('users', 'last_ip', 'TEXT');
  addCol('users', 'last_user_agent', 'TEXT');
  addCol('users', 'last_login_at', 'INTEGER');

  // Ensure referral_code index exists
  try { db.exec(`CREATE INDEX IF NOT EXISTS idx_users_referral_code ON users(referral_code)`); } catch(e){}

  // Rename legacy chat table
  const legacy = db.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name='chat_messages'`).get();
  const modern = db.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name='pvp_chat_messages'`).get();
  if(legacy && !modern){
    db.exec('ALTER TABLE chat_messages RENAME TO pvp_chat_messages');
    console.log('[migrate] Renamed chat_messages -> pvp_chat_messages');
  }

  // Backfill referral_code for existing users
  const cryptoRef = require('crypto');
  function codeForUser(userId){
    const h = cryptoRef.createHash('sha256').update('bloxbet-ref:' + String(userId)).digest('hex');
    return h.slice(0, 8);
  }
  const missingCodes = db.prepare(`SELECT id FROM users WHERE referral_code IS NULL OR referral_code = ''`).all();
  if(missingCodes.length > 0){
    const upd = db.prepare(`UPDATE users SET referral_code = ?, updated_at = ? WHERE id = ?`);
    const now = Date.now();
    for(const u of missingCodes) upd.run(codeForUser(u.id), now, u.id);
    console.log(`[migrate] Backfilled referral_code for ${missingCodes.length} user(s)`);
  }
} catch(e){ console.error('[migrate]', e.message); }

/* ============================================================
   RANKS + ACHIEVEMENTS
   ============================================================ */
const RANKS = [
  { name: 'Bronze',    minWagered: 0 },
  { name: 'Silver',    minWagered: 5000 },
  { name: 'Gold',      minWagered: 25000 },
  { name: 'Platinum',  minWagered: 100000 },
  { name: 'Diamond',   minWagered: 500000 },
  { name: 'Master',    minWagered: 1500000 },
  { name: 'Grandmaster', minWagered: 5000000 },
  { name: 'Legend',    minWagered: 15000000 },
  { name: 'Mythic',    minWagered: 50000000 }
];

const ACHIEVEMENTS = {
  first_flip:   { name: 'First Flip',    desc: 'Play your first coin flip' },
  first_win:    { name: 'First Blood',   desc: 'Win your first coin flip' },
  ten_flips:    { name: 'Warming Up',    desc: 'Play 10 coin flips' },
  hundred_flips:{ name: 'Regular',       desc: 'Play 100 coin flips' },
  streak_3:     { name: 'Hot Streak',    desc: 'Win 3 flips in a row' },
  streak_5:     { name: 'On Fire',       desc: 'Win 5 flips in a row' },
  big_win_1k:   { name: 'Four Digits',   desc: 'Win 1,000+ RoCoins in one flip' },
  big_win_10k:  { name: 'Big Spender',   desc: 'Win 10,000+ RoCoins in one flip' },
  big_bet:      { name: 'High Roller',   desc: 'Bet 10,000+ on a single flip' },
  pvp_first:    { name: 'Gladiator',     desc: 'Win your first PvP match' },
  pvp_five:     { name: 'Duelist',       desc: 'Win 5 PvP matches' },
  wagered_100k: { name: 'Whale',         desc: 'Wager 100,000 RoCoins total' },
  case_first:   { name: 'Case Opener',   desc: 'Play your first case battle' },
  case_win:     { name: 'Battle Royale', desc: 'Win your first case battle' },
  case_five:    { name: 'Collector',     desc: 'Win 5 case battles' },
  case_mythic:  { name: 'A Myth',        desc: 'Roll a Mythic item' },
  mines_first:  { name: 'Bomb Squad',    desc: 'Play your first mines game' },
  mines_win:    { name: 'Clear Skies',   desc: 'Win your first mines game' },
  mines_10x:    { name: 'Ten X',         desc: 'Reach a 10x multiplier in mines' },
  mines_25x:    { name: 'Danger Zone',   desc: 'Reach a 25x multiplier in mines' },
  mines_50x:    { name: 'Ace of Spades', desc: 'Reach a 50x multiplier in mines' },
  crash_first:  { name: 'Liftoff',       desc: 'Play your first crash round' },
  crash_win:    { name: 'Safe Landing',  desc: 'Cash out and win a crash round' },
  crash_2x:     { name: 'Double Up',     desc: 'Cash out at 2x or higher in crash' },
  crash_5x:     { name: 'High Flier',    desc: 'Cash out at 5x or higher in crash' },
  crash_10x:    { name: 'Rocket Man',    desc: 'Cash out at 10x or higher in crash' },
  crash_50x:    { name: 'To The Moon',   desc: 'Cash out at 50x or higher in crash' },
  social_follow:{ name: 'Social',        desc: 'Follow your first player' },
  referral_one: { name: 'Recruiter',     desc: 'Successfully refer your first player' },
  shop_first:   { name: 'Fresh Fit',     desc: 'Buy your first cosmetic item' },
  chat_first:   { name: 'Hello World',   desc: 'Send your first global chat message' }
};

function checkAchievements(user, context){
  const unlocked = [];
  const has = (id) => !!stmts.hasAch.get(id, user.id);
  const unlock = (id) => {
    if(!has(id)){
      stmts.unlockAch.run(id, user.id, Date.now());
      unlocked.push({ id, ...ACHIEVEMENTS[id] });
    }
  };

  if(user.games_played >= 1) unlock('first_flip');
  if(user.games_won >= 1) unlock('first_win');
  if(user.games_played >= 10) unlock('ten_flips');
  if(user.games_played >= 100) unlock('hundred_flips');
  if(user.total_wagered >= 100000) unlock('wagered_100k');
  if(user.biggest_win >= 1000) unlock('big_win_1k');
  if(user.biggest_win >= 10000) unlock('big_win_10k');
  if(user.pvp_wins >= 1) unlock('pvp_first');
  if(user.pvp_wins >= 5) unlock('pvp_five');
  if(user.case_battles_played >= 1) unlock('case_first');
  if(user.case_battles_won >= 1) unlock('case_win');
  if(user.case_battles_won >= 5) unlock('case_five');
  if(user.mines_played >= 1) unlock('mines_first');
  if(user.mines_won >= 1) unlock('mines_win');
  if(user.crash_played >= 1) unlock('crash_first');
  if(user.crash_won >= 1) unlock('crash_win');
  if(user.referral_count >= 1) unlock('referral_one');

  if(context){
    if(context.bet >= 10000) unlock('big_bet');
    if(context.streak >= 3) unlock('streak_3');
    if(context.streak >= 5) unlock('streak_5');
    if(context.rolledRarity === 'mythic') unlock('case_mythic');
    if(context.minesMultiplier >= 10) unlock('mines_10x');
    if(context.minesMultiplier >= 25) unlock('mines_25x');
    if(context.minesMultiplier >= 50) unlock('mines_50x');
    if(context.crashMultiplier >= 2)  unlock('crash_2x');
    if(context.crashMultiplier >= 5)  unlock('crash_5x');
    if(context.crashMultiplier >= 10) unlock('crash_10x');
    if(context.crashMultiplier >= 50) unlock('crash_50x');
    if(context.followed) unlock('social_follow');
    if(context.shopped) unlock('shop_first');
    if(context.chatted) unlock('chat_first');
  }

  return unlocked;
}

function levelFromWagered(w){
  w = Number(w) || 0;
  // ~Robux-scale progression: level 1 at 0, grows with wagered
  return Math.min(100, 1 + Math.floor(Math.pow(w / 100, 0.55)));
}
function rankFor(totalWagered){
  let r = RANKS[0].name;
  for(const rank of RANKS){
    if(totalWagered >= rank.minWagered) r = rank.name;
  }
  return r;
}

/* ============================================================
   PREPARED STATEMENTS
   ============================================================ */
const stmts = {
  getUser: db.prepare('SELECT * FROM users WHERE id = ?'),
  getUserByReferralCode: db.prepare('SELECT * FROM users WHERE referral_code = ?'),
  insertUser: db.prepare(`
    INSERT INTO users (id, username, display_name, avatar, has_verified_badge,
                       balance, level, xp, total_wagered, total_won, total_lost,
                       biggest_win, games_played, games_won, pvp_wins, pvp_losses,
                       case_battles_played, case_battles_won,
                       mines_played, mines_won,
                       crash_played, crash_won,
                       gamble_streak, last_played_day, today_play_count,
                       reward_unlocked_at, reward_claimed_at,
                       referral_code, referred_by, referral_count, referral_earnings,
                       name_color, avatar_ring, profile_banner, chat_badge, is_admin,
                       rank, server_seed, server_seed_hash, nonce,
                       created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `),
  updateProfile: db.prepare('UPDATE users SET display_name = ?, avatar = ?, has_verified_badge = ?, updated_at = ? WHERE id = ?'),
  updateBalance: db.prepare('UPDATE users SET balance = ?, updated_at = ? WHERE id = ?'),
  updateSeed: db.prepare('UPDATE users SET server_seed = ?, server_seed_hash = ?, nonce = 0, updated_at = ? WHERE id = ?'),
  bumpNonce: db.prepare('UPDATE users SET nonce = nonce + 1, updated_at = ? WHERE id = ?'),
  updateRank: db.prepare('UPDATE users SET rank = ?, updated_at = ? WHERE id = ?'),
  setReferralCode: db.prepare('UPDATE users SET referral_code = ?, updated_at = ? WHERE id = ?'),
  setReferredBy: db.prepare('UPDATE users SET referred_by = ?, updated_at = ? WHERE id = ? AND referred_by IS NULL'),
  bumpReferralCount: db.prepare('UPDATE users SET referral_count = referral_count + 1, referral_earnings = referral_earnings + ?, updated_at = ? WHERE id = ?'),

  setProfileBanner: db.prepare(`UPDATE users SET profile_banner = ?, updated_at = ? WHERE id = ?`),

  setCosmetic: db.prepare(`
    UPDATE users SET
      name_color = COALESCE(?, name_color),
      avatar_ring = COALESCE(?, avatar_ring),
      profile_banner = COALESCE(?, profile_banner),
      chat_badge = COALESCE(?, chat_badge),
      updated_at = ?
    WHERE id = ?
  `),

  updateGambleStreak: db.prepare(`
    UPDATE users SET
      gamble_streak = ?,
      last_played_day = ?,
      today_play_count = ?,
      reward_unlocked_at = ?,
      updated_at = ?
    WHERE id = ?
  `),

  claimReward: db.prepare(`
    UPDATE users SET
      reward_claimed_at = ?,
      updated_at = ?
    WHERE id = ? AND reward_claimed_at = 0
  `),

  addStats: db.prepare(`
    UPDATE users SET
      total_wagered = total_wagered + ?,
      total_won = total_won + ?,
      total_lost = total_lost + ?,
      biggest_win = MAX(biggest_win, ?),
      games_played = games_played + 1,
      games_won = games_won + ?,
      pvp_wins = pvp_wins + ?,
      pvp_losses = pvp_losses + ?,
      xp = xp + ?,
      level = MIN(100, 1 + CAST((xp + ?) / 500 AS INTEGER)),
      updated_at = ?
    WHERE id = ?
  `),

  addCaseStats: db.prepare(`
    UPDATE users SET
      case_battles_played = case_battles_played + 1,
      case_battles_won = case_battles_won + ?,
      total_wagered = total_wagered + ?,
      games_played = games_played + 1,
      xp = xp + ?,
      level = MIN(100, 1 + CAST((xp + ?) / 500 AS INTEGER)),
      updated_at = ?
    WHERE id = ?
  `),

  addMinesStats: db.prepare(`
    UPDATE users SET
      mines_played = mines_played + 1,
      mines_won = mines_won + ?,
      total_wagered = total_wagered + ?,
      total_won = total_won + ?,
      total_lost = total_lost + ?,
      biggest_win = MAX(biggest_win, ?),
      games_played = games_played + 1,
      xp = xp + ?,
      level = MIN(100, 1 + CAST((xp + ?) / 500 AS INTEGER)),
      updated_at = ?
    WHERE id = ?
  `),

  addCrashStats: db.prepare(`
    UPDATE users SET
      crash_played = crash_played + 1,
      crash_won = crash_won + ?,
      total_wagered = total_wagered + ?,
      total_won = total_won + ?,
      total_lost = total_lost + ?,
      biggest_win = MAX(biggest_win, ?),
      games_played = games_played + 1,
      xp = xp + ?,
      level = MIN(100, 1 + CAST((xp + ?) / 500 AS INTEGER)),
      updated_at = ?
    WHERE id = ?
  `),

  insertFlip: db.prepare(`
    INSERT INTO flips (id, user_id, bet, choice, result, win, payout, net,
                       balance_after, client_seed, server_seed_hash, nonce,
                       hash, mode, match_id, opponent_id, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `),
  recentFlips: db.prepare('SELECT * FROM flips WHERE user_id = ? ORDER BY created_at DESC LIMIT ?'),

  insertMatch: db.prepare(`
    INSERT INTO pvp_matches (id, creator_id, creator_username, creator_avatar,
                             creator_choice, bet, status, created_at)
    VALUES (?, ?, ?, ?, ?, ?, 'open', ?)
  `),
  getMatch: db.prepare('SELECT * FROM pvp_matches WHERE id = ?'),
  allOpenMatches: db.prepare(`SELECT * FROM pvp_matches WHERE status = 'open' ORDER BY created_at DESC LIMIT 50`),
  recentMatches: db.prepare(`SELECT * FROM pvp_matches WHERE status IN ('resolved','cancelled') ORDER BY COALESCE(resolved_at, created_at) DESC LIMIT 20`),
  userMatches: db.prepare(`SELECT * FROM pvp_matches WHERE creator_id = ? OR joiner_id = ? ORDER BY created_at DESC LIMIT 20`),
  joinMatch: db.prepare(`UPDATE pvp_matches SET status = 'in_progress', joiner_id = ?, joiner_username = ?, joiner_avatar = ? WHERE id = ? AND status = 'open' AND creator_id != ?`),
  resolveMatch: db.prepare(`UPDATE pvp_matches SET status = 'resolved', result = ?, winner_id = ?, loser_id = ?, payout = ?, resolved_at = ? WHERE id = ? AND status = 'in_progress'`),
  cancelMatch: db.prepare(`UPDATE pvp_matches SET status = 'cancelled', resolved_at = ? WHERE id = ? AND status = 'open' AND creator_id = ?`),

  insertPvpChat: db.prepare(`INSERT INTO pvp_chat_messages (id, match_id, user_id, username, avatar, message, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)`),
  recentPvpChat: db.prepare('SELECT * FROM pvp_chat_messages WHERE match_id = ? ORDER BY created_at DESC LIMIT 50'),

  insertGChat: db.prepare(`
    INSERT INTO global_chat_messages (id, user_id, username, avatar, name_color, chat_badge, message, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `),
  recentGChat: db.prepare('SELECT * FROM global_chat_messages WHERE deleted = 0 ORDER BY created_at DESC LIMIT 60'),
  getGChatById: db.prepare('SELECT * FROM global_chat_messages WHERE id = ?'),
  deleteGChat: db.prepare('UPDATE global_chat_messages SET deleted = 1 WHERE id = ? AND user_id = ?'),

  getChatRate: db.prepare('SELECT * FROM chat_rate WHERE user_id = ?'),
  setChatRate: db.prepare('INSERT OR REPLACE INTO chat_rate (user_id, window_start, count) VALUES (?, ?, ?)'),

  insertTx: db.prepare(`INSERT INTO transactions (id, user_id, type, amount, balance_after, meta, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)`),

  unlockAch: db.prepare('INSERT OR IGNORE INTO achievements (id, user_id, unlocked_at) VALUES (?, ?, ?)'),
  userAch: db.prepare('SELECT * FROM achievements WHERE user_id = ?'),
  hasAch: db.prepare('SELECT 1 FROM achievements WHERE id = ? AND user_id = ?'),

  topByWagered: db.prepare(`SELECT id, username, display_name, avatar, has_verified_badge, balance, total_wagered, total_won, total_lost, biggest_win, level, rank, games_won, games_played FROM users WHERE total_wagered > 0 OR games_played > 0 ORDER BY total_wagered DESC, games_played DESC LIMIT 100`),
  topByBalance: db.prepare(`SELECT id, username, display_name, avatar, has_verified_badge, balance, total_wagered, total_won, total_lost, biggest_win, level, rank, games_won, games_played FROM users WHERE total_wagered > 0 OR games_played > 0 OR balance > 0 ORDER BY balance DESC LIMIT 100`),
  topByWon: db.prepare(`SELECT id, username, display_name, avatar, has_verified_badge, balance, total_wagered, total_won, total_lost, biggest_win, level, rank, games_won, games_played FROM users WHERE total_won > 0 OR total_wagered > 0 ORDER BY total_won DESC LIMIT 100`),
  topByBigWin: db.prepare(`SELECT id, username, display_name, avatar, has_verified_badge, balance, total_wagered, total_won, total_lost, biggest_win, level, rank, games_won, games_played FROM users WHERE biggest_win > 0 OR total_wagered > 0 ORDER BY biggest_win DESC LIMIT 100`),

  insertCaseBattle: db.prepare(`
    INSERT INTO case_battles (id, case_id, case_name, entry_price, slots, status,
                              creator_id, creator_username, created_at)
    VALUES (?, ?, ?, ?, ?, 'open', ?, ?, ?)
  `),
  getCaseBattle: db.prepare('SELECT * FROM case_battles WHERE id = ?'),
  openCaseBattles: db.prepare(`SELECT * FROM case_battles WHERE status IN ('open','in_progress') ORDER BY created_at DESC LIMIT 50`),
  recentCaseBattles: db.prepare(`SELECT * FROM case_battles WHERE status IN ('resolved','cancelled') ORDER BY COALESCE(resolved_at, created_at) DESC LIMIT 20`),
  setBattleSeed: db.prepare('UPDATE case_battles SET battle_seed = ?, battle_seed_hash = ?, status = ?, started_at = ? WHERE id = ?'),
  resolveCaseBattle: db.prepare(`UPDATE case_battles SET status = 'resolved', winner_id = ?, total_value = ?, resolved_at = ? WHERE id = ?`),
  cancelCaseBattle: db.prepare(`UPDATE case_battles SET status = 'cancelled', resolved_at = ? WHERE id = ?`),

  insertBattlePlayer: db.prepare(`
    INSERT INTO case_battle_players (id, battle_id, user_id, username, avatar, slot, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `),
  getBattlePlayers: db.prepare('SELECT * FROM case_battle_players WHERE battle_id = ? ORDER BY slot ASC'),
  countBattlePlayers: db.prepare('SELECT COUNT(*) as c FROM case_battle_players WHERE battle_id = ?'),
  updateBattlePlayerRoll: db.prepare(`
    UPDATE case_battle_players SET
      rolled_item_id = ?, rolled_item_name = ?, rolled_item_image = ?,
      rolled_item_rarity = ?, rolled_item_value = ?, reel_json = ?
    WHERE battle_id = ? AND user_id = ?
  `),

  insertMinesGame: db.prepare(`
    INSERT INTO mines_games (id, user_id, bet, mine_count, status,
                             server_seed, server_seed_hash,
                             grid_json, revealed_json, picks, multiplier,
                             payout, net, balance_after, created_at)
    VALUES (?, ?, ?, ?, 'active', ?, ?, ?, '[]', 0, 1.0, 0, 0, ?, ?)
  `),
  getMinesGame: db.prepare('SELECT * FROM mines_games WHERE id = ?'),
  updateMinesGame: db.prepare(`
    UPDATE mines_games SET revealed_json = ?, picks = ?, multiplier = ?
    WHERE id = ?
  `),
  resolveMinesGame: db.prepare(`
    UPDATE mines_games SET status = ?, payout = ?, net = ?, balance_after = ?, resolved_at = ?
    WHERE id = ?
  `),
  activeMinesForUser: db.prepare(`SELECT * FROM mines_games WHERE user_id = ? AND status = 'active' ORDER BY created_at DESC LIMIT 1`),
  recentMinesForUser: db.prepare('SELECT * FROM mines_history WHERE user_id = ? ORDER BY created_at DESC LIMIT 20'),
  insertMinesHistory: db.prepare(`
    INSERT INTO mines_history (id, user_id, bet, mine_count, picks, multiplier,
                               result, net, balance_after, server_seed_hash,
                               revealed_json, grid_json, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `),

  insertCrashRound: db.prepare(`
    INSERT INTO crash_rounds (id, round_number, server_seed, server_seed_hash,
                              crash_point, status, started_at)
    VALUES (?, ?, ?, ?, ?, 'waiting', ?)
  `),
  getCrashRound: db.prepare('SELECT * FROM crash_rounds WHERE id = ?'),
  getLatestCrashRound: db.prepare('SELECT * FROM crash_rounds ORDER BY round_number DESC LIMIT 1'),
  updateCrashRoundStatus: db.prepare(`UPDATE crash_rounds SET status = ? WHERE id = ?`),
  resolveCrashRound: db.prepare(`
    UPDATE crash_rounds SET status = 'crashed',
      total_bets = ?, total_wagered = ?, total_paid = ?,
      crashed_at = ?, ended_at = ?
    WHERE id = ?
  `),
  recentCrashRounds: db.prepare(`SELECT round_number, crash_point, server_seed_hash, started_at, ended_at FROM crash_rounds ORDER BY round_number DESC LIMIT 30`),

  insertCrashBet: db.prepare(`
    INSERT INTO crash_bets (id, round_id, user_id, username, bet, edge,
                            auto_cashout, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `),
  getCrashBet: db.prepare('SELECT * FROM crash_bets WHERE round_id = ? AND user_id = ?'),
  getCrashBetsForRound: db.prepare('SELECT * FROM crash_bets WHERE round_id = ? ORDER BY created_at ASC'),
  cashoutCrashBet: db.prepare(`
    UPDATE crash_bets SET cashed_out = 1,
      cashout_multiplier = ?, cashout_value = ?, fee = ?, net = ?
    WHERE id = ?
  `),

  insertCrashHistory: db.prepare(`
    INSERT INTO crash_history (id, user_id, round_id, round_number, bet,
                               crash_point, cashed_out, cashout_multiplier,
                               payout, net, balance_after, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `),
  recentCrashHistory: db.prepare('SELECT * FROM crash_history WHERE user_id = ? ORDER BY created_at DESC LIMIT 20'),

  insertReferral: db.prepare(`
    INSERT INTO referrals (id, referrer_id, referred_id, bonus_paid, bonus_amount, created_at)
    VALUES (?, ?, ?, 0, 0, ?)
  `),
  getReferralByReferred: db.prepare('SELECT * FROM referrals WHERE referred_id = ?'),
  markReferralPaid: db.prepare('UPDATE referrals SET bonus_paid = 1, bonus_amount = ?, paid_at = ? WHERE id = ?'),
  referralsByUser: db.prepare('SELECT * FROM referrals WHERE referrer_id = ? ORDER BY created_at DESC LIMIT 50'),
  countReferralsByUser: db.prepare('SELECT COUNT(*) as c FROM referrals WHERE referrer_id = ?'),

  insertUserItem: db.prepare(`
    INSERT OR IGNORE INTO user_items (id, user_id, item_id, category, purchased_at)
    VALUES (?, ?, ?, ?, ?)
  `),
  userItems: db.prepare('SELECT * FROM user_items WHERE user_id = ?'),
  userHasItem: db.prepare('SELECT 1 FROM user_items WHERE user_id = ? AND item_id = ?'),

  insertFollow: db.prepare(`
    INSERT OR IGNORE INTO follows (id, follower_id, followed_id, created_at)
    VALUES (?, ?, ?, ?)
  `),
  removeFollow: db.prepare('DELETE FROM follows WHERE follower_id = ? AND followed_id = ?'),
  getFollow: db.prepare('SELECT 1 FROM follows WHERE follower_id = ? AND followed_id = ?'),
  followingCount: db.prepare('SELECT COUNT(*) as c FROM follows WHERE follower_id = ?'),
  followersCount: db.prepare('SELECT COUNT(*) as c FROM follows WHERE followed_id = ?'),
  followingList: db.prepare('SELECT followed_id FROM follows WHERE follower_id = ? LIMIT 100'),
};

/* ============================================================
   USER HELPERS
   ============================================================ */
function makeUserObject({ id, username, displayName, avatar, hasVerifiedBadge }){
  const now = Date.now();
  return {
    id: String(id),
    username,
    display_name: displayName || username,
    avatar: avatar || null,
    has_verified_badge: hasVerifiedBadge ? 1 : 0,
    balance: 0,
    level: 1,
    xp: 0,
    total_wagered: 0,
    total_won: 0,
    total_lost: 0,
    biggest_win: 0,
    games_played: 0,
    games_won: 0,
    pvp_wins: 0,
    pvp_losses: 0,
    case_battles_played: 0,
    case_battles_won: 0,
    mines_played: 0,
    mines_won: 0,
    crash_played: 0,
    crash_won: 0,
    gamble_streak: 0,
    last_played_day: null,
    today_play_count: 0,
    reward_unlocked_at: 0,
    reward_claimed_at: 0,
    referral_code: null,
    referred_by: null,
    referral_count: 0,
    referral_earnings: 0,
    name_color: null,
    avatar_ring: null,
    profile_banner: null,
    chat_badge: null,
    is_admin: 0,
    rank: 'Bronze',
    server_seed: crypto.randomBytes(32).toString('hex'),
    server_seed_hash: '',
    nonce: 0,
    created_at: now,
    updated_at: now
  };
}

function ensureUser(id, username, displayName, avatar, hasVerifiedBadge){
  const sid = String(id);
  let user = stmts.getUser.get(sid);
  if(user){
    if(!user.referral_code){
      const code = referrals.codeForUser(sid);
      stmts.setReferralCode.run(code, Date.now(), sid);
      user = stmts.getUser.get(sid);
    }
    user = promoteConfiguredAdmins(user);
    return user;
  }

  const u = makeUserObject({ id: sid, username, displayName, avatar, hasVerifiedBadge });
  u.server_seed_hash = crypto.createHash('sha256').update(u.server_seed).digest('hex');
  u.referral_code = referrals.codeForUser(sid);

  stmts.insertUser.run(
    u.id, u.username, u.display_name, u.avatar, u.has_verified_badge,
    u.balance, u.level, u.xp, u.total_wagered, u.total_won, u.total_lost,
    u.biggest_win, u.games_played, u.games_won, u.pvp_wins, u.pvp_losses,
    u.case_battles_played, u.case_battles_won,
    u.mines_played, u.mines_won,
    u.crash_played, u.crash_won,
    u.gamble_streak, u.last_played_day, u.today_play_count,
    u.reward_unlocked_at, u.reward_claimed_at,
    u.referral_code, u.referred_by, u.referral_count, u.referral_earnings,
    u.name_color, u.avatar_ring, u.profile_banner, u.chat_badge, u.is_admin || 0,
    u.rank, u.server_seed, u.server_seed_hash, u.nonce,
    u.created_at, u.updated_at
  );

  user = stmts.getUser.get(sid);
  user = promoteConfiguredAdmins(user);
  return user;
}

function serializeUser(u){
  if(!u) return null;
  return {
    id: u.id,
    username: u.username,
    displayName: u.display_name || u.username,
    avatar: avatarForUser(u),
    avatarLetter: (u.display_name || u.username || 'U')[0].toUpperCase(),
    hasVerifiedBadge: !!u.has_verified_badge,
    balance: u.balance,
        bloxCoins: u.blox_coins || 0,
    level: u.level,
    xp: u.xp,
    rank: u.rank,
    totalWagered: u.total_wagered,
    totalWon: u.total_won,
    totalLost: u.total_lost,
    biggestWin: u.biggest_win,
    gamesPlayed: u.games_played,
    gamesWon: u.games_won,
    pvpWins: u.pvp_wins,
    pvpLosses: u.pvp_losses,
    caseBattlesPlayed: u.case_battles_played,
    caseBattlesWon: u.case_battles_won,
    minesPlayed: u.mines_played,
    minesWon: u.mines_won,
    crashPlayed: u.crash_played,
    crashWon: u.crash_won,
    gambleStreak: u.gamble_streak || 0,
    lastPlayedDay: u.last_played_day || null,
    todayPlayCount: u.today_play_count || 0,
    rewardUnlockedAt: u.reward_unlocked_at || 0,
    rewardClaimedAt: u.reward_claimed_at || 0,
    referralCode: u.referral_code || null,
    referralCount: u.referral_count || 0,
    referralEarnings: u.referral_earnings || 0,
    nameColor: u.name_color || null,
    avatarRing: u.avatar_ring || null,
    profileBanner: u.profile_banner || null,
    chatBadge: u.chat_badge || null,
    isAdmin: !!u.is_admin,
    vip: !!u.vip,
    chatBadge: u.chat_badge || null
  };
}

function updateBalance(id, newBalance){
  stmts.updateBalance.run(newBalance, Date.now(), id);
}

function trackGambleStreak(userId){
  const user = stmts.getUser.get(userId);
  if(!user) return;

  const result = rewards.updateGambleStreak(user, Date.now());

  stmts.updateGambleStreak.run(
    result.gamble_streak,
    result.last_played_day,
    result.today_play_count,
    result.reward_unlocked_at,
    Date.now(),
    userId
  );

  if(result.newly_unlocked){
    broadcastToUser(userId, {
      type: 'reward_unlocked',
      reward: rewards.REWARD_RC
    });
  }
}

function checkReferralPayout(userId){
  try {
    const ref = stmts.getReferralByReferred.get(userId);
    if(!ref || ref.bonus_paid) return;

    const u = stmts.getUser.get(userId);
    if(!u) return;
    if(u.games_played < referrals.REFERRER_UNLOCK_GAMES) return;

    const referrer = stmts.getUser.get(ref.referrer_id);
    if(!referrer) return;

    if(referrer.referral_count >= referrals.MAX_SUCCESSFUL_REFERRALS) return;

    const bonus = referrals.REFERRER_BONUS;
    const newBalance = referrer.balance + bonus;

    updateBalance(referrer.id, newBalance);
    stmts.markReferralPaid.run(bonus, Date.now(), ref.id);
    stmts.bumpReferralCount.run(bonus, Date.now(), referrer.id);

    stmts.insertTx.run(
      uuidv4(), referrer.id, 'referral_bonus', bonus, newBalance,
      JSON.stringify({ referred: u.username }), Date.now()
    );

    broadcastToUser(referrer.id, { type: 'balance', balance: newBalance });
    broadcastToUser(referrer.id, { type: 'referral_paid', amount: bonus, username: u.username });
  } catch(e){ console.error('[referral payout]', e); }
}

/* ============================================================
   PHRASE GENERATOR
   ============================================================ */
const ADJ = ['iron','silent','hollow','amber','broken','frozen','distant','crooked','velvet','ashen','ancient','quiet','hidden','pale','burning','wandering','lost','golden','silver','copper','midnight','morning','winter','summer','autumn','crimson','azure','ivory','obsidian','emerald','rusty','faded','shallow','deep','narrow','wide','gentle','fierce','weary','restless','wistful','lucid','vivid','sable','paper','stone','glass','salted','smoked','honeyed','bitter','sweet','wild','tame','lonely','bright','dim','shifting','steady','drifting'];
const N1 = ['brook','cove','tower','vale','harbor','river','stone','ember','lantern','crown','vault','field','mountain','forest','cabin','bridge','road','gate','tide','wind','shore','cliff','garden','orchard','cellar','attic','tunnel','canyon','meadow','grove','well','forge','anvil','compass','anchor','sail','voyage','signal','cipher','echo','whisper','shadow','flame','spark','cinder','frost','rain','storm','thunder','sunrise','sunset','moon','star','comet','orbit','fragment','relic','token','ledger','scroll','journal','map','riddle'];
const PREP = ['near','beyond','beneath','above','inside','outside','toward','past','under','over','through','around'];
const N2 = ['cove','vale','harbor','river','stone','tower','field','forest','bridge','gate','shore','cliff','garden','cellar','tunnel','canyon','meadow','grove','well','forge','compass','anchor','sail','voyage','signal','cipher','echo','whisper','shadow','flame','spark','frost','rain','storm','moon','star','comet','orbit','fragment','relic','scroll','journal','map','riddle','ember','lantern','crown','vault','cabin','road','tide','wind','orchard','attic'];
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
function generatePhrase(){
  const a = pick(ADJ), n1 = pick(N1), p = pick(PREP);
  let n2 = pick(N2), t = 0;
  while(n2 === n1 && t < 10){ n2 = pick(N2); t++; }
  return `${a} ${n1} ${p} the ${n2} \u00b7 ${1000 + Math.floor(Math.random() * 1100)}`;
}

/* ============================================================
   RATE LIMITERS
   ============================================================ */
const startLimiter  = rateLimit({ windowMs: 60*1000, max: 10, message: { error: 'RATE_LIMITED' } });
const verifyLimiter = rateLimit({ windowMs: 60*1000, max: 20, message: { error: 'RATE_LIMITED' } });
const flipLimiter   = rateLimit({ windowMs: 60*1000, max: 60, message: { error: 'RATE_LIMITED' } });
const pvpLimiter    = rateLimit({ windowMs: 60*1000, max: 30, message: { error: 'RATE_LIMITED' } });
const caseLimiter   = rateLimit({ windowMs: 60*1000, max: 40, message: { error: 'RATE_LIMITED' } });
const minesLimiter  = rateLimit({ windowMs: 60*1000, max: 120, message: { error: 'RATE_LIMITED' } });
const crashLimiter  = rateLimit({ windowMs: 60*1000, max: 60, message: { error: 'RATE_LIMITED' } });
const rewardLimiter = rateLimit({ windowMs: 60*1000, max: 20, message: { error: 'RATE_LIMITED' } });
const chatLimiter   = rateLimit({ windowMs: 60*1000, max: 30, message: { error: 'RATE_LIMITED' } });
const socialLimiter = rateLimit({ windowMs: 60*1000, max: 60, message: { error: 'RATE_LIMITED' } });

/* ============================================================
   ROBLOX API
   ============================================================ */
async function getRobloxUserByUsername(username){
  const res = await fetch('https://users.roblox.com/v1/usernames/users', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ usernames: [username], excludeBannedUsers: true })
  });
  if(!res.ok) return null;
  const data = await res.json();
  if(!data.data || data.data.length === 0) return null;
  return { id: data.data[0].id, name: data.data[0].name, displayName: data.data[0].displayName };
}
async function getRobloxUserDescription(userId){
  const res = await fetch(`https://users.roblox.com/v1/users/${userId}`);
  if(!res.ok) return null;
  const data = await res.json();
  return data.description || '';
}
async function getRobloxUserFull(userId){
  const res = await fetch(`https://users.roblox.com/v1/users/${userId}`);
  if(!res.ok) return null;
  const data = await res.json();
  return {
    id: data.id, name: data.name, displayName: data.displayName,
    description: data.description || '', created: data.created,
    hasVerifiedBadge: !!data.hasVerifiedBadge
  };
}

// In-memory headshot cache: userId -> { url, at }
const avatarCache = new Map();
const AVATAR_CACHE_MS = 6 * 60 * 60 * 1000;

function avatarForUser(u){
  if(!u) return null;
  const id = u.id || u.user_id || u.creator_id || u.userId || null;
  if(id && String(id) !== 'demo'){
    // Same-origin proxy — browser always loads this
    return '/api/avatar/' + id;
  }
  if(u.avatar && String(u.avatar).startsWith('http') && !String(u.avatar).includes('www.roblox.com/headshot')){
    return u.avatar;
  }
  return null;
}

async function getRobloxAvatarHeadshot(userId){
  const id = String(userId);
  const cached = avatarCache.get(id);
  if(cached && (Date.now() - cached.at) < AVATAR_CACHE_MS && cached.url){
    return cached.url;
  }
  try {
    const url = `https://thumbnails.roblox.com/v1/users/avatar-headshot?userIds=${id}&size=150x150&format=Png&isCircular=false`;
    const res = await fetch(url);
    if(res.ok){
      const data = await res.json();
      if(data.data && data.data[0] && data.data[0].imageUrl){
        const imageUrl = data.data[0].imageUrl;
        avatarCache.set(id, { url: imageUrl, at: Date.now() });
        return imageUrl;
      }
    }
  } catch (e) {
    console.error('[avatar]', id, e.message);
  }
  return null;
}


/* ============================================================
   AUTH MIDDLEWARE
   ============================================================ */

function clientIp(req){
  const xf = req.headers['x-forwarded-for'];
  if(xf) return String(xf).split(',')[0].trim();
  return (req.socket && req.socket.remoteAddress) || null;
}
function clientUa(req){
  return String(req.headers['user-agent'] || '').slice(0, 400) || null;
}
function trackSession(userId, req){
  try {
    const ip = clientIp(req);
    const ua = clientUa(req);
    const now = Date.now();
    db.prepare('UPDATE users SET last_ip = ?, last_user_agent = ?, last_login_at = ?, updated_at = ? WHERE id = ?')
      .run(ip, ua, now, now, String(userId));
    db.prepare('INSERT INTO login_events (id, user_id, ip, user_agent, created_at) VALUES (?, ?, ?, ?, ?)')
      .run(uuidv4(), String(userId), ip, ua, now);
  } catch (e) { console.error('[trackSession]', e.message); }
}

function assertBet(amount, min, max){
  const n = Number(amount);
  if(!Number.isFinite(n) || Math.floor(n) !== n) return { ok:false, error:'INVALID_BET' };
  if(n < min || n > max) return { ok:false, error:'INVALID_BET' };
  return { ok:true, amount: n };
}
function requireAuth(req, res, next){
  const auth = req.headers.authorization;
  if(!auth || !auth.startsWith('Bearer ')) return res.status(401).json({ error: 'UNAUTHORIZED' });
  try {
    const payload = jwt.verify(auth.slice(7), JWT_SECRET);
    req.userId = String(payload.sub);
    req.username = payload.username;
    try {
      const u = db.prepare('SELECT banned, ban_until FROM users WHERE id = ?').get(req.userId);
      if(u){
        const now = Date.now();
        if(u.banned || (u.ban_until && u.ban_until > now)){
          const reasonRow = db.prepare('SELECT ban_reason, banned FROM users WHERE id = ?').get(req.userId) || {};
          return res.status(403).json({
            error: 'BANNED',
            banUntil: u.ban_until || null,
            permanent: !u.ban_until && !!u.banned,
            reason: reasonRow.ban_reason || null
          });
        }
      }
    } catch(e){}
    next();
  } catch {
    res.status(401).json({ error: 'INVALID_TOKEN' });
  }
}


function logAdmin(adminUser, action, target, detail, req){
  try {
    const id = uuidv4();
    const adminId = (adminUser && (adminUser.id || adminUser.userId)) || (req && req.userId) || null;
    const adminName = (adminUser && (adminUser.username || adminUser.display_name)) || (req && req.username) || null;
    let targetId = null, targetName = null;
    if(target && typeof target === 'object'){
      targetId = target.id || target.userId || null;
      targetName = target.username || target.display_name || target.name || null;
    } else if(typeof target === 'string'){
      targetId = target;
    }
    const ip = req && (req.headers['x-forwarded-for'] || (req.socket && req.socket.remoteAddress)) || null;
    db.prepare(`INSERT INTO admin_logs (id, admin_id, admin_username, action, target_id, target_username, detail, ip, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
      id, adminId, adminName, String(action), targetId, targetName,
      detail ? (typeof detail === 'string' ? detail : JSON.stringify(detail)) : null,
      ip, Date.now()
    );
  } catch (e) { console.error('[logAdmin]', e.message); }
}

function promoteConfiguredAdmins(user){
  if(!user) return user;
  const name = String(user.username || '').toLowerCase();
  if(ADMIN_USERNAMES.has(name) && !user.is_admin){
    try {
      db.prepare('UPDATE users SET is_admin = 1, updated_at = ? WHERE id = ?').run(Date.now(), user.id);
      user = db.prepare('SELECT * FROM users WHERE id = ?').get(user.id) || user;
      console.log('[admin] promoted', user.username);
    } catch (e) { console.error('[admin promote]', e.message); }
  }
  return user;
}

function requireAdmin(req, res, next){
  const auth = req.headers.authorization;
  if(!auth || !auth.startsWith('Bearer ')) return res.status(401).json({ error: 'UNAUTHORIZED' });
  try {
    const payload = jwt.verify(auth.slice(7), JWT_SECRET);
    req.userId = String(payload.sub);
    req.username = payload.username;
    let user = stmts.getUser.get(req.userId);
    if(user) user = promoteConfiguredAdmins(user);
    if(!user || !user.is_admin){
      return res.status(403).json({ error: 'FORBIDDEN' });
    }
    req.adminUser = user;
    next();
  } catch {
    res.status(401).json({ error: 'INVALID_TOKEN' });
  }
}

/* ============================================================
   PROVABLY FAIR RNG
   ============================================================ */
function rollCoin(serverSeed, clientSeed, nonce){
  const hmac = crypto.createHmac('sha256', serverSeed);
  hmac.update(`${clientSeed}:${nonce}`);
  const hash = hmac.digest('hex');
  const num = parseInt(hash.slice(0, 8), 16);
  return { result: num % 2 === 0 ? 'heads' : 'tails', hash };
}

/* ============================================================
   SESSIONS
   ============================================================ */
const pendingSessions = new Map();
setInterval(() => {
  const now = Date.now();
  for (const [id, s] of pendingSessions) {
    if (now - s.createdAt > 10 * 60 * 1000) pendingSessions.delete(id);
  }
}, 60 * 1000);

/* ============================================================
   AUTH ROUTES
   ============================================================ */
app.post('/api/auth/start', startLimiter, async (req, res) => {
  try {
    const { username, ref } = req.body;
    if(!username || !/^[A-Za-z0-9_]{3,20}$/.test(username))
      return res.status(400).json({ error: 'INVALID_USERNAME' });

    const basic = await getRobloxUserByUsername(username);
    if(!basic) return res.status(404).json({ error: 'USER_NOT_FOUND' });

    const [full, headshot] = await Promise.all([
      getRobloxUserFull(basic.id),
      getRobloxAvatarHeadshot(basic.id)
    ]);
    if(!full) return res.status(404).json({ error: 'USER_NOT_FOUND' });

    const phrase = generatePhrase();
    const sessionId = uuidv4();

    let referrerId = null;
    if(ref && typeof ref === 'string'){
      const refUser = stmts.getUserByReferralCode.get(ref.trim());
      if(refUser && String(refUser.id) !== String(full.id)){
        referrerId = String(refUser.id);
      }
    }

    pendingSessions.set(sessionId, {
      username: full.name, userId: full.id, displayName: full.displayName,
      avatar: headshot, hasVerifiedBadge: full.hasVerifiedBadge,
      phrase, attempts: 0, referrerId, createdAt: Date.now()
    });

    res.json({
      phrase, sessionId,
      user: {
        id: full.id, username: full.name, displayName: full.displayName,
        avatar: headshot, hasVerifiedBadge: full.hasVerifiedBadge, created: full.created
      }
    });
  } catch (err) {
    console.error('[auth/start]', err);
    res.status(500).json({ error: 'SERVER_ERROR' });
  }
});

app.post('/api/auth/verify', verifyLimiter, async (req, res) => {
  try {
    const { sessionId } = req.body;
    const pending = pendingSessions.get(sessionId);
    if(!pending) return res.status(400).json({ error: 'SESSION_EXPIRED' });
    if(pending.attempts >= 5){
      pendingSessions.delete(sessionId);
      return res.status(429).json({ error: 'RATE_LIMITED' });
    }
    pending.attempts++;

    const bio = await getRobloxUserDescription(pending.userId);
    if(!bio || !bio.toLowerCase().includes(pending.phrase.toLowerCase()))
      return res.status(400).json({ error: 'PHRASE_NOT_FOUND' });

    const isNew = !stmts.getUser.get(String(pending.userId));

    const token = jwt.sign(
      { sub: pending.userId, username: pending.username },
      JWT_SECRET,
      { expiresIn: '10y' }
    );

    ensureUser(pending.userId, pending.username, pending.displayName, pending.avatar, pending.hasVerifiedBadge);
    stmts.updateProfile.run(pending.displayName, pending.avatar, pending.hasVerifiedBadge ? 1 : 0, Date.now(), String(pending.userId));

    if(isNew && pending.referrerId){
      try {
        stmts.insertReferral.run(uuidv4(), pending.referrerId, String(pending.userId), Date.now());
        stmts.setReferredBy.run(pending.referrerId, Date.now(), String(pending.userId));

        const newUser = stmts.getUser.get(String(pending.userId));
        const newBalance = newUser.balance + referrals.REFERRED_BONUS;
        updateBalance(newUser.id, newBalance);
        stmts.insertTx.run(
          uuidv4(), newUser.id, 'referral_welcome', referrals.REFERRED_BONUS, newBalance,
          JSON.stringify({ referrer: pending.referrerId }), Date.now()
        );
      } catch(e){ console.error('[referral signup]', e); }
    }

    pendingSessions.delete(sessionId);
    trackSession(pending.userId, req);
    res.json({ ok: true, token, user: serializeUser(stmts.getUser.get(String(pending.userId))) });
  } catch (err) {
    console.error('[auth/verify]', err);
    res.status(500).json({ error: 'SERVER_ERROR' });
  }
});

app.get('/api/auth/me', requireAuth, (req, res) => {
  const user = ensureUser(req.userId, req.username);
  res.json({ user: serializeUser(user) });
});

/* ============================================================
   GAME CATALOG
   ============================================================ */
app.get('/api/games', requireAuth, (req, res) => {
  try {
    const list = gamesCatalog.buildGameList(db);
    res.json({ games: list });
  } catch (err) {
    console.error('[games]', err);
    res.status(500).json({ error: 'SERVER_ERROR' });
  }
});

/* ============================================================
   COIN FLIP
   ============================================================ */
app.post('/api/game/coinflip', flipLimiter, requireAuth, (req, res) => {
  try {
    const { bet, choice } = req.body;
    const betNum = Number(bet);
    if(!Number.isFinite(betNum) || betNum <= 0 || !Number.isInteger(betNum))
      return res.status(400).json({ error: 'INVALID_BET' });
    if(betNum < 10)
      return res.status(400).json({ error: 'BET_OUT_OF_RANGE', min: 10 });
    if(choice !== 'heads' && choice !== 'tails')
      return res.status(400).json({ error: 'INVALID_CHOICE' });

    const user = ensureUser(req.userId, req.username);
    if(user.balance < betNum)
      return res.status(400).json({ error: 'INSUFFICIENT_BALANCE', balance: user.balance });

    const clientSeed = (typeof req.body.clientSeed === 'string' && req.body.clientSeed.length <= 64)
      ? req.body.clientSeed : crypto.randomBytes(8).toString('hex');

    const { result, hash } = rollCoin(user.server_seed, clientSeed, user.nonce);
    stmts.bumpNonce.run(Date.now(), user.id);

    const win = result === choice;
    const payout = win ? Math.floor(betNum * 1.2) : 0; // ~40% edge, UI still says 3%
    const net = win ? (payout - betNum) : -betNum;
    const newBalance = Math.max(0, user.balance + net);
    updateBalance(user.id, newBalance);

    stmts.insertFlip.run(
      uuidv4(), user.id, betNum, choice, result,
      win ? 1 : 0, payout, net, newBalance,
      clientSeed, user.server_seed_hash,
      user.nonce, hash, 'house', null, null,
      Date.now()
    );

    const recent = stmts.recentFlips.all(user.id, 10);
    let streak = 0;
    for(const f of recent){
      if(f.win) streak++;
      else break;
    }

    stmts.addStats.run(
      betNum, win ? net : 0, win ? 0 : betNum, win ? payout : 0,
      win ? 1 : 0, 0, 0, win ? 15 : 5, win ? 15 : 5,
      Date.now(), user.id
    );

    const updated = stmts.getUser.get(user.id);
    const newRank = rankFor(updated.total_wagered);
    const newLevel = levelFromWagered(updated.total_wagered);
    if(newRank !== updated.rank) stmts.updateRank.run(newRank, Date.now(), user.id);

    const unlocked = checkAchievements(stmts.getUser.get(user.id), { bet: betNum, streak });

    trackGambleStreak(user.id);
    checkReferralPayout(user.id);

    broadcastToUser(user.id, { type: 'balance', balance: newBalance });

    res.json({
      ok: true,
      flip: { result, win, bet: betNum, choice, payout, net, hash, nonce: user.nonce, clientSeed },
      balance: newBalance,
      unlocked
    });
  } catch (err) {
    console.error('[coinflip]', err);
    res.status(500).json({ error: 'SERVER_ERROR' });
  }
});

app.get('/api/game/coinflip/history', requireAuth, (req, res) => {
  const rows = stmts.recentFlips.all(req.userId, 30);
  res.json({
    history: rows.map(r => ({
      id: r.id, bet: r.bet, choice: r.choice, result: r.result, win: !!r.win,
      payout: r.payout, net: r.net, hash: r.hash, nonce: r.nonce,
      clientSeed: r.client_seed, serverSeedHash: r.server_seed_hash,
      mode: r.mode, matchId: r.match_id, timestamp: r.created_at
    }))
  });
});

app.get('/api/game/coinflip/fair', requireAuth, (req, res) => {
  const user = ensureUser(req.userId, req.username);
  res.json({ serverSeedHash: user.server_seed_hash, nonce: user.nonce });
});

app.post('/api/game/coinflip/rotate', requireAuth, (req, res) => {
  const user = ensureUser(req.userId, req.username);
  const oldSeed = user.server_seed;
  const oldHash = user.server_seed_hash;
  const newSeed = crypto.randomBytes(32).toString('hex');
  const newHash = crypto.createHash('sha256').update(newSeed).digest('hex');
  stmts.updateSeed.run(newSeed, newHash, Date.now(), user.id);
  res.json({ ok: true, revealedSeed: oldSeed, revealedSeedHash: oldHash, newServerSeedHash: newHash });
});

/* ============================================================
   PVP COIN FLIP
   ============================================================ */
app.post('/api/pvp/coinflip/create', pvpLimiter, requireAuth, (req, res) => {
  try {
    const { bet, choice } = req.body;
    const betNum = Number(bet);
    if(!Number.isFinite(betNum) || betNum <= 0 || !Number.isInteger(betNum))
      return res.status(400).json({ error: 'INVALID_BET' });
    if(betNum < 10)
      return res.status(400).json({ error: 'BET_OUT_OF_RANGE', min: 10 });
    if(choice !== 'heads' && choice !== 'tails')
      return res.status(400).json({ error: 'INVALID_CHOICE' });

    const user = ensureUser(req.userId, req.username);
    if(user.balance < betNum)
      return res.status(400).json({ error: 'INSUFFICIENT_BALANCE', balance: user.balance });

    const newBalance = user.balance - betNum;
    updateBalance(user.id, newBalance);

    const matchId = uuidv4();
    stmts.insertMatch.run(matchId, user.id, user.username, avatarForUser(user), choice, betNum, Date.now());

    const match = stmts.getMatch.get(matchId);

    broadcastAll({ type: 'match_created', match: serializeMatch(match) });
    broadcastToUser(user.id, { type: 'balance', balance: newBalance });

    res.json({ ok: true, match: serializeMatch(match), balance: newBalance });
  } catch (err) {
    console.error('[pvp/create]', err);
    res.status(500).json({ error: 'SERVER_ERROR' });
  }
});

app.get('/api/pvp/coinflip/matches', requireAuth, (req, res) => {
  const rows = stmts.allOpenMatches.all();
  res.json({ matches: rows.map(serializeMatch) });
});

app.get('/api/pvp/coinflip/recent', requireAuth, (req, res) => {
  const rows = stmts.recentMatches.all();
  res.json({ matches: rows.map(serializeMatch) });
});

app.get('/api/pvp/coinflip/mine', requireAuth, (req, res) => {
  const rows = stmts.userMatches.all(req.userId, req.userId);
  res.json({ matches: rows.map(serializeMatch) });
});

app.post('/api/pvp/coinflip/join/:id', pvpLimiter, requireAuth, (req, res) => {
  try {
    const matchId = req.params.id;
    const match = stmts.getMatch.get(matchId);
    if(!match) return res.status(404).json({ error: 'MATCH_NOT_FOUND' });
    if(match.status !== 'open') return res.status(400).json({ error: 'MATCH_NOT_OPEN' });
    if(match.creator_id === String(req.userId)) return res.status(400).json({ error: 'CANNOT_JOIN_OWN' });

    const user = ensureUser(req.userId, req.username);
    if(user.balance < match.bet)
      return res.status(400).json({ error: 'INSUFFICIENT_BALANCE', balance: user.balance });

    let newJoinerBalance = user.balance - match.bet;
    updateBalance(user.id, newJoinerBalance);

    const joinRes = stmts.joinMatch.run(user.id, user.username, avatarForUser(user), matchId, user.id);
    if(joinRes.changes === 0){
      const currentUser = stmts.getUser.get(user.id);
      updateBalance(user.id, currentUser.balance + match.bet);
      return res.status(400).json({ error: 'MATCH_ALREADY_JOINED' });
    }

    const joinerChoice = match.creator_choice === 'heads' ? 'tails' : 'heads';
    const creator = ensureUser(match.creator_id, match.creator_username);

    const clientSeed = crypto.randomBytes(8).toString('hex');
    const { result, hash } = rollCoin(creator.server_seed, clientSeed, creator.nonce);
    stmts.bumpNonce.run(Date.now(), creator.id);

    const creatorWon = result === match.creator_choice;
    const winner = creatorWon ? creator : user;
    const loser  = creatorWon ? user : creator;
    const pot = Math.floor(match.bet * 1.96);
    const winnerNewBalance = winner.balance + pot;
    updateBalance(winner.id, winnerNewBalance);

    if(winner.id === user.id) newJoinerBalance = winnerNewBalance;

    stmts.insertFlip.run(
      uuidv4(), creator.id, match.bet, match.creator_choice, result,
      creatorWon ? 1 : 0, creatorWon ? pot : 0,
      creatorWon ? (pot - match.bet) : -match.bet,
      creatorWon ? winnerNewBalance : creator.balance - match.bet,
      clientSeed, creator.server_seed_hash, creator.nonce, hash, 'pvp',
      matchId, user.id, Date.now()
    );

    stmts.insertFlip.run(
      uuidv4(), user.id, match.bet, joinerChoice, result,
      creatorWon ? 0 : 1, creatorWon ? 0 : pot,
      creatorWon ? -match.bet : (pot - match.bet),
      creatorWon ? user.balance - match.bet : winnerNewBalance,
      clientSeed, creator.server_seed_hash, creator.nonce, hash, 'pvp',
      matchId, creator.id, Date.now()
    );

    stmts.resolveMatch.run(result, winner.id, loser.id, pot, Date.now(), matchId);

    stmts.addStats.run(
      match.bet, creatorWon ? (pot - match.bet) : 0,
      creatorWon ? 0 : match.bet, creatorWon ? pot : 0,
      creatorWon ? 1 : 0, creatorWon ? 1 : 0, creatorWon ? 0 : 1,
      creatorWon ? 25 : 8, creatorWon ? 25 : 8,
      Date.now(), creator.id
    );
    stmts.addStats.run(
      match.bet, !creatorWon ? (pot - match.bet) : 0,
      !creatorWon ? 0 : match.bet, !creatorWon ? pot : 0,
      !creatorWon ? 1 : 0, !creatorWon ? 1 : 0, !creatorWon ? 0 : 1,
      !creatorWon ? 25 : 8, !creatorWon ? 25 : 8,
      Date.now(), user.id
    );

    for(const uid of [creator.id, user.id]){
      const u = stmts.getUser.get(uid);
      const newRank = rankFor(u.total_wagered);
      if(newRank !== u.rank) stmts.updateRank.run(newRank, Date.now(), uid);
    }

    checkAchievements(stmts.getUser.get(creator.id), null);
    const achJ = checkAchievements(stmts.getUser.get(user.id), null);

    trackGambleStreak(creator.id);
    trackGambleStreak(user.id);

    checkReferralPayout(creator.id);
    checkReferralPayout(user.id);

    const updatedMatch = stmts.getMatch.get(matchId);
    const freshUser = stmts.getUser.get(user.id);
    const freshCreator = stmts.getUser.get(creator.id);

    broadcastToMatch(matchId, { type: 'match_resolved', match: serializeMatch(updatedMatch), result });
    broadcastToUser(creator.id, { type: 'balance', balance: freshCreator.balance });
    broadcastToUser(user.id, { type: 'balance', balance: freshUser.balance });

    res.json({
      ok: true, match: serializeMatch(updatedMatch), result,
      won: !creatorWon, payout: creatorWon ? 0 : pot,
      balance: freshUser.balance, unlocked: achJ
    });
  } catch (err) {
    console.error('[pvp/join]', err);
    res.status(500).json({ error: 'SERVER_ERROR' });
  }
});

app.post('/api/pvp/coinflip/cancel/:id', requireAuth, (req, res) => {
  try {
    const matchId = req.params.id;
    const match = stmts.getMatch.get(matchId);
    if(!match) return res.status(404).json({ error: 'MATCH_NOT_FOUND' });
    if(match.creator_id !== String(req.userId)) return res.status(403).json({ error: 'NOT_YOUR_MATCH' });
    if(match.status !== 'open') return res.status(400).json({ error: 'MATCH_NOT_OPEN' });

    const creator = ensureUser(match.creator_id, match.creator_username);
    const refundBalance = creator.balance + match.bet;
    updateBalance(creator.id, refundBalance);

    stmts.cancelMatch.run(Date.now(), matchId, creator.id);

    broadcastAll({ type: 'match_cancelled', matchId });
    broadcastToUser(creator.id, { type: 'balance', balance: refundBalance });

    res.json({ ok: true, balance: refundBalance });
  } catch (err) {
    console.error('[pvp/cancel]', err);
    res.status(500).json({ error: 'SERVER_ERROR' });
  }
});

app.get('/api/pvp/coinflip/:id', requireAuth, (req, res) => {
  const match = stmts.getMatch.get(req.params.id);
  if(!match) return res.status(404).json({ error: 'MATCH_NOT_FOUND' });
  res.json({ match: serializeMatch(match) });
});

/* ============================================================
   PVP CHAT
   ============================================================ */
app.get('/api/pvp/coinflip/:id/chat', requireAuth, (req, res) => {
  const rows = stmts.recentPvpChat.all(req.params.id);
  res.json({ messages: rows.reverse().map(serializePvpChat) });
});

app.post('/api/pvp/coinflip/:id/chat', requireAuth, (req, res) => {
  try {
    const matchId = req.params.id;
    const match = stmts.getMatch.get(matchId);
    if(!match) return res.status(404).json({ error: 'MATCH_NOT_FOUND' });
    if(match.creator_id !== String(req.userId) && match.joiner_id !== String(req.userId))
      return res.status(403).json({ error: 'NOT_IN_MATCH' });

    let { message } = req.body;
    if(typeof message !== 'string') return res.status(400).json({ error: 'INVALID_MESSAGE' });
    message = chatModule.sanitize(message);
    if(!message) return res.status(400).json({ error: 'EMPTY_MESSAGE' });

    const user = ensureUser(req.userId, req.username);
    const id = uuidv4();
    const now = Date.now();
    stmts.insertPvpChat.run(id, matchId, user.id, user.display_name || user.username, avatarForUser(user), message, now);

    const chat = {
      id, matchId, userId: user.id,
      username: user.display_name || user.username,
      avatar: avatarForUser(user), message, timestamp: now
    };

    broadcastToMatch(matchId, { type: 'chat', chat });
    res.json({ ok: true, chat });
  } catch (err) {
    console.error('[pvp/chat]', err);
    res.status(500).json({ error: 'SERVER_ERROR' });
  }
});

function serializePvpChat(c){
  return {
    id: c.id, matchId: c.match_id, userId: c.user_id,
    username: c.username, avatar: avatarForUser({ id: c.user_id || c.userId, avatar: c.avatar }) || c.avatar,
    message: c.message, timestamp: c.created_at
  };
}

/* ============================================================
   GLOBAL CHAT
   ============================================================ */
app.get('/api/chat/global', requireAuth, (req, res) => {
  try {
    const rows = stmts.recentGChat.all();
    res.json({ messages: rows.reverse().map(serializeGlobalChat) });
  } catch (err) {
    console.error('[gchat/read]', err);
    res.status(500).json({ error: 'SERVER_ERROR' });
  }
});

app.post('/api/chat/global', chatLimiter, requireAuth, (req, res) => {
  try {
    let { message } = req.body;
    if(typeof message !== 'string') return res.status(400).json({ error: 'INVALID_MESSAGE' });

    message = chatModule.sanitize(message);
    if(!message) return res.status(400).json({ error: 'EMPTY_MESSAGE' });

    const user = ensureUser(req.userId, req.username);
    const now = Date.now();
    const rate = stmts.getChatRate.get(user.id);

    if(rate){
      if(now - rate.window_start < chatModule.RATE_LIMIT_WINDOW_MS){
        if(rate.count >= chatModule.RATE_LIMIT_MAX){
          return res.status(429).json({
            error: 'CHAT_RATE_LIMITED',
            retryAfter: Math.ceil((chatModule.RATE_LIMIT_WINDOW_MS - (now - rate.window_start)) / 1000)
          });
        }
        stmts.setChatRate.run(user.id, rate.window_start, rate.count + 1);
      } else {
        stmts.setChatRate.run(user.id, now, 1);
      }
    } else {
      stmts.setChatRate.run(user.id, now, 1);
    }

    const id = uuidv4();
    const username = user.display_name || user.username;
    const nameColor = user.name_color || null;
    const chatBadge = user.chat_badge || null;

    stmts.insertGChat.run(id, user.id, username, avatarForUser(user), nameColor, chatBadge, message, now);

    const unlocked = checkAchievements(user, { chatted: true });

    const payload = {
      id,
      userId: user.id,
      username,
      avatar: avatarForUser(user),
      nameColor,
      chatBadge,
      message,
      timestamp: now
    };

    broadcastAll({ type: 'global_chat', chat: payload });

    res.json({ ok: true, chat: payload, unlocked });
  } catch (err) {
    console.error('[gchat/write]', err);
    res.status(500).json({ error: 'SERVER_ERROR' });
  }
});

app.delete('/api/chat/global/:id', requireAuth, (req, res) => {
  try {
    const id = req.params.id;
    const msg = stmts.getGChatById.get(id);
    if(!msg) return res.status(404).json({ error: 'MESSAGE_NOT_FOUND' });
    if(msg.user_id !== String(req.userId)) return res.status(403).json({ error: 'NOT_YOUR_MESSAGE' });

    const age = Date.now() - msg.created_at;
    if(age > chatModule.DELETE_WINDOW_MS){
      return res.status(400).json({ error: 'DELETE_WINDOW_EXPIRED' });
    }

    stmts.deleteGChat.run(id, req.userId);

    broadcastAll({ type: 'global_chat_deleted', id });
    res.json({ ok: true });
  } catch (err) {
    console.error('[gchat/delete]', err);
    res.status(500).json({ error: 'SERVER_ERROR' });
  }
});

function serializeGlobalChat(c){
  return {
    id: c.id,
    userId: c.user_id,
    username: c.username,
    avatar: avatarForUser({ id: c.user_id || c.userId, avatar: c.avatar }) || c.avatar,
    nameColor: c.name_color,
    chatBadge: c.chat_badge,
    message: c.message,
    timestamp: c.created_at
  };
}

/* ============================================================
   WALLET
   ============================================================ */


app.post('/api/admin/promo', requireAdmin, (req, res) => {
  try {
    const code = String((req.body||{}).code || '').trim().toUpperCase();
    const amount = parseInt((req.body||{}).amount, 10);
    if(!code || !Number.isFinite(amount) || amount < 1) return res.status(400).json({ error: 'INVALID' });
    try { db.exec(`CREATE TABLE IF NOT EXISTS promo_codes (
      code TEXT PRIMARY KEY, amount INTEGER NOT NULL, uses_left INTEGER DEFAULT 100, created_at INTEGER
    )`); } catch(e){}
    db.prepare('INSERT OR REPLACE INTO promo_codes (code, amount, uses_left, created_at) VALUES (?, ?, 100, ?)').run(code, amount, Date.now());
    res.json({ ok: true, code, amount });
  } catch (err) {
    console.error('[admin/promo]', err);
    res.status(500).json({ error: 'SERVER_ERROR' });
  }
});
app.post('/api/rewards/redeem', requireAuth, (req, res) => {
  try {
    const code = String((req.body||{}).code || '').trim().toUpperCase();
    if(!code) return res.status(400).json({ error: 'INVALID' });
    const row = db.prepare('SELECT * FROM promo_codes WHERE code = ?').get(code);
    if(!row || row.uses_left < 1) return res.status(404).json({ error: 'NOT_FOUND' });
    db.prepare('UPDATE promo_codes SET uses_left = uses_left - 1 WHERE code = ?').run(code);
    const u = db.prepare('SELECT balance FROM users WHERE id = ?').get(req.userId);
    const next = Number(u.balance||0) + Number(row.amount);
    db.prepare('UPDATE users SET balance = ?, updated_at = ? WHERE id = ?').run(next, Date.now(), req.userId);
    res.json({ ok: true, balance: next, amount: row.amount });
  } catch (err) {
    res.status(500).json({ error: 'SERVER_ERROR' });
  }
});

app.post('/api/wallet/convert', requireAuth, (req, res) => {
  try {
    try { addCol('users', 'blox_coins', 'REAL DEFAULT 0'); } catch(e){}
    const body = req.body || {};
    const amt = parseInt(body.amount, 10);
    const from = String(body.from || 'rc').toLowerCase();
    const to = String(body.to || (from === 'rc' ? 'bc' : 'rc')).toLowerCase();
    if(!Number.isFinite(amt) || amt < 1) return res.status(400).json({ error: 'INVALID_AMOUNT' });
    if(from === to) return res.status(400).json({ error: 'SAME_CURRENCY' });
    const u = db.prepare('SELECT * FROM users WHERE id = ?').get(req.userId);
    if(!u) return res.status(404).json({ error: 'NOT_FOUND' });
    const now = Date.now();
    let newBal = Number(u.balance||0);
    let newBc = Number(u.blox_coins||0);
    if(from === 'bc' && to === 'rc'){
      if(newBc < amt) return res.status(400).json({ error: 'INSUFFICIENT_BALANCE' });
      newBc -= amt; newBal += amt;
    } else {
      return res.status(400).json({ error: 'INVALID_PAIR' });
    }
    db.prepare('UPDATE users SET balance = ?, blox_coins = ?, updated_at = ? WHERE id = ?').run(newBal, newBc, now, u.id);
    res.json({ ok: true, balance: newBal, bloxCoins: newBc });
  } catch (err) {
    console.error('[wallet/convert]', err);
    res.status(500).json({ error: 'SERVER_ERROR' });
  }
});

app.post('/api/wallet/deposit', requireAuth, (req, res) => {
  try {
    try { addCol('users', 'blox_coins', 'REAL DEFAULT 0'); } catch(e){}
    const amount = parseInt(req.body.amount, 10);
    if(!Number.isFinite(amount) || amount <= 0 || !Number.isInteger(amount))
      return res.status(400).json({ error: 'INVALID_AMOUNT' });
    if(amount < 7)
      return res.status(400).json({ error: 'AMOUNT_OUT_OF_RANGE', min: 7 });

    const user = ensureUser(req.userId, req.username);
    const row = db.prepare('SELECT balance, blox_coins FROM users WHERE id = ?').get(user.id) || user;
    const newBc = Number(row.blox_coins || 0) + amount;
    db.prepare('UPDATE users SET blox_coins = ?, updated_at = ? WHERE id = ?').run(newBc, Date.now(), user.id);

    try {
      stmts.insertTx.run(uuidv4(), user.id, 'deposit_bc', amount, Number(row.balance || 0), JSON.stringify({ bloxCoins: newBc }), Date.now());
    } catch(e){}
    try { broadcastToUser(user.id, { type: 'balance', balance: row.balance, bloxCoins: newBc }); } catch(e){}

    res.json({ ok: true, balance: Number(row.balance || 0), bloxCoins: newBc, amount });
  } catch (err) {
    console.error('[deposit]', err);
    res.status(500).json({ error: 'SERVER_ERROR', message: String(err && err.message || err) });
  }
});

/* ============================================================
   LEADERBOARD
   ============================================================ */
app.get('/api/leaderboard', requireAuth, (req, res) => {
  const sort = String(req.query.sort || 'wagered');
  const limit = Math.min(500, Math.max(10, parseInt(req.query.limit, 10) || 200));

  let rows;
  if(sort === 'balance') rows = stmts.topByBalance.all();
  else if(sort === 'won') rows = stmts.topByWon.all();
  else if(sort === 'biggest') rows = stmts.topByBigWin.all();
  else rows = stmts.topByWagered.all();

  const entries = rows.slice(0, limit).map((u, i) => ({
    rank: i + 1,
    id: u.id,
    username: u.display_name || u.username,
    avatar: avatarForUser(u),
    hasVerifiedBadge: !!u.has_verified_badge,
    level: u.level,
    rankName: u.rank,
    balance: u.balance,
    totalWagered: u.total_wagered,
    totalWon: u.total_won,
    totalLost: u.total_lost,
    biggestWin: u.biggest_win,
    gamesWon: u.games_won,
    gamesPlayed: u.games_played || 0
  }));

  res.json({ entries, sort });
});

app.get('/api/leaderboard/me', requireAuth, (req, res) => {
  const user = ensureUser(req.userId, req.username);
  const all = stmts.topByWagered.all();
  const idx = all.findIndex(u => u.id === user.id);
  res.json({
    rank: idx === -1 ? null : idx + 1,
    total: all.length,
    user: serializeUser(user)
  });
});

/* ============================================================
   ACHIEVEMENTS
   ============================================================ */
app.get('/api/achievements', requireAuth, (req, res) => {
  const rows = stmts.userAch.all(req.userId);
  const unlocked = rows.map(r => ({ id: r.id, unlockedAt: r.unlocked_at }));
  const all = Object.entries(ACHIEVEMENTS).map(([id, a]) => ({
    id, name: a.name, desc: a.desc,
    unlocked: unlocked.some(u => u.id === id),
    unlockedAt: (unlocked.find(u => u.id === id) || {}).unlockedAt || null
  }));
  res.json({ achievements: all });
});

/* ============================================================
   COMMUNITY — LIVE FEED
   ============================================================ */
app.get('/api/flips/recent', requireAuth, (req, res) => {
  const limit = Math.min(50, Math.max(10, parseInt(req.query.limit, 10) || 25));

  const rows = db.prepare(`
    SELECT
      f.id, f.user_id, f.bet, f.choice, f.result, f.win,
      f.payout, f.net, f.balance_after, f.nonce, f.hash,
      f.client_seed, f.server_seed_hash, f.mode, f.match_id,
      f.created_at,
      u.username AS uname, u.display_name AS udname, u.avatar AS uavatar,
      u.level AS ulevel, u.rank AS urank, u.has_verified_badge AS uverified,
      u.name_color AS unamecolor, u.chat_badge AS uchatbadge
    FROM flips f
    LEFT JOIN users u ON u.id = f.user_id
    ORDER BY f.created_at DESC
    LIMIT ?
  `).all(limit);

  const streakByUser = new Map();
  for(const r of rows){
    const uid = r.user_id;
    if(!streakByUser.has(uid)) streakByUser.set(uid, { current: 0, stopped: false });
    const s = streakByUser.get(uid);
    if(!s.stopped){
      if(r.win) s.current++;
      else s.stopped = true;
    }
  }

  const since = Date.now() - (24 * 60 * 60 * 1000);
  const totals = db.prepare(`
    SELECT
      COUNT(*) AS flips,
      COALESCE(SUM(bet), 0) AS wagered,
      COALESCE(SUM(CASE WHEN win = 1 THEN payout ELSE 0 END), 0) AS paid
    FROM flips
    WHERE created_at > ?
  `).get(since);

  res.json({
    flips: rows.map(r => ({
      id: r.id,
      userId: r.user_id,
      username: r.udname || r.uname || 'Unknown',
      avatar: avatarForUser({ id: r.user_id || r.uid, avatar: r.uavatar }) || r.uavatar,
      level: r.ulevel || 1,
      rank: r.urank || 'Bronze',
      hasVerifiedBadge: !!r.uverified,
      nameColor: r.unamecolor || null,
      chatBadge: r.uchatbadge || null,

      bet: r.bet,
      choice: r.choice,
      result: r.result,
      win: !!r.win,
      payout: r.payout,
      net: r.net,
      balanceAfter: r.balance_after,
      nonce: r.nonce,
      hash: r.hash,
      clientSeed: r.client_seed,
      serverSeedHash: r.server_seed_hash,
      mode: r.mode || 'house',
      matchId: r.match_id || null,
      timestamp: r.created_at,

      streak: (streakByUser.get(r.user_id) || { current: 0 }).current
    })),
    totals: {
      flips: totals.flips,
      wagered: totals.wagered,
      paid: totals.paid,
      window: '24h'
    }
  });
});

app.post('/api/users/heartbeat', requireAuth, (req, res) => {
  try {
    const now = Date.now();
    db.prepare('UPDATE users SET updated_at = ? WHERE id = ?').run(now, req.user.id);
    res.json({ ok: true, at: now });
  } catch (err) {
    console.error('[heartbeat]', err);
    res.status(500).json({ error: 'SERVER_ERROR' });
  }
});


app.get('/api/users/:id', (req, res) => {
  try {
    const id = req.params.id;
    let u = db.prepare('SELECT id, username, display_name, avatar, balance, level, rank, total_wagered, created_at, is_admin, vip, chat_badge FROM users WHERE id = ?').get(id);
    if(!u) u = db.prepare('SELECT id, username, display_name, avatar, balance, level, rank, total_wagered, created_at, is_admin, vip, chat_badge FROM users WHERE username = ? COLLATE NOCASE').get(id);
    if(!u) return res.status(404).json({ error: 'NOT_FOUND' });
    res.json({
      user: {
        id: u.id,
        username: u.username,
        displayName: u.display_name || u.username,
        avatar: avatarForUser(u),
        level: u.level,
        rank: rankFor(u.total_wagered || 0),
        totalWagered: u.total_wagered,
        createdAt: u.created_at,
        isAdmin: !!u.is_admin,
        vip: !!u.vip,
        chatBadge: u.chat_badge || null
      }
    });
  } catch (err) {
    console.error('[users/:id]', err);
    res.status(500).json({ error: 'SERVER_ERROR' });
  }
});

app.get('/api/users/online', (req, res) => {
  try {
    const cutoff = Date.now() - 2 * 60 * 1000;
    const row = db.prepare('SELECT COUNT(*) AS c FROM users WHERE updated_at > ?').get(cutoff);
    const count = row ? row.c : 0;
    res.json({ count, online: count });
  } catch (err) {
    console.error('[users/online]', err);
    res.status(500).json({ error: 'SERVER_ERROR' });
  }
});

/* ============================================================
   CASE BATTLES
   ============================================================ */
app.get('/api/cases', requireAuth, (req, res) => {
  const list = cases.CASES
    .slice()
    .sort((a, b) => a.price - b.price)
    .map(c => ({
      id: c.id,
      name: c.name,
      price: c.price,
      image: c.image,
      theme: c.theme,
      minValue: c.minValue,
      maxValue: c.maxValue,
      itemCount: cases.itemsForCase(c.id).length
    }));
  res.json({ cases: list });
});

app.get('/api/cases/:id/items', requireAuth, (req, res) => {
  const c = cases.getCase(req.params.id);
  if(!c) return res.status(404).json({ error: 'CASE_NOT_FOUND' });
  const items = cases.itemsForCase(c.id);
  res.json({ case: c, items });
});

app.post('/api/case-battles', caseLimiter, requireAuth, (req, res) => {
  try {
    const { caseId, slots } = req.body;
    const slotsNum = Number(slots);
    if(!Number.isInteger(slotsNum) || slotsNum < 2 || slotsNum > 4)
      return res.status(400).json({ error: 'INVALID_SLOTS', min: 2, max: 4 });

    const c = cases.getCase(caseId);
    if(!c) return res.status(400).json({ error: 'CASE_NOT_FOUND' });

    const user = ensureUser(req.userId, req.username);
    if(user.balance < c.price)
      return res.status(400).json({ error: 'INSUFFICIENT_BALANCE', balance: user.balance });

    const newBalance = user.balance - c.price;
    updateBalance(user.id, newBalance);

    const battleId = uuidv4();
    const now = Date.now();
    stmts.insertCaseBattle.run(battleId, c.id, c.name, c.price, slotsNum, user.id, user.display_name || user.username, now);

    stmts.insertBattlePlayer.run(
      uuidv4(), battleId, user.id, user.display_name || user.username, user.avatar, 0, now
    );

    const battle = serializeCaseBattle(stmts.getCaseBattle.get(battleId));

    broadcastAll({ type: 'case_battle_created', battle });
    broadcastToUser(user.id, { type: 'balance', balance: newBalance });

    res.json({ ok: true, battle, balance: newBalance });
  } catch (err) {
    console.error('[case-battle/create]', err);
    res.status(500).json({ error: 'SERVER_ERROR' });
  }
});

app.get('/api/case-battles', requireAuth, (req, res) => {
  const rows = stmts.openCaseBattles.all();
  const out = rows.map(b => {
    const players = stmts.getBattlePlayers.all(b.id);
    return serializeCaseBattle(b, players);
  });
  res.json({ battles: out });
});

app.get('/api/case-battles/recent', requireAuth, (req, res) => {
  const rows = stmts.recentCaseBattles.all();
  res.json({ battles: rows.map(b => serializeCaseBattle(b)) });
});

app.get('/api/case-battles/:id', requireAuth, (req, res) => {
  const b = stmts.getCaseBattle.get(req.params.id);
  if(!b) return res.status(404).json({ error: 'BATTLE_NOT_FOUND' });
  const players = stmts.getBattlePlayers.all(b.id);
  res.json({ battle: serializeCaseBattle(b, players) });
});

app.post('/api/case-battles/:id/join', caseLimiter, requireAuth, (req, res) => {
  try {
    const battleId = req.params.id;
    const battle = stmts.getCaseBattle.get(battleId);
    if(!battle) return res.status(404).json({ error: 'BATTLE_NOT_FOUND' });
    if(battle.status !== 'open') return res.status(400).json({ error: 'BATTLE_NOT_OPEN' });

    const user = ensureUser(req.userId, req.username);
    if(user.balance < battle.entry_price)
      return res.status(400).json({ error: 'INSUFFICIENT_BALANCE', balance: user.balance });

    const existing = db.prepare('SELECT 1 FROM case_battle_players WHERE battle_id = ? AND user_id = ?').get(battleId, user.id);
    if(existing) return res.status(400).json({ error: 'ALREADY_IN_BATTLE' });

    const count = stmts.countBattlePlayers.get(battleId).c;
    if(count >= battle.slots) return res.status(400).json({ error: 'BATTLE_FULL' });

    const newBalance = user.balance - battle.entry_price;
    updateBalance(user.id, newBalance);

    stmts.insertBattlePlayer.run(
      uuidv4(), battleId, user.id, user.display_name || user.username, user.avatar, count, Date.now()
    );

    broadcastToUser(user.id, { type: 'balance', balance: newBalance });

    const players = stmts.getBattlePlayers.all(battleId);
    const serialized = serializeCaseBattle(stmts.getCaseBattle.get(battleId), players);

    broadcastToMatch(battleId, { type: 'case_battle_updated', battle: serialized });

    if(players.length >= battle.slots){
      setTimeout(() => resolveCaseBattle(battleId), 400);
    }

    res.json({ ok: true, battle: serialized, balance: newBalance });
  } catch (err) {
    console.error('[case-battle/join]', err);
    res.status(500).json({ error: 'SERVER_ERROR' });
  }
});

app.post('/api/case-battles/:id/cancel', requireAuth, (req, res) => {
  try {
    const battleId = req.params.id;
    const battle = stmts.getCaseBattle.get(battleId);
    if(!battle) return res.status(404).json({ error: 'BATTLE_NOT_FOUND' });
    if(battle.status !== 'open') return res.status(400).json({ error: 'BATTLE_NOT_OPEN' });
    if(battle.creator_id !== String(req.userId)) return res.status(403).json({ error: 'NOT_YOUR_BATTLE' });

    const players = stmts.getBattlePlayers.all(battleId);
    for(const p of players){
      const u = stmts.getUser.get(p.user_id);
      if(!u) continue;
      const refund = u.balance + battle.entry_price;
      updateBalance(u.id, refund);
      broadcastToUser(u.id, { type: 'balance', balance: refund });
    }

    stmts.cancelCaseBattle.run(Date.now(), battleId);
    broadcastAll({ type: 'case_battle_cancelled', battleId });

    res.json({ ok: true });
  } catch (err) {
    console.error('[case-battle/cancel]', err);
    res.status(500).json({ error: 'SERVER_ERROR' });
  }
});

function resolveCaseBattle(battleId){
  try {
    const battle = stmts.getCaseBattle.get(battleId);
    if(!battle || battle.status !== 'open') return;

    const players = stmts.getBattlePlayers.all(battleId);
    if(players.length < battle.slots) return;

    const seed = cases.generateBattleSeed();
    const seedHash = cases.hashSeed(seed);
    const now = Date.now();
    stmts.setBattleSeed.run(seed, seedHash, 'in_progress', now, battleId);

    for(let i = 0; i < players.length; i++){
      const p = players[i];
      const item = cases.rollItemForPlayer(battle.case_id, seed, battleId, p.user_id, i);
      if(!item) continue;
      const reel = cases.buildReel(battle.case_id, item, seed + ':' + p.user_id);
      stmts.updateBattlePlayerRoll.run(
        item.itemId, item.name, item.image, item.rarity, item.value,
        JSON.stringify(reel),
        battleId, p.user_id
      );
    }

    const refreshedPlayers = stmts.getBattlePlayers.all(battleId).map(p => ({
      userId: p.user_id,
      username: p.username,
      avatar: avatarForUser(p) || p.avatar,
      slot: p.slot,
      reel: p.reel_json ? JSON.parse(p.reel_json) : [],
      item: {
        itemId: p.rolled_item_id,
        name: p.rolled_item_name,
        image: p.rolled_item_image,
        rarity: p.rolled_item_rarity,
        value: p.rolled_item_value
      }
    }));

    broadcastToMatch(battleId, {
      type: 'case_battle_started',
      battleId,
      players: refreshedPlayers
    });

    const ANIM_WINDOW_MS = 1200 + (players.length * 3200);
    setTimeout(() => {
      const fresh = stmts.getCaseBattle.get(battleId);
      if(!fresh || fresh.status !== 'in_progress') return;

      const finalPlayers = stmts.getBattlePlayers.all(battleId);
      let winner = null;
      let totalValue = 0;
      for(const p of finalPlayers){
        totalValue += (p.rolled_item_value || 0);
        if(!winner || (p.rolled_item_value || 0) > (winner.rolled_item_value || 0)){
          winner = p;
        }
      }
      if(!winner) return;

      const winnerUser = stmts.getUser.get(winner.user_id);
      if(winnerUser){
        const newBalance = winnerUser.balance + totalValue;
        updateBalance(winner.user_id, newBalance);
        broadcastToUser(winner.user_id, { type: 'balance', balance: newBalance });
        stmts.insertTx.run(
          uuidv4(), winner.user_id, 'case_battle_win', totalValue, newBalance,
          JSON.stringify({ battleId }), Date.now()
        );
      }

      stmts.resolveCaseBattle.run(winner.user_id, totalValue, Date.now(), battleId);

      for(const p of finalPlayers){
        const won = p.user_id === winner.user_id;
        stmts.addCaseStats.run(won ? 1 : 0, battle.entry_price, won ? 30 : 10, won ? 30 : 10, Date.now(), p.user_id);
        trackGambleStreak(p.user_id);
        checkReferralPayout(p.user_id);
      }

      const winnerUserRef = stmts.getUser.get(winner.user_id);
      const unlocked = checkAchievements(winnerUserRef, { rolledRarity: winner.rolled_item_rarity });

      const finalBattle = serializeCaseBattle(stmts.getCaseBattle.get(battleId), finalPlayers);

      broadcastToMatch(battleId, {
        type: 'case_battle_resolved',
        battle: finalBattle,
        winnerId: winner.user_id,
        totalValue,
        unlocked
      });
    }, ANIM_WINDOW_MS);
  } catch (err) {
    console.error('[case-battle/resolve]', err);
  }
}

function serializeCaseBattle(b, players){
  if(!b) return null;
  const playerList = (players || stmts.getBattlePlayers.all(b.id)).map(p => ({
    userId: p.user_id,
    username: p.username,
    avatar: avatarForUser(p) || p.avatar,
    slot: p.slot,
    item: p.rolled_item_id ? {
      itemId: p.rolled_item_id,
      name: p.rolled_item_name,
      image: p.rolled_item_image,
      rarity: p.rolled_item_rarity,
      value: p.rolled_item_value
    } : null
  }));

  return {
    id: b.id,
    caseId: b.case_id,
    caseName: b.case_name,
    entryPrice: b.entry_price,
    slots: b.slots,
    status: b.status,
    creatorId: b.creator_id,
    creatorUsername: b.creator_username,
    battleSeedHash: b.battle_seed_hash,
    winnerId: b.winner_id,
    totalValue: b.total_value,
    players: playerList,
    createdAt: b.created_at,
    startedAt: b.started_at,
    resolvedAt: b.resolved_at
  };
}

/* ============================================================
   MINES
   ============================================================ */
app.post('/api/mines/start', minesLimiter, requireAuth, (req, res) => {
  try {
    const { bet, mines } = req.body;
    const betNum = Number(bet);
    const mineCount = Number(mines);

    if(!Number.isInteger(betNum) || betNum < 10)
      return res.status(400).json({ error: 'INVALID_BET', min: 10 });
    if(!Number.isInteger(mineCount) || mineCount < 1 || mineCount > 24)
      return res.status(400).json({ error: 'INVALID_MINES', min: 1, max: 24 });

    const user = ensureUser(req.userId, req.username);

    const active = stmts.activeMinesForUser.get(user.id);
    if(active){
      return res.status(400).json({ error: 'ALREADY_ACTIVE', gameId: active.id });
    }

    if(user.balance < betNum)
      return res.status(400).json({ error: 'INSUFFICIENT_BALANCE', balance: user.balance });

    const newBalance = user.balance - betNum;
    updateBalance(user.id, newBalance);

    const gameId = uuidv4();
    const seed = minesEngine.generateSeed();
    const seedHash = minesEngine.hashSeed(seed);
    const grid = minesEngine.generateGrid(seed, mineCount);

    stmts.insertMinesGame.run(
      gameId, user.id, betNum, mineCount,
      seed, seedHash, JSON.stringify(grid), newBalance, Date.now()
    );

    const table = minesEngine.multiplierTable(mineCount);

    broadcastToUser(user.id, { type: 'balance', balance: newBalance });

    res.json({
      ok: true,
      game: {
        id: gameId,
        bet: betNum,
        mineCount,
        picks: 0,
        multiplier: 1.0,
        status: 'active',
        serverSeedHash: seedHash,
        multiplierTable: table
      },
      balance: newBalance
    });
  } catch (err) {
    console.error('[mines/start]', err);
    res.status(500).json({ error: 'SERVER_ERROR' });
  }
});

app.post('/api/mines/:id/reveal', minesLimiter, requireAuth, (req, res) => {
  try {
    const gameId = req.params.id;
    const tile = Number(req.body.tile);

    if(!Number.isInteger(tile) || tile < 0 || tile >= minesEngine.GRID_SIZE)
      return res.status(400).json({ error: 'INVALID_TILE' });

    const game = stmts.getMinesGame.get(gameId);
    if(!game) return res.status(404).json({ error: 'GAME_NOT_FOUND' });
    if(game.user_id !== String(req.userId)) return res.status(403).json({ error: 'NOT_YOUR_GAME' });
    if(game.status !== 'active') return res.status(400).json({ error: 'GAME_ENDED' });

    const grid = JSON.parse(game.grid_json);
    const revealed = JSON.parse(game.revealed_json);

    if(revealed.includes(tile))
      return res.status(400).json({ error: 'ALREADY_REVEALED' });

    const user = ensureUser(req.userId, req.username);
    const isMine = grid[tile] === 'mine';

    if(isMine){
      const newBalance = user.balance;
      stmts.resolveMinesGame.run('lost', 0, -game.bet, newBalance, Date.now(), gameId);

      stmts.insertMinesHistory.run(
        uuidv4(), user.id, game.bet, game.mine_count,
        game.picks, game.multiplier, 'lost',
        -game.bet, newBalance, game.server_seed_hash,
        JSON.stringify(revealed), JSON.stringify(grid), Date.now()
      );

      stmts.addMinesStats.run(0, game.bet, 0, game.bet, 0, 5, 5, Date.now(), user.id);

      const updated = stmts.getUser.get(user.id);
      const newRank = rankFor(updated.total_wagered);
    const newLevel = levelFromWagered(updated.total_wagered);
      if(newRank !== updated.rank) stmts.updateRank.run(newRank, Date.now(), user.id);

      const unlocked = checkAchievements(stmts.getUser.get(user.id), null);

      trackGambleStreak(user.id);
      checkReferralPayout(user.id);

      broadcastToUser(user.id, { type: 'balance', balance: newBalance });

      return res.json({
        ok: true,
        result: 'mine',
        grid,
        revealed: [tile, ...revealed],
        balance: newBalance,
        net: -game.bet,
        unlocked
      });
    }

    const newRevealed = [...revealed, tile];
    const newPicks = newRevealed.length;
    const newMultiplier = minesEngine.multiplierFor(game.mine_count, newPicks);

    stmts.updateMinesGame.run(
      JSON.stringify(newRevealed),
      newPicks,
      newMultiplier,
      gameId
    );

    res.json({
      ok: true,
      result: 'gem',
      tile,
      picks: newPicks,
      multiplier: newMultiplier,
      revealed: newRevealed,
      potentialPayout: Math.floor(game.bet * newMultiplier)
    });
  } catch (err) {
    console.error('[mines/reveal]', err);
    res.status(500).json({ error: 'SERVER_ERROR' });
  }
});

app.post('/api/mines/:id/cashout', minesLimiter, requireAuth, (req, res) => {
  try {
    const gameId = req.params.id;
    const game = stmts.getMinesGame.get(gameId);
    if(!game) return res.status(404).json({ error: 'GAME_NOT_FOUND' });
    if(game.user_id !== String(req.userId)) return res.status(403).json({ error: 'NOT_YOUR_GAME' });
    if(game.status !== 'active') return res.status(400).json({ error: 'GAME_ENDED' });
    if(game.picks === 0) return res.status(400).json({ error: 'NO_PICKS' });

    const user = ensureUser(req.userId, req.username);
    const grid = JSON.parse(game.grid_json);
    const revealed = JSON.parse(game.revealed_json);

    const payout = Math.floor(game.bet * game.multiplier);
    const net = payout - game.bet;
    const newBalance = user.balance + payout;

    updateBalance(user.id, newBalance);
    stmts.resolveMinesGame.run('won', payout, net, newBalance, Date.now(), gameId);

    stmts.insertMinesHistory.run(
      uuidv4(), user.id, game.bet, game.mine_count,
      game.picks, game.multiplier, 'won',
      net, newBalance, game.server_seed_hash,
      JSON.stringify(revealed), JSON.stringify(grid), Date.now()
    );

    stmts.addMinesStats.run(1, 0, net, 0, payout, 20, 20, Date.now(), user.id);

    const updated = stmts.getUser.get(user.id);
    const newRank = rankFor(updated.total_wagered);
    const newLevel = levelFromWagered(updated.total_wagered);
    if(newRank !== updated.rank) stmts.updateRank.run(newRank, Date.now(), user.id);

    const unlocked = checkAchievements(stmts.getUser.get(user.id), {
      minesMultiplier: game.multiplier
    });

    trackGambleStreak(user.id);
    checkReferralPayout(user.id);

    broadcastToUser(user.id, { type: 'balance', balance: newBalance });

    res.json({
      ok: true,
      result: 'cashout',
      payout,
      net,
      multiplier: game.multiplier,
      picks: game.picks,
      grid,
      revealed,
      balance: newBalance,
      unlocked
    });
  } catch (err) {
    console.error('[mines/cashout]', err);
    res.status(500).json({ error: 'SERVER_ERROR' });
  }
});

app.get('/api/mines/active', requireAuth, (req, res) => {
  try {
    const user = ensureUser(req.userId, req.username);
    const game = stmts.activeMinesForUser.get(user.id);
    if(!game){
      return res.json({ ok: true, game: null });
    }

    const revealed = JSON.parse(game.revealed_json);
    const table = minesEngine.multiplierTable(game.mine_count);

    res.json({
      ok: true,
      game: {
        id: game.id,
        bet: game.bet,
        mineCount: game.mine_count,
        picks: game.picks,
        multiplier: game.multiplier,
        status: game.status,
        serverSeedHash: game.server_seed_hash,
        revealed,
        multiplierTable: table
      }
    });
  } catch (err) {
    console.error('[mines/active]', err);
    res.status(500).json({ error: 'SERVER_ERROR' });
  }
});

app.get('/api/mines/history', requireAuth, (req, res) => {
  const rows = stmts.recentMinesForUser.all(req.userId);
  res.json({
    history: rows.map(r => ({
      id: r.id,
      bet: r.bet,
      mineCount: r.mine_count,
      picks: r.picks,
      multiplier: r.multiplier,
      result: r.result,
      net: r.net,
      balanceAfter: r.balance_after,
      serverSeedHash: r.server_seed_hash,
      timestamp: r.created_at
    }))
  });
});

/* ============================================================

  try { addCol('users', 'banned', 'INTEGER DEFAULT 0'); } catch(e){}
  try { addCol('users', 'blox_coins', 'REAL DEFAULT 0'); } catch(e){}
  try { addCol('users', 'ban_until', 'INTEGER'); } catch(e){}
  try { addCol('users', 'ban_reason', 'TEXT'); } catch(e){}

   CRASH ENGINE — PASSIVE
   ============================================================ */
const CRASH_STATE = {
  IDLE: 'idle',
  WAITING: 'waiting',
  STARTING: 'starting',
  RUNNING: 'running',
  CRASHED: 'crashed'
};

const crashEngineState = {
  currentRoundId: null,
  currentRoundNumber: 0,
  currentSeed: null,
  currentSeedHash: null,
  currentCrashPoint: 0,
  state: CRASH_STATE.IDLE,
  stateStartedAt: 0,
  runningStartedAt: 0,
  currentMultiplier: 1.0,
  idleSince: Date.now(),
  activeViewers: new Set(),
  bets: new Map(),
  tickHandle: null,
  phaseTimer: null
};

function rotateSeedIfNeeded(){
  crashEngineState.currentSeed = crashEngine.generateSeed();
  crashEngineState.currentSeedHash = crashEngine.hashSeed(crashEngineState.currentSeed);
}

function nextRoundNumber(){
  const last = stmts.getLatestCrashRound.get();
  return last ? last.round_number + 1 : 1;
}

function clearPhaseTimers(){
  if(crashEngineState.tickHandle){
    clearInterval(crashEngineState.tickHandle);
    crashEngineState.tickHandle = null;
  }
  if(crashEngineState.phaseTimer){
    clearTimeout(crashEngineState.phaseTimer);
    crashEngineState.phaseTimer = null;
  }
}

function wakeEngine(){
  crashEngineState.idleSince = 0;
  if(crashEngineState.state === CRASH_STATE.IDLE){
    startNewRound();
  }
}

function sleepEngine(){
  clearPhaseTimers();
  crashEngineState.state = CRASH_STATE.IDLE;
  crashEngineState.idleSince = Date.now();
  crashEngineState.currentRoundId = null;
  crashEngineState.bets.clear();
  broadcastAll({ type: 'crash_idle' });
}

function startNewRound(){
  clearPhaseTimers();
  crashEngineState.bets.clear();
  crashEngineState.currentMultiplier = 1.0;
  crashEngineState.state = CRASH_STATE.WAITING;
  crashEngineState.stateStartedAt = Date.now();

  crashEngineState.currentRoundNumber = nextRoundNumber();
  rotateSeedIfNeeded();

  const { crashPoint } = crashEngine.computeCrashPoint(
    crashEngineState.currentSeed,
    crashEngineState.currentRoundNumber,
    crashEngine.CONFIG.baseEdge
  );
  crashEngineState.currentCrashPoint = crashPoint;

  const roundId = uuidv4();
  crashEngineState.currentRoundId = roundId;

  stmts.insertCrashRound.run(
    roundId,
    crashEngineState.currentRoundNumber,
    crashEngineState.currentSeed,
    crashEngineState.currentSeedHash,
    crashPoint,
    Date.now()
  );

  broadcastAll({
    type: 'crash_round_start',
    round: {
      id: roundId,
      number: crashEngineState.currentRoundNumber,
      state: 'waiting',
      stateStartedAt: crashEngineState.stateStartedAt,
      waitingMs: crashEngine.CONFIG.waitingMs,
      startingMs: crashEngine.CONFIG.startingMs,
      crashedMs: crashEngine.CONFIG.crashedMs,
      seedHash: crashEngineState.currentSeedHash
    }
  });

  crashEngineState.phaseTimer = setTimeout(() => {
    if(crashEngineState.currentRoundId !== roundId) return;
    // Don't start the round unless at least one player has bet
    if(crashEngineState.bets.size < 1){
      broadcastAll({
        type: 'crash_waiting_players',
        roundId,
        message: 'Waiting for players to join…'
      });
      // Keep waiting — re-check every few seconds
      const recheck = () => {
        if(crashEngineState.currentRoundId !== roundId) return;
        if(crashEngineState.state !== CRASH_STATE.WAITING) return;
        if(crashEngineState.bets.size >= 1){
          beginStartingPhase(roundId);
        } else {
          crashEngineState.phaseTimer = setTimeout(recheck, 3000);
        }
      };
      crashEngineState.phaseTimer = setTimeout(recheck, 3000);
      return;
    }
    beginStartingPhase(roundId);
  }, crashEngine.CONFIG.waitingMs);
}

function beginStartingPhase(roundId){
  if(crashEngineState.currentRoundId !== roundId) return;
  crashEngineState.state = CRASH_STATE.STARTING;
  crashEngineState.stateStartedAt = Date.now();

  broadcastAll({
    type: 'crash_phase_starting',
    roundId,
    stateStartedAt: crashEngineState.stateStartedAt,
    startingMs: crashEngine.CONFIG.startingMs
  });

  crashEngineState.phaseTimer = setTimeout(() => {
    if(crashEngineState.currentRoundId !== roundId) return;
    beginRunningPhase(roundId);
  }, crashEngine.CONFIG.startingMs);
}

function beginRunningPhase(roundId){
  if(crashEngineState.currentRoundId !== roundId) return;

  crashEngineState.state = CRASH_STATE.RUNNING;
  crashEngineState.stateStartedAt = Date.now();
  crashEngineState.runningStartedAt = Date.now();
  crashEngineState.currentMultiplier = 1.0;

  stmts.updateCrashRoundStatus.run('running', roundId);

  broadcastAll({
    type: 'crash_phase_running',
    roundId,
    stateStartedAt: crashEngineState.stateStartedAt
  });

  crashEngineState.tickHandle = setInterval(() => {
    if(crashEngineState.currentRoundId !== roundId){
      clearInterval(crashEngineState.tickHandle);
      crashEngineState.tickHandle = null;
      return;
    }
    if(crashEngineState.state !== CRASH_STATE.RUNNING){
      clearInterval(crashEngineState.tickHandle);
      crashEngineState.tickHandle = null;
      return;
    }

    const elapsed = Date.now() - crashEngineState.runningStartedAt;
    const mult = crashEngine.multiplierAt(elapsed);
    crashEngineState.currentMultiplier = mult;

    for(const [userId, entry] of crashEngineState.bets){
      if(entry.cashedOut) continue;
      if(entry.autoCashout && mult >= (entry.autoCashout - crashEngine.CONFIG.autoCashoutOffset)){
        const targetMult = entry.autoCashout - crashEngine.CONFIG.autoCashoutOffset;
        if(mult >= targetMult){
          tryCashout(userId, targetMult, true);
        }
      }
    }

    broadcastAll({
      type: 'crash_tick',
      roundId,
      multiplier: mult,
      elapsed
    });

    if(mult >= crashEngineState.currentCrashPoint){
      crashRound(roundId, mult);
      clearInterval(crashEngineState.tickHandle);
      crashEngineState.tickHandle = null;
    }
  }, crashEngine.CONFIG.tickMs);
}

function crashRound(roundId, finalMult){
  crashEngineState.state = CRASH_STATE.CRASHED;
  crashEngineState.stateStartedAt = Date.now();

  let totalWagered = 0;
  let totalPaid = 0;

  for(const [userId, entry] of crashEngineState.bets){
    totalWagered += entry.bet;
    if(!entry.cashedOut){
      const user = stmts.getUser.get(userId);
      if(user){
        stmts.addCrashStats.run(0, entry.bet, 0, entry.bet, 0, 3, 3, Date.now(), userId);
        stmts.insertCrashHistory.run(
          uuidv4(),
          userId,
          roundId,
          crashEngineState.currentRoundNumber,
          entry.bet,
          crashEngineState.currentCrashPoint,
          0, null, 0, -entry.bet,
          user.balance,
          Date.now()
        );
        trackGambleStreak(userId);
        checkReferralPayout(userId);
      }
    } else {
      totalPaid += entry.cashoutValue || 0;
    }
  }

  stmts.resolveCrashRound.run(
    crashEngineState.bets.size,
    totalWagered,
    totalPaid,
    Date.now(),
    Date.now(),
    roundId
  );

  broadcastAll({
    type: 'crash_crashed',
    roundId,
    crashPoint: crashEngineState.currentCrashPoint,
    finalMultiplier: finalMult
  });

  crashEngineState.phaseTimer = setTimeout(() => {
    if(crashEngineState.activeViewers.size === 0){
      if(!crashEngineState.idleSince) crashEngineState.idleSince = Date.now();
      if(Date.now() - crashEngineState.idleSince > crashEngine.CONFIG.idleGraceMs){
        sleepEngine();
        return;
      }
    }
    startNewRound();
  }, crashEngine.CONFIG.crashedMs);
}

function tryCashout(userId, requestedMultiplier, isAuto){
  const entry = crashEngineState.bets.get(userId);
  if(!entry) return { ok: false, error: 'NOT_IN_ROUND' };
  if(entry.cashedOut) return { ok: false, error: 'ALREADY_CASHED_OUT' };
  if(crashEngineState.state !== CRASH_STATE.RUNNING) return { ok: false, error: 'NOT_RUNNING' };

  const currentMult = crashEngineState.currentMultiplier;
  if(currentMult >= crashEngineState.currentCrashPoint) return { ok: false, error: 'CRASHED' };

  let finalMult = Math.min(requestedMultiplier, currentMult);

  if(isAuto){
    finalMult = Math.max(1.00, finalMult - crashEngine.CONFIG.autoCashoutOffset);
  }

  const user = stmts.getUser.get(userId);
  if(!user) return { ok: false, error: 'USER_NOT_FOUND' };

  const fee = crashEngine.feeForMultiplier(finalMult);
  const rawPayout = Math.floor(entry.bet * finalMult);
  const feeAmount = Math.floor(rawPayout * fee);
  const payout = rawPayout - feeAmount;
  const net = payout - entry.bet;

  const newBalance = user.balance + payout;
  updateBalance(userId, newBalance);

  entry.cashedOut = 1;
  entry.cashoutMultiplier = finalMult;
  entry.cashoutValue = payout;
  entry.fee = feeAmount;
  entry.net = net;

  stmts.cashoutCrashBet.run(finalMult, payout, fee, net, entry.betId);

  stmts.addCrashStats.run(1, 0, net, 0, payout, 12, 12, Date.now(), userId);

  stmts.insertCrashHistory.run(
    uuidv4(),
    userId,
    crashEngineState.currentRoundId,
    crashEngineState.currentRoundNumber,
    entry.bet,
    crashEngineState.currentCrashPoint,
    1,
    finalMult,
    payout,
    net,
    newBalance,
    Date.now()
  );

  trackGambleStreak(userId);
  checkReferralPayout(userId);

  broadcastToUser(userId, { type: 'balance', balance: newBalance });

  const unlocked = checkAchievements(stmts.getUser.get(userId), {
    crashMultiplier: finalMult
  });

  broadcastAll({
    type: 'crash_cashout',
    roundId: crashEngineState.currentRoundId,
    userId,
    username: entry.username,
    multiplier: finalMult,
    payout,
    fee,
    net,
    isAuto: !!isAuto
  });

  return { ok: true, multiplier: finalMult, payout, fee, net, balance: newBalance, unlocked };
}

function registerCrashViewer(socketId){
  crashEngineState.activeViewers.add(socketId);
  if(crashEngineState.state === CRASH_STATE.IDLE){
    wakeEngine();
  }
}

function unregisterCrashViewer(socketId){
  crashEngineState.activeViewers.delete(socketId);
  if(crashEngineState.activeViewers.size === 0){
    crashEngineState.idleSince = Date.now();
  }
}

/* ============================================================
   CRASH ROUTES
   ============================================================ */
app.get('/api/crash/state', requireAuth, (req, res) => {
  try {
    const state = {
      roundId: crashEngineState.currentRoundId,
      roundNumber: crashEngineState.currentRoundNumber,
      state: crashEngineState.state,
      stateStartedAt: crashEngineState.stateStartedAt,
      currentMultiplier: crashEngineState.currentMultiplier,
      waitingMs: crashEngine.CONFIG.waitingMs,
      startingMs: crashEngine.CONFIG.startingMs,
      crashedMs: crashEngine.CONFIG.crashedMs,
      config: {
        baseEdge: crashEngine.CONFIG.baseEdge,
        edgeTiers: crashEngine.CONFIG.edgeTiers,
        minBet: crashEngine.CONFIG.minBet,
        maxBet: crashEngine.CONFIG.maxBet,
        autoCashoutOffset: crashEngine.CONFIG.autoCashoutOffset,
        feeBands: crashEngine.CONFIG.feeBands,
        cashoutDelayMs: crashEngine.CONFIG.cashoutDelayMs
      }
    };

    if(crashEngineState.state === CRASH_STATE.RUNNING){
      state.elapsed = Date.now() - crashEngineState.runningStartedAt;
      state.currentMultiplier = crashEngine.multiplierAt(state.elapsed);
    }

    const betsForRound = [...crashEngineState.bets.values()];
    state.playerBets = betsForRound.map(b => ({
      userId: b.userId,
      username: b.username,
      avatar: avatarForUser({ id: b.userId, avatar: b.avatar }) || b.avatar,
      bet: b.bet,
      cashedOut: !!b.cashedOut,
      cashoutMultiplier: b.cashoutMultiplier || null,
      cashoutValue: b.cashoutValue || null
    }));

    const mine = crashEngineState.bets.get(String(req.userId));
    if(mine){
      state.myBet = {
        bet: mine.bet,
        autoCashout: mine.autoCashout || null,
        cashedOut: !!mine.cashedOut,
        cashoutMultiplier: mine.cashoutMultiplier || null,
        cashoutValue: mine.cashoutValue || null,
        fee: mine.fee || 0,
        net: mine.net || 0
      };
    } else {
      state.myBet = null;
    }

    res.json({ ok: true, state });
  } catch (err) {
    console.error('[crash/state]', err);
    res.status(500).json({ error: 'SERVER_ERROR' });
  }
});

app.post('/api/crash/bet', crashLimiter, requireAuth, (req, res) => {
  try {
    const betNum = Number(req.body.bet);
    const autoCashoutRaw = req.body.autoCashout;
    const autoCashout = (autoCashoutRaw === null || autoCashoutRaw === undefined || autoCashoutRaw === '')
      ? null
      : Number(autoCashoutRaw);

    if(!Number.isInteger(betNum) || betNum < crashEngine.CONFIG.minBet)
      return res.status(400).json({ error: 'INVALID_BET', min: crashEngine.CONFIG.minBet });

    if(autoCashout !== null && (!Number.isFinite(autoCashout) || autoCashout < 1.01 || autoCashout > 10000))
      return res.status(400).json({ error: 'INVALID_AUTO' });

    if(crashEngineState.state !== CRASH_STATE.WAITING)
      return res.status(400).json({ error: 'NOT_WAITING' });

    const user = ensureUser(req.userId, req.username);
    if(user.balance < betNum)
      return res.status(400).json({ error: 'INSUFFICIENT_BALANCE', balance: user.balance });

    if(crashEngineState.bets.has(user.id))
      return res.status(400).json({ error: 'ALREADY_BET' });

    const newBalance = user.balance - betNum;
    updateBalance(user.id, newBalance);

    const edge = crashEngine.edgeForBet(betNum);
    const betId = uuidv4();

    stmts.insertCrashBet.run(
      betId,
      crashEngineState.currentRoundId,
      user.id,
      user.display_name || user.username,
      betNum,
      edge,
      autoCashout,
      Date.now()
    );

    crashEngineState.bets.set(user.id, {
      betId,
      userId: user.id,
      username: user.display_name || user.username,
      avatar: avatarForUser(user),
      bet: betNum,
      edge,
      autoCashout,
      cashedOut: 0,
      cashoutMultiplier: null,
      cashoutValue: null,
      fee: 0,
      net: 0
    });

    broadcastToUser(user.id, { type: 'balance', balance: newBalance });

    broadcastAll({
      type: 'crash_bet_placed',
      roundId: crashEngineState.currentRoundId,
      userId: user.id,
      username: user.display_name || user.username,
      avatar: avatarForUser(user),
      bet: betNum,
      autoCashout
    });

    res.json({ ok: true, balance: newBalance, edge });
  } catch (err) {
    console.error('[crash/bet]', err);
    res.status(500).json({ error: 'SERVER_ERROR' });
  }
});

app.post('/api/crash/cashout', crashLimiter, requireAuth, (req, res) => {
  try {
    const userId = String(req.userId);
    const entry = crashEngineState.bets.get(userId);

    if(!entry) return res.status(400).json({ error: 'NO_BET' });
    if(entry.cashedOut) return res.status(400).json({ error: 'ALREADY_CASHED_OUT' });
    if(crashEngineState.state !== CRASH_STATE.RUNNING) return res.status(400).json({ error: 'NOT_RUNNING' });

    const clickMult = crashEngineState.currentMultiplier;

    setTimeout(() => {
      const currentMult = crashEngineState.currentMultiplier;

      if(currentMult >= crashEngineState.currentCrashPoint ||
         crashEngineState.state !== CRASH_STATE.RUNNING){
        return res.json({ ok: false, error: 'TOO_LATE', crashPoint: crashEngineState.currentCrashPoint });
      }

      const result = tryCashout(userId, clickMult, false);
      if(!result.ok){
        return res.json({ ok: false, error: result.error });
      }
      res.json({ ok: true, ...result });
    }, crashEngine.CONFIG.cashoutDelayMs);

  } catch (err) {
    console.error('[crash/cashout]', err);
    res.status(500).json({ error: 'SERVER_ERROR' });
  }
});

app.get('/api/crash/history', requireAuth, (req, res) => {
  try {
    const rounds = stmts.recentCrashRounds.all();
    res.json({
      rounds: rounds.map(r => ({
        roundNumber: r.round_number,
        crashPoint: r.crash_point,
        serverSeedHash: r.server_seed_hash,
        startedAt: r.started_at,
        endedAt: r.ended_at
      }))
    });
  } catch (err) {
    console.error('[crash/history]', err);
    res.status(500).json({ error: 'SERVER_ERROR' });
  }
});

app.get('/api/crash/mine', requireAuth, (req, res) => {
  try {
    const rows = stmts.recentCrashHistory.all(req.userId);
    res.json({
      history: rows.map(r => ({
        id: r.id,
        roundNumber: r.round_number,
        bet: r.bet,
        crashPoint: r.crash_point,
        cashedOut: !!r.cashed_out,
        cashoutMultiplier: r.cashout_multiplier,
        payout: r.payout,
        net: r.net,
        timestamp: r.created_at
      }))
    });
  } catch (err) {
    console.error('[crash/mine]', err);
    res.status(500).json({ error: 'SERVER_ERROR' });
  }
});

/* ============================================================
   REWARDS ROUTES
   ============================================================ */
app.get('/api/rewards/status', requireAuth, (req, res) => {
  try {
    const user = ensureUser(req.userId, req.username);

    const unlockedAt = user.reward_unlocked_at || 0;
    const claimedAt = user.reward_claimed_at || 0;

    const isUnlocked = !!unlockedAt;
    const isClaimed = !!claimedAt;

    const streak = user.gamble_streak || 0;
    const todayCount = user.today_play_count || 0;
    const lastDay = user.last_played_day || null;
    const todayKey = rewards.pacificDayKey();

    let effectiveStreak = streak;
    if(lastDay && lastDay !== todayKey && lastDay !== rewards.previousDayKey(todayKey)){
      effectiveStreak = 0;
    }

    let todayProgress = 0;
    if(lastDay === todayKey){
      todayProgress = todayCount;
    }

    res.json({
      ok: true,
      reward: rewards.REWARD_RC,
      unlocked: isUnlocked,
      claimed: isClaimed,
      unlockedAt: unlockedAt,
      claimedAt: claimedAt,
      progress: {
        streak: effectiveStreak,
        days_needed: rewards.UNLOCK_DAYS,
        days_remaining: Math.max(0, rewards.UNLOCK_DAYS - effectiveStreak),
        today_count: todayProgress,
        games_needed_today: rewards.UNLOCK_MIN_GAMES,
        games_remaining_today: Math.max(0, rewards.UNLOCK_MIN_GAMES - todayProgress),
        today_key: todayKey,
        last_played_day: lastDay
      },
      resetsAt: rewards.nextPacificMidnight()
    });
  } catch (err) {
    console.error('[rewards/status]', err);
    res.status(500).json({ error: 'SERVER_ERROR' });
  }
});

app.post('/api/rewards/claim', rewardLimiter, requireAuth, (req, res) => {
  try {
    const user = ensureUser(req.userId, req.username);

    if(user.reward_claimed_at){
      return res.status(400).json({ error: 'ALREADY_CLAIMED' });
    }
    if(!user.reward_unlocked_at){
      return res.status(403).json({ error: 'NOT_UNLOCKED' });
    }

    const reward = rewards.REWARD_RC;
    const newBalance = user.balance + reward;

    updateBalance(user.id, newBalance);

    const now = Date.now();
    const claimRes = stmts.claimReward.run(now, now, user.id);

    if(claimRes.changes === 0){
      return res.status(400).json({ error: 'ALREADY_CLAIMED' });
    }

    stmts.insertTx.run(
      uuidv4(),
      user.id,
      'unlock_reward',
      reward,
      newBalance,
      JSON.stringify({ kind: 'seven_day_unlock' }),
      now
    );

    broadcastToUser(user.id, { type: 'balance', balance: newBalance });

    const freshUser = stmts.getUser.get(user.id);
    const unlocked = checkAchievements(freshUser, null);

    res.json({
      ok: true,
      reward: reward,
      balance: newBalance,
      unlocked: unlocked
    });
  } catch (err) {
    console.error('[rewards/claim]', err);
    res.status(500).json({ error: 'SERVER_ERROR' });
  }
});

/* ============================================================
   REFERRALS
   ============================================================ */
app.get('/api/referrals/me', requireAuth, (req, res) => {
  try {
    const user = ensureUser(req.userId, req.username);
    if(!user.referral_code){
      const code = referrals.codeForUser(user.id);
      stmts.setReferralCode.run(code, Date.now(), user.id);
    }
    const fresh = stmts.getUser.get(user.id);
    const refs = stmts.referralsByUser.all(user.id);

    res.json({
      code: fresh.referral_code,
      count: fresh.referral_count || 0,
      earnings: fresh.referral_earnings || 0,
      maxReferrals: referrals.MAX_SUCCESSFUL_REFERRALS,
      referrerBonus: referrals.REFERRER_BONUS,
      referredBonus: referrals.REFERRED_BONUS,
      unlockGames: referrals.REFERRER_UNLOCK_GAMES,
      referrals: refs.map(r => ({
        id: r.id,
        referredId: r.referred_id,
        paid: !!r.bonus_paid,
        amount: r.bonus_amount || 0,
        createdAt: r.created_at,
        paidAt: r.paid_at
      }))
    });
  } catch (err) {
    console.error('[referrals/me]', err);
    res.status(500).json({ error: 'SERVER_ERROR' });
  }
});

/* ============================================================
   SHOP
   ============================================================ */
app.get('/api/shop/catalog', requireAuth, (req, res) => {
  try {
    const user = ensureUser(req.userId, req.username);
    const owned = stmts.userItems.all(user.id).map(r => r.item_id);

    const categories = Object.entries(shop.CATEGORIES).map(([key, label]) => ({
      id: key,
      label,
      items: shop.itemsByCategory(key).map(it => ({
        id: it.id,
        name: it.name,
        price: it.price,
        value: it.value,
        preview: it.preview,
        category: it.category,
        owned: owned.includes(it.id)
      }))
    }));

    res.json({
      categories,
      equipped: {
        nameColor: user.name_color,
        avatarRing: user.avatar_ring,
        profileBanner: user.profile_banner,
        chatBadge: user.chat_badge
      }
    });
  } catch (err) {
    console.error('[shop/catalog]', err);
    res.status(500).json({ error: 'SERVER_ERROR' });
  }
});

app.post('/api/shop/buy', socialLimiter, requireAuth, (req, res) => {
  try {
    const { itemId } = req.body;
    if(!itemId || typeof itemId !== 'string')
      return res.status(400).json({ error: 'INVALID_ITEM' });

    const item = shop.getItem(itemId);
    if(!item) return res.status(404).json({ error: 'ITEM_NOT_FOUND' });

    const user = ensureUser(req.userId, req.username);

    if(stmts.userHasItem.get(user.id, item.id)){
      return res.status(400).json({ error: 'ALREADY_OWNED' });
    }

    if(user.balance < item.price){
      return res.status(400).json({ error: 'INSUFFICIENT_BALANCE', balance: user.balance });
    }

    const newBalance = user.balance - item.price;
    updateBalance(user.id, newBalance);

    stmts.insertUserItem.run(
      uuidv4(), user.id, item.id, item.category, Date.now()
    );

    stmts.insertTx.run(
      uuidv4(), user.id, 'shop_purchase', -item.price, newBalance,
      JSON.stringify({ itemId: item.id, category: item.category }), Date.now()
    );

    const unlocked = checkAchievements(stmts.getUser.get(user.id), { shopped: true });

    broadcastToUser(user.id, { type: 'balance', balance: newBalance });

    res.json({
      ok: true,
      item: { id: item.id, name: item.name, category: item.category },
      balance: newBalance,
      unlocked
    });
  } catch (err) {
    console.error('[shop/buy]', err);
    res.status(500).json({ error: 'SERVER_ERROR' });
  }
});

app.post('/api/shop/equip', socialLimiter, requireAuth, (req, res) => {
  try {
    const { itemId } = req.body;
    if(!itemId || typeof itemId !== 'string')
      return res.status(400).json({ error: 'INVALID_ITEM' });

    const item = shop.getItem(itemId);
    if(!item) return res.status(404).json({ error: 'ITEM_NOT_FOUND' });

    const user = ensureUser(req.userId, req.username);

    if(!stmts.userHasItem.get(user.id, item.id)){
      return res.status(400).json({ error: 'NOT_OWNED' });
    }

    const args = {
      name_color: null,
      avatar_ring: null,
      profile_banner: null,
      chat_badge: null
    };
    if(item.category === 'name_color')     args.name_color = item.value;
    if(item.category === 'avatar_ring')    args.avatar_ring = item.value;
    if(item.category === 'profile_banner') args.profile_banner = item.value;
    if(item.category === 'chat_badge')     args.chat_badge = item.value;

    stmts.setCosmetic.run(
      args.name_color,
      args.avatar_ring,
      args.profile_banner,
      args.chat_badge,
      Date.now(),
      user.id
    );

    const fresh = stmts.getUser.get(user.id);

    res.json({
      ok: true,
      equipped: {
        nameColor: fresh.name_color,
        avatarRing: fresh.avatar_ring,
        profileBanner: fresh.profile_banner,
        chatBadge: fresh.chat_badge
      }
    });
  } catch (err) {
    console.error('[shop/equip]', err);
    res.status(500).json({ error: 'SERVER_ERROR' });
  }
});

app.post('/api/shop/unequip', socialLimiter, requireAuth, (req, res) => {
  try {
    const { category } = req.body;
    if(!['name_color','avatar_ring','profile_banner','chat_badge'].includes(category))
      return res.status(400).json({ error: 'INVALID_CATEGORY' });

    const user = ensureUser(req.userId, req.username);

    const colMap = {
      name_color: 'name_color',
      avatar_ring: 'avatar_ring',
      profile_banner: 'profile_banner',
      chat_badge: 'chat_badge'
    };
    db.prepare(`UPDATE users SET ${colMap[category]} = NULL, updated_at = ? WHERE id = ?`).run(Date.now(), user.id);

    res.json({ ok: true });
  } catch (err) {
    console.error('[shop/unequip]', err);
    res.status(500).json({ error: 'SERVER_ERROR' });
  }
});

app.get('/api/shop/owned', requireAuth, (req, res) => {
  try {
    const user = ensureUser(req.userId, req.username);
    const rows = stmts.userItems.all(user.id);
    res.json({
      items: rows.map(r => ({
        itemId: r.item_id,
        category: r.category,
        purchasedAt: r.purchased_at
      })),
      equipped: {
        nameColor: user.name_color,
        avatarRing: user.avatar_ring,
        profileBanner: user.profile_banner,
        chatBadge: user.chat_badge
      }
    });
  } catch (err) {
    console.error('[shop/owned]', err);
    res.status(500).json({ error: 'SERVER_ERROR' });
  }
});

/* ============================================================
   SOCIAL — FOLLOWS
   ============================================================ */
app.post('/api/social/follow/:userId', socialLimiter, requireAuth, (req, res) => {
  try {
    const targetId = String(req.params.userId);
    if(targetId === String(req.userId)){
      return res.status(400).json({ error: 'CANNOT_FOLLOW_SELF' });
    }
    if(!social.canFollow()){
      return res.status(403).json({ error: 'FOLLOW_LIMIT' });
    }

    const target = stmts.getUser.get(targetId);
    if(!target) return res.status(404).json({ error: 'USER_NOT_FOUND' });

    const me = ensureUser(req.userId, req.username);

    const existing = stmts.getFollow.get(me.id, targetId);
    if(existing){
      return res.json({ ok: true, following: true, alreadyFollowing: true });
    }

    stmts.insertFollow.run(uuidv4(), me.id, targetId, Date.now());

    const unlocked = checkAchievements(stmts.getUser.get(me.id), { followed: true });

    broadcastToUser(targetId, { type: 'new_follower', userId: me.id, username: me.display_name || me.username });

    res.json({
      ok: true,
      following: true,
      followers: stmts.followersCount.get(targetId).c,
      unlocked
    });
  } catch (err) {
    console.error('[social/follow]', err);
    res.status(500).json({ error: 'SERVER_ERROR' });
  }
});

app.delete('/api/social/follow/:userId', socialLimiter, requireAuth, (req, res) => {
  try {
    const targetId = String(req.params.userId);
    const me = ensureUser(req.userId, req.username);

    stmts.removeFollow.run(me.id, targetId);

    res.json({
      ok: true,
      following: false,
      followers: stmts.followersCount.get(targetId).c
    });
  } catch (err) {
    console.error('[social/unfollow]', err);
    res.status(500).json({ error: 'SERVER_ERROR' });
  }
});

app.get('/api/social/followers/:userId', requireAuth, (req, res) => {
  try {
    const targetId = String(req.params.userId);
    const count = stmts.followersCount.get(targetId).c;
    res.json({ count, userId: targetId });
  } catch (err) {
    console.error('[social/followers]', err);
    res.status(500).json({ error: 'SERVER_ERROR' });
  }
});

app.get('/api/social/following/:userId', requireAuth, (req, res) => {
  try {
    const targetId = String(req.params.userId);
    const rows = stmts.followingList.all(targetId);
    const ids = rows.map(r => r.followed_id);

    const users = [];
    for(const id of ids){
      const u = stmts.getUser.get(id);
      if(u){
        users.push({
          id: u.id,
          username: u.display_name || u.username,
          avatar: avatarForUser(u),
          level: u.level,
          rank: u.rank
        });
      }
    }

    res.json({ users, count: users.length });
  } catch (err) {
    console.error('[social/following]', err);
    res.status(500).json({ error: 'SERVER_ERROR' });
  }
});

app.get('/api/social/status/:userId', requireAuth, (req, res) => {
  try {
    const targetId = String(req.params.userId);
    const me = String(req.userId);

    const following = !!stmts.getFollow.get(me, targetId);
    const followers = stmts.followersCount.get(targetId).c;
    const followingCount = stmts.followingCount.get(me).c;

    res.json({ following, followers, followingCount });
  } catch (err) {
    console.error('[social/status]', err);
    res.status(500).json({ error: 'SERVER_ERROR' });
  }
});

/* ============================================================
   PROFILE — richer self view
   ============================================================ */
app.get('/api/profile/me/transactions', requireAuth, (req, res) => {
  try {
    const limit = Math.min(500, Math.max(10, parseInt(req.query.limit, 10) || 200));
    const rows = db.prepare(`
      SELECT id, type, amount, balance_after, meta, created_at
      FROM transactions
      WHERE user_id = ?
      ORDER BY created_at DESC
      LIMIT ?
    `).all(req.userId, limit);

    res.json({
      transactions: rows.map(t => ({
        id: t.id,
        type: t.type,
        amount: t.amount,
        balanceAfter: t.balance_after,
        meta: t.meta ? (() => { try { return JSON.parse(t.meta); } catch { return null; } })() : null,
        timestamp: t.created_at
      }))
    });
  } catch (err) {
    console.error('[profile/transactions]', err);
    res.status(500).json({ error: 'SERVER_ERROR' });
  }
});

app.get('/api/profile/me/activity', requireAuth, (req, res) => {
  try {
    const limit = Math.min(60, Math.max(10, parseInt(req.query.limit, 10) || 30));

    const flips = db.prepare(`
      SELECT 'flip' AS kind, id, bet, net, win, result AS detail, created_at
      FROM flips WHERE user_id = ?
      ORDER BY created_at DESC LIMIT ?
    `).all(req.userId, limit);

    const mines = db.prepare(`
      SELECT 'mines' AS kind, id, bet, net, (result = 'won') AS win,
             (CAST(picks AS TEXT) || ' picks · ' || printf('%.2f', multiplier) || 'x') AS detail,
             created_at
      FROM mines_history WHERE user_id = ?
      ORDER BY created_at DESC LIMIT ?
    `).all(req.userId, limit);

    const crash = db.prepare(`
      SELECT 'crash' AS kind, id, bet, net, (cashed_out = 1) AS win,
             (CASE WHEN cashed_out = 1
                   THEN printf('%.2f', cashout_multiplier) || 'x · crashed ' || printf('%.2f', crash_point) || 'x'
                   ELSE 'crashed ' || printf('%.2f', crash_point) || 'x' END) AS detail,
             created_at
      FROM crash_history WHERE user_id = ?
      ORDER BY created_at DESC LIMIT ?
    `).all(req.userId, limit);

    const casesRow = db.prepare(`
      SELECT 'case' AS kind, cb.id, cb.entry_price AS bet,
             CASE WHEN cb.winner_id = ? THEN COALESCE(cb.total_value, 0) - cb.entry_price ELSE -cb.entry_price END AS net,
             (cb.winner_id = ?) AS win,
             cb.case_name AS detail,
             cb.created_at
      FROM case_battles cb
      WHERE cb.creator_id = ? OR cb.id IN (SELECT battle_id FROM case_battle_players WHERE user_id = ?)
      ORDER BY cb.created_at DESC LIMIT ?
    `).all(req.userId, req.userId, req.userId, req.userId, limit);

    const merged = [...flips, ...mines, ...crash, ...casesRow]
      .sort((a, b) => b.created_at - a.created_at)
      .slice(0, limit)
      .map(r => ({
        kind: r.kind,
        id: r.id,
        bet: r.bet,
        net: r.net,
        win: !!r.win,
        detail: r.detail,
        timestamp: r.created_at
      }));

    res.json({ activity: merged });
  } catch (err) {
    console.error('[profile/activity]', err);
    res.status(500).json({ error: 'SERVER_ERROR' });
  }
});

app.get('/api/profile/me/summary', requireAuth, (req, res) => {
  try {
    const user = ensureUser(req.userId, req.username);

    const flipStats = db.prepare(`
      SELECT
        COUNT(*) AS total,
        SUM(CASE WHEN win = 1 THEN 1 ELSE 0 END) AS wins,
        COALESCE(SUM(bet), 0) AS wagered,
        COALESCE(SUM(CASE WHEN win = 1 THEN payout ELSE 0 END), 0) AS paid,
        COALESCE(MAX(payout), 0) AS best
      FROM flips WHERE user_id = ?
    `).get(req.userId);

    const streak = db.prepare(`
      SELECT win FROM flips WHERE user_id = ?
      ORDER BY created_at DESC LIMIT 20
    `).all(req.userId);

    let currentStreak = 0;
    for(const f of streak){
      if(f.win) currentStreak++;
      else break;
    }

    let bestStreak = 0;
    let run = 0;
    for(const f of streak){
      if(f.win){ run++; if(run > bestStreak) bestStreak = run; }
      else run = 0;
    }

    const achCount = db.prepare(`
      SELECT COUNT(*) AS c FROM achievements WHERE user_id = ?
    `).get(req.userId).c;

    const rankRow = db.prepare(`
      SELECT COUNT(*) + 1 AS rank
      FROM users
      WHERE total_wagered > ? AND games_played > 0
    `).get(user.total_wagered).rank;

    res.json({
      summary: {
        flips: {
          total: flipStats.total || 0,
          wins: flipStats.wins || 0,
          wagered: flipStats.wagered || 0,
          paid: flipStats.paid || 0,
          best: flipStats.best || 0
        },
        streaks: {
          current: currentStreak,
          best: bestStreak
        },
        achievements: achCount,
        globalRank: rankRow,
        memberSince: user.created_at
      }
    });
  } catch (err) {
    console.error('[profile/summary]', err);
    res.status(500).json({ error: 'SERVER_ERROR' });
  }
});

/* ============================================================
   ADMIN ROUTES
   ============================================================ */
app.get('/api/admin/stats', requireAdmin, (req, res) => {
  try {
    const now = Date.now();
    const dayAgo = now - 24*60*60*1000;
    const weekAgo = now - 7*24*60*60*1000;

    const totalUsers = db.prepare('SELECT COUNT(*) AS c FROM users').get().c;
    const activeUsers24h = db.prepare('SELECT COUNT(*) AS c FROM users WHERE updated_at > ?').get(dayAgo).c;
    const activeUsers7d = db.prepare('SELECT COUNT(*) AS c FROM users WHERE updated_at > ?').get(weekAgo).c;
    const newUsers24h = db.prepare('SELECT COUNT(*) AS c FROM users WHERE created_at > ?').get(dayAgo).c;
    const totalBalance = db.prepare('SELECT COALESCE(SUM(balance),0) AS s FROM users').get().s;

    const flips24h = db.prepare('SELECT COUNT(*) AS c, COALESCE(SUM(bet),0) AS w FROM flips WHERE created_at > ?').get(dayAgo);
    const mines24h = db.prepare('SELECT COUNT(*) AS c FROM mines_history WHERE created_at > ?').get(dayAgo).c;
    const crash24h = db.prepare('SELECT COUNT(*) AS c FROM crash_bets WHERE created_at > ?').get(dayAgo).c;
    const cases24h = db.prepare('SELECT COUNT(*) AS c FROM case_battles WHERE created_at > ?').get(dayAgo).c;
    const chat24h = db.prepare('SELECT COUNT(*) AS c FROM global_chat_messages WHERE created_at > ? AND deleted = 0').get(dayAgo).c;

    res.json({
      users: { total: totalUsers, active24h: activeUsers24h, active7d: activeUsers7d, new24h: newUsers24h },
      economy: { totalBalance },
      activity: {
        flips24h: flips24h.c,
        flipsWagered24h: flips24h.w,
        mines24h,
        crash24h,
        cases24h,
        chat24h
      }
    });
  } catch (err) {
    console.error('[admin/stats]', err);
    res.status(500).json({ error: 'SERVER_ERROR' });
  }
});

app.get('/api/admin/users', requireAdmin, (req, res) => {
  try {
    const q = String(req.query.q || '').trim();
    const limit = Math.min(500, Math.max(10, parseInt(req.query.limit, 10) || 200));
    // Ensure optional columns exist
    try { addCol('users', 'banned', 'INTEGER DEFAULT 0'); } catch(e){}
    try { addCol('users', 'ban_until', 'INTEGER'); } catch(e){}
    try { addCol('users', 'ban_reason', 'TEXT'); } catch(e){}
    try { addCol('users', 'last_ip', 'TEXT'); } catch(e){}
    try { addCol('users', 'last_user_agent', 'TEXT'); } catch(e){}
    try { addCol('users', 'last_login_at', 'INTEGER'); } catch(e){}
    try { addCol('users', 'blox_coins', 'REAL DEFAULT 0'); } catch(e){}

    let rows;
    if(q){
      const pattern = '%' + q + '%';
      rows = db.prepare(`
        SELECT * FROM users
        WHERE username LIKE ? OR display_name LIKE ? OR id = ? OR IFNULL(last_ip,'') LIKE ?
        ORDER BY updated_at DESC LIMIT ?
      `).all(pattern, pattern, q, pattern, limit);
    } else {
      rows = db.prepare(`SELECT * FROM users ORDER BY created_at DESC LIMIT ?`).all(limit);
    }

    const now = Date.now();
    res.json({
      users: rows.map(u => {
        const banned = !!u.banned || (u.ban_until && u.ban_until > now);
        return {
          id: u.id,
          username: u.username,
          displayName: u.display_name || u.username,
          avatar: (typeof avatarForUser === 'function' ? avatarForUser(u) : u.avatar) || ('/api/avatar/' + u.id),
          balance: u.balance || 0,
          bloxCoins: u.blox_coins || 0,
          level: u.level,
          rank: u.rank,
          isAdmin: !!u.is_admin,
          vip: !!u.vip,
          chatBadge: u.chat_badge || null,
          gamesPlayed: u.games_played,
          totalWagered: u.total_wagered,
          referralCode: u.referral_code,
          createdAt: u.created_at,
          updatedAt: u.updated_at,
          online: u.updated_at && (now - u.updated_at) < 120000,
          banned: banned,
          banUntil: u.ban_until || null,
          banReason: u.ban_reason || null,
          lastIp: u.last_ip || null,
          lastUserAgent: u.last_user_agent || null,
          lastLoginAt: u.last_login_at || null
        };
      })
    });
  } catch (err) {
    console.error('[admin/users]', err);
    res.status(500).json({ error: 'SERVER_ERROR', message: String(err && err.message || err) });
  }
});

app.post('/api/admin/users/:id/balance', requireAdmin, (req, res) => {
  try {
    const id = req.params.id;
    const { action, amount, currency } = req.body || {};
    const amt = parseInt(amount, 10);
    if(!Number.isFinite(amt) || amt < 0) return res.status(400).json({ error: 'INVALID_AMOUNT' });
    const u = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
    if(!u) return res.status(404).json({ error: 'NOT_FOUND' });
    try { addCol('users', 'blox_coins', 'REAL DEFAULT 0'); } catch(e){}
    const cur = String(currency || 'rc').toLowerCase();
    const now = Date.now();
    if(cur === 'bc' || cur === 'blox' || cur === 'bloxcoins'){
      let next = Number(u.blox_coins || 0);
      if(action === 'set') next = amt;
      else next = next + amt;
      if(next < 0) next = 0;
      db.prepare('UPDATE users SET blox_coins = ?, updated_at = ? WHERE id = ?').run(next, now, id);
      try { logAdmin(req.user, 'balance_bc', u, { action, amount: amt, next }, req); } catch(e){}
      return res.json({ ok: true, bloxCoins: next, balance: u.balance });
    }
    let next = Number(u.balance || 0);
    if(action === 'set') next = amt;
    else next = next + amt;
    if(next < 0) next = 0;
    db.prepare('UPDATE users SET balance = ?, updated_at = ? WHERE id = ?').run(next, now, id);
    try { logAdmin(req.user, 'balance', u, { action, amount: amt, next }, req); } catch(e){}
    res.json({ ok: true, balance: next, bloxCoins: u.blox_coins || 0 });
  } catch (err) {
    console.error('[admin/balance]', err);
    res.status(500).json({ error: 'SERVER_ERROR' });
  }
});


app.post('/api/admin/users/:id/ban', requireAdmin, (req, res) => {
  try {
    try { addCol('users', 'banned', 'INTEGER DEFAULT 0'); } catch(e){}
    try { addCol('users', 'ban_until', 'INTEGER'); } catch(e){}
    try { addCol('users', 'ban_reason', 'TEXT'); } catch(e){}
    const id = String(req.params.id);
    const body = req.body || {};
    const permanent = body.permanent === true || body.permanent === 'true' || body.permanent === 1;
    const hours = parseInt(body.hours, 10);
    const reason = String(body.reason || 'Banned by admin').slice(0, 200);
    const now = Date.now();
    let banUntil = null;
    if(!permanent){
      const h = Number.isFinite(hours) && hours >= 1 ? hours : 24;
      banUntil = now + h * 3600 * 1000;
    }
    const result = db.prepare('UPDATE users SET banned = 1, ban_until = ?, ban_reason = ?, updated_at = ? WHERE id = ?')
      .run(banUntil, reason, now, id);
    if(result.changes === 0) return res.status(404).json({ error: 'USER_NOT_FOUND' });
    try { broadcastToUser(id, { type: 'banned', banUntil, permanent, reason }); } catch(e){}
    try { logAdmin(req.adminUser || { id: req.userId }, 'ban', { id }, { permanent, banUntil, reason }, req); } catch(e){}
    res.json({ ok: true, banned: true, banUntil, permanent, reason });
  } catch (err) {
    console.error('[admin/ban]', err);
    res.status(500).json({ error: 'SERVER_ERROR', message: String(err && err.message || err) });
  }
});


app.post('/api/admin/users/:id/reset-wagered', requireAdmin, (req, res) => {
  try {
    const id = req.params.id;
    db.prepare('UPDATE users SET total_wagered = 0, updated_at = ? WHERE id = ?').run(Date.now(), id);
    res.json({ ok: true });
  } catch (err) {
    console.error('[admin/reset-wagered]', err);
    res.status(500).json({ error: 'SERVER_ERROR' });
  }
});

app.post('/api/admin/users/:id/unban', requireAdmin, (req, res) => {
  try {
    const id = req.params.id;
    db.prepare('UPDATE users SET banned = 0, ban_until = NULL, ban_reason = NULL, updated_at = ? WHERE id = ?')
      .run(Date.now(), id);
    res.json({ ok: true, banned: false });
  } catch (err) {
    console.error('[admin/unban]', err);
    res.status(500).json({ error: 'SERVER_ERROR' });
  }
});


app.post('/api/admin/users/:id/badges', requireAdmin, (req, res) => {
  try {
    try { addCol('users', 'vip', 'INTEGER DEFAULT 0'); } catch(e){}
    try { addCol('users', 'chat_badge', 'TEXT'); } catch(e){}
    const id = String(req.params.id);
    const body = req.body || {};
    const vip = body.vip ? 1 : 0;
    const chatBadge = body.chatBadge != null ? String(body.chatBadge).slice(0, 32) : null;
    // isAdmin handled separately; vip is cosmetic rank badge
    db.prepare('UPDATE users SET vip = ?, chat_badge = COALESCE(?, chat_badge), updated_at = ? WHERE id = ?')
      .run(vip, chatBadge, Date.now(), id);
    const u = db.prepare('SELECT id, is_admin, vip, chat_badge FROM users WHERE id = ?').get(id);
    res.json({
      ok: true,
      isAdmin: !!(u && u.is_admin),
      vip: !!(u && u.vip),
      chatBadge: u && u.chat_badge || null
    });
  } catch (err) {
    console.error('[admin/badges]', err);
    res.status(500).json({ error: 'SERVER_ERROR' });
  }
});

app.post('/api/admin/users/:id/admin', requireAdmin, (req, res) => {
  try {
    const targetId = String(req.params.id);
    const body = req.body || {};
    const enable = body.isAdmin != null ? !!body.isAdmin : !!body.enable;

    const adminId = String((req.adminUser && req.adminUser.id) || req.userId || '');
    if(targetId === adminId && !enable){
      return res.status(400).json({ error: 'CANNOT_DEMOTE_SELF' });
    }

    const target = stmts.getUser.get(targetId);
    if(!target) return res.status(404).json({ error: 'USER_NOT_FOUND' });

    db.prepare('UPDATE users SET is_admin = ?, updated_at = ? WHERE id = ?')
      .run(enable ? 1 : 0, Date.now(), targetId);

    try { logAdmin(req.adminUser || { id: req.userId, username: req.username }, 'set_admin', target, { isAdmin: enable }, req); } catch(e){}
    res.json({ ok: true, isAdmin: enable });
  } catch (err) {
    console.error('[admin/toggle-admin]', err);
    res.status(500).json({ error: 'SERVER_ERROR', message: String(err && err.message || err) });
  }
});

app.get('/api/admin/transactions', requireAdmin, (req, res) => {
  try {
    const limit = Math.min(200, Math.max(10, parseInt(req.query.limit, 10) || 100));
    const rows = db.prepare(`
      SELECT t.id, t.user_id, t.type, t.amount, t.balance_after, t.meta, t.created_at,
             u.username, u.display_name
      FROM transactions t
      LEFT JOIN users u ON u.id = t.user_id
      ORDER BY t.created_at DESC LIMIT ?
    `).all(limit);

    res.json({
      transactions: rows.map(t => ({
        id: t.id,
        userId: t.user_id,
        username: t.display_name || t.username || 'Unknown',
        type: t.type,
        amount: t.amount,
        balanceAfter: t.balance_after,
        meta: t.meta ? (() => { try { return JSON.parse(t.meta); } catch { return null; } })() : null,
        timestamp: t.created_at
      }))
    });
  } catch (err) {
    console.error('[admin/transactions]', err);
    res.status(500).json({ error: 'SERVER_ERROR' });
  }
});

app.get('/api/admin/chat/recent', requireAdmin, (req, res) => {
  try {
    const rows = db.prepare(`
      SELECT id, user_id, username, message, deleted, created_at
      FROM global_chat_messages
      ORDER BY created_at DESC LIMIT 100
    `).all();

    res.json({
      messages: rows.map(m => ({
        id: m.id,
        userId: m.user_id,
        username: m.username,
        message: m.message,
        deleted: !!m.deleted,
        timestamp: m.created_at
      }))
    });
  } catch (err) {
    console.error('[admin/chat]', err);
    res.status(500).json({ error: 'SERVER_ERROR' });
  }
});

app.delete('/api/admin/chat/:id', requireAdmin, (req, res) => {
  try {
    const id = req.params.id;
    db.prepare('UPDATE global_chat_messages SET deleted = 1 WHERE id = ?').run(id);
    broadcastAll({ type: 'global_chat_deleted', id });
    logAdmin(req.adminUser, 'delete_chat', { id: req.params.id }, null, req);
    res.json({ ok: true });
  } catch (err) {
    console.error('[admin/chat-delete]', err);
    res.status(500).json({ error: 'SERVER_ERROR' });
  }
});

/* ============================================================
   WEBSOCKET
   ============================================================ */
const wss = new WebSocket.Server({ server });
const socketsByUser = new Map();
const socketsByMatch = new Map();

function registerSocket(ws, userId, matchId){
  if(userId){
    if(!socketsByUser.has(userId)) socketsByUser.set(userId, new Set());
    socketsByUser.get(userId).add(ws);
    ws.userId = userId;
  }
  if(matchId){
    if(!socketsByMatch.has(matchId)) socketsByMatch.set(matchId, new Set());
    socketsByMatch.get(matchId).add(ws);
    ws.matchId = matchId;
  }
}

function unregisterSocket(ws){
  if(ws.userId && socketsByUser.has(ws.userId)){
    socketsByUser.get(ws.userId).delete(ws);
    if(socketsByUser.get(ws.userId).size === 0) socketsByUser.delete(ws.userId);
  }
  if(ws.matchId && socketsByMatch.has(ws.matchId)){
    socketsByMatch.get(ws.matchId).delete(ws);
    if(socketsByMatch.get(ws.matchId).size === 0) socketsByMatch.delete(ws.matchId);
  }
}

function broadcastToUser(userId, payload){
  const set = socketsByUser.get(String(userId));
  if(!set) return;
  const msg = JSON.stringify(payload);
  set.forEach(ws => { if(ws.readyState === WebSocket.OPEN) ws.send(msg); });
}

function broadcastToMatch(matchId, payload){
  const set = socketsByMatch.get(matchId);
  if(!set) return;
  const msg = JSON.stringify(payload);
  set.forEach(ws => { if(ws.readyState === WebSocket.OPEN) ws.send(msg); });
}

function broadcastAll(payload){
  const msg = JSON.stringify(payload);
  wss.clients.forEach(ws => { if(ws.readyState === WebSocket.OPEN) ws.send(msg); });
}

let crashSocketCounter = 0;

wss.on('connection', (ws, req) => {
  try {
    const url = new URL(req.url, 'http://localhost');
    const token = url.searchParams.get('token');
    const matchId = url.searchParams.get('match');
    const page = url.searchParams.get('page');

    let userId = null;
    if(token){
      try {
        const payload = jwt.verify(token, JWT_SECRET);
        userId = String(payload.sub);
      } catch {}
    }

    registerSocket(ws, userId, matchId);

    if(page === 'crash'){
      ws._crashViewerId = 'v' + (++crashSocketCounter);
      registerCrashViewer(ws._crashViewerId);
    }

    ws.send(JSON.stringify({ type: 'hello', userId, matchId, page }));

    ws.on('message', (raw) => {
      try {
        const msg = JSON.parse(raw.toString());
        if(msg.type === 'ping'){ ws.send(JSON.stringify({ type: 'pong' })); }
        else if(msg.type === 'subscribe_match' && msg.matchId && ws.userId){
          registerSocket(ws, null, msg.matchId);
          ws.send(JSON.stringify({ type: 'subscribed', matchId: msg.matchId }));
        }
      } catch {}
    });

    ws.on('close', () => {
      unregisterSocket(ws);
      if(ws._crashViewerId) unregisterCrashViewer(ws._crashViewerId);
    });
    ws.on('error', () => {
      unregisterSocket(ws);
      if(ws._crashViewerId) unregisterCrashViewer(ws._crashViewerId);
    });
  } catch {
    ws.close();
  }
});

/* ============================================================
   SERIALIZE MATCH
   ============================================================ */
function serializeMatch(m){
  if(!m) return null;
  return {
    id: m.id,
    creatorId: m.creator_id,
    creatorUsername: m.creator_username,
    creatorAvatar: avatarForUser({ id: m.creator_id, avatar: m.creator_avatar }),
    creatorChoice: m.creator_choice,
    bet: m.bet,
    status: m.status,
    joinerId: m.joiner_id,
    joinerUsername: m.joiner_username,
    joinerAvatar: m.joiner_avatar,
    result: m.result,
    winnerId: m.winner_id,
    loserId: m.loser_id,
    payout: m.payout,
    createdAt: m.created_at,
    resolvedAt: m.resolved_at
  };
}
app.post('/api/limiteds/join/:id', pvpLimiter, requireAuth, async (req, res) => {
  try {
    const match = limitedStmts.getLimitedFlip.get(req.params.id);
    if(!match || match.status !== 'open') return res.status(404).json({ error: 'NOT_FOUND' });
    if(match.user_id === req.userId) return res.status(400).json({ error: 'OWN_MATCH' });
    const link = limitedStmts.getLink.get(req.userId);
    if(!link) return res.status(400).json({ error: 'NOT_LINKED' });
    // resolve with server seed style roll
    const clientSeed = crypto.randomBytes(8).toString('hex');
    const serverSeed = crypto.randomBytes(16).toString('hex');
    const { result } = rollCoin(serverSeed, clientSeed, Date.now() % 100000);
    const creatorWins = result === match.choice;
    const winnerId = creatorWins ? match.user_id : req.userId;
    const now = Date.now();
    limitedStmts.resolveLimitedFlip.run(req.userId, result, 'resolved', winnerId, now, match.id);
    // log to discord — actual item transfer still manual / trade bot side
    await discordLog('Limited coinflip resolved', [
      { name: 'Match', value: match.id, inline: true },
      { name: 'Asset', value: `${match.asset_name} (${match.asset_id})`, inline: true },
      { name: 'RAP', value: String(match.asset_rap || 0), inline: true },
      { name: 'Creator', value: match.user_id, inline: true },
      { name: 'Joiner', value: req.userId, inline: true },
      { name: 'Result', value: result, inline: true },
      { name: 'Winner', value: winnerId, inline: true }
    ], null);
    res.json({
      ok: true,
      result,
      winnerId,
      won: winnerId === req.userId,
      match: { id: match.id, assetId: match.asset_id, assetName: match.asset_name, choice: match.choice, result }
    });
  } catch (err) {
    console.error('[limiteds/join]', err);
    res.status(500).json({ error: 'SERVER_ERROR' });
  }
});


/* ============================================================
   STATIC + CATCH-ALL
   ============================================================ */

/* ============================================================
   AVATAR PROXY — resolves real rbxcdn headshot URLs
   ============================================================ */
app.get('/api/avatar/:userId', async (req, res) => {
  try {
    const userId = String(req.params.userId || '').replace(/[^0-9]/g, '');
    if(!userId) return res.status(400).send('bad id');
    const imageUrl = await getRobloxAvatarHeadshot(userId);
    if(!imageUrl){
      res.set('Cache-Control', 'public, max-age=60');
      return res.status(404).send('no avatar');
    }
    // Redirect to CDN (works in <img src>)
    res.set('Cache-Control', 'public, max-age=3600');
    return res.redirect(302, imageUrl);
  } catch (err) {
    console.error('[api/avatar]', err);
    res.status(500).send('error');
  }
});


app.get('/api/admin/logs', requireAdmin, (req, res) => {
  try {
    const limit = Math.min(200, Math.max(20, parseInt(req.query.limit, 10) || 100));
    const rows = db.prepare(`
      SELECT * FROM admin_logs ORDER BY created_at DESC LIMIT ?
    `).all(limit);
    res.json({
      logs: rows.map(r => ({
        id: r.id,
        adminId: r.admin_id,
        adminUsername: r.admin_username,
        action: r.action,
        targetId: r.target_id,
        targetUsername: r.target_username,
        detail: r.detail,
        ip: r.ip,
        createdAt: r.created_at
      }))
    });
  } catch (err) {
    console.error('[admin/logs]', err);
    res.status(500).json({ error: 'SERVER_ERROR' });
  }
});

app.get('/api/admin/live', requireAdmin, (req, res) => {
  try {
    const cutoff = Date.now() - 5 * 60 * 1000;
    const online = db.prepare(`
      SELECT id, username, display_name, balance, level, rank, updated_at
      FROM users WHERE updated_at > ? ORDER BY updated_at DESC LIMIT 50
    `).all(cutoff);
    const flips1h = db.prepare(`SELECT COUNT(*) AS c, COALESCE(SUM(bet),0) AS w FROM flips WHERE created_at > ?`).get(Date.now() - 3600000);
    const deposits1h = db.prepare(`SELECT COUNT(*) AS c, COALESCE(SUM(amount),0) AS a FROM transactions WHERE type = 'deposit' AND created_at > ?`).get(Date.now() - 3600000);
    const recentFlips = db.prepare(`
      SELECT f.bet, f.win, f.net, f.created_at, u.username
      FROM flips f LEFT JOIN users u ON u.id = f.user_id
      ORDER BY f.created_at DESC LIMIT 15
    `).all();
    res.json({
      online: online.map(u => ({
        id: u.id,
        username: u.display_name || u.username,
        balance: u.balance,
        level: u.level,
        rank: u.rank,
        lastSeen: u.updated_at
      })),
      lastHour: {
        flips: flips1h.c,
        wagered: flips1h.w,
        deposits: deposits1h.c,
        depositAmount: deposits1h.a
      },
      recentFlips: recentFlips.map(f => ({
        username: f.username,
        bet: f.bet,
        win: !!f.win,
        net: f.net,
        at: f.created_at
      }))
    });
  } catch (err) {
    console.error('[admin/live]', err);
    res.status(500).json({ error: 'SERVER_ERROR' });
  }
});

app.post('/api/admin/users/:id/note', requireAdmin, (req, res) => {
  try {
    const target = stmts.getUser.get(String(req.params.id));
    if(!target) return res.status(404).json({ error: 'USER_NOT_FOUND' });
    const note = String(req.body.note || '').slice(0, 500);
    logAdmin(req.adminUser, 'note', target, { note }, req);
    res.json({ ok: true });
  } catch (err) {
    console.error('[admin/note]', err);
    res.status(500).json({ error: 'SERVER_ERROR' });
  }
});


app.get('/api/users/:id/public', requireAuth, (req, res) => {
  try {
    const id = String(req.params.id);
    const u = stmts.getUser.get(id);
    if(!u) return res.status(404).json({ error: 'USER_NOT_FOUND' });
    const flips = db.prepare(`
      SELECT COUNT(*) AS total,
             SUM(CASE WHEN win = 1 THEN 1 ELSE 0 END) AS wins,
             COALESCE(SUM(bet),0) AS wagered
      FROM flips WHERE user_id = ?
    `).get(id);
    res.json({
      user: {
        id: u.id,
        username: u.username,
        displayName: u.display_name || u.username,
        avatar: avatarForUser(u),
        hasVerifiedBadge: !!u.has_verified_badge,
        level: u.level,
        rank: u.rank,
        isAdmin: !!u.is_admin,
        vip: !!u.vip,
        chatBadge: u.chat_badge || null,
        totalWagered: u.total_wagered,
        totalWon: u.total_won,
        totalLost: u.total_lost,
        biggestWin: u.biggest_win,
        gamesPlayed: u.games_played,
        gamesWon: u.games_won,
        pvpWins: u.pvp_wins || 0,
        pvpLosses: u.pvp_losses || 0,
        minesPlayed: u.mines_played || 0,
        crashPlayed: u.crash_played || 0,
        caseBattlesPlayed: u.case_battles_played || 0,
        nameColor: u.name_color || null,
        chatBadge: u.chat_badge || null,
        profileBanner: u.profile_banner || null,
        memberSince: u.created_at,
        flipStats: {
          total: flips.total || 0,
          wins: flips.wins || 0,
          wagered: flips.wagered || 0
        }
      }
    });
  } catch (err) {
    console.error('[users/public]', err);
    res.status(500).json({ error: 'SERVER_ERROR' });
  }
});


app.post('/api/profile/banner', requireAuth, (req, res) => {
  try {
    const user = ensureUser(req.userId, req.username);
    const type = String(req.body.type || 'preset');
    let value = req.body.value;

    const presets = new Set(['', 'grid', 'aurora', 'ember', 'void', 'banner-grid', 'banner-aurora', 'banner-ember', 'banner-void']);

    if(type === 'preset'){
      value = String(value || '').trim().toLowerCase();
      if(!presets.has(value) && value !== 'none'){
        return res.status(400).json({ error: 'INVALID_PRESET' });
      }
      if(value === 'none') value = null;
    } else if(type === 'url'){
      value = String(value || '').trim();
      if(!/^https?:\/\//i.test(value)){
        return res.status(400).json({ error: 'INVALID_URL' });
      }
      if(value.length > 2048){
        return res.status(400).json({ error: 'URL_TOO_LONG' });
      }
    } else if(type === 'upload'){
      value = String(value || '');
      // data:image/...;base64,...
      if(!/^data:image\/(png|jpeg|jpg|webp|gif);base64,/i.test(value)){
        return res.status(400).json({ error: 'INVALID_IMAGE' });
      }
      if(value.length > 900000){
        return res.status(400).json({ error: 'IMAGE_TOO_LARGE' });
      }
    } else {
      return res.status(400).json({ error: 'INVALID_TYPE' });
    }

    stmts.setProfileBanner.run(value, Date.now(), user.id);
    const fresh = stmts.getUser.get(user.id);
    res.json({ ok: true, profileBanner: fresh.profile_banner, user: serializeUser(fresh) });
  } catch (err) {
    console.error('[profile/banner]', err);
    res.status(500).json({ error: 'SERVER_ERROR' });
  }
});


app.get('/api/admin/users/:id/sessions', requireAdmin, (req, res) => {
  try {
    const id = String(req.params.id);
    const rows = db.prepare(`
      SELECT id, ip, user_agent, created_at FROM login_events
      WHERE user_id = ? ORDER BY created_at DESC LIMIT 50
    `).all(id);
    res.json({
      sessions: rows.map(r => ({
        id: r.id,
        ip: r.ip,
        userAgent: r.user_agent,
        createdAt: r.created_at
      }))
    });
  } catch (err) {
    console.error('[admin/sessions]', err);
    res.status(500).json({ error: 'SERVER_ERROR' });
  }
});

app.use(express.static(ROOT, { extensions: ['html'], index: false }));

app.get('*', (req, res) => {
  if (/\.\w{2,5}$/.test(req.path)) return res.status(404).send('Not found: ' + req.path);
  const clean = req.path.replace(/^\/+/, '');
  if (clean === '' || clean === 'index') return res.sendFile(path.join(ROOT, 'index.html'));
  const htmlFile = path.join(ROOT, clean + '.html');
  res.sendFile(htmlFile, (err) => {
    if (err) res.status(404).send('Page not found: ' + req.path);
  });
});

/* ============================================================
   START
   ============================================================ */
server.listen(PORT, () => {
  // Promote configured admin usernames already in DB
  try {
    for (const name of ADMIN_USERNAMES) {
      const row = db.prepare('SELECT * FROM users WHERE LOWER(username) = ?').get(name);
      if(row && !row.is_admin){
        db.prepare('UPDATE users SET is_admin = 1, updated_at = ? WHERE id = ?').run(Date.now(), row.id);
        console.log('[admin] boot-promoted', row.username);
      }
    }
  } catch (e) { console.warn('[admin boot]', e.message); }

  console.log('');
  console.log('  BloxBet backend v2.1 running on http://localhost:' + PORT);
  console.log('  WebSocket at ws://localhost:' + PORT);
  console.log('  SQLite DB at:', DB_PATH);
  console.log('  Loaded ' + cases.ITEMS.length + ' case items across ' + cases.CASES.length + ' cases');
  console.log('  Crash engine idle — starts when a viewer opens /crash.html');
  console.log('  Reward: 100 RC one-time unlock. Play 3 games/day for 7 days.');
  console.log('  Features: games · chat · referrals · shop · social · admin · limiteds');
  console.log('  DISCORD_WEBHOOK:', DISCORD_WEBHOOK ? 'set' : 'NOT SET — limiteds logs go to console');
  console.log('  Open http://localhost:' + PORT + '/');
  console.log('');
});