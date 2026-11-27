// Neon 초기화: 테이블 생성 + 로컬 SQLite(.local/hometv.sqlite)의 채널 목록 복사.
// 사용: node scripts/neon-setup.mjs <DATABASE_URL 이 든 env 파일>
// PIN 해시·세션 버전·신고·로그인 기록은 복사하지 않는다(운영은 Vercel 환경 변수의 PIN 사용).
import {readFileSync, existsSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {neon} from '@neondatabase/serverless';

const envFile = process.argv[2];
const vars = Object.fromEntries(readFileSync(envFile, 'utf8').split(/\r?\n/).filter(l => l.includes('=') && !l.startsWith('#'))
  .map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^"|"$/g, '')]; }));
const url = vars.DATABASE_URL;
if (!url) throw new Error('DATABASE_URL 이 env 파일에 없습니다.');
const sql = neon(url);

for (const stmt of readFileSync('server/schema.pg.sql', 'utf8').split(';').map(s => s.replace(/--.*$/gm, '').trim()).filter(Boolean)) {
  await sql.query(stmt);
}
console.log('tables ready');

if (existsSync('.local/hometv.sqlite')) {
  const local = new DatabaseSync('.local/hometv.sqlite', {readOnly: true});
  const channels = local.prepare('SELECT id,payload,revision,updated_at FROM channels').all();
  for (const c of channels) {
    await sql.query('INSERT INTO channels (id,payload,revision,updated_at) VALUES ($1,$2,$3,$4) ON CONFLICT (id) DO NOTHING',
      [c.id, c.payload, Number(c.revision), Number(c.updated_at)]);
  }
  const init = local.prepare("SELECT value FROM settings WHERE key = 'catalog_initialized'").get();
  if (init) await sql.query("INSERT INTO settings (key,value) VALUES ('catalog_initialized','1') ON CONFLICT DO NOTHING");
  local.close();
  console.log('copied channels:', channels.length);
}
const [{n}] = await sql.query('SELECT count(*)::int AS n FROM channels');
console.log('channels in Neon:', n);
