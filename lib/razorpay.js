import {createHmac,timingSafeEqual} from 'node:crypto';
import {HttpError} from './http.js';
import {emailAddress,publicUrl,plans} from './validation.js';
import {leadKey} from './queue.js';
export function verifySignature(raw,signature,secret) {
  if(!secret)throw new HttpError(503,'configuration','Webhook is not configured.');
  if(!/^[a-f0-9]{64}$/i.test(signature || ''))throw new HttpError(401,'signature','Invalid webhook signature.');
  const expected=createHmac('sha256',secret).update(raw).digest();
  if(!timingSafeEqual(expected,Buffer.from(signature,'hex')))throw new HttpError(401,'signature','Invalid webhook signature.');
}
export class Razorpay {
  constructor(env=process.env,fetcher=fetch){this.env=env;this.fetcher=fetcher;}
  async get(kind,id) {
    if(!/^(cust|sub|inv)_[a-zA-Z0-9]+$/.test(id || ''))throw new HttpError(400,'entity','Invalid payment reference.');
    if(!this.env.RAZORPAY_KEY_ID||!this.env.RAZORPAY_KEY_SECRET)throw new HttpError(503,'razorpay_configuration','Customer lookup is not configured.');
    const response=await this.fetcher(`https://api.razorpay.com/v1/${kind}/${encodeURIComponent(id)}`,{headers:{Authorization:'Basic '+Buffer.from(`${this.env.RAZORPAY_KEY_ID}:${this.env.RAZORPAY_KEY_SECRET}`).toString('base64')},signal:AbortSignal.timeout(6000)});
    if(!response.ok)throw new HttpError(503,'razorpay_lookup','Customer lookup is temporarily unavailable.');
    return response.json();
  }
}
export async function resolveCustomer(event,state,{razorpay=new Razorpay(),lookup}={}) {
  const payment=event.payload?.payment?.entity || {};
  let subscription=event.payload?.subscription?.entity || {};
  if(event.event==='payment.captured'&&payment.status!=='captured')throw new HttpError(400,'payment','Payment is not captured.');
  if(event.event.startsWith('subscription.')&&!subscription.id)throw new HttpError(400,'subscription','Subscription is missing.');
  let subscriptionId=subscription.id || payment.subscription_id;
  if(!subscriptionId&&payment.invoice_id)subscriptionId=(await razorpay.get('invoices',payment.invoice_id)).subscription_id;
  if(subscriptionId&&!subscription.id)subscription=await razorpay.get('subscriptions',subscriptionId);
  const notes={...(subscription.notes || {}),...(payment.notes || {})};
  const customerId=subscription.customer_id || payment.customer_id;
  let email=payment.email || event.payload?.customer?.entity?.email || notes.client_email || notes.email;
  if(!email&&customerId)email=(await razorpay.get('customers',customerId)).email;
  if(!email)throw new HttpError(503,'customer_email','Customer email is not available yet.');
  email=emailAddress(email);
  const lead=state.leads[leadKey(email)];
  if(!notes.website_url&&!lead?.url)throw new HttpError(503,'lead_missing','The website mapping is not available yet.');
  const url=await publicUrl(notes.website_url || lead?.url,lookup);
  // A payment alone does not grant permission to scan an arbitrary website.
  const noteConsent=notes.permission===true||notes.permission==='true';
  if(!(lead?.permission===true&&lead.url===url)&&!noteConsent)throw new HttpError(503,'lead_missing','The authorized website mapping is not available yet.');
  const plan=notes.foxguard_plan || notes.plan || lead?.plan;
  if(!plans.has(plan)||plan==='free-audit')throw new HttpError(503,'paid_plan_missing','The paid plan mapping is not available yet.');
  const reference=subscriptionId || payment.id;
  if(!/^(sub|pay)_[a-zA-Z0-9]+$/.test(reference || ''))throw new HttpError(400,'reference','A payment or subscription reference is required.');
  return {url,email,plan,permission:true,reference};
}
