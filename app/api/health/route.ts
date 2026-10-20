import { db, response, failure } from '@/lib/server';
export async function GET() {
  try { await db().prepare('SELECT 1 ok').first(); return response({status:'ok'}); }
  catch (error) { return failure(error); }
}
