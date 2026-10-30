import {createHash,createHmac,randomUUID} from 'node:crypto';
import {HttpError} from './http.js';
export const hash=value=>createHash('sha256').update(value).digest('hex');
export const leadKey=email=>hash(email.toLowerCase());
export function prune(state, now) {
  for(const [key,value] of Object.entries(state.limits))if(value.expires<=now)delete state.limits[key];
  // Completed audit requests expire; paid activation records stay for deduplication.
  for(const [key,job] of Object.entries(state.jobs))if(!job.saveToClients&&['completed','captured'].includes(job.status)&&now-job.createdAt>30*86400000)delete state.jobs[key];
}
export async function capture(store,lead,{mode='audit',key,ip,now=Date.now()}) {
  if(!/^[a-zA-Z0-9_-]{16,100}$/.test(key || ''))throw new HttpError(400,'request_id','Please refresh the page and try again.');
  const id=hash(`request:${key}`),fingerprint=hash(JSON.stringify({...lead,mode}));
  return store.update(state=>{
    prune(state,now);
    const previous=state.jobs[id];
    if(previous){if(previous.fingerprint!==fingerprint)throw new HttpError(409,'request_id','Please start a new request for these details.');return {unchanged:true,value:previous};}
    // IPs are HMACed and counters expire. No raw visitor IP is committed.
    const buckets=[['ip',ip,5,3600000],['email',lead.email,5,86400000],['global','all',100,86400000]];
    for(const [kind,value,max,window] of buckets){
      const bucket=createHmac('sha256',store.token).update(`${kind}:${value}:${Math.floor(now/window)}`).digest('hex');
      const count=state.limits[bucket] || {count:0,expires:now+window};
      if(count.count>=max)throw new HttpError(429,'rate_limit','You have reached the request limit. Please try again later or email tonygokul30@gmail.com.');
      state.limits[bucket]={...count,count:count.count+1};
    }
    state.leads[leadKey(lead.email)]={...lead,updatedAt:new Date(now).toISOString()};
    const job={...lead,id,fingerprint,saveToClients:false,status:mode==='lead-capture'?'captured':'queued',createdAt:now,attempts:0};
    state.jobs[id]=job;return job;
  });
}
export async function dispatchJob(store,id,now=Date.now()) {
  const lease=randomUUID();
  const job=await store.update(state=>{
    const job=state.jobs[id];
    if(!job)throw new HttpError(503,'missing_job','The audit request is unavailable.');
    if(job.status==='failed')throw new HttpError(503,'retry_exhausted','The audit request needs operator attention.');
    if(['dispatched','running','completed','captured'].includes(job.status))return {unchanged:true,value:null};
    if(job.leaseUntil>now)throw new HttpError(503,'busy','Your request is being processed. Please retry shortly.');
    Object.assign(job,{status:'dispatching',lease,leaseUntil:now+90000,attempts:job.attempts+1});return {...job};
  });
  if(!job)return;
  try {
    await store.dispatch(job);
    await store.update(state=>{
      const current=state.jobs[id];
      // A fast workflow can claim/complete the job before dispatch bookkeeping.
      if(current.lease===lease&&current.status==='dispatching')Object.assign(current,{status:'dispatched',dispatchedAt:Date.now(),leaseUntil:0});
    });
  } catch(error) {
    await store.update(state=>{const current=state.jobs[id];if(current.lease===lease&&current.status==='dispatching')Object.assign(current,{status:'queued',leaseUntil:0});}).catch(()=>{});
    throw error;
  }
}
