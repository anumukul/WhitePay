import {WhitePay} from '@whitepay/node';
export function client(){if(!process.env.WHITEPAY_SECRET_KEY||!process.env.WHITEPAY_API_URL)throw new Error('WhitePay server configuration is required');return new WhitePay({secretKey:process.env.WHITEPAY_SECRET_KEY,apiBaseUrl:process.env.WHITEPAY_API_URL});}
