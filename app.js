// Importerer innebygd 'path' for trygg håndtering av filstier
const path = require('path');

// Importerer Express-rammeverket
const express = require('express');

// Importerer SQLite3-driver
const sqlite3 = require('sqlite3').verbose();

// Importerer bcrypt for kryptering av passord
const bcrypt = require('bcrypt');

// Importerer express-session for innloggingssesjoner
const session = require('express-session');

// Lager Express-applikasjonen
const app = express();

// Port
const PORT = 3000;

// Åpner/oppretter SQLite-database
const db = new sqlite3.Database(path.join(__dirname, 'accounts.db'));

app.use(express.static(path.join(__dirname, 'public')));

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.get('/', (req, res) => {
  res.render('index', {
    title: "Account System"
  });
});

// Oppretter users-tabell hvis den ikke finnes
db.serialize(() => {
  db.run(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      created_at TEXT NOT NULL
    )
  `);
});


// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));


// Session-oppsett
app.use(session({
  secret: 'very-secret-key-change-this',
  resave: false,
  saveUninitialized: false
}));


// Hjelpefunksjon: SELECT
function dbGet(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) return reject(err);
      resolve(row);
    });
  });
}


// Hjelpefunksjon: SELECT flere
function dbAll(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) return reject(err);
      resolve(rows);
    });
  });
}


// Hjelpefunksjon: INSERT/UPDATE/DELETE
function dbRun(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function(err) {
      if (err) return reject(err);
      resolve(this);
    });
  });
}


// Middleware som krever innlogging
function requireAuth(req, res, next) {
  if (!req.session.userId) {
    return res.status(401).json({ error: "Ikke logget inn" });
  }
  next();
}

// REGISTER
app.post('/api/register', async (req, res) => {

  try {

    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({
        error: "Username and password required"
      });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const result = await dbRun(
      `INSERT INTO users (username, password, created_at)
       VALUES (?, ?, ?)`,
      [username.trim(), hashedPassword, new Date().toISOString()]
    );

    // Automatically log the user in
    req.session.userId = result.lastID;

    res.json({
      success: true,
      message: "User created and logged in"
    });

  } catch (err) {

    if (err.message.includes("UNIQUE")) {
      return res.status(400).json({
        error: "Username already exists"
      });
    }

    console.error(err);
    res.status(500).json({ error: "Server error" });

  }

});


// LOGIN
app.post('/api/login', async (req, res) => {

  try {

    const { username, password } = req.body;

    const user = await dbGet(
      "SELECT * FROM users WHERE username = ?",
      [username]
    );

    if (!user) {
      return res.status(401).json({
        error: "Feil brukernavn eller passord"
      });
    }

    // Sammenlign passord
    const validPassword = await bcrypt.compare(password, user.password);

    if (!validPassword) {
      return res.status(401).json({
        error: "Feil brukernavn eller passord"
      });
    }

    // Lagre bruker i session
    req.session.userId = user.id;

    res.json({
      success: true,
      message: "Innlogget"
    });

  } catch (err) {

    console.error(err);
    res.status(500).json({ error: "Serverfeil" });

  }
});


// LOGOUT
app.post('/api/logout', (req, res) => {

  req.session.destroy(() => {
    res.json({
      success: true,
      message: "Logget ut"
    });
  });

});


// PROTECTED ROUTE
app.get('/api/profile', requireAuth, async (req, res) => {

  try {

    const user = await dbGet(
      "SELECT id, username, created_at FROM users WHERE id = ?",
      [req.session.userId]
    );

    res.json(user);

  } catch (err) {

    console.error(err);
    res.status(500).json({ error: "Serverfeil" });

  }

});


// Liste alle brukere (bare som test)
app.get('/api/users', async (req, res) => {

  const users = await dbAll(
    "SELECT id, username, created_at FROM users"
  );

  res.json(users);

});


// Starter server
app.listen(PORT, () => {
  console.log(`Server kjører på http://localhost:${PORT}`);
});