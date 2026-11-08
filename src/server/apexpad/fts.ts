/**
 * src/server/apexpad/fts.ts
 * FTS5 virtual table + sync triggers for progressive disclosure search.
 * Created lazily at runtime (virtual tables are not representable in the Prisma schema).
 * Gracefully degrades to LIKE-based scoring when the SQLite build lacks FTS5.
 */

import { db } from '@/lib/db';

const globalForFts = globalThis as unknown as {
  apexpadFtsReady: boolean;
  apexpadFtsAvailable: boolean;
};

export function isFtsAvailable(): boolean {
  return globalForFts.apexpadFtsAvailable === true;
}

async function exec(sql: string): Promise<void> {
  await db.$executeRawUnsafe(sql);
}

export async function ensureFtsSetup(): Promise<void> {
  if (globalForFts.apexpadFtsReady) return;
  globalForFts.apexpadFtsReady = true;

  try {
    await exec(`
      CREATE VIRTUAL TABLE IF NOT EXISTS "observations_fts" USING fts5(
        "obs_id" UNINDEXED,
        "project_slug" UNINDEXED,
        "title",
        "subtitle",
        "narrative",
        "facts_text",
        "referenced_files",
        "referenced_symbols",
        tokenize = 'porter unicode61'
      );
    `);

    await exec(`
      CREATE TRIGGER IF NOT EXISTS "trg_observations_ai" AFTER INSERT ON "observations" BEGIN
        INSERT INTO "observations_fts"(
          "obs_id", "project_slug", "title", "subtitle", "narrative", "facts_text", "referenced_files", "referenced_symbols"
        ) VALUES (
          new."id", new."project_slug", new."title", new."subtitle", new."narrative", new."facts_json", new."referenced_files", new."referenced_symbols"
        );
      END;
    `);

    await exec(`
      CREATE TRIGGER IF NOT EXISTS "trg_observations_ad" AFTER DELETE ON "observations" BEGIN
        DELETE FROM "observations_fts" WHERE "obs_id" = old."id";
      END;
    `);

    await exec(`
      CREATE TRIGGER IF NOT EXISTS "trg_observations_au" AFTER UPDATE ON "observations" BEGIN
        DELETE FROM "observations_fts" WHERE "obs_id" = old."id";
        INSERT INTO "observations_fts"(
          "obs_id", "project_slug", "title", "subtitle", "narrative", "facts_text", "referenced_files", "referenced_symbols"
        ) VALUES (
          new."id", new."project_slug", new."title", new."subtitle", new."narrative", new."facts_json", new."referenced_files", new."referenced_symbols"
        );
      END;
    `);

    // Verify FTS5 is actually usable (some SQLite builds lack the module)
    await db.$queryRawUnsafe(`SELECT 1 FROM "observations_fts" LIMIT 1;`);

    // Self-healing backfill: re-index any observations that predate the FTS table
    // (e.g. after a schema push that dropped the virtual tables). The AFTER INSERT
    // trigger only covers rows written after setup, so a backfill guard is required.
    await exec(`
      INSERT INTO "observations_fts"(
        "obs_id", "project_slug", "title", "subtitle", "narrative", "facts_text", "referenced_files", "referenced_symbols"
      )
      SELECT
        o."id", o."project_slug", o."title", o."subtitle", o."narrative", o."facts_json", o."referenced_files", o."referenced_symbols"
      FROM "observations" o
      WHERE NOT EXISTS (
        SELECT 1 FROM "observations_fts" f WHERE f."obs_id" = o."id"
      );
    `);

    globalForFts.apexpadFtsAvailable = true;
  } catch (err) {
    console.warn('[apexpad] FTS5 unavailable — falling back to LIKE scoring search:', err);
    globalForFts.apexpadFtsAvailable = false;
  }
}
