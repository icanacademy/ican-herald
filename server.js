require('dotenv').config();
const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3000;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'changeme';
const BOOKS_PASSWORD = process.env.BOOKS_PASSWORD || 'changeme';
const DATA_FILE = path.join(__dirname, 'data', 'editions.json');
const BOOKS_FILE = path.join(__dirname, 'data', 'books.json');
const UPLOADS_DIR = path.join(__dirname, 'uploads');

// Ensure directories exist
fs.mkdirSync(path.join(__dirname, 'data'), { recursive: true });
fs.mkdirSync(UPLOADS_DIR, { recursive: true });
if (!fs.existsSync(DATA_FILE)) {
  fs.writeFileSync(DATA_FILE, '[]');
}
if (!fs.existsSync(BOOKS_FILE)) {
  fs.writeFileSync(BOOKS_FILE, '[]');
}

// Active admin tokens (in-memory, cleared on restart)
const adminTokens = new Set();
const booksTokens = new Set();

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Static files
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(UPLOADS_DIR));

// Multer config for PDF uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOADS_DIR),
  filename: (req, file, cb) => {
    const uniqueName = Date.now() + '-' + crypto.randomBytes(4).toString('hex') + '.pdf';
    cb(null, uniqueName);
  }
});
const upload = multer({
  storage,
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'application/pdf') {
      cb(null, true);
    } else {
      cb(new Error('Only PDF files are allowed'));
    }
  },
  limits: { fileSize: 100 * 1024 * 1024 } // 100MB max
});

// --- Helpers ---

function readEditions() {
  const raw = fs.readFileSync(DATA_FILE, 'utf-8');
  return JSON.parse(raw);
}

function writeEditions(editions) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(editions, null, 2));
}

function readBooks() {
  const raw = fs.readFileSync(BOOKS_FILE, 'utf-8');
  return JSON.parse(raw);
}

function writeBooks(books) {
  fs.writeFileSync(BOOKS_FILE, JSON.stringify(books, null, 2));
}

function slugify(text) {
  return text.toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function authMiddleware(req, res, next) {
  const token = req.headers['x-admin-token'] || req.query.token;
  if (!token || !adminTokens.has(token)) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
}

function booksAuthMiddleware(req, res, next) {
  const token = req.headers['x-books-token'] || req.query.token;
  if (!token || !booksTokens.has(token)) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
}

// --- API Routes ---

// Herald admin login
app.post('/api/login', (req, res) => {
  const { password } = req.body;
  if (password === ADMIN_PASSWORD) {
    const token = crypto.randomBytes(32).toString('hex');
    adminTokens.add(token);
    return res.json({ success: true, token });
  }
  res.status(401).json({ error: 'Invalid password' });
});

// Books admin login
app.post('/api/books/login', (req, res) => {
  const { password } = req.body;
  if (password === BOOKS_PASSWORD) {
    const token = crypto.randomBytes(32).toString('hex');
    booksTokens.add(token);
    return res.json({ success: true, token });
  }
  res.status(401).json({ error: 'Invalid password' });
});

// List all editions (public)
app.get('/api/editions', (req, res) => {
  const editions = readEditions();
  // Sort newest first by year, then by season order
  const seasonOrder = { Spring: 0, Summer: 1, Fall: 2, Winter: 3 };
  editions.sort((a, b) => {
    if (b.year !== a.year) return b.year - a.year;
    return (seasonOrder[b.season] || 0) - (seasonOrder[a.season] || 0);
  });
  res.json(editions);
});

// Get single edition (public)
app.get('/api/editions/:slug', (req, res) => {
  const editions = readEditions();
  const edition = editions.find(e => e.slug === req.params.slug);
  if (!edition) {
    return res.status(404).json({ error: 'Edition not found' });
  }
  res.json(edition);
});

// Upload new edition (auth required)
app.post('/api/upload', authMiddleware, upload.single('pdf'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No PDF file provided' });
  }

  const { title, season, year } = req.body;
  if (!title || !season || !year) {
    // Clean up uploaded file if validation fails
    fs.unlinkSync(req.file.path);
    return res.status(400).json({ error: 'Title, season, and year are required' });
  }

  const editions = readEditions();
  const slug = slugify(`${title}-${season}-${year}`);

  // Check for duplicate slug
  if (editions.find(e => e.slug === slug)) {
    fs.unlinkSync(req.file.path);
    return res.status(409).json({ error: 'An edition with this title/season/year already exists' });
  }

  const edition = {
    id: crypto.randomUUID(),
    title,
    slug,
    season,
    year: parseInt(year),
    filename: req.file.filename,
    createdAt: new Date().toISOString()
  };

  editions.push(edition);
  writeEditions(editions);

  res.json({ success: true, edition });
});

// Delete edition (auth required)
app.delete('/api/editions/:slug', authMiddleware, (req, res) => {
  const editions = readEditions();
  const index = editions.findIndex(e => e.slug === req.params.slug);
  if (index === -1) {
    return res.status(404).json({ error: 'Edition not found' });
  }

  const edition = editions[index];

  // Delete PDF file
  const filePath = path.join(UPLOADS_DIR, edition.filename);
  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
  }

  editions.splice(index, 1);
  writeEditions(editions);

  res.json({ success: true });
});

// --- Books API Routes ---

// List all books (public)
app.get('/api/books', (req, res) => {
  const books = readBooks();
  books.sort((a, b) => new Date(b.publishedDate) - new Date(a.publishedDate));
  res.json(books);
});

// Get single book (public)
app.get('/api/books/:slug', (req, res) => {
  const books = readBooks();
  const book = books.find(b => b.slug === req.params.slug);
  if (!book) {
    return res.status(404).json({ error: 'Book not found' });
  }
  res.json(book);
});

// Upload new book (public, no auth required)
app.post('/api/books/upload', upload.single('pdf'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No PDF file provided' });
  }

  const { title, author, teacher, publishedDate } = req.body;
  if (!title || !author || !teacher || !publishedDate) {
    fs.unlinkSync(req.file.path);
    return res.status(400).json({ error: 'Title, author, teacher, and published date are required' });
  }

  const books = readBooks();
  const slug = slugify(`${title}-${author}`);

  if (books.find(b => b.slug === slug)) {
    fs.unlinkSync(req.file.path);
    return res.status(409).json({ error: 'A book with this title/author already exists' });
  }

  const book = {
    id: crypto.randomUUID(),
    title,
    slug,
    author,
    teacher,
    publishedDate,
    filename: req.file.filename,
    createdAt: new Date().toISOString()
  };

  books.push(book);
  writeBooks(books);

  res.json({ success: true, book });
});

// Delete book (auth required)
app.delete('/api/books/:slug', booksAuthMiddleware, (req, res) => {
  const books = readBooks();
  const index = books.findIndex(b => b.slug === req.params.slug);
  if (index === -1) {
    return res.status(404).json({ error: 'Book not found' });
  }

  const book = books[index];
  const filePath = path.join(UPLOADS_DIR, book.filename);
  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
  }

  books.splice(index, 1);
  writeBooks(books);

  res.json({ success: true });
});

// Serve admin page
app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

// Serve reader page for any /read/:slug route
app.get('/read/:slug', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'reader.html'));
});

// Serve reader page for any /book/:slug route
app.get('/book/:slug', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'reader.html'));
});

// Start server
app.listen(PORT, () => {
  console.log(`ICAN Herald server running at http://localhost:${PORT}`);
});
