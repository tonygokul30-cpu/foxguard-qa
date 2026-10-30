import {setTimeout as delay} from 'node:timers/promises';
import {HttpError} from './http.js';
export const emptyState=()=>({version:1,leads:{},jobs:{},limits:{}});
export class GitHubStore {
  constructor({env=process.env,fetcher=fetch}={}) {
    this.token=env.GITHUB_TRIGGER_TOKEN;
    this.repo='tonygokul30-cpu/autonomous-qa-engine';this.branch='main';this.fetcher=fetcher;
    if(!this.token)throw new HttpError(503,'configuration','Automation is not configured.');
  }
  async api(path, options={}) {
    return this.fetcher(`https://api.github.com/repos/${this.repo}/${path}`,{...options,signal:AbortSignal.timeout(6000),headers:{Accept:'application/vnd.github+json',Authorization:`Bearer ${this.token}`,'X-GitHub-Api-Version':'2022-11-28','Content-Type':'application/json',...options.headers}});
  }
  async read() {
    const response=await this.api(`contents/leads.json?ref=${this.branch}`);
    if(response.status===404)return {state:emptyState()};
    if(!response.ok)throw new HttpError(503,'github_read','Lead storage is unavailable.');
    const file=await response.json();
    const state=JSON.parse(Buffer.from(file.content,'base64').toString('utf8'));
    if(state.version!==1||!state.leads||!state.jobs||!state.limits)throw new HttpError(503,'state_format','Lead storage needs attention.');
    return {state,sha:file.sha};
  }
  async update(change) {
    // SHA compare-and-swap makes limits, webhook claims and lead updates durable
    // across concurrent Vercel instances. Never blindly overwrite another writer.
    for(let attempt=0;attempt<5;attempt++) {
      const {state,sha}=await this.read();const result=change(state);
      if(result?.unchanged)return result.value;
      const content=Buffer.from(JSON.stringify(state,null,2)+'\n');
      if(content.length>900000)throw new HttpError(503,'state_capacity','Lead storage needs attention.');
      const response=await this.api('contents/leads.json',{method:'PUT',body:JSON.stringify({message:'Update FoxGuard automation state [skip ci]',branch:this.branch,...(sha?{sha}:{}),content:content.toString('base64')})});
      if(response.ok)return result;
      if(![409,422].includes(response.status))throw new HttpError(503,'github_write','Lead storage is unavailable.');
      await delay(80*(attempt+1));
    }
    throw new HttpError(503,'github_conflict','Please retry shortly.');
  }
  async dispatch(job) {
    const response=await this.api('actions/workflows/run-audit.yml/dispatches',{method:'POST',body:JSON.stringify({ref:this.branch,inputs:{target_url:job.url,client_email:job.email,selected_plan:job.plan || 'free-audit',authorized:'true',profile:'smoke',send_email:'true',enable_ai:'false',save_to_clients:String(job.saveToClients),request_id:job.id}})});
    if(!response.ok)throw new HttpError(503,'github_dispatch','The audit queue is temporarily unavailable.');
  }
}
