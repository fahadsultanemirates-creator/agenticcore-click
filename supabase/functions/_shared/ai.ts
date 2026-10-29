// Keep the established call shapes; select providers by role on the server.
import {claudeChat,claudeVisionChat} from './claude.ts';
import {openaiChat,openaiVisionChat} from './openai.ts';
export function providerFor(role:string):'openai'|'claude'{const override=Deno.env.get('AI_PROVIDER_'+role.toUpperCase().replaceAll('-','_'));if(override==='claude')return 'claude';if(override==='openai')return 'openai';return Deno.env.get('OPENAI_API_KEY')?'openai':'claude'}
export function aiChat(role:string,...args:Parameters<typeof claudeChat>):Promise<string>{if(providerFor(role)==='openai')return openaiChat(...args);return claudeChat(...args)}
export function aiVisionChat(role:string,...args:Parameters<typeof claudeVisionChat>):Promise<string>{if(providerFor(role)==='openai')return openaiVisionChat(...args);return claudeVisionChat(...args)}
