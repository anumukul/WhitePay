import {DatabaseSync} from 'node:sqlite';
import {mkdirSync} from 'node:fs';
import {dirname} from 'node:path';
import {createHash,randomBytes,randomUUID} from 'node:crypto';
let singleton:DatabaseSync|null=null;
export function getDb(){
 if(singleton)return singleton;
 const path=process.env.DEMO_DATABASE_PATH??'data/saas.db';
 if(path.includes('://'))throw new Error('DEMO_DATABASE_PATH must be a local SQLite file');
 mkdirSync(dirname(path),{recursive:true});
 const db=new DatabaseSync(path);db.exec('PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;');
 db.exec(`CREATE TABLE IF NOT EXISTS customers(id TEXT PRIMARY KEY,token_hash TEXT NOT NULL UNIQUE,expires_at INTEGER NOT NULL);
 CREATE TABLE IF NOT EXISTS orders(id TEXT PRIMARY KEY,customer_id TEXT NOT NULL REFERENCES customers(id),merchant_id TEXT NOT NULL,session_id TEXT UNIQUE,amount_minor INTEGER NOT NULL CHECK(amount_minor=5000000),status TEXT NOT NULL DEFAULT 'open',created_at INTEGER NOT NULL);
 CREATE TABLE IF NOT EXISTS webhook_events(event_id TEXT PRIMARY KEY,order_id TEXT NOT NULL REFERENCES orders(id),received_at INTEGER NOT NULL);
 CREATE TABLE IF NOT EXISTS entitlements(order_id TEXT PRIMARY KEY REFERENCES orders(id),customer_id TEXT NOT NULL REFERENCES customers(id),payment_id TEXT NOT NULL UNIQUE,credits_granted INTEGER NOT NULL CHECK(credits_granted=100),created_at INTEGER NOT NULL);
 CREATE TABLE IF NOT EXISTS credit_ledger(id INTEGER PRIMARY KEY AUTOINCREMENT,customer_id TEXT NOT NULL REFERENCES customers(id),delta INTEGER NOT NULL,order_id TEXT REFERENCES orders(id),created_at INTEGER NOT NULL);`);
 singleton=db;return db;
}
export function resetDbForTests(path:string){closeDbForTests();process.env.DEMO_DATABASE_PATH=path;return getDb();}
export function closeDbForTests(){singleton?.close();singleton=null;}
const hash=(token:string)=>createHash('sha256').update(token).digest('hex');
export function createCustomer(now=Date.now()){
 const id='customer_'+randomUUID(),token=randomBytes(32).toString('hex');getDb().prepare('INSERT INTO customers VALUES(?,?,?)').run(id,hash(token),now+86400000);return {id,token};
}
export function customerFromToken(token:string|undefined,now=Date.now()){
 if(!token)return null;return getDb().prepare('SELECT id FROM customers WHERE token_hash=? AND expires_at>?').get(hash(token),now) as {id:string}|undefined??null;
}
export interface Order {id:string;customerId:string;merchantId:string;sessionId:string|null;amountMinor:number;status:string;}
export function createOrder(customerId:string,merchantId:string){const id='order_'+randomUUID();getDb().prepare('INSERT INTO orders VALUES(?,?,?,NULL,5000000,\'open\',?)').run(id,customerId,merchantId,Date.now());return orderForCustomer(id,customerId)!;}
export function orderForCustomer(id:string,customerId:string){return getDb().prepare('SELECT id,customer_id AS customerId,merchant_id AS merchantId,session_id AS sessionId,amount_minor AS amountMinor,status FROM orders WHERE id=? AND customer_id=?').get(id,customerId) as Order|undefined;}
export function bindSession(orderId:string,customerId:string,sessionId:string){const old=orderForCustomer(orderId,customerId);if(!old||old.status!=='open'||(old.sessionId&&old.sessionId!==sessionId))throw new Error('order_session_mismatch');getDb().prepare('UPDATE orders SET session_id=? WHERE id=? AND customer_id=?').run(sessionId,orderId,customerId);}
export function ownsSession(customerId:string,sessionId:string){return !!getDb().prepare('SELECT id FROM orders WHERE customer_id=? AND session_id=?').get(customerId,sessionId);}
