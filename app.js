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
  // Bound both the request and response parsing, including browsers without AbortSignal.timeout.
  const request = async (url, options, readJson = false) => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3000);
    try {
      const response = await fetch(url, {...options, signal: controller.signal});
      if (!readJson) return;
      if (!response.ok) throw new Error('Submission unavailable');
      return await response.json();
    } finally {clearTimeout(timeout);}
  };
  form.addEventListener('submit',async event=>{
    event.preventDefault();if(button.disabled||!form.reportValidity())return;
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
    // The prepared email is available immediately, regardless of background delivery.
    fallback.textContent='Send audit request by email →';
    fallback.hidden=false;
    status.textContent='Request ready! Click below to send your audit request directly to our team, or email tonygokul30@gmail.com.';
    button.disabled=true;
    try {
      const endpoint=https(config.WEBHOOK_URL);
      try {
        // Browsers supply Origin and Referer; these must not be forged in headers.
        const result=await request(endpoint.href,{method:'POST',mode:'cors',referrerPolicy:'strict-origin-when-cross-origin',headers:{'Content-Type':'application/json','Accept':'application/json'},body:JSON.stringify(payload),credentials:'omit'},true);
        if(result.success===false||result.success==='false'||(endpoint.hostname==='formsubmit.co'&&result.success!==true&&result.success!=='true')||/activat|confirm your email/i.test(result.message||''))throw new Error('Submission unconfirmed');
      } catch {
        if(endpoint.hostname==='formsubmit.co') {
          // A simple multipart POST avoids the AJAX preflight. Its opaque response
          // cannot confirm delivery, so keep the prepared email available either way.
          const data=new FormData();
          Object.entries(payload).forEach(([key,value])=>data.append(key,String(value)));
          const fallbackEndpoint=new URL(endpoint.href);
          fallbackEndpoint.pathname=fallbackEndpoint.pathname.replace(/^\/ajax\//,'/');
          await request(fallbackEndpoint.href,{method:'POST',mode:'no-cors',body:data,credentials:'omit',referrerPolicy:'strict-origin-when-cross-origin'});
        }
      }
    } catch {
      // Network, timeout and service errors never replace the visitor-facing message.
    } finally {button.disabled=false;}
  });
})();
