import 'dotenv/config';
import path from 'path';
import { fileURLToPath } from 'url';
import express from 'express';
import cors from 'cors';
import { pool, checkDatabaseConnection } from './config/db.js';
import { initDb } from './scripts/initDb.js';
import authRoutes from './routes/auth.js';
import readerRoutes from './routes/reader.js';
import booksRoutes from './routes/books.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = Number(process.env.PORT || 3000);
const publicDir = path.join(__dirname, '..', 'public');
const bootstrapIconsDir = path.join(
  __dirname,
  '..',
  'node_modules',
  'bootstrap-icons',
  'font',
);
const sweetalert2Dir = path.join(
  __dirname,
  '..',
  'node_modules',
  'sweetalert2',
  'dist',
);

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use('/assets/bootstrap-icons', express.static(bootstrapIconsDir));
app.use('/assets/sweetalert2', express.static(sweetalert2Dir));

// HTML pages reference icons via /node_modules/bootstrap-icons/...
// Serve them at that path so all <link>/<script> tags resolve correctly.
const nodeModulesDir = path.join(__dirname, '..', 'node_modules');
app.use('/node_modules', express.static(nodeModulesDir));

app.use(express.static(publicDir));

app.get('/', (req, res) => {
  res.sendFile(path.join(publicDir, 'home.html'));
});

app.get('/home.html', (req, res) => {
  res.sendFile(path.join(publicDir, 'home.html'));
});

app.get('/read/manga/:slug/:chapter/:page', (req, res) => {
  res.sendFile(path.join(publicDir, 'read.html'));
});

app.get('/api', (req, res) => {
  res.json({
    message: 'Express + MySQL API is running',
  });
});

app.use('/api/auth', authRoutes);
app.use('/api/books', booksRoutes);
app.use('/api/reader', readerRoutes);

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

app.get('/db-check', async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT 1 + 1 AS result');

    res.json({
      status: 'connected',
      data: rows[0],
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message,
    });
  }
});

async function startServer() {
  try {
    await initDb();
    console.log('Database schema ready.');
  } catch (error) {
    console.warn('Database migration skipped or failed:');
    console.warn(error.message);
  }

  app.listen(PORT, '0.0.0.0', async () => {
    console.log(`Server running at http://localhost:${PORT}`);

    try {
      await checkDatabaseConnection();
      console.log('Connected to MySQL successfully.');
    } catch (error) {
      console.warn(
        'Could not connect to MySQL. Check XAMPP and your .env settings.',
      );
      console.warn(error.message);
    }
  });
}

startServer().catch((error) => {
  console.error('Failed to start server:', error.message);
  process.exit(1);
});
