import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createHmac} from 'node:crypto';
import {handleRequest} from '../api/request-audit.js';
import {handleWebhook} from '../api/razorpay-webhook.js';
import {GitHubStore,emptyState} from '../lib/github.js';
import {publicUrl} from '../lib/validation.js';
import {leadKey} from '../lib/queue.js';

const env={GITHUB_TRIGGER_TOKEN:'test-token',RAZORPAY_WEBHOOK_SECRET:'test-webhook-secret',VERCEL_PROJECT_PRODUCTION_URL:'foxguard.example.vercel.app'};
const lookup=async()=>[{address:'93.184.216.34'}];
const lead={url:'https://example.com/',email:'visitor@example.com',plan:'starter',permission:true};
function github(){
  let state=emptyState(),revision=0,conflict=false,dispatchError=false;
  const calls=[],dispatches=[];
  const fetcher=async(url,options)=>{
    calls.push({url,options});assert.equal(options.headers.Authorization,'Bearer test-token');
    if(url.includes('/dispatches')){if(dispatchError)return new Response('',{status:503});dispatches.push(JSON.parse(options.body));return new Response(null,{status:204});}
    if(!options.method)return Response.json({sha:String(revision),content:Buffer.from(JSON.stringify(state)).toString('base64')});
    const body=JSON.parse(options.body);
    if(conflict){conflict=false;revision++;state.leads.concurrent={email:'other@example.com'};return new Response('',{status:409});}
    if(body.sha!==String(revision))return new Response('',{status:409});
    state=JSON.parse(Buffer.from(body.content,'base64').toString('utf8'));revision++;return Response.json({commit:{sha:String(revision)}});
  };
  return {store:new GitHubStore({env,fetcher}),calls,dispatches,get state(){return state;},set conflict(value){conflict=value;},set dispatchError(value){dispatchError=value;}};
}
function request(body=lead,{key='request-1234567890',ip='203.0.113.5',origin='https://tonygokul30-cpu.github.io',method='POST'}={}){
  return new Request('https://foxguard.example.vercel.app/api/request-audit',{method,headers:{'Content-Type':'application/json','Origin':origin,'Idempotency-Key':key,'x-vercel-forwarded-for':ip},...(method==='POST'?{body:JSON.stringify(body)}:{})});
}
const submit=(g,body,options)=>handleRequest(request(body,options),{env,store:g.store,lookup});
function webhook(event,signature){
  const raw=JSON.stringify(event);
  return new Request('https://foxguard.example.vercel.app/api/razorpay-webhook',{method:'POST',headers:{'Content-Type':'application/json','x-razorpay-signature':signature || createHmac('sha256',env.RAZORPAY_WEBHOOK_SECRET).update(raw).digest('hex')},body:raw});
}
const paid={event:'payment.captured',payload:{payment:{entity:{id:'pay_123',status:'captured',email:lead.email,notes:{}}}}};

test('audit stores private mapping and dispatches exact authorized email inputs',async()=>{
  const g=github(),response=await submit(g,lead);
  assert.equal(response.status,200);assert.equal(response.headers.get('access-control-allow-origin'),'https://tonygokul30-cpu.github.io');
  assert.equal((await response.json()).message,'Audit started! Your FoxGuard QA report will arrive in your inbox in ~2 minutes.');
  assert.equal(g.state.leads[leadKey(lead.email)].url,lead.url);
  assert.equal(g.dispatches.length,1);
  assert.deepEqual({...g.dispatches[0].inputs,request_id:'ID'},{target_url:lead.url,client_email:lead.email,authorized:'true',profile:'smoke',send_email:'true',enable_ai:'false',save_to_clients:'false',request_id:'ID'});
  assert.equal(JSON.stringify(g.state).includes('203.0.113.5'),false);
});
test('checkout capture saves paid plan without dispatch; repeated POST is idempotent',async()=>{
  const g=github();assert.equal((await submit(g,{...lead,mode:'lead-capture'})).status,200);
  assert.equal((await submit(g,{...lead,mode:'lead-capture'})).status,200);
  assert.equal(g.dispatches.length,0);assert.equal(Object.keys(g.state.jobs).length,1);
  assert.equal((await submit(g,{...lead,url:'https://different.example/'})).status,409);
});
test('duplicate audit does not dispatch twice; SHA conflict preserves another lead',async()=>{
  const g=github();g.conflict=true;
  assert.equal((await submit(g,lead)).status,200);assert.equal((await submit(g,lead)).status,200);
  assert.equal(g.dispatches.length,1);assert.equal(g.state.leads.concurrent.email,'other@example.com');
});
test('dispatch failure stays durably queued and retry recovers without a false success',async()=>{
  const g=github();g.dispatchError=true;
  const response=await submit(g,lead);assert.equal(response.status,503);
  assert.equal(Object.values(g.state.jobs)[0].status,'queued');
  assert.doesNotMatch(await response.text(),/token|Failed to fetch|AbortError|stack/);
  g.dispatchError=false;assert.equal((await submit(g,lead)).status,200);assert.equal(g.dispatches.length,1);
});
test('persistent IP limit survives a new handler/store instance and is not reset by another email',async()=>{
  const g=github();
  for(let i=0;i<5;i++)assert.equal((await submit(g,{...lead,email:`visitor${i}@example.com`,mode:'lead-capture'},{key:`request-123456789${i}`})).status,200);
  assert.equal((await submit(g,{...lead,email:'new@example.com'},{key:'request-9999999999'})).status,429);
});
test('consent, email, plan, URL, JSON, size, CORS and methods are checked before writes',async()=>{
  const g=github();
  for(const body of [{...lead,permission:'true'},{...lead,email:'bad\r\n@example.com'},{...lead,plan:'admin'},{...lead,url:'http://localhost/'},{...lead,url:'https://example.com/?secret=1'}])assert.equal((await submit(g,body)).status,400);
  assert.equal((await submit(g,lead,{origin:'https://evil.example'})).status,403);
  assert.equal((await submit(g,lead,{origin:'https://foxguard.example.vercel.app',method:'OPTIONS'})).status,204);
  assert.equal((await submit(g,lead,{method:'GET'})).status,405);
  assert.equal((await handleRequest(new Request('https://api.example',{method:'POST',headers:{'Content-Type':'application/json'},body:'{'}),{env,store:g.store})).status,400);
  assert.equal((await handleRequest(new Request('https://api.example',{method:'POST',headers:{'Content-Type':'application/json'},body:'x'.repeat(9000)}),{env,store:g.store})).status,413);
  assert.equal(g.calls.length,0);
});
test('SSRF blocks literal, obfuscated, mapped IPv6, DNS-private and mixed records',async()=>{
  for(const url of ['http://127.0.0.1','http://2130706433','http://0x7f000001','http://10.0.0.1','http://169.254.169.254','http://192.168.1.1','http://[::1]','http://[::ffff:127.0.0.1]','http://[fc00::1]','http://[fe80::1]','ftp://example.com','https://user:pass@example.com','https://example.com:8080'])await assert.rejects(publicUrl(url,lookup));
  await assert.rejects(publicUrl('https://example.com',async()=>[{address:'127.0.0.1'}]));
  await assert.rejects(publicUrl('https://example.com',async()=>[{address:'93.184.216.34'},{address:'10.1.1.1'}]));
  assert.equal(await publicUrl('https://example.com',lookup),'https://example.com/');
});
test('signed payment dispatches saved website for monitoring and repeated deliveries deduplicate',async()=>{
  const g=github();await submit(g,{...lead,mode:'lead-capture'});
  for(let i=0;i<2;i++)assert.equal((await handleWebhook(webhook(paid),{env,store:g.store,lookup})).status,200);
  assert.equal(g.dispatches.length,1);assert.equal(g.dispatches[0].inputs.save_to_clients,'true');assert.equal(g.dispatches[0].inputs.client_email,lead.email);
});
test('bad/tampered raw signatures never touch storage; unsupported events are acknowledged',async()=>{
  const g=github();assert.equal((await handleWebhook(webhook(paid,'0'.repeat(64)),{env,store:g.store})).status,401);
  const signature=createHmac('sha256',env.RAZORPAY_WEBHOOK_SECRET).update(JSON.stringify(paid)).digest('hex');
  const changed={...paid,extra:true};assert.equal((await handleWebhook(webhook(changed,signature),{env,store:g.store})).status,401);
  assert.equal((await handleWebhook(webhook({event:'unrelated.event'}),{env,store:g.store})).status,200);assert.equal(g.calls.length,0);
});
test('subscription events resolve missing email via customer API and share one activation',async()=>{
  const g=github();await submit(g,{...lead,mode:'lead-capture'});
  const razorpay={get:async(kind,id)=>{assert.equal(kind,'customers');assert.equal(id,'cust_123');return {email:lead.email};}};
  for(const name of ['subscription.authenticated','subscription.activated']){
    const event={event:name,payload:{subscription:{entity:{id:'sub_123',customer_id:'cust_123'}}}};
    assert.equal((await handleWebhook(webhook(event),{env,store:g.store,lookup,razorpay})).status,200);
  }
  assert.equal(g.dispatches.length,1);
});
test('missing mappings remain retryable; signed notes can provide an explicitly authorized website',async()=>{
  const g=github();assert.equal((await handleWebhook(webhook(paid),{env,store:g.store,lookup})).status,503);assert.equal(g.dispatches.length,0);
  const event=structuredClone(paid);event.payload.payment.entity.notes={website_url:lead.url,permission:'true',foxguard_plan:'growth'};
  assert.equal((await handleWebhook(webhook(event),{env,store:g.store,lookup})).status,200);assert.equal(g.dispatches.length,1);
});
