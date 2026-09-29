const API='https://api.higgsfield.ai';
export const VIDEO_MODEL='kling-video/v2.5-turbo/pro/image-to-video';
export function providerUrl(raw,api=false){const u=new URL(raw);if(u.protocol!=='https:'||u.username||u.password||u.port)throw Error('Unsupported media address.');if(api?u.origin!==API:!/(^|\.)(higgsfield\.ai|higgsfield\.xyz|amazonaws\.com|cloudfront\.net|cloudflarestorage\.com|fal\.media)$/.test(u.hostname))throw Error('The provider returned an unrecognised media host.');return u.href;}
export async function limitedBody(r,max){if(!r.ok)throw Error('Media transfer failed ('+r.status+').');if(Number(r.headers.get('content-length'))>max)throw Error('Media file is too large.');const chunks=[];let size=0;for await(const c of r.body){size+=c.length;if(size>max)throw Error('Media file is too large.');chunks.push(Buffer.from(c));}return Buffer.concat(chunks);}
/** Credentials go only to the fixed API origin; signed storage uses only its upload headers. */
export class ProductVideo {
  constructor({key,fetchImpl=fetch}){this.key=key;this.fetch=fetchImpl;}
  async api(route,body,method=body===undefined?'GET':'POST'){const url=route.startsWith('https:')?providerUrl(route,true):API+'/'+route;const key=this.key();if(!key)throw Error('Add your Higgsfield API credentials in Product Studio.');const r=await this.fetch(url,{method,redirect:'error',signal:AbortSignal.timeout(45000),headers:{Authorization:'Key '+key,'Content-Type':'application/json'},...(body!==undefined?{body:JSON.stringify(body)}:{})});if(!r.ok)throw Error('Higgsfield returned '+r.status+'. Check its account dashboard; no automatic paid retry was made.');if(r.status===202&&method==='POST'&&route.endsWith('/cancel'))return {};return r.json();}
  async upload(bytes){const r=await this.api('files/generate-upload-url',{content_type:'image/jpeg'});providerUrl(r.public_url);const headers=r.upload_headers||{'Content-Type':'image/jpeg'};if(Object.keys(headers).some(k=>/^(authorization|cookie|host|proxy-authorization)$/i.test(k)))throw Error('Unexpected storage headers.');const res=await this.fetch(providerUrl(r.upload_url),{method:'PUT',headers,body:bytes,redirect:'error',signal:AbortSignal.timeout(45000)});if(!res.ok)throw Error('Product photo upload failed ('+res.status+').');return r.public_url;}
  input(job,url){return {image_url:url,prompt:job.prompt,duration:job.duration,cfg_scale:.5,negative_prompt:'warped product, altered label, invented text, extra products, distorted proportions, flicker'};}
  async estimate(input){const r=await this.api('estimate/'+VIDEO_MODEL,input),usd=Number(r.usd);if(!Number.isFinite(usd)||usd<0||usd>100)throw Error('The provider did not return a usable price estimate.');return usd;}
  submit(input){return this.api(VIDEO_MODEL,input);}
  status(url){return this.api(providerUrl(url,true));}
  cancel(url){return this.api(providerUrl(url,true),undefined,'POST');}
  async download(url){const r=await this.fetch(providerUrl(url),{redirect:'error',signal:AbortSignal.timeout(90000)}),b=await limitedBody(r,150*1024*1024);if(b.length<12||b.toString('ascii',4,8)!=='ftyp')throw Error('The result is not an MP4 video.');return b;}
}
