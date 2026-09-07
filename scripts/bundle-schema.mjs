#!/usr/bin/env node
/**
 * Samler alle migrationer til én fil, supabase/schema.sql.
 *
 * Formålet er opsætning i hånden: Supabase' SQL Editor tager én forespørgsel
 * ad gangen, og det er nemmere at indsætte én fil end at holde styr på
 * rækkefølgen selv. Migrationerne forbliver kilden til sandhed - denne fil er
 * genereret og må ikke rettes direkte.
 *
 *   npm run schema:bundle   skriver filen
 *   npm run schema:check    fejler hvis filen er kommet bagud
 */
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const MIGRATIONS = 'supabase/migrations';
const OUTPUT = 'supabase/schema.sql';

function bundle() {
  const files = readdirSync(MIGRATIONS)
    .filter((name) => name.endsWith('.sql'))
    .sort();

  if (!files.length) {
    throw new Error(`Ingen migrationer fundet i ${MIGRATIONS}`);
  }

  const parts = [
    '-- Ny-outbound: komplet databaseskema',
    '--',
    '-- GENERERET FIL - ret ikke i den. Kilden er supabase/migrations/,',
    '-- og filen bygges med `npm run schema:bundle`.',
    '--',
    '-- Til opsætning i hånden: indsæt hele filen i Supabase SQL Editor og kør',
    '-- den én gang på et tomt projekt.',
    '',
  ];

  for (const name of files) {
    parts.push(
      '-- ============================================================',
      `-- ${MIGRATIONS}/${name}`,
      '-- ============================================================',
      readFileSync(join(MIGRATIONS, name), 'utf8').trimEnd(),
      '',
    );
  }

  return `${parts.join('\n')}\n`;
}

const bundled = bundle();

if (process.argv.includes('--check')) {
  let current = '';
  try {
    current = readFileSync(OUTPUT, 'utf8');
  } catch {
    console.error(`${OUTPUT} mangler. Kør: npm run schema:bundle`);
    process.exit(1);
  }

  if (current !== bundled) {
    console.error(
      `${OUTPUT} er ikke i sync med migrationerne. Kør: npm run schema:bundle`,
    );
    process.exit(1);
  }

  console.log(`${OUTPUT} er opdateret.`);
} else {
  writeFileSync(OUTPUT, bundled);
  console.log(`Skrev ${OUTPUT}`);
}
