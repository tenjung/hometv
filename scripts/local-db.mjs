import { DatabaseSync } from 'node:sqlite';
import {mkdirSync,readFileSync,readdirSync,existsSync} from 'node:fs';
export function localDB(filename='.local/hometv.sqlite') {
  mkdirSync('.local',{recursive:true});const db=new DatabaseSync(filename);db.exec('PRAGMA journal_mode=WAL');
  db.exec('CREATE TABLE IF NOT EXISTS _local_migrations (name TEXT PRIMARY KEY)');
  if(existsSync('drizzle'))for(const file of readdirSync('drizzle').filter(f=>f.endsWith('.sql')).sort()){
    if(!db.prepare('SELECT 1 FROM _local_migrations WHERE name = ?').get(file)){
      db.exec('BEGIN');try{db.exec(readFileSync('drizzle/'+file,'utf8'));db.prepare('INSERT INTO _local_migrations (name) VALUES (?)').run(file);db.exec('COMMIT');}catch(e){db.exec('ROLLBACK');throw e;}
    }
  }
  const wrap=(sql,params=[])=>({bind(...p){return wrap(sql,p)},async first(){return db.prepare(sql).get(...params)||null},async all(){return {results:db.prepare(sql).all(...params)}},async run(){const r=db.prepare(sql).run(...params);return {success:true,meta:{changes:Number(r.changes)}}}});
  return {prepare:sql=>wrap(sql),async batch(statements){db.exec('BEGIN');try{const result=[];for(const stmt of statements)result.push(await stmt.run());db.exec('COMMIT');return result;}catch(e){db.exec('ROLLBACK');throw e;}},close(){db.close()}};
}
