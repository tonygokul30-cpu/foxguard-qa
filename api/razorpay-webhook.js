import {json,failure,readBody,parseJson} from '../lib/http.js';
import {GitHubStore} from '../lib/github.js';
import {verifySignature,resolveCustomer,Razorpay} from '../lib/razorpay.js';
import {hash,dispatchJob} from '../lib/queue.js';
const supported=new Set(['payment.captured','subscription.authenticated','subscription.activated']);
export async function handleWebhook(request,{env=process.env,store,razorpay,lookup}={}) {
  try {
    if(request.method!=='POST')return json({ok:false,message:'Use POST.'},405,{Allow:'POST'});
    const raw=await readBody(request,262144);
    verifySignature(raw,request.headers.get('x-razorpay-signature'),env.RAZORPAY_WEBHOOK_SECRET);
    const event=parseJson(raw);
    if(!supported.has(event.event))return json({ok:true,ignored:true});
    store ||= new GitHubStore({env});
    const {state}=await store.read();
    const customer=await resolveCustomer(event,state,{razorpay:razorpay || new Razorpay(env),lookup});
    // Both authenticated and activated events for one subscription share a job.
    const id=hash(`activation:${customer.reference}`);
    await store.update(state=>{
      if(state.jobs[id])return {unchanged:true};
      state.jobs[id]={...customer,id,saveToClients:true,status:'queued',createdAt:Date.now(),attempts:0};
    });
    await dispatchJob(store,id);
    return json({ok:true,request_id:id});
  } catch(error){return failure(error);}
}
// Web-standard Request preserves the exact body bytes for HMAC verification.
export default {fetch:handleWebhook};
