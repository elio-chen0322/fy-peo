function config() {
  const url = process.env.SUPABASE_URL, key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Supabase attachment storage is not configured');
  return {url,key,bucket:process.env.SUPABASE_STORAGE_BUCKET || 'feedback-files'};
}
function endpoint(key: string) {
  const c=config();
  return {url:`${c.url}/storage/v1/object/${encodeURIComponent(c.bucket)}/${key.split('/').map(encodeURIComponent).join('/')}`,headers:{Authorization:`Bearer ${c.key}`,apikey:c.key}};
}
export const storage = {
  async get(key:string) { const e=endpoint(key); const r=await fetch(e.url,{headers:e.headers}); if(r.status===404)return null;if(!r.ok)throw new Error('Attachment read failed');return {body:r.body}; },
  async put(key:string, body:ReadableStream) {const e=endpoint(key);const r=await fetch(e.url,{method:'POST',headers:{...e.headers,'Content-Type':'application/octet-stream'},body,duplex:'half'} as RequestInit);if(!r.ok)throw new Error('Attachment write failed');},
  async delete(key:string) {const e=endpoint(key);const r=await fetch(e.url,{method:'DELETE',headers:e.headers});if(!r.ok&&r.status!==404)throw new Error('Attachment delete failed');},
};
