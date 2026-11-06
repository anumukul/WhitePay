import {fulfillWebhook} from '../../../../lib/fulfillment';
export const runtime='nodejs';
export async function POST(req:Request){
 try{
  if(!process.env.WHITEPAY_WEBHOOK_SECRET)return Response.json({error:'not_configured'},{status:503});
  const reader=req.body?.getReader();let size=0;const chunks:Uint8Array[]=[];
  if(reader)try{for(;;){const {value,done}=await reader.read();if(done)break;size+=value.length;if(size>65536){await reader.cancel();return Response.json({error:'body_too_large'},{status:413});}chunks.push(value);}}finally{reader.releaseLock();}
  const result=await fulfillWebhook({payload:Buffer.concat(chunks),signature:req.headers.get('x-whitepay-signature')??'',timestamp:req.headers.get('x-whitepay-timestamp')??'',secret:process.env.WHITEPAY_WEBHOOK_SECRET});
  return Response.json({received:true,...result});
 }catch{return Response.json({error:'webhook_not_verified'},{status:400});}
}
