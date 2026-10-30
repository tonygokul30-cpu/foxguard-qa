// Public URLs only. Never put tokens or SMTP credentials in this file.
const FOXGUARD_DEFAULTS={API_BASE_URL:'',FOUNDING_CHECKOUT_URL:'',STARTER_CHECKOUT_URL:'',PRO_CHECKOUT_URL:''};
(()=>{
  'use strict';
  const config={...FOXGUARD_DEFAULTS,...(window.FOXGUARD_CONFIG || {})};
  const form=document.getElementById('audit-form'),status=document.getElementById('form-status');
  const button=document.getElementById('submit-audit'),fallback=document.getElementById('request-fallback');
  const planField=document.getElementById('selected-plan'),hint=document.getElementById('delivery-hint');
  const cancel=document.getElementById('cancel-checkout');
  const labels={'free-audit':'Free website audit',founding:'$99/mo Founding Deal',starter:'$199/mo Starter Protection',growth:'$499/mo Growth Pro'};
  const checkoutKeys={founding:'FOUNDING_CHECKOUT_URL',starter:'STARTER_CHECKOUT_URL',growth:'PRO_CHECKOUT_URL'};
  let pendingCheckout=null,pendingRequest=null;
  const defaultHint='Your public-page audit runs automatically. Reports are emailed to the address you enter. Delivery time depends on the audit queue.';
  document.getElementById('year').textContent=new Date().getFullYear();hint.textContent=defaultHint;
  function requestUrl(){
    if(!config.API_BASE_URL&&location.hostname.endsWith('github.io'))throw new Error('API configuration required');
    const base=new URL(config.API_BASE_URL || location.origin);
    if(base.protocol!=='https:'&&!['localhost','127.0.0.1'].includes(base.hostname))throw new Error('Secure API required');
    if(base.username||base.password)throw new Error('Invalid API configuration');
    return new URL('/api/request-audit',base).href;
  }
  function checkoutUrl(plan){
    const url=new URL(config[checkoutKeys[plan]]);
    if(url.protocol!=='https:'||url.username||url.password||!['rzp.io','razorpay.com'].some(host=>url.hostname===host||url.hostname.endsWith('.'+host)))throw new Error('Checkout unavailable');
    return url.href;
  }
  function resetCheckout(){pendingCheckout=null;cancel.hidden=true;button.textContent='Send My Free FoxGuard Report ↗';hint.textContent=defaultHint;}
  cancel.addEventListener('click',()=>{resetCheckout();status.textContent='Complete the form to request your free audit.';});
  planField.addEventListener('change',()=>{if(pendingCheckout){pendingCheckout=checkoutKeys[planField.value]?planField.value:null;cancel.hidden=!pendingCheckout;button.textContent=pendingCheckout?'Continue to secure checkout ↗':'Send My Free FoxGuard Report ↗';}});
  function payload(){
    const url=new URL(document.getElementById('website').value.trim());
    if(!['http:','https:'].includes(url.protocol)||url.username||url.password||url.search||url.hash||(url.port&&!['80','443'].includes(url.port)))throw new Error('Invalid public URL');
    return {url:url.href,email:document.getElementById('email').value.trim(),plan:planField.value,permission:document.getElementById('permission').checked};
  }
  function prepareEmail(data){
    const message=`Hello FoxGuard QA,\n\nWebsite: ${data.url}\nWork email: ${data.email}\nSelected plan: ${labels[data.plan]}\nI own or have explicit permission to test this website.\n\nPlease arrange my audit and reply with next steps.`;
    fallback.href=`mailto:tonygokul30@gmail.com?subject=${encodeURIComponent('FoxGuard QA — Website audit request')}&body=${encodeURIComponent(message)}`;
  }
  async function submit(){
    if(button.disabled||!form.reportValidity())return;
    status.classList.remove('error');fallback.hidden=true;
    let data;
    try{data=payload();}catch{status.classList.add('error');status.textContent='Enter a public HTTP(S) URL without credentials, query parameters, fragments or custom ports.';return;}
    if(!data.permission)return;
    const checkout=pendingCheckout;
    data.mode=checkout?'lead-capture':'audit';prepareEmail(data);
    const fingerprint=JSON.stringify(data);
    if(pendingRequest?.fingerprint!==fingerprint)pendingRequest={fingerprint,id:crypto.randomUUID()};
    button.disabled=true;cancel.disabled=true;
    status.textContent=checkout?'Saving your website details before secure checkout…':'Starting your website audit…';
    const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),20000);
    try{
      // Validate the destination before storing the lead. Never navigate on API failure.
      const destination=checkout?checkoutUrl(checkout):null;
      const response=await fetch(requestUrl(),{method:'POST',mode:'cors',credentials:'omit',headers:{'Content-Type':'application/json','Idempotency-Key':pendingRequest.id},body:JSON.stringify(data),signal:controller.signal});
      const result=await response.json();
      if(!response.ok||result.ok!==true){
        if(response.status===429){status.textContent='You have reached the request limit. Please try again later or email tonygokul30@gmail.com.';fallback.hidden=false;return;}
        if(response.status===400){status.textContent='Check your website URL, email, and testing permission, then try again.';fallback.hidden=false;return;}
        throw new Error('Request not confirmed');
      }
      if(checkout){
        status.textContent=`Details saved. Opening secure checkout. Use ${data.email} as your billing email so we can activate your website automatically.`;
        window.location.assign(destination);
      }else{
        status.textContent=`Scanning your website now in a real browser... Your report will arrive at ${data.email} within 2 minutes!`;
        hint.textContent='Your audit request has been accepted. Two minutes is an estimate; GitHub queues and email delivery can take longer. Check your spam folder too.';
      }
    }catch{
      status.textContent='We could not confirm your request yet. Please retry shortly, or send your prepared request by email to tonygokul30@gmail.com.';
      fallback.hidden=false;
    }finally{clearTimeout(timeout);button.disabled=false;cancel.disabled=false;}
  }
  form.addEventListener('submit',event=>{event.preventDefault();void submit();});
  document.querySelectorAll('[data-plan]').forEach(link=>{
    const plan=link.dataset.plan;
    link.addEventListener('click',event=>{
      event.preventDefault();if(button.disabled)return;
      pendingCheckout=plan;planField.value=plan;cancel.hidden=false;
      button.textContent='Continue to secure checkout ↗';
      status.classList.remove('error');fallback.hidden=true;
      status.textContent=`Selected: ${labels[plan]}. Enter your website URL and email and confirm testing permission before checkout.`;
      hint.textContent='Use the same email at Razorpay checkout. Your website details are saved before payment; lead capture does not start an audit or subscription.';
      document.getElementById('audit').scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth',block:'start'});
      if(form.checkValidity())void submit();else document.getElementById('website').focus({preventScroll:true});
    });
  });
})();
