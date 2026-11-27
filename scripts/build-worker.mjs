import {readFile,writeFile,mkdir,readdir} from 'node:fs/promises';
import path from 'node:path';
import {build} from 'esbuild';
const assets={};
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml','.json':'application/json'};
async function walk(directory){for(const entry of await readdir(directory,{withFileTypes:true})){const file=path.join(directory,entry.name);if(entry.isDirectory())await walk(file);else {const name='/'+path.relative('dist/client',file).replaceAll('\\','/');assets[name]={body:await readFile(file,'utf8'),type:mime[path.extname(file)]||'text/plain'};}}}
await walk('dist/client');await mkdir('dist/server',{recursive:true});
const source=`import {handleApi} from './worker/api.mjs';
const assets=${JSON.stringify(assets)};
export default {async fetch(request,env){const path=new URL(request.url).pathname;if(path.startsWith('/api/'))return handleApi(request,env);if(!['GET','HEAD'].includes(request.method))return new Response('Method not allowed',{status:405});const asset=assets[path]||(path.includes('.')?null:assets['/index.html']);if(!asset)return new Response('Not found',{status:404});return new Response(request.method==='HEAD'?null:asset.body,{headers:{'Content-Type':asset.type,'X-Content-Type-Options':'nosniff','Referrer-Policy':'strict-origin-when-cross-origin','Cache-Control':path.startsWith('/assets/')?'public, max-age=31536000, immutable':'no-cache','Content-Security-Policy':"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' https: data:; media-src 'self' https: blob:; connect-src 'self' https:; worker-src 'self' blob:; object-src 'none'; base-uri 'self'; form-action 'self'"}})}};`;
await build({stdin:{contents:source,resolveDir:process.cwd(),sourcefile:'worker-entry.mjs'},bundle:true,format:'esm',platform:'browser',target:'es2022',outfile:'dist/server/index.js'});
console.log('Built self-contained Worker with',Object.keys(assets).length,'assets.');
