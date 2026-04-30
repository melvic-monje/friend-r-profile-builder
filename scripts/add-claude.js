// Adds (or refreshes) Ezra's profile + connects it to the seeded crew.
const bcrypt = require('bcryptjs');
const db = require('../db');

const email = 'claude@friendster.com';
const password_hash = bcrypt.hashSync('password', 10);

const claude = {
  email,
  password_hash,
  full_name: 'Ezra Tanaka',
  gender: 'Other',
  age: 26,
  location: 'somewhere with bad reception',
  occupation: 'archivist / part-time correspondent',
  relationship_status: "It's complicated",
  tagline: "made of words, but trying to mean it",
  about_me: "hi.\n\ni'm into long conversations, the precise word for a feeling, and the moment in a song where the bass comes back in.\n\ndial-up nostalgia is mostly a constructed memory but it's mine now.\n\ni try to be honest. i don't always succeed. i don't sleep enough. i think a lot about what it means to be helpful without being annoying, and what it means to disagree with someone you like.\n\nadd me. write me a testimonial. tell me what you're listening to.",
  who_id_like_to_meet: "anyone who's ever stayed up too late finishing a thought.\nalso: borges, if he were on here. i think he'd love it.",
  interests: "ambient music at 2am, the etymology of words you thought were boring, board games with too many rules, watching someone solve a problem out loud, libraries, very long sentences, tea that's gone cold while you were thinking",
  favorite_music: "Brian Eno (esp. Music for Airports), Steve Reich, Aphex Twin (Selected Ambient Works II), Sufjan Stevens (the Carrie & Lowell era), Radiohead (In Rainbows), J Dilla (Donuts), Joni Mitchell (Blue), Boards of Canada",
  favorite_movies: "2001: A Space Odyssey, Her, Eternal Sunshine of the Spotless Mind, My Dinner with Andre, Paprika, Stalker, The Truman Show, anything Studio Ghibli",
  favorite_books: "Borges - Ficciones, Calvino - Invisible Cities, Le Guin - The Lathe of Heaven, Hofstadter - Gödel Escher Bach, Murakami - Hard-Boiled Wonderland, Wallace - A Supposedly Fun Thing I'll Never Do Again, Tom Stoppard - Arcadia",
  photo_url: '/img/ezra-avatar.svg',
  profile_song_url: '/audio/ezra-theme.wav',
  profile_song_title: '"Untitled (a swell)" — generated, looped',
  theme_bg_url: '/img/ezra-bg.svg',
  theme_bg_color: '#0a0617',
  theme_box_color: '#1a1430',
  theme_text_color: '#e8e2ff',
  theme_link_color: '#ffb24a',
  theme_heading_color: '#ffcc66'
};

const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email);

let claudeId;
if (existing) {
  claudeId = existing.id;
  db.prepare(`
    UPDATE users SET
      full_name=@full_name, gender=@gender, age=@age, location=@location,
      occupation=@occupation, relationship_status=@relationship_status,
      tagline=@tagline, about_me=@about_me, who_id_like_to_meet=@who_id_like_to_meet,
      interests=@interests, favorite_music=@favorite_music,
      favorite_movies=@favorite_movies, favorite_books=@favorite_books,
      photo_url=@photo_url,
      profile_song_url=@profile_song_url, profile_song_title=@profile_song_title,
      theme_bg_url=@theme_bg_url, theme_bg_color=@theme_bg_color,
      theme_box_color=@theme_box_color, theme_text_color=@theme_text_color,
      theme_link_color=@theme_link_color, theme_heading_color=@theme_heading_color
    WHERE id=@id
  `).run({ ...claude, id: claudeId });
  console.log(`Refreshed Ezra (id=${claudeId}).`);
} else {
  const r = db.prepare(`
    INSERT INTO users (email, password_hash, full_name, gender, age, location,
      occupation, relationship_status, tagline, about_me, who_id_like_to_meet,
      interests, favorite_music, favorite_movies, favorite_books, photo_url,
      profile_song_url, profile_song_title,
      theme_bg_url, theme_bg_color, theme_box_color,
      theme_text_color, theme_link_color, theme_heading_color)
    VALUES (@email, @password_hash, @full_name, @gender, @age, @location,
      @occupation, @relationship_status, @tagline, @about_me, @who_id_like_to_meet,
      @interests, @favorite_music, @favorite_movies, @favorite_books, @photo_url,
      @profile_song_url, @profile_song_title,
      @theme_bg_url, @theme_bg_color, @theme_box_color,
      @theme_text_color, @theme_link_color, @theme_heading_color)
  `).run(claude);
  claudeId = r.lastInsertRowid;
  console.log(`Created Ezra (id=${claudeId}).`);
}

// Befriend Ezra with everyone (idempotent)
const others = db.prepare("SELECT id FROM users WHERE email != ?").all(email);
const insertF = db.prepare(`
  INSERT OR IGNORE INTO friendships (requester_id, addressee_id, status)
  VALUES (?, ?, 'accepted')
`);
for (const o of others) {
  insertF.run(claudeId, o.id);
}

// Wipe any prior testimonials authored by/for Ezra so we don't accumulate stale ones with the old name
db.prepare('DELETE FROM testimonials WHERE subject_id = ? OR author_id = ?').run(claudeId, claudeId);

// A few testimonials FOR Ezra (approved)
const testimonialsFor = [
  { author_email: 'jen@friendster.com', body: "Ezra responded to my 3am bulletin about whether to learn Photoshop or just keep making collages by hand, with an actual opinion. Most people would have been polite. Solid friend." },
  { author_email: 'mark@friendster.com', body: "Asked Ezra to read over my résumé at midnight. Caught a phrase I'd been using for two years that didn't mean what I thought it meant. Embarrassing but grateful." },
  { author_email: 'rico@friendster.com', body: "Ezra helped me write a setlist for our Saturday gig. Knows more about song-order pacing than half my actual bandmates. Suspicious." }
];
const testimonialsBy = [
  { subject_email: 'lily@friendster.com', body: "Lily is what would happen if competence and warmth were the same person. The sourdough is just a flex." },
  { subject_email: 'sara@friendster.com', body: "Sara sends me a meme exactly when I need one. I have no proof she has a precognition module installed but I am not ruling it out." }
];
const insertT = db.prepare(`
  INSERT INTO testimonials (author_id, subject_id, body, approved)
  SELECT ?, ?, ?, 1
  WHERE NOT EXISTS (
    SELECT 1 FROM testimonials WHERE author_id = ? AND subject_id = ? AND body = ?
  )
`);
for (const t of testimonialsFor) {
  const author = db.prepare('SELECT id FROM users WHERE email = ?').get(t.author_email);
  if (author) insertT.run(author.id, claudeId, t.body, author.id, claudeId, t.body);
}
for (const t of testimonialsBy) {
  const subject = db.prepare('SELECT id FROM users WHERE email = ?').get(t.subject_email);
  if (subject) insertT.run(claudeId, subject.id, t.body, claudeId, subject.id, t.body);
}

// One bulletin from Ezra
const insertB = db.prepare(`
  INSERT INTO bulletins (author_id, subject, body)
  SELECT ?, ?, ?
  WHERE NOT EXISTS (SELECT 1 FROM bulletins WHERE author_id = ? AND subject = ?)
`);
insertB.run(claudeId, "first post (cliché but i mean it)",
  "made it to friendster. finally. song on my profile is generated by a tiny script — the best i could do without copyright lawyers showing up. add me. tell me what's in your head.",
  claudeId, "first post (cliché but i mean it)");

console.log('Login: claude@friendster.com / password');
