const bcrypt = require('bcryptjs');
const db = require('./db');

const exists = db.prepare('SELECT COUNT(*) AS c FROM users').get().c > 0;
if (exists) {
  console.log('Database already seeded. Delete friendster.db to reseed.');
  process.exit(0);
}

const users = [
  {
    email: 'jen@friendster.com', password: 'password', full_name: 'Jen Marquez',
    gender: 'Female', age: 24, location: 'Manila, Philippines',
    occupation: 'Graphic Designer', relationship_status: 'Single',
    interests: 'photography, indie music, late-night chats, cats',
    favorite_music: 'Coldplay, Sugar Ray, Eraserheads, Norah Jones',
    favorite_movies: 'Amélie, Lost in Translation, Garden State',
    favorite_books: 'The Little Prince, anything by Murakami',
    about_me: "Just a girl trying to figure things out one weekend at a time. I love finding hole-in-the-wall coffee shops and taking photos of strangers' shoes.",
    who_id_like_to_meet: "People who can quote Wes Anderson movies on demand.",
    tagline: "live, laugh, and stay weird",
    photo_url: ''
  },
  {
    email: 'mark@friendster.com', password: 'password', full_name: 'Mark Tan',
    gender: 'Male', age: 27, location: 'Singapore',
    occupation: 'Software Engineer', relationship_status: 'In a relationship',
    interests: 'gaming, basketball, ramen, building random side projects',
    favorite_music: 'Linkin Park, Daft Punk, Jay Chou',
    favorite_movies: 'The Matrix trilogy, Lord of the Rings',
    favorite_books: "Hitchhiker's Guide to the Galaxy",
    about_me: "Code by day, NBA League Pass by night. Will travel for good ramen.",
    who_id_like_to_meet: "Anyone who wants to argue about tabs vs spaces.",
    tagline: "shipping software, slowly",
    photo_url: ''
  },
  {
    email: 'sara@friendster.com', password: 'password', full_name: 'Sara Lim',
    gender: 'Female', age: 22, location: 'Kuala Lumpur, Malaysia',
    occupation: 'Student', relationship_status: 'Single',
    interests: 'k-pop, anime, café-hopping, sleeping in',
    favorite_music: 'BoA, Utada Hikaru, Avril Lavigne',
    favorite_movies: 'Spirited Away, Mean Girls',
    favorite_books: 'Harry Potter (all of them)',
    about_me: "Final year uni student majoring in procrastination with a minor in milk tea.",
    who_id_like_to_meet: "Someone who'll watch Studio Ghibli marathons with me.",
    tagline: "coffee, naps, repeat",
    photo_url: ''
  },
  {
    email: 'rico@friendster.com', password: 'password', full_name: 'Rico DelaCruz',
    gender: 'Male', age: 30, location: 'Cebu, Philippines',
    occupation: 'Musician', relationship_status: "It's complicated",
    interests: 'guitar, motorbikes, surfing, songwriting',
    favorite_music: 'Parokya ni Edgar, Rivermaya, Foo Fighters',
    favorite_movies: 'Almost Famous, High Fidelity',
    favorite_books: "On the Road",
    about_me: "I play in a band. We're not famous yet but we will be (or we won't, and that's also fine).",
    who_id_like_to_meet: "Someone with their own van.",
    tagline: "three chords and the truth",
    photo_url: ''
  },
  {
    email: 'lily@friendster.com', password: 'password', full_name: 'Lily Chen',
    gender: 'Female', age: 26, location: 'Hong Kong',
    occupation: 'Marketing Manager', relationship_status: 'Married',
    interests: 'yoga, brunch, traveling, my dog Mochi',
    favorite_music: 'Nora Jones, Jack Johnson, Faye Wong',
    favorite_movies: 'In the Mood for Love, Notting Hill',
    favorite_books: 'Eat Pray Love',
    about_me: "Marketing by day, dog mom always. Recently obsessed with making sourdough.",
    who_id_like_to_meet: "Other dog parents in HK!",
    tagline: "she/her | dog mom | brunch enthusiast",
    photo_url: ''
  },
  {
    email: 'kev@friendster.com', password: 'password', full_name: 'Kevin Park',
    gender: 'Male', age: 25, location: 'Seoul, South Korea',
    occupation: 'Photographer', relationship_status: 'Single',
    interests: 'film cameras, street photography, vinyl records',
    favorite_music: 'Radiohead, Beatles, Nujabes',
    favorite_movies: 'Oldboy, Memories of Murder',
    favorite_books: "Norwegian Wood",
    about_me: "Shoot mostly film. Never trust a camera that needs a battery to take a photo.",
    who_id_like_to_meet: "Anyone willing to model for free in exchange for prints.",
    tagline: "shoot first, ask questions later",
    photo_url: ''
  }
];

const insertUser = db.prepare(`
  INSERT INTO users (email, password_hash, full_name, gender, age, location, occupation,
    relationship_status, interests, favorite_music, favorite_movies, favorite_books,
    about_me, who_id_like_to_meet, photo_url, tagline)
  VALUES (@email, @password_hash, @full_name, @gender, @age, @location, @occupation,
    @relationship_status, @interests, @favorite_music, @favorite_movies, @favorite_books,
    @about_me, @who_id_like_to_meet, @photo_url, @tagline)
`);

const insertFriendship = db.prepare(
  "INSERT INTO friendships (requester_id, addressee_id, status) VALUES (?, ?, 'accepted')"
);
const insertTestimonial = db.prepare(
  'INSERT INTO testimonials (author_id, subject_id, body, approved) VALUES (?, ?, ?, 1)'
);
const insertBulletin = db.prepare(
  'INSERT INTO bulletins (author_id, subject, body) VALUES (?, ?, ?)'
);

const ids = {};
for (const u of users) {
  const password_hash = bcrypt.hashSync(u.password, 10);
  const r = insertUser.run({ ...u, password_hash });
  ids[u.email] = r.lastInsertRowid;
}

// Create a web of friendships
const f = (a, b) => insertFriendship.run(ids[a], ids[b]);
f('jen@friendster.com', 'mark@friendster.com');
f('jen@friendster.com', 'sara@friendster.com');
f('jen@friendster.com', 'lily@friendster.com');
f('mark@friendster.com', 'rico@friendster.com');
f('mark@friendster.com', 'kev@friendster.com');
f('sara@friendster.com', 'lily@friendster.com');
f('rico@friendster.com', 'kev@friendster.com');
f('lily@friendster.com', 'kev@friendster.com');

// Testimonials
insertTestimonial.run(ids['mark@friendster.com'], ids['jen@friendster.com'],
  "Jen has the best taste in music and is the only person who actually responds to bulletins. Solid friend.");
insertTestimonial.run(ids['sara@friendster.com'], ids['jen@friendster.com'],
  "We once spent four hours at a café arguing about whether Lost in Translation has a happy ending. Still no resolution.");
insertTestimonial.run(ids['rico@friendster.com'], ids['mark@friendster.com'],
  "Mark fixed my laptop at 2am the night before our gig. Legend.");
insertTestimonial.run(ids['kev@friendster.com'], ids['lily@friendster.com'],
  "Lily threw the best dinner party I've been to in Hong Kong. Mochi is also adorable.");
insertTestimonial.run(ids['lily@friendster.com'], ids['sara@friendster.com'],
  "Sara is the type of friend who'll text you a meme at 3am that perfectly captures your mood. Treasure.");

// A few bulletins
insertBulletin.run(ids['jen@friendster.com'], 'New photos!',
  "Just uploaded shots from the trip to Batanes. Check them out and let me know which ones I should print!");
insertBulletin.run(ids['mark@friendster.com'], 'Anyone going to the gig this Saturday?',
  "Rico's band is playing at 19East. DM me if you're in.");
insertBulletin.run(ids['rico@friendster.com'], 'Saturday show — bring friends!',
  "Doors at 8. We're playing 4 new songs. Come early, stay late.");
insertBulletin.run(ids['lily@friendster.com'], 'Sourdough = best hobby',
  "Two weeks in and my starter has a name (Doughrothy). Send tips.");

console.log('Seeded with', users.length, 'users.');
console.log('Login as any of:', users.map(u => `${u.email} / password`).join(', '));
