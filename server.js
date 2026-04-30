const express = require('express');
const session = require('express-session');
const path = require('path');
const fs = require('fs');
const bcrypt = require('bcryptjs');
const multer = require('multer');
const db = require('./db');

const app = express();
const PORT = process.env.PORT || 3000;

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));
app.use(session({
  secret: 'friendster-nostalgia-2003',
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 1000 * 60 * 60 * 24 * 7 }
}));

app.use((req, res, next) => {
  res.locals.currentUser = null;
  if (req.session.userId) {
    res.locals.currentUser = db.prepare('SELECT id, full_name, email, photo_url FROM users WHERE id = ?').get(req.session.userId);
  }
  res.locals.flash = req.session.flash || null;
  delete req.session.flash;
  next();
});

function requireAuth(req, res, next) {
  if (!req.session.userId) {
    req.session.flash = { type: 'error', message: 'You must sign in first.' };
    return res.redirect('/login');
  }
  next();
}

// ===================== Multer setup =====================
function makeStorage(subdir) {
  return multer.diskStorage({
    destination: (req, file, cb) => cb(null, path.join(__dirname, 'public', 'uploads', subdir)),
    filename: (req, file, cb) => {
      const ext = path.extname(file.originalname).toLowerCase().replace(/[^a-z0-9.]/g, '');
      const safe = `${req.session.userId || 'anon'}-${Date.now()}${ext}`;
      cb(null, safe);
    }
  });
}
const photoUpload = multer({
  storage: makeStorage('photos'),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (/^image\/(jpeg|png|gif|webp)$/.test(file.mimetype)) cb(null, true);
    else cb(new Error('Photo must be JPG, PNG, GIF, or WEBP.'));
  }
});
const bgUpload = multer({
  storage: makeStorage('bg'),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (/^image\/(jpeg|png|gif|webp)$/.test(file.mimetype)) cb(null, true);
    else cb(new Error('Background must be JPG, PNG, GIF, or WEBP.'));
  }
});
const audioUpload = multer({
  storage: makeStorage('audio'),
  limits: { fileSize: 8 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (/^audio\/(mpeg|mp3|wav|ogg|x-wav|wave)$/.test(file.mimetype)) cb(null, true);
    else cb(new Error('Audio must be MP3, WAV, or OGG.'));
  }
});
const profileMediaUpload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => {
      const sub = file.fieldname === 'photo_file' ? 'photos'
                : file.fieldname === 'bg_file'    ? 'bg'
                : 'audio';
      cb(null, path.join(__dirname, 'public', 'uploads', sub));
    },
    filename: (req, file, cb) => {
      const ext = path.extname(file.originalname).toLowerCase().replace(/[^a-z0-9.]/g, '');
      cb(null, `${req.session.userId}-${file.fieldname}-${Date.now()}${ext}`);
    }
  }),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.fieldname === 'song_file') {
      if (/^audio\/(mpeg|mp3|wav|ogg|x-wav|wave)$/.test(file.mimetype)) cb(null, true);
      else cb(new Error('Audio must be MP3, WAV, or OGG.'));
    } else {
      if (/^image\/(jpeg|png|gif|webp)$/.test(file.mimetype)) cb(null, true);
      else cb(new Error('Image must be JPG, PNG, GIF, or WEBP.'));
    }
  }
});

// ===================== Helpers =====================
function friendshipStatus(viewerId, profileId) {
  if (!viewerId || viewerId === profileId) return null;
  const row = db.prepare(`
    SELECT * FROM friendships
    WHERE (requester_id = ? AND addressee_id = ?) OR (requester_id = ? AND addressee_id = ?)
  `).get(viewerId, profileId, profileId, viewerId);
  if (!row) return { state: 'none' };
  if (row.status === 'accepted') return { state: 'friends', row };
  if (row.requester_id === viewerId) return { state: 'sent', row };
  return { state: 'received', row };
}

function countFriends(userId) {
  return db.prepare(`
    SELECT COUNT(*) AS c FROM friendships
    WHERE status = 'accepted' AND (requester_id = ? OR addressee_id = ?)
  `).get(userId, userId).c;
}

function getFriends(userId) {
  return db.prepare(`
    SELECT u.id, u.full_name, u.photo_url, u.tagline, u.location
    FROM friendships f
    JOIN users u ON u.id = CASE WHEN f.requester_id = ? THEN f.addressee_id ELSE f.requester_id END
    WHERE f.status = 'accepted' AND (f.requester_id = ? OR f.addressee_id = ?)
    ORDER BY u.full_name
  `).all(userId, userId, userId);
}

// ===================== ROUTES =====================
app.get('/', (req, res) => {
  if (req.session.userId) return res.redirect('/home');
  const totalUsers = db.prepare('SELECT COUNT(*) AS c FROM users').get().c;
  const recent = db.prepare(`
    SELECT id, full_name, photo_url, age, relationship_status, location, created_at
    FROM users ORDER BY created_at DESC LIMIT 4
  `).all();
  const featured = db.prepare(`
    SELECT id, full_name, photo_url, age, relationship_status, location
    FROM users ORDER BY id LIMIT 4
  `).all();
  res.render('landing', { totalUsers, recent, featured });
});

app.get('/signup', (req, res) => {
  if (req.session.userId) return res.redirect('/home');
  res.render('signup', { values: {}, error: null });
});

app.post('/signup', (req, res) => {
  const { email, password, full_name, gender, age, location } = req.body;
  if (!email || !password || !full_name) {
    return res.render('signup', { values: req.body, error: 'Email, password, and name are required.' });
  }
  const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email.toLowerCase());
  if (existing) {
    return res.render('signup', { values: req.body, error: 'That email is already registered.' });
  }
  const hash = bcrypt.hashSync(password, 10);
  const result = db.prepare(`
    INSERT INTO users (email, password_hash, full_name, gender, age, location, tagline, about_me)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    email.toLowerCase(), hash, full_name,
    gender || null,
    age ? parseInt(age, 10) : null,
    location || null,
    'New to Friendster!',
    ''
  );
  req.session.userId = result.lastInsertRowid;
  req.session.flash = { type: 'success', message: 'Welcome to Friendster! Edit your profile to get started.' };
  res.redirect('/home');
});

app.get('/login', (req, res) => {
  if (req.session.userId) return res.redirect('/home');
  res.render('login', { error: null });
});

app.post('/login', (req, res) => {
  const { email, password } = req.body;
  const user = db.prepare('SELECT * FROM users WHERE email = ?').get((email || '').toLowerCase());
  if (!user || !bcrypt.compareSync(password || '', user.password_hash)) {
    return res.render('login', { error: 'Invalid email or password.' });
  }
  req.session.userId = user.id;
  res.redirect('/home');
});

app.post('/logout', (req, res) => {
  req.session.destroy(() => res.redirect('/'));
});

app.get('/home', requireAuth, (req, res) => {
  const userId = req.session.userId;
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
  const friends = getFriends(userId);
  const pendingRequests = db.prepare(`
    SELECT f.id AS friendship_id, u.id, u.full_name, u.photo_url, u.tagline
    FROM friendships f
    JOIN users u ON u.id = f.requester_id
    WHERE f.addressee_id = ? AND f.status = 'pending'
    ORDER BY f.created_at DESC
  `).all(userId);
  const pendingTestimonials = db.prepare(`
    SELECT t.*, u.full_name AS author_name, u.photo_url AS author_photo
    FROM testimonials t
    JOIN users u ON u.id = t.author_id
    WHERE t.subject_id = ? AND t.approved = 0
    ORDER BY t.created_at DESC
  `).all(userId);
  const recentBulletins = db.prepare(`
    SELECT b.*, u.full_name, u.photo_url
    FROM bulletins b
    JOIN users u ON u.id = b.author_id
    WHERE b.author_id IN (
      SELECT CASE WHEN requester_id = ? THEN addressee_id ELSE requester_id END
      FROM friendships WHERE status = 'accepted' AND (requester_id = ? OR addressee_id = ?)
      UNION SELECT ?
    )
    ORDER BY b.created_at DESC
    LIMIT 10
  `).all(userId, userId, userId, userId);
  res.render('home', { user, friends, pendingRequests, pendingTestimonials, recentBulletins });
});

app.get('/browse', requireAuth, (req, res) => {
  const q = (req.query.q || '').trim();
  let users;
  if (q) {
    const like = `%${q}%`;
    users = db.prepare(`
      SELECT id, full_name, photo_url, tagline, location, age
      FROM users
      WHERE id != ? AND (full_name LIKE ? OR location LIKE ? OR interests LIKE ?)
      ORDER BY created_at DESC
      LIMIT 60
    `).all(req.session.userId, like, like, like);
  } else {
    users = db.prepare(`
      SELECT id, full_name, photo_url, tagline, location, age
      FROM users
      WHERE id != ?
      ORDER BY created_at DESC
      LIMIT 60
    `).all(req.session.userId);
  }
  res.render('browse', { users, q });
});

app.get('/profile/:id', requireAuth, (req, res) => {
  const profileId = parseInt(req.params.id, 10);
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(profileId);
  if (!user) return res.status(404).send('User not found');
  const status = friendshipStatus(req.session.userId, profileId);
  const friends = getFriends(profileId).slice(0, 8);
  const friendCount = countFriends(profileId);
  const testimonials = db.prepare(`
    SELECT t.*, u.full_name AS author_name, u.photo_url AS author_photo, u.id AS author_id
    FROM testimonials t
    JOIN users u ON u.id = t.author_id
    WHERE t.subject_id = ? AND t.approved = 1
    ORDER BY t.created_at DESC
  `).all(profileId);
  const bulletins = db.prepare(`
    SELECT * FROM bulletins WHERE author_id = ? ORDER BY created_at DESC LIMIT 5
  `).all(profileId);
  const isOwn = req.session.userId === profileId;
  res.render('profile', { user, status, friends, friendCount, testimonials, bulletins, isOwn });
});

app.get('/profile/:id/edit', requireAuth, (req, res) => {
  const profileId = parseInt(req.params.id, 10);
  if (profileId !== req.session.userId) return res.status(403).send('Forbidden');
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(profileId);
  res.render('edit-profile', { user });
});

app.post('/profile/:id/edit',
  requireAuth,
  (req, res, next) => {
    const profileId = parseInt(req.params.id, 10);
    if (profileId !== req.session.userId) return res.status(403).send('Forbidden');
    next();
  },
  profileMediaUpload.fields([
    { name: 'photo_file', maxCount: 1 },
    { name: 'bg_file', maxCount: 1 },
    { name: 'song_file', maxCount: 1 }
  ]),
  (req, res) => {
    const profileId = parseInt(req.params.id, 10);
    const fields = ['full_name', 'gender', 'age', 'location', 'occupation', 'relationship_status',
      'interests', 'favorite_music', 'favorite_movies', 'favorite_books',
      'about_me', 'who_id_like_to_meet', 'photo_url', 'tagline',
      'profile_song_url', 'profile_song_title',
      'theme_bg_url', 'theme_bg_color', 'theme_box_color',
      'theme_text_color', 'theme_link_color', 'theme_heading_color'];
    const updates = {};
    for (const f of fields) updates[f] = (req.body[f] && String(req.body[f]).trim()) || null;
    if (updates.age) updates.age = parseInt(updates.age, 10) || null;

    if (req.files && req.files.photo_file && req.files.photo_file[0]) {
      updates.photo_url = '/uploads/photos/' + req.files.photo_file[0].filename;
    }
    if (req.files && req.files.bg_file && req.files.bg_file[0]) {
      updates.theme_bg_url = '/uploads/bg/' + req.files.bg_file[0].filename;
    }
    if (req.files && req.files.song_file && req.files.song_file[0]) {
      updates.profile_song_url = '/uploads/audio/' + req.files.song_file[0].filename;
    }

    db.prepare(`
      UPDATE users SET
        full_name = @full_name, gender = @gender, age = @age, location = @location,
        occupation = @occupation, relationship_status = @relationship_status,
        interests = @interests, favorite_music = @favorite_music,
        favorite_movies = @favorite_movies, favorite_books = @favorite_books,
        about_me = @about_me, who_id_like_to_meet = @who_id_like_to_meet,
        photo_url = @photo_url, tagline = @tagline,
        profile_song_url = @profile_song_url, profile_song_title = @profile_song_title,
        theme_bg_url = @theme_bg_url, theme_bg_color = @theme_bg_color,
        theme_box_color = @theme_box_color, theme_text_color = @theme_text_color,
        theme_link_color = @theme_link_color, theme_heading_color = @theme_heading_color
      WHERE id = @id
    `).run({ ...updates, id: profileId });
    req.session.flash = { type: 'success', message: 'Profile updated!' };
    res.redirect(`/profile/${profileId}`);
  }
);

// Multer error handler (file too large, wrong type, etc.)
app.use((err, req, res, next) => {
  if (err) {
    req.session.flash = { type: 'error', message: err.message || 'Upload failed.' };
    if (req.session.userId) return res.redirect(`/profile/${req.session.userId}/edit`);
    return res.redirect('/');
  }
  next();
});

// ============== FRIENDS ==============
app.post('/friends/request/:id', requireAuth, (req, res) => {
  const targetId = parseInt(req.params.id, 10);
  const me = req.session.userId;
  if (targetId === me) return res.redirect('/home');
  const existing = friendshipStatus(me, targetId);
  if (existing.state === 'none') {
    db.prepare('INSERT INTO friendships (requester_id, addressee_id, status) VALUES (?, ?, ?)').run(me, targetId, 'pending');
    req.session.flash = { type: 'success', message: 'Friend request sent!' };
  }
  res.redirect(`/profile/${targetId}`);
});

app.post('/friends/accept/:friendshipId', requireAuth, (req, res) => {
  const fid = parseInt(req.params.friendshipId, 10);
  const f = db.prepare('SELECT * FROM friendships WHERE id = ?').get(fid);
  if (!f || f.addressee_id !== req.session.userId) return res.status(403).send('Forbidden');
  db.prepare("UPDATE friendships SET status = 'accepted' WHERE id = ?").run(fid);
  req.session.flash = { type: 'success', message: 'Friend added!' };
  res.redirect('/home');
});

app.post('/friends/decline/:friendshipId', requireAuth, (req, res) => {
  const fid = parseInt(req.params.friendshipId, 10);
  const f = db.prepare('SELECT * FROM friendships WHERE id = ?').get(fid);
  if (!f || f.addressee_id !== req.session.userId) return res.status(403).send('Forbidden');
  db.prepare('DELETE FROM friendships WHERE id = ?').run(fid);
  res.redirect('/home');
});

app.get('/friends', requireAuth, (req, res) => {
  const friends = getFriends(req.session.userId);
  res.render('friends', { friends });
});

// ============== TESTIMONIALS ==============
app.post('/testimonials/:subjectId', requireAuth, (req, res) => {
  const subjectId = parseInt(req.params.subjectId, 10);
  const me = req.session.userId;
  if (subjectId === me) return res.status(400).send("Can't testimonial yourself");
  const status = friendshipStatus(me, subjectId);
  if (!status || status.state !== 'friends') {
    req.session.flash = { type: 'error', message: 'You must be friends to write a testimonial.' };
    return res.redirect(`/profile/${subjectId}`);
  }
  const body = (req.body.body || '').trim();
  if (!body) return res.redirect(`/profile/${subjectId}`);
  db.prepare('INSERT INTO testimonials (author_id, subject_id, body, approved) VALUES (?, ?, ?, 0)').run(me, subjectId, body);
  req.session.flash = { type: 'success', message: 'Testimonial sent! It will appear once approved.' };
  res.redirect(`/profile/${subjectId}`);
});

app.post('/testimonials/:id/approve', requireAuth, (req, res) => {
  const id = parseInt(req.params.id, 10);
  const t = db.prepare('SELECT * FROM testimonials WHERE id = ?').get(id);
  if (!t || t.subject_id !== req.session.userId) return res.status(403).send('Forbidden');
  db.prepare('UPDATE testimonials SET approved = 1 WHERE id = ?').run(id);
  res.redirect('/home');
});

app.post('/testimonials/:id/reject', requireAuth, (req, res) => {
  const id = parseInt(req.params.id, 10);
  const t = db.prepare('SELECT * FROM testimonials WHERE id = ?').get(id);
  if (!t || t.subject_id !== req.session.userId) return res.status(403).send('Forbidden');
  db.prepare('DELETE FROM testimonials WHERE id = ?').run(id);
  res.redirect('/home');
});

// ============== BULLETINS ==============
app.post('/bulletins', requireAuth, (req, res) => {
  const subject = (req.body.subject || '').trim();
  const body = (req.body.body || '').trim();
  if (!subject || !body) return res.redirect('/home');
  db.prepare('INSERT INTO bulletins (author_id, subject, body) VALUES (?, ?, ?)').run(req.session.userId, subject, body);
  res.redirect('/home');
});

app.listen(PORT, () => {
  console.log(`Friendster running at http://localhost:${PORT}`);
});
