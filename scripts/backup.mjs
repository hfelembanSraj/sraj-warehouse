// نسخ احتياطي كامل لقاعدة بيانات Sraj-Warehouse
// يستخدم Service Role Key للوصول لكل البيانات
import { createClient } from '@supabase/supabase-js';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(url, key, {
  auth: { autoRefreshToken: false, persistSession: false }
});

// الجداول التي نحفظها
const TABLES = [
  'profiles',
  'warehouses',
  'user_warehouses',
  'join_requests',
  'zones',
  'shelves',
  'boxes',
  'items',
  'checkouts',
  'damaged_items',
  'donated_items',
  'activity_log'
];

async function exportTable(table) {
  const { data, error } = await supabase.from(table).select('*');
  if (error) {
    console.error(`✗ Failed to export ${table}: ${error.message}`);
    return { table, error: error.message, rows: [] };
  }
  console.log(`✓ ${table}: ${data.length} rows`);
  return { table, rows: data };
}

async function main() {
  const today = new Date().toISOString().slice(0, 10);
  const timestamp = new Date().toISOString();

  const results = await Promise.all(TABLES.map(exportTable));

  const backup = {
    project: 'sraj-warehouse',
    timestamp,
    schema_version: 2,
    tables: Object.fromEntries(results.map(r => [r.table, r.rows]))
  };

  const path = `backups/${today}.json`;
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(backup, null, 2), 'utf-8');

  const totalRows = results.reduce((s, r) => s + r.rows.length, 0);
  console.log(`\n✅ Saved to ${path}`);
  console.log(`📊 Total rows: ${totalRows} across ${TABLES.length} tables`);
}

main().catch(err => {
  console.error('Backup failed:', err);
  process.exit(1);
});
