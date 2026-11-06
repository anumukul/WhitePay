import Link from 'next/link';
import {startCustomer} from './actions';
import {customer} from '../lib/customer';
import {PRODUCT_CONTENT,PRODUCT_DESCRIPTION,PRODUCT_NAME,PRODUCT_PRICE_MINOR} from '../lib/product';
export const dynamic='force-dynamic';
export default async function Home(){const c=await customer(),price=(PRODUCT_PRICE_MINOR/1_000_000).toFixed(3);return <main><h2>{PRODUCT_NAME}</h2><p>{PRODUCT_DESCRIPTION}</p><p>Price: {price} USDT. A disclosed 0.003 USDT sponsorship fee is added at checkout; the relayer pays WBT gas.</p><p>{PRODUCT_CONTENT.split('\n').filter(Boolean).slice(1,3).join(' ')}</p>{c?<Link href="/checkout">Buy template</Link>:<form action={startCustomer}><button>Start your demo session</button></form>}<p>Each browser session owns its orders and download entitlement.</p><Link href="/downloads">Your downloads</Link></main>;}
