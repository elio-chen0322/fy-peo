// D1-shaped interface over PostgreSQL; each batch keeps one transactional connection.
export function translateSQL(source, previousChanges = 0) {
  let sql = source.replace(/`([^`]+)`/g, '"$1"');
  const ignore = /^\s*INSERT OR IGNORE\b/i.test(sql);
  sql = sql.replace(/\bINSERT OR IGNORE\b/gi, 'INSERT');
  let result = '', index = 0, quoted = false;
  for (let i = 0; i < sql.length; i++) {
    const ch = sql[i];
    if (ch === "'") {
      result += ch;
      if (quoted && sql[i + 1] === "'") { result += sql[++i]; continue; }
      quoted = !quoted;
    } else if (ch === '?' && !quoted) result += '$' + (++index);
    else result += ch;
  }
  result = result.replace(/\bchanges\(\)/gi, String(Number(previousChanges)));
  if (ignore) result = result.replace(/;?\s*$/, ' ON CONFLICT DO NOTHING');
  return result;
}
export function database(pool) {
  class Statement {
    constructor(sql, args = []) { this.sql = sql; this.args = args; }
    bind(...args) { return new Statement(this.sql, args); }
    async execute(client, previous = 0) {
      const q = await client.query(translateSQL(this.sql, previous), this.args.map(x => x === undefined ? null : x));
      return { success: true, results: q.rows, meta: { changes: /^\s*(SELECT|WITH)\b/i.test(this.sql) ? 0 : q.rowCount || 0 } };
    }
    async all() { return this.execute(pool); }
    async run() { return this.execute(pool); }
    async first(column) { const r = (await this.all()).results[0]; return column ? r?.[column] ?? null : r ?? null; }
  }
  return {
    prepare: sql => new Statement(sql),
    async batch(statements) {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const results = []; let changes = 0;
        for (const statement of statements) { const r = await statement.execute(client, changes); results.push(r); changes = r.meta.changes; }
        await client.query('COMMIT'); return results;
      } catch (error) { await client.query('ROLLBACK'); throw error; }
      finally { client.release(); }
    },
  };
}
