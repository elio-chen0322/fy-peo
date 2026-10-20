// @ts-ignore Deno resolves the pinned npm package when the function is deployed.
import pg from 'npm:pg@8.23.1';
import {database} from '../render/database.mjs';
declare const Deno: {env:{get(name:string):string|undefined}};
const read=(key:string)=>Deno.env.get(key)||'';
pg.types.setTypeParser(20,(x:string)=>Number(x));
let connection:ReturnType<typeof database>|undefined;
const url=()=>read('SUPABASE_URL');
const secret=()=>read('SUPABASE_SERVICE_ROLE_KEY');
function endpoint(key:string){return {url:`${url()}/storage/v1/object/feedback-files/${key.split('/').map(encodeURIComponent).join('/')}`,headers:{Authorization:`Bearer ${secret()}`,apikey:secret()}};}
const files={
 async get(key:string){const e=endpoint(key);const r=await fetch(e.url,{headers:e.headers});if(r.status===404)return null;if(!r.ok)throw new Error('Attachment read failed');return {body:r.body};},
 async put(key:string,body:ReadableStream){const e=endpoint(key);const r=await fetch(e.url,{method:'POST',headers:{...e.headers,'Content-Type':'application/octet-stream'},body});if(!r.ok)throw new Error('Attachment upload failed');},
 async delete(key:string){const e=endpoint(key);const r=await fetch(e.url,{method:'DELETE',headers:e.headers});if(!r.ok&&r.status!==404)throw new Error('Attachment cleanup failed');},
};
export const env={
 get DB(){return (connection??=database(new pg.Pool({connectionString:read('SUPABASE_DB_URL'),max:1,connectionTimeoutMillis:10000,idleTimeoutMillis:10000}))) as unknown as D1Database;},
 get FILES(){return files as unknown as R2Bucket;},
 DEPLOYMENT_MODE:'supabase-edge',
 PUBLIC_DATA_OWNER:'firefly-public',
 APP_ORIGIN:'https://elio-chen0322.github.io',
};
