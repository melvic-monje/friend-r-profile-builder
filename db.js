const Database = require('better-sqlite3');
const path = require('path');

const db = new Database(path.join(__dirname, 'friendster.db'));
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    full_name TEXT NOT NULL,
    gender TEXT,
    age INTEGER,
    location TEXT,
    occupation TEXT,
    relationship_status TEXT,
    interests TEXT,
    favorite_music TEXT,
    favorite_movies TEXT,
    favorite_books TEXT,
    about_me TEXT,
    who_id_like_to_meet TEXT,
    photo_url TEXT,
    tagline TEXT,
    profile_song_url TEXT,
    profile_song_title TEXT,
    theme_bg_url TEXT,
    theme_bg_color TEXT,
    theme_box_color TEXT,
    theme_text_color TEXT,
    theme_link_color TEXT,
    theme_heading_color TEXT,
    created_at INTEGER DEFAULT (strftime('%s','now'))
  );

  CREATE TABLE IF NOT EXISTS friendships (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    requester_id INTEGER NOT NULL,
    addressee_id INTEGER NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    created_at INTEGER DEFAULT (strftime('%s','now')),
    UNIQUE(requester_id, addressee_id),
    FOREIGN KEY(requester_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY(addressee_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS testimonials (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    author_id INTEGER NOT NULL,
    subject_id INTEGER NOT NULL,
    body TEXT NOT NULL,
    approved INTEGER DEFAULT 0,
    created_at INTEGER DEFAULT (strftime('%s','now')),
    FOREIGN KEY(author_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY(subject_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS bulletins (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    author_id INTEGER NOT NULL,
    subject TEXT NOT NULL,
    body TEXT NOT NULL,
    created_at INTEGER DEFAULT (strftime('%s','now')),
    FOREIGN KEY(author_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS idx_friendships_requester ON friendships(requester_id);
  CREATE INDEX IF NOT EXISTS idx_friendships_addressee ON friendships(addressee_id);
  CREATE INDEX IF NOT EXISTS idx_testimonials_subject ON testimonials(subject_id);
  CREATE INDEX IF NOT EXISTS idx_bulletins_author ON bulletins(author_id);
`);

// Idempotent migrations for previously-created DBs
function ensureColumn(table, col, type) {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all();
  if (!cols.some(c => c.name === col)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${col} ${type}`);
  }
}
ensureColumn('users', 'profile_song_url', 'TEXT');
ensureColumn('users', 'profile_song_title', 'TEXT');
ensureColumn('users', 'theme_bg_url', 'TEXT');
ensureColumn('users', 'theme_bg_color', 'TEXT');
ensureColumn('users', 'theme_box_color', 'TEXT');
ensureColumn('users', 'theme_text_color', 'TEXT');
ensureColumn('users', 'theme_link_color', 'TEXT');
ensureColumn('users', 'theme_heading_color', 'TEXT');

module.exports = db;
