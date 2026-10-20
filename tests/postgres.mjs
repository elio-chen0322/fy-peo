import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { database, translateSQL } from '../deploy/render/database.mjs';
const pg = new PGlite();
await pg.exec('CREATE ROLE anon; CREATE ROLE authenticated;');
await pg.exec(readFileSync(new URL('../deploy/render/schema.sql',import.meta.url),'utf8'));
const client = {query: (sql,args) => pg.query(sql,args).then(r=>({...r,rowCount:r.affectedRows})),release(){}};
const db=database({...client,connect:async()=>client});
await db.batch([
 db.prepare('INSERT OR IGNORE INTO features(id,owner,parent,name) VALUES(?,?,?,?)').bind('a','test','一级','二级'),
 db.prepare('INSERT OR IGNORE INTO features(id,owner,parent,name) VALUES(?,?,?,?)').bind('a','test','一级','二级'),
]);
assert.equal((await db.prepare('SELECT COUNT(*) n FROM features').first()).n,1);
assert.equal((await db.prepare("SELECT json_extract(?, '$.诉求ID') id").bind('{"诉求ID":"需求1"}').first()).id,'需求1');
assert.equal((await db.prepare("SELECT SUM(name='二级') n FROM features").first()).n,1);
assert.equal((await db.prepare('SELECT value FROM json_each(?)').bind('["a"]' ).first()).value,'a');
const r=await db.batch([
 db.prepare('UPDATE features SET name=? WHERE id=?').bind('修订','a'),
 db.prepare('INSERT INTO features(id,owner,parent,name) SELECT ?,?,?,? WHERE changes()=1').bind('b','test','一级','审计'),
]);
assert.equal(r[1].meta.changes,1);
await assert.rejects(db.batch([
 db.prepare('UPDATE features SET name=? WHERE id=?').bind('不应保存','a'),
 db.prepare('INSERT INTO features(id,owner,parent,name) VALUES(?,?,?,?)').bind('a','test','一级','重复'),
]));
assert.equal((await db.prepare('SELECT name FROM features WHERE id=?').bind('a').first()).name,'修订');
assert.equal(translateSQL("SELECT '?' value, ? bound"),"SELECT '?' value, $1 bound");
await pg.close();
console.log('PostgreSQL schema, JSON filters, boolean counts, deduplication, audit conditions and rollback passed.');
