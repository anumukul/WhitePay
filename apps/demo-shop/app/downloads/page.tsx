import Link from 'next/link';
import {requireCustomer} from '../../lib/customer';
import {listEntitlements} from '../../lib/db/entitlements';
import {PRODUCT_NAME} from '../../lib/product';
export const dynamic='force-dynamic';
export default async function Downloads(){const c=await requireCustomer(),entitlements=listEntitlements(c.id);return <main><h2>Your downloads</h2>{entitlements.length===0?<p data-testid="download-count">0</p>:<ul>{entitlements.map(e=><li key={e.orderId}><Link href={'/download/'+e.downloadToken}>{PRODUCT_NAME}</Link> — downloaded {e.downloads} time(s)</li>)}</ul>}<Link href="/checkout">Buy the template</Link></main>;}
