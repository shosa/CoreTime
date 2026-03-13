/**
 * Script di inizializzazione DB SQLite per la build Electron.
 * Crea il DB, applica lo schema con `prisma db push`, esegue il seed.
 * Uso: npx ts-node src/main-sqlite-init.ts <percorso-db>
 */
import { execSync } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';

const dbPath = process.argv[2] || path.join(__dirname, '..', 'data', 'coretime.db');
const dataDir = path.dirname(dbPath);

if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

process.env.DATABASE_URL = `file:${dbPath}`;

console.log(`Inizializzazione DB SQLite: ${dbPath}`);

// Push schema
execSync('npx prisma db push --schema=./prisma/schema.prisma --skip-generate', {
  env: { ...process.env },
  stdio: 'inherit',
  cwd: path.join(__dirname, '..'),
});

// Seed
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcrypt');
const { randomUUID } = require('crypto');

async function seed() {
  const prisma = new PrismaClient({ datasources: { db: { url: `file:${dbPath}` } } });

  try {
    const count = await prisma.user.count();
    if (count > 0) { console.log('DB già inizializzato, seed saltato.'); return; }

    const adminPw = await bcrypt.hash('admin123', 10);
    const hrPw = await bcrypt.hash('hr123', 10);

    await prisma.user.createMany({
      data: [
        { id: randomUUID(), email: 'admin@coretime.local', password: adminPw, firstName: 'Admin', lastName: 'CoreTime', role: 'admin' },
        { id: randomUUID(), email: 'hr@coretime.local', password: hrPw, firstName: 'Responsabile', lastName: 'Paghe', role: 'hr' },
      ],
    });

    const dept1 = { id: randomUUID(), code: 'MAN1', name: 'Manovia 1' };
    const dept2 = { id: randomUUID(), code: 'MAN2', name: 'Manovia 2' };
    const dept3 = { id: randomUUID(), code: 'MAG', name: 'Magazzino' };
    await prisma.department.createMany({ data: [dept1, dept2, dept3] });

    console.log('✅ Seed completato');
  } finally {
    await prisma.$disconnect();
  }
}

seed().catch(console.error);
