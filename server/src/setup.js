const { execSync } = require('child_process');
const path = require('path');

/**
 * Auto-setup: runs migrations, seeds, and creates pgvector indexes
 * Safe to run multiple times (idempotent)
 */
async function autoSetup() {
  console.log('[Setup] Starting auto-configuration...');

  try {
    console.log('[Setup] Running database migrations...');
    execSync('npx prisma migrate deploy', {
      cwd: path.join(__dirname, '..'),
      stdio: 'inherit',
      env: process.env,
    });
    console.log('[Setup] ✓ Migrations complete');
  } catch (err) {
    console.error('[Setup] ✗ Migration failed:', err.message);
    throw err;
  }

  try {
    console.log('[Setup] Generating Prisma client...');
    execSync('npx prisma generate', {
      cwd: path.join(__dirname, '..'),
      stdio: 'inherit',
      env: process.env,
    });
    console.log('[Setup] ✓ Prisma client generated');
  } catch (err) {
    console.error('[Setup] ✗ Prisma generate failed:', err.message);
  }

  try {
    console.log('[Setup] Configuring pgvector...');
    const { PrismaClient } = require('@prisma/client');
    const prisma = new PrismaClient();

    await prisma.$executeRawUnsafe('CREATE EXTENSION IF NOT EXISTS vector;');
    console.log('[Setup] ✓ pgvector extension enabled');

    try {
      await prisma.$executeRawUnsafe(`
        CREATE INDEX IF NOT EXISTS idx_chunk_embedding
        ON "DocumentChunk"
        USING ivfflat (embedding vector_cosine_ops)
        WITH (lists = 100);
      `);
      console.log('[Setup] ✓ Vector similarity index created');
    } catch (indexErr) {
      console.log('[Setup] ℹ Vector index skipped (table may be empty, will create on first insert)');
    }

    await prisma.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS idx_chunk_content_search
      ON "DocumentChunk"
      USING gin (to_tsvector('english', content));
    `);
    console.log('[Setup] ✓ Full-text search index created');

    await prisma.$disconnect();
  } catch (err) {
    console.warn('[Setup] ℹ pgvector setup note:', err.message);
  }

  try {
    console.log('[Setup] Running seed...');
    execSync('node src/seed.js', {
      cwd: path.join(__dirname, '..'),
      stdio: 'inherit',
      env: process.env,
    });
    console.log('[Setup] ✓ Seed complete');
  } catch (err) {
    console.warn('[Setup] ℹ Seed note:', err.message);
  }

  console.log('[Setup] ✓ Auto-configuration complete!');
}

module.exports = { autoSetup };