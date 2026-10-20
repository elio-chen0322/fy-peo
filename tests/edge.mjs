import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import pg from 'pg';
import {readFileSync,writeFileSync,mkdirSync,unlinkSync} from 'node:fs';
const db=new PGlite();
await db.exec('CREATE ROLE anon; CREATE ROLE authenticated;');
await db.exec(readFileSync('deploy/render/schema.sql','utf8'));
await db.exec("CREATE TABLE peo_members(user_id text primary key,email text,active integer); INSERT INTO peo_members VALUES('member','member@example.com',1);");
const client={query:async(sql,args)=>{const r=await db.query(sql,args);return {...r,rowCount:r.affectedRows};},release(){}};
pg.Pool=class{query(...args){return client.query(...args);} async connect(){return client;}};
let handler;
globalThis.Deno={env:{get:key=>({SUPABASE_URL:'https://test.supabase.co',SUPABASE_ANON_KEY:'public',SUPABASE_DB_URL:'postgres://test'}[key])},serve:fn=>{handler=fn;}};
const realFetch=globalThis.fetch;
globalThis.fetch=async(url,init)=>{
 assert.match(String(url),/\/auth\/v1\/user$/);
 return Response.json({id:init.headers.Authorization==='Bearer outsider'?'outsider':'member',email:'member@example.com',email_confirmed_at:'2026-10-20'});
};
mkdirSync('work',{recursive:true});
const file='work/edge-test.mjs';
writeFileSync(file,readFileSync('supabase/functions/peo-api/index.js','utf8').replace('npm:pg@8.23.1','pg'));
try{
 await import('../'+file+'?test='+Date.now());
 const call=async(path,body,token='member',origin='https://elio-chen0322.github.io')=>{
  const r=await handler(new Request('https://test.supabase.co/functions/v1/peo-api/'+path,{method:body?'POST':'GET',headers:{Authorization:'Bearer '+token,Origin:origin,'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined}));
  const data=await r.json();return {status:r.status,data};
 };
 assert.equal((await call('library?mode=meta',null,'outsider')).status,403);
 assert.equal((await call('library?mode=meta',null,'member','https://other.example')).status,403);
 const preflight=await handler(new Request('https://test.supabase.co/functions/v1/peo-api/library',{method:'OPTIONS',headers:{Origin:'https://elio-chen0322.github.io'}}));assert.equal(preflight.status,204);
 const meta=await call('library?mode=meta');assert.equal(meta.status,200,JSON.stringify(meta.data));assert.ok(meta.data.features.length);
 const created=await call('library',{action:'create',record:{raw:'导航语音希望增加音量设置',source:'测试',source_type:'帖子',published_at:'2026-10-20 10:00:00'}});assert.equal(created.status,200,JSON.stringify(created.data));
 const id=created.data.id;assert.ok(id);
 const detail=await call('library?mode=detail&id='+id);assert.equal(detail.status,200);assert.equal(detail.data.row.raw,'导航语音希望增加音量设置');
 const revision=detail.data.row.revision;
 const edited=await call('library',{action:'edit',id,revision,patch:{raw:'导航语音建议增加音量设置'}});assert.equal(edited.status,200,JSON.stringify(edited.data));
 const conflict=await call('library',{action:'edit',id,revision,patch:{raw:'不应覆盖'}});assert.equal(conflict.status,409,JSON.stringify(conflict.data));
 const imported=await call('library',{action:'import',records:[{raw:'希望增加地图显示设置',source:'测试',source_type:'评论'}]});assert.equal(imported.status,200,JSON.stringify(imported.data));
 const voices=await call('voice-labels');assert.equal(voices.status,200,JSON.stringify(voices.data));
 const cycle=await call('peo-cycle');assert.equal(cycle.status,200,JSON.stringify(cycle.data));
 console.log('Edge API passed: CORS, membership, metadata, create/read/edit, conflict protection, import, voice archive and cycle report.');
}finally{globalThis.fetch=realFetch;await db.close();unlinkSync(file);}
