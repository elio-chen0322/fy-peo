"""Make a private, consistent SQLite backup and PostgreSQL insert batches.

Usage: python3 deploy/supabase/prepare-data.py /absolute/source.sqlite /absolute/output
Output contains user data: keep it outside source control. Does not contact Supabase.
"""
import hashlib,json,sqlite3,sys
from pathlib import Path
source,out=Path(sys.argv[1]).resolve(),Path(sys.argv[2]).resolve()
if source==out or out==source.parent:raise SystemExit('Choose a separate output directory')
out.mkdir(parents=True,exist_ok=True)
# SQLite backup incorporates committed WAL contents without editing source records.
immutable = '&immutable=1' if not Path(str(source)+'-wal').exists() else ''
with sqlite3.connect(f'file:{source}?mode=ro{immutable}',uri=True) as live:
 with sqlite3.connect(out/'before-migration.sqlite') as target:live.backup(target)
db=sqlite3.connect(out/'before-migration.sqlite');db.row_factory=sqlite3.Row
names=['features','demands','themes','feedback','events','files','voice_labels','voice_screenings','voice_label_events','voice_review_queue','cycle_decisions']
def literal(v):
 if v is None:return 'NULL'
 if isinstance(v,(int,float)):return str(v)
 return "'"+str(v).replace("'","''")+"'"
manifest={'source_sha256':hashlib.sha256((out/'before-migration.sqlite').read_bytes()).hexdigest(),'workspace':'firefly-public','tables':{}}
for table in names:
 rows=[dict(r) for r in db.execute(f'SELECT * FROM "{table}" ORDER BY id')]
 for row in rows:row['owner']='firefly-public'
 manifest['tables'][table]={'rows':len(rows),'batches':[]}
 (out/f'{table}.json').write_text(json.dumps(rows,ensure_ascii=False))
 batch=[];size=0;index=0
 def flush():
  global batch,size,index
  if not batch:return
  filename=f'{table}-{index:04d}.sql';(out/filename).write_text('BEGIN;\n'+'\n'.join(batch)+'\nCOMMIT;\n');manifest['tables'][table]['batches'].append(filename);index+=1;batch=[];size=0
 for row in rows:
  columns=','.join('"'+k+'"' for k in row)
  sql=f'INSERT INTO public."{table}" ({columns}) VALUES ('+','.join(literal(v) for v in row.values())+') ON CONFLICT DO NOTHING;'
  if size+len(sql)>30000:flush()
  batch.append(sql);size+=len(sql)
 flush()
(out/'manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2))
print(json.dumps({t:x['rows'] for t,x in manifest['tables'].items()},ensure_ascii=False))
