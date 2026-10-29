import {supabaseAdmin} from './storage.ts';
import {callSite} from './frameworkBridge.ts';
import {verifyContract,verifyAdditionalToken,recentTransfers,currentBlock,RECEIVING_ADDRESS,USDT_CONTRACT,MIN_CONFIRMATIONS} from './usdtChain.ts';
import {matchPayment} from './usdtAmount.ts';
import {AC_CONTRACT} from './paymentAssets.ts';
export async function syncGroupPayments():Promise<number>{
 const head=await currentBlock();let paid=0;
 for(const siteName of ['group','biz','agency']){
 const {data:site}=await supabaseAdmin.from('framework_sites').select('last_block,enabled').eq('site',siteName).maybeSingle();if(!site?.enabled)continue;
 const {orders}=await callSite(siteName,{action:'pending_payments'});const from=site.last_block?BigInt(site.last_block):null;
 for(const method of ['usdt','ac']){const pending=orders.filter((o:any)=>o.payment_method===method&&o.expected_amount);if(!pending.length)continue;const token=method==='usdt'?USDT_CONTRACT:AC_CONTRACT;const metadata=method==='usdt'?await verifyContract():await verifyAdditionalToken(token);const transfers=await recentTransfers(from,token);const hashes=new Set<string>();
 for(const order of pending){const match=matchPayment(transfers,{expected:order.expected_amount,decimals:metadata.decimals,receivingAddress:RECEIVING_ADDRESS,minConfirmations:MIN_CONFIRMATIONS,alreadyCredited:hashes,minBlock:null});if(match.status==='paid'){const result=await callSite(siteName,{action:'paid',orderId:order.id,txHash:match.txHash.toLowerCase()});if(result.credited)paid++;hashes.add(match.txHash)}}}
 const cursor=(head>BigInt(MIN_CONFIRMATIONS*2)?head-BigInt(MIN_CONFIRMATIONS*2):0n).toString();const result=await supabaseAdmin.from('framework_sites').update({last_block:cursor}).eq('site',siteName);if(result.error)throw Error('Payment scan checkpoint could not be saved');
 }return paid;
}
