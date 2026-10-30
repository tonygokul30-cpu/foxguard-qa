export class HttpError extends Error {
  constructor(status, code, message) { super(message); this.status=status; this.code=code; }
}
export const json = (data, status=200, headers={}) => Response.json(data,{status,headers:{'Cache-Control':'no-store',...headers}});
export function failure(error, headers={}) {
  const status=error instanceof HttpError ? error.status : 503;
  // Never send provider responses, tokens, stack traces or raw network errors to visitors.
  if(status>=500) console.error('FoxGuard automation unavailable:',error.code || error.name || 'internal');
  return json({ok:false,code:error instanceof HttpError?error.code:'unavailable',message:status>=500?'We could not confirm your request yet. Please retry shortly or email tonygokul30@gmail.com.':error.message},status,headers);
}
export function cors(request, env) {
  const origin=request.headers.get('origin');
  const allowed=new Set(['https://tonygokul30-cpu.github.io',...(env.ALLOWED_ORIGINS || '').split(',').map(s=>s.trim()).filter(Boolean)]);
  for(const host of [env.VERCEL_PROJECT_PRODUCTION_URL,env.VERCEL_URL]) if(host) allowed.add(`https://${host}`);
  if(origin && !allowed.has(origin)) throw new HttpError(403,'origin','This origin is not allowed.');
  return {'Vary':'Origin',...(origin?{'Access-Control-Allow-Origin':origin}:{}),'Access-Control-Allow-Methods':'POST, OPTIONS','Access-Control-Allow-Headers':'Content-Type, Idempotency-Key','Access-Control-Max-Age':'600'};
}
export async function readBody(request, max=8192) {
  if(Number(request.headers.get('content-length'))>max)throw new HttpError(413,'body_size','Request is too large.');
  const reader=request.body?.getReader();
  if(!reader)return Buffer.alloc(0);
  const chunks=[];let size=0;
  while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>max){await reader.cancel();throw new HttpError(413,'body_size','Request is too large.');}chunks.push(Buffer.from(value));}
  return Buffer.concat(chunks);
}
export function parseJson(raw) {
  try {const data=JSON.parse(raw.toString('utf8'));if(!data||Array.isArray(data)||typeof data!=='object')throw new Error();return data;}
  catch {throw new HttpError(400,'json','Please send a valid JSON request.');}
}
