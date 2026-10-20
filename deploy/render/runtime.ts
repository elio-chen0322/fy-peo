import { createRequire } from 'node:module';
import { storage } from './storage';
import { database } from './database.mjs';
const require = createRequire(import.meta.url);
const { Pool, types } = require('pg');
// Preserve the numeric count/metric values returned by the existing application.
types.setTypeParser(20, (value: string) => Number(value));
let connection: ReturnType<typeof database> | undefined;
function db() {
  if (!process.env.DATABASE_URL && !process.env.PGPASSWORD) throw new Error('Database connection is not configured');
  return connection ??= database(new Pool({connectionString:process.env.DATABASE_URL,host:process.env.PGHOST,user:process.env.PGUSER,database:process.env.PGDATABASE || 'postgres',password:process.env.PGPASSWORD,port:Number(process.env.PGPORT || 5432),ssl:true,max:3,connectionTimeoutMillis:10000,idleTimeoutMillis:30000}));
}
export const env = {
  get DB() { return db() as unknown as D1Database; },
  get FILES() { return (process.env.SUPABASE_SERVICE_ROLE_KEY ? storage : undefined) as unknown as R2Bucket; },
  get DEPLOYMENT_MODE() { return 'team'; },
  get PUBLIC_DATA_OWNER() { return process.env.PUBLIC_DATA_OWNER || 'firefly-public'; },
  get SUPABASE_URL() { return process.env.SUPABASE_URL || ''; },
  get SUPABASE_PUBLISHABLE_KEY() { return process.env.SUPABASE_PUBLISHABLE_KEY || ''; },
  get TEAM_EMAILS() { return process.env.TEAM_EMAILS || ''; },
};
