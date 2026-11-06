import Link from 'next/link';
import {startCustomer} from './actions';
import {customer} from '../lib/customer';
export const dynamic='force-dynamic';
export default async function Home(){const c=await customer();return <main><h2>100 credits for 5 USDT</h2><p>Use credits to run the sample action. A disclosed sponsorship fee is added at checkout; the relayer pays WBT gas.</p>{c?<Link href="/checkout">Buy credits</Link>:<form action={startCustomer}><button>Start your demo session</button></form>}<p>Each browser session owns its orders and credits.</p><Link href="/credits">Your credits</Link></main>;}
