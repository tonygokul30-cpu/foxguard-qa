import {cors,json,failure,readBody,parseJson,HttpError} from '../lib/http.js';
import {validateLead} from '../lib/validation.js';
import {GitHubStore} from '../lib/github.js';
import {capture,dispatchJob} from '../lib/queue.js';
import {randomUUID} from 'node:crypto';

export async function handleRequest(request,{env=process.env,store,lookup}={}) {
  let headers={};
  try {
    headers=cors(request,env);
    if(request.method==='OPTIONS')return new Response(null,{status:204,headers});
    if(request.method!=='POST')return json({ok:false,message:'Use POST.'},405,{...headers,Allow:'POST, OPTIONS'});
    if(!/^application\/json(?:;|$)/i.test(request.headers.get('content-type') || ''))throw new HttpError(415,'content_type','Send JSON data.');
    const body=parseJson(await readBody(request));const lead=await validateLead(body,lookup);
    store ||= new GitHubStore({env});
    // Vercel overwrites this header with the actual connecting IP. Do not trust
    // arbitrary x-forwarded-for values supplied by visitors.
    const ip=request.headers.get('x-vercel-forwarded-for')?.split(',')[0].trim() || 'unknown';
    const job=await capture(store,lead,{mode:body.mode,key:request.headers.get('idempotency-key') || body.request_id || randomUUID(),ip});
    if(body.mode==='lead-capture')return json({ok:true,message:'Details saved. Continue to secure checkout using the same email address.'},200,headers);
    await dispatchJob(store,job.id);
    return json({ok:true,message:'Audit started! Your FoxGuard QA report will arrive in your inbox in ~2 minutes.',request_id:job.id},200,headers);
  }catch(error){return failure(error,headers);}
}
export default {fetch:handleRequest};
