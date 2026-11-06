'use client';
import {WhitePayCheckout} from '@whitepay/react';
import {useRouter} from 'next/navigation';
export function CheckoutWidget({sessionId}:{sessionId:string}){const router=useRouter();return <WhitePayCheckout sessionId={sessionId} onComplete={()=>router.refresh()}/>;}
