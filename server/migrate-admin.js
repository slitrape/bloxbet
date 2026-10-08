/* migrate-admin.js — adds is_admin column, promotes a user by username */
const path = require('path');
const { DatabaseSync } = require('node:sqlite');

const DB_PATH = path.join(__dirname, 'bloxbet.db');
const db = new DatabaseSync(DB_PATH);

function hasColumn(table, col){
  const rows = db.prepare(`PRAGMA table_info(${table})`).all();
  return rows.some(r => r.name === col);
}

if(!hasColumn('users', 'is_admin')){
  db.exec(`ALTER TABLE users ADD COLUMN is_admin INTEGER DEFAULT 0`);
  console.log('[migrate] Added users.is_admin');
} else {
  console.log('[ok] users.is_admin exists');
}

const targetUsername = process.argv[2];
if(targetUsername){
  const row = db.prepare(`SELECT id, username, display_name FROM users WHERE username = ? OR display_name = ?`).get(targetUsername, targetUsername);
  if(!row){
    console.log('[!] No user found with username:', targetUsername);
    console.log('    Log into the site first so your row exists, then rerun.');
  } else {
    db.prepare(`UPDATE users SET is_admin = 1, updated_at = ? WHERE id = ?`).run(Date.now(), row.id);
    console.log('[admin] Promoted:', row.display_name || row.username, '(id:', row.id + ')');
  }
} else {
  console.log('');
  console.log('Usage: node migrate-admin.js <your-roblox-username>');
  console.log('');
}

const admins = db.prepare(`SELECT id, username, display_name FROM users WHERE is_admin = 1`).all();
console.log('[admins]', admins.length ? admins.map(a => a.display_name || a.username).join(', ') : 'none');