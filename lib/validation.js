import dns from 'node:dns/promises';
import ipaddr from 'ipaddr.js';
import {HttpError} from './http.js';
export const plans=new Set(['free-audit','founding','starter','growth']);
export function emailAddress(value) {
  if(typeof value!=='string'||value.length>254||!/^[^\s<>@,;]+@[^\s<>@,;]+\.[^\s<>@,;]+$/.test(value.trim()))throw new HttpError(400,'email','Enter a valid email address.');
  return value.trim().toLowerCase();
}
export async function publicUrl(value, lookup=dns.lookup) {
  let url;
  try {url=new URL(value);}catch{throw new HttpError(400,'url','Enter a public HTTP or HTTPS website URL.');}
  if(typeof value!=='string'||value.length>2048||!['http:','https:'].includes(url.protocol)||url.username||url.password||url.search||url.hash||(url.port&&!['80','443'].includes(url.port)))throw new HttpError(400,'url','Use a public HTTP(S) URL without credentials, query parameters, fragments or custom ports.');
  const host=url.hostname.replace(/^\[|\]$/g,'').replace(/\.$/,'');
  if(host==='localhost'||/\.(localhost|local|internal|test|invalid)$/.test(host))throw new HttpError(400,'private_url','Private websites cannot be audited.');
  let addresses;
  try {addresses=ipaddr.isValid(host)?[{address:host}]:await lookup(host,{all:true});}
  catch {throw new HttpError(400,'dns','The website address could not be resolved.');}
  if(!addresses.length||addresses.some(({address})=>{
    try {let ip=ipaddr.parse(address);if(ip.kind()==='ipv6'&&ip.isIPv4MappedAddress())ip=ip.toIPv4Address();return ip.range()!=='unicast';}catch{return true;}
  }))throw new HttpError(400,'private_url','Private, local and reserved network addresses cannot be audited.');
  return url.href;
}
export async function validateLead(body, lookup) {
  if(body.permission!==true)throw new HttpError(400,'permission','Confirm that you own or have permission to test this website.');
  if(body.plan&&body.selected_plan&&body.plan!==body.selected_plan)throw new HttpError(400,'plan','Choose one selected plan.');
  const plan=body.selected_plan || body.plan || 'free-audit';
  if(!plans.has(plan))throw new HttpError(400,'plan','Select a valid FoxGuard plan.');
  if(body.mode!==undefined&&!['audit','lead-capture'].includes(body.mode))throw new HttpError(400,'mode','Choose audit or lead-capture mode.');
  return {url:await publicUrl(body.url,lookup),email:emailAddress(body.email),plan,permission:true};
}
