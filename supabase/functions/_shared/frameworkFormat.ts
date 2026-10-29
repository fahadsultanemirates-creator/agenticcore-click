export const GROUP_ID=/^(?:GRP|BIZ|AGN)-([0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})$/i;
export function groupCommand(text:string):{action:'orders'|'deliver'|'progress';orderId?:string;status?:string;site?:string}|null{
 if(/^\/gorders(?:@\S+)?\s*$/i.test(text))return{action:'orders'};
 const deliver=text.match(/^\/(?:gdeliver|deliver)(?:@\S+)?\s+((?:GRP|BIZ|AGN)-[0-9a-f-]+)\s*$/i);if(deliver){const m=deliver[1].match(GROUP_ID);if(m)return{action:'deliver',orderId:m[1].toLowerCase(),...(deliver[1].toUpperCase().startsWith('BIZ-')?{site:'biz'}:deliver[1].toUpperCase().startsWith('AGN-')?{site:'agency'}:{})}}
 const progress=text.match(/^\/gprogress(?:@\S+)?\s+(GRP-[0-9a-f-]+)\s+(pending|in_progress|needs_information)\s*$/i);if(progress){const m=progress[1].match(GROUP_ID);if(m)return{action:'progress',orderId:m[1].toLowerCase(),status:progress[2].toLowerCase()}}return null;
}
export function frameworkNotice(kind:string,p:Record<string,unknown>):string{
 const ref=String(p.reference||'Unknown reference');
 if(kind==='legacy_request')return `${p.site} · new service request\n${ref}\nService: ${p.category}\nPrice: ${p.agreed_price==null?'not quoted':p.agreed_price} · ${p.status}\n${String(p.brief||'').slice(0,2600)}\n\nAttach the finished file with caption /deliver ${ref}`;
 if(kind==='legacy_payment')return `${p.site} · payment marked paid by the website\n${ref}\nAmount: $${p.amount}\nPayment and work completion are separate.`;
 if(kind==='setup')return 'GROUP · shared framework connected. New Group orders, work requests and submitted payments now use this bot. No customer order or payment was created by this connection test.';
 if(kind==='payment_verified')return `GROUP · payment verified on chain\n${ref}\nPaid: $${(Number(p.due_cents)/100).toFixed(2)}\nTransaction: ${p.transaction_hash}`;
 if(kind==='payment_submitted')return `GROUP · payment submitted (not yet verified)\n${ref}\nTransaction: ${p.transaction_hash}\nCheck receipt before confirming payment.`;
 if(kind==='request')return `GROUP · new work request\n${ref}\n${String(p.title||'Work request')}\n${String(p.brief||'').slice(0,2600)}`;
 const c=(p.configuration||{}) as Record<string,unknown>;return `GROUP · new ${c.route==='owned'?'framework':'managed office'} order\n${ref}\n${JSON.stringify(c)}\nTotal: $${(Number(p.total_cents)/100).toFixed(2)} · first/full amount: $${(Number(p.due_cents)/100).toFixed(2)}\nPayment: ${p.payment_method} · ${p.status}\nBrief: ${String(p.requirements||'Not provided').slice(0,1800)}\n\nDeliver a finished file with caption:\n/deliver ${ref}\n\nWebsite: https://agenticcore.group/workspace`;
}
