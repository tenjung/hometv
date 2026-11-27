import http from 'node:http';
import {readFileSync} from 'node:fs';
import {spawn} from 'node:child_process';
import {handleApi} from '../worker/api.mjs';
import {localDB} from './local-db.mjs';
const vars=Object.fromEntries(readFileSync('.dev.vars','utf8').split(/\r?\n/).filter(x=>x&&!x.startsWith('#')).map(line=>{const at=line.indexOf('=');return [line.slice(0,at),line.slice(at+1)];}));
const env={...vars,DB:localDB()};const production=process.argv.includes('--production');
let worker;if(production)worker=(await import('../dist/server/index.js')).default;
const server=http.createServer(async(req,res)=>{try {
  const headers=new Headers();for(const [k,v] of Object.entries(req.headers))if(v)headers.set(k,Array.isArray(v)?v.join(','):v);
  headers.set('X-Local-Client',req.socket.remoteAddress||'local');
  // Only the loopback API port accepts Vite's forwarded host for origin checks.
  const forwarded=!production&&['127.0.0.1','::1','::ffff:127.0.0.1'].includes(req.socket.remoteAddress)?req.headers['x-dev-original-host']:null;
  const url=`http://${forwarded||req.headers.host||'127.0.0.1:4318'}${req.url}`;
  const chunks=[];let size=0;for await(const chunk of req){size+=chunk.length;if(size>16384){res.writeHead(413);res.end();return;}chunks.push(chunk);}
  const request=new Request(url,{method:req.method,headers,...(!['GET','HEAD'].includes(req.method)?{body:Buffer.concat(chunks)}:{})});
  const response=production?await worker.fetch(request,env):await handleApi(request,env);
  res.writeHead(response.status,Object.fromEntries(response.headers));res.end(Buffer.from(await response.arrayBuffer()));
}catch(e){console.error(e);res.writeHead(500);res.end('Server error');}});
server.listen(production?4317:4318,production?'0.0.0.0':'127.0.0.1',()=>console.log(production?'HomeTV: http://localhost:4317':'HomeTV API: http://localhost:4318'));
const vite=production?null:spawn(process.execPath,['node_modules/vite/bin/vite.js'],{stdio:'inherit'});
function shutdown(){vite?.kill();server.close();env.DB.close();process.exit(0);}process.on('SIGINT',shutdown);process.on('SIGTERM',shutdown);
