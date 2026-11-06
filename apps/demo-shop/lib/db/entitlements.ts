import {getDb} from './index';
import {PRODUCT_CONTENT,PRODUCT_FILENAME} from '../product';
export interface Entitlement {orderId:string;customerId:string;paymentId:string;downloadToken:string;downloads:number;}
export function getEntitlement(orderId:string,customerId:string){return getDb().prepare('SELECT order_id AS orderId,customer_id AS customerId,payment_id AS paymentId,download_token AS downloadToken,downloads FROM entitlements WHERE order_id=? AND customer_id=?').get(orderId,customerId) as Entitlement|undefined;}
export function listEntitlements(customerId:string){return getDb().prepare('SELECT order_id AS orderId,customer_id AS customerId,payment_id AS paymentId,download_token AS downloadToken,downloads FROM entitlements WHERE customer_id=? ORDER BY created_at DESC').all(customerId) as unknown as Entitlement[];}
export function entitlementByToken(token:string){return getDb().prepare('SELECT order_id AS orderId,customer_id AS customerId,payment_id AS paymentId,download_token AS downloadToken,downloads FROM entitlements WHERE download_token=?').get(token) as Entitlement|undefined;}
export function redeemDownload(token:string,customerId:string){
 const entitlement=entitlementByToken(token);
 if(!entitlement||entitlement.customerId!==customerId)return null;
 const db=getDb();db.exec('BEGIN IMMEDIATE');
 try{
  const current=entitlementByToken(token);
  if(!current||current.customerId!==customerId){db.exec('ROLLBACK');return null;}
  db.prepare('UPDATE entitlements SET downloads=downloads+1 WHERE order_id=?').run(current.orderId);
  db.exec('COMMIT');
  return {content:PRODUCT_CONTENT,filename:PRODUCT_FILENAME,downloads:current.downloads+1};
 }catch(e){db.exec('ROLLBACK');throw e;}
}
