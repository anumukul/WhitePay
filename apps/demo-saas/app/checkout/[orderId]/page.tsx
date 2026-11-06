import Link from 'next/link';
import {notFound} from 'next/navigation';
import {requireCustomer} from '../../../lib/customer';
import {orderForCustomer} from '../../../lib/db/index';
import {getEntitlement} from '../../../lib/db/entitlements';
import {CheckoutWidget} from './widget';
export const dynamic='force-dynamic';
export default async function Payment({params}:{params:Promise<{orderId:string}>}){const c=await requireCustomer(),order=orderForCustomer((await params).orderId,c.id);if(!order?.sessionId)notFound();const entitlement=getEntitlement(order.id,c.id);return <main><h2>100 credits checkout</h2><CheckoutWidget sessionId={order.sessionId}/>{entitlement?<p role="status">100 credits granted.</p>:<p>Credits are delivered only after the verified payment webhook. A browser callback cannot grant them.</p>}<Link href="/credits">Check your credit balance</Link></main>;}
