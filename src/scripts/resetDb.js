import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { initDb } from './initDb.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function resetDb() {
  const uploadsRoot = path.join(__dirname, '..', '..', 'public', 'uploads');

  fs.rmSync(uploadsRoot, { recursive: true, force: true });
  fs.mkdirSync(uploadsRoot, { recursive: true });

  await initDb({ dropDatabase: true });
  console.log('Database dan file upload berhasil direset.');
}

resetDb().catch((error) => {
  console.error('Gagal mereset database:', error.message);
  process.exit(1);
});
