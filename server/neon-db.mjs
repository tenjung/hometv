// Neon(Postgres)을 worker/api.mjs 가 쓰는 D1 방식(prepare/bind/first/all/run/batch)으로 감싼다.
// 같은 API 코드를 Cloudflare D1, 로컬 SQLite, Vercel+Neon에서 그대로 쓰기 위한 어댑터.
import {neon} from '@neondatabase/serverless';

const INT8 = 20; // Postgres bigint: 드라이버가 문자열로 주므로 숫자로 바꾼다(Date.now() 값 등).

/** SQLite식 ? 자리표시자를 Postgres $1, $2 … 로 바꾼다(문자열 리터럴 안의 ?는 건드리지 않음). */
export function toPg(sql) {
  let n = 0, out = '', quote = null;
  for (const ch of sql) {
    if (quote) { out += ch; if (ch === quote) quote = null; continue; }
    if (ch === "'" || ch === '"') { quote = ch; out += ch; continue; }
    out += ch === '?' ? '$' + (++n) : ch;
  }
  return out;
}

function rows(result) {
  const big = (result.fields || []).filter(f => f.dataTypeID === INT8).map(f => f.name);
  if (!big.length) return result.rows;
  return result.rows.map(r => { const o = {...r}; for (const k of big) if (o[k] != null) o[k] = Number(o[k]); return o; });
}

export function neonDB(url) {
  const sql = neon(url, {fullResults: true});
  const statement = (text, params = []) => ({
    text: toPg(text), params,
    bind(...p) { return statement(text, p); },
    async first() { return rows(await sql.query(this.text, params))[0] ?? null; },
    async all() { return {results: rows(await sql.query(this.text, params))}; },
    async run() { const r = await sql.query(this.text, params); return {success: true, meta: {changes: r.rowCount ?? 0}}; },
  });
  return {
    prepare: text => statement(text),
    async batch(list) {
      const results = await sql.transaction(list.map(s => sql.query(s.text, s.params)));
      return results.map(r => ({success: true, meta: {changes: r.rowCount ?? 0}}));
    },
  };
}
