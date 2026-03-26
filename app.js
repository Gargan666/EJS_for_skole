const path = require('path');
const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcrypt');
const session = require('express-session');

const app = express();
const PORT = 3000;

const db = new sqlite3.Database(path.join(__dirname, 'accounts.db'));

app.use(express.static(path.join(__dirname, 'public')));

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// =====================
// DATABASE SETUP
// =====================

db.serialize(() => {
  db.run(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      email TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      created_at TEXT NOT NULL
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS posts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      text TEXT NOT NULL,
      likes INTEGER DEFAULT 0,
      parent INTEGER,
      created_at TEXT NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id),
      FOREIGN KEY (parent) REFERENCES posts(id)
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS post_likes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      post_id INTEGER NOT NULL,
      UNIQUE(user_id, post_id),
      FOREIGN KEY (user_id) REFERENCES users(id),
      FOREIGN KEY (post_id) REFERENCES posts(id)
    )
  `);
});

// =====================
// MIDDLEWARE
// =====================

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(session({
  secret: 'very-secret-key-change-this',
  resave: false,
  saveUninitialized: false
}));

// ✅ Make user available in ALL EJS templates
app.use((req, res, next) => {
  res.locals.user = req.session.user || null;
  next();
});

// =====================
// HELPERS
// =====================

function dbGet(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) return reject(err);
      resolve(row);
    });
  });
}

function dbAll(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) return reject(err);
      resolve(rows);
    });
  });
}

function dbRun(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function(err) {
      if (err) return reject(err);
      resolve(this);
    });
  });
}

// =====================
// AUTH MIDDLEWARE
// =====================

function requireAuth(req, res, next) {
  if (!req.session || !req.session.user) {
    return res.status(401).json({ error: "Ikke logget inn" });
  }
  next();
}

// =====================
// PAGES
// =====================

app.get('/', (req, res) => {
  res.render('index', { title: "Account System" });
});

app.get('/feed', (req, res) => {
  if (!req.session.user) {
    return res.redirect('/');
  }
  res.render('feed', { title: "Feed" });
});

app.get('/account', (req, res) => {
  res.render('account', { title: "Account" });
});

// =====================
// AUTH ROUTES
// =====================

app.post('/api/register', async (req, res) => {
  try {
    const { username, email, password } = req.body;

    if (!username || !email || !password) {
      return res.status(400).json({ error: "Missing fields" });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const result = await dbRun(
      `INSERT INTO users (username, email, password, created_at)
       VALUES (?, ?, ?, ?)`,
      [
        username.trim(),
        email.trim().toLowerCase(),
        hashedPassword,
        new Date().toISOString()
      ]
    );

    // ✅ Store user in session (IMPORTANT)
    req.session.user = {
      id: result.lastID,
      username: username.trim()
    };

    res.json({ success: true });

  } catch (err) {
    if (err.message.includes("UNIQUE")) {
      return res.status(400).json({ error: "User exists" });
    }
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
});

app.post('/api/login', async (req, res) => {
  try {
    const { username, password } = req.body;

    const user = await dbGet(
      "SELECT * FROM users WHERE username = ? OR email = ?",
      [username, username]
    );

    if (!user) return res.status(401).json({ error: "Invalid login" });

    const valid = await bcrypt.compare(password, user.password);

    if (!valid) return res.status(401).json({ error: "Invalid login" });

    // ✅ Store user in session
    req.session.user = {
      id: user.id,
      username: user.username
    };

    res.json({ success: true });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
});

app.post('/api/logout', (req, res) => {
  req.session.destroy(() => res.json({ success: true }));
});

app.get('/api/profile', requireAuth, async (req, res) => {
  const user = await dbGet(
    "SELECT id, username, email, created_at FROM users WHERE id = ?",
    [req.session.user.id]
  );
  res.json(user);
});

// =====================
// POSTS
// =====================

app.post('/api/posts', requireAuth, async (req, res) => {
  const { text, parent = null } = req.body;

  if (!text || !text.trim()) {
    return res.status(400).json({ error: "Text required" });
  }

  const result = await dbRun(
    `INSERT INTO posts (user_id, text, parent, created_at)
     VALUES (?, ?, ?, ?)`,
    [req.session.user.id, text.trim(), parent, new Date().toISOString()]
  );

  res.json({ success: true, id: result.lastID });
});

app.get('/api/posts', async (req, res) => {
  const posts = await dbAll(`
    SELECT 
      posts.id,
      posts.text,
      posts.parent,
      posts.created_at,
      users.username,
      COUNT(post_likes.id) as likes
    FROM posts
    JOIN users ON posts.user_id = users.id
    LEFT JOIN post_likes ON post_likes.post_id = posts.id
    GROUP BY posts.id
    ORDER BY posts.created_at DESC
  `);

  res.json(posts);
});

// =====================
// START SERVER
// =====================

app.listen(PORT, () => {
  console.log(`Server kjører på http://localhost:${PORT}`);
});