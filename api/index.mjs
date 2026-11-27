// Vercel Function: /api/* 요청을 worker/api.mjs 로 넘긴다. DB는 Neon(Postgres).
import {handleApi} from '../worker/api.mjs';
import {neonDB} from '../server/neon-db.mjs';

let db;
function env() {
  db ??= neonDB(process.env.DATABASE_URL);
  return {
    DB: db,
    FAMILY_PIN: process.env.FAMILY_PIN,
    ADMIN_PIN: process.env.ADMIN_PIN,
    SESSION_SECRET: process.env.SESSION_SECRET,
  };
}

async function handle(request) {
  const url = new URL(request.url);
  // vercel.json 이 /api/<경로> 를 /api?__path=<경로> 로 넘긴다. 원래 경로로 되돌린다.
  const path = url.searchParams.get('__path');
  if (path !== null) { url.pathname = '/api/' + path; url.searchParams.delete('__path'); }

  // 로그인 실패 제한은 접속 IP 기준. 클라이언트가 꾸밀 수 있는 헤더는 버리고,
  // Vercel이 덮어써 주는 x-real-ip 만 믿는다.
  const headers = new Headers(request.headers);
  headers.delete('cf-connecting-ip');
  headers.set('x-local-client', request.headers.get('x-real-ip') || request.headers.get('x-vercel-forwarded-for') || 'unknown');

  const body = ['GET', 'HEAD'].includes(request.method) ? undefined : await request.arrayBuffer();
  return handleApi(new Request(url, {method: request.method, headers, body}), env());
}

export const GET = handle, POST = handle, PUT = handle, DELETE = handle, PATCH = handle, OPTIONS = handle;
