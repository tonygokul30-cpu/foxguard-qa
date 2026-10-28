// Configure public integration URLs here, or override them in config.js.
const FOXGUARD_DEFAULTS = {
  WEBHOOK_URL: 'https://formsubmit.co/ajax/tonygokul30@gmail.com',
  FOUNDING_CHECKOUT_URL: '', STARTER_CHECKOUT_URL: '', PRO_CHECKOUT_URL: ''
};
(() => {
  'use strict';
  const overrides = window.FOXGUARD_CONFIG || {};
  const config = Object.fromEntries(Object.entries(FOXGUARD_DEFAULTS).map(([key,value]) => [key, overrides[key] || value]));
  const form = document.getElementById('audit-form');
  const status = document.getElementById('form-status');
  const button = document.getElementById('submit-audit');
  const fallback = document.getElementById('request-fallback');
  const planField = document.getElementById('selected-plan');
  const labels = {'free-audit':'Free website audit',founding:'$99/mo Founding Deal',starter:'$199/mo Starter Protection',growth:'$499/mo Growth Pro'};
  const https = value => {const url=new URL(value);if(url.protocol!=='https:'||url.username||url.password)throw new Error('A secure integration URL is required. Please use the email fallback.');return url;};
  const checkoutKeys={founding:'FOUNDING_CHECKOUT_URL',starter:'STARTER_CHECKOUT_URL',growth:'PRO_CHECKOUT_URL'};
  document.getElementById('year').textContent=new Date().getFullYear();
  document.getElementById('delivery-hint').textContent='Submit your request here. We review scope and arrange your audit; submission does not start a subscription or charge you.';
  document.querySelectorAll('[data-plan]').forEach(link=>{
    const plan=link.dataset.plan;
    try {link.href=config[checkoutKeys[plan]] ? https(config[checkoutKeys[plan]]).href : '#audit';} catch {link.href='#audit';}
    link.addEventListener('click',event=>{
      if(link.getAttribute('href')!=='#audit')return;
      event.preventDefault();planField.value=plan;
      document.getElementById('audit').scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth',block:'start'});
      status.classList.remove('error');status.textContent=`Selected: ${labels[plan]}. Submit your request to arrange activation. No payment or monitoring starts automatically.`;
    });
  });
  form.addEventListener('submit',async event=>{
    event.preventDefault();if(!form.reportValidity())return;
    fallback.hidden=true;status.classList.remove('error');status.textContent='';
    let target;
    try {
      target=new URL(document.getElementById('website').value.trim());
      if(!['https:','http:'].includes(target.protocol)||target.username||target.password||target.search||target.hash)throw new Error('Invalid URL');
    } catch {status.classList.add('error');status.textContent='Enter a public HTTP(S) URL without credentials, query parameters or fragments.';return;}
    const payload={url:target.href,email:document.getElementById('email').value.trim(),permission:document.getElementById('permission').checked,plan:planField.value,selected_plan:labels[planField.value],requestedAt:new Date().toISOString(),_subject:'New FoxGuard QA Request',_captcha:'false',_template:'table'};
    if(!payload.permission)return;
    const message=`Hello FoxGuard QA,\n\nWebsite: ${payload.url}\nWork email: ${payload.email}\nSelected plan: ${payload.selected_plan}\nI own or have explicit permission to test this website.\n\nPlease arrange my audit and reply with next steps.`;
    fallback.href=`mailto:tonygokul30@gmail.com?subject=${encodeURIComponent('FoxGuard QA — Website audit request')}&body=${encodeURIComponent(message)}`;
    fallback.textContent='Send this request by email instead →';
    button.disabled=true;
    try {
      if(!navigator.onLine)throw new Error('You appear to be offline. Reconnect and retry, or use the email fallback.');
      const endpoint=https(config.WEBHOOK_URL);
      // Browsers supply Origin and Referer; these must not be forged in headers.
      const response=await fetch(endpoint.href,{method:'POST',mode:'cors',referrerPolicy:'strict-origin-when-cross-origin',headers:{'Content-Type':'application/json','Accept':'application/json'},body:JSON.stringify(payload),credentials:'omit',signal:AbortSignal.timeout(20000)});
      if(!response.ok)throw new Error('The request service is unavailable. Please retry or use the email fallback.');
      const result=await response.json();
      if(result.success===false||result.success==='false')throw new Error('The request service could not accept this submission. Please use the email fallback.');
      if(endpoint.hostname==='formsubmit.co' && result.success!==true && result.success!=='true')throw new Error('Submission was not confirmed. Please use the email fallback.');
      if(/activat|confirm your email/i.test(result.message||'')) {
        status.textContent='The request service requires owner email activation. Please use the email fallback while setup is completed.';fallback.hidden=false;return;
      }
      status.textContent='Request received! Your FoxGuard QA report is being prepared.';
      document.getElementById('delivery-hint').textContent='Your request is queued for FoxGuard’s review. Scope and timing are confirmed by email; no automatic audit, payment or subscription has started.';
      form.reset();
    } catch(error) {
      status.classList.add('error');status.textContent=error.name==='TimeoutError'?'The request timed out. Retry or use the email fallback.':error.message;fallback.hidden=false;
    } finally {button.disabled=false;}
  });
})();
