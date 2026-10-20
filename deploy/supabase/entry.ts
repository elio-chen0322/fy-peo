import * as library from '../../app/api/library/route';
import * as voices from '../../app/api/voice-labels/route';
import * as cycle from '../../app/api/peo-cycle/route';
import * as files from '../../app/api/files/route';
import {requestUser} from './context';
import {env} from './runtime';
declare const Deno:{env:{get(name:string):string|undefined};serve(handler:(req:Request)=>Promise<Response>):void};
const allowedOrigin=env.APP_ORIGIN;
const routes:Record<string,Record<string,(req:Request)=>Promise<Response>>>={library,'voice-labels':voices,'peo-cycle':cycle,files};
const cors={'Access-Control-Allow-Origin':allowedOrigin,'Access-Control-Allow-Headers':'authorization, apikey, content-type, x-client-info','Access-Control-Allow-Methods':'GET, POST, OPTIONS','Access-Control-Expose-Headers':'content-disposition','Vary':'Origin'};
function reply(body:unknown,status:number){return Response.json(body,{status,headers:{...cors,'Cache-Control':'no-store'}});}
export async function handler(req:Request):Promise<Response>{
  const origin=req.headers.get('origin');
  if(origin && origin!==allowedOrigin)return reply({error:'此来源未获授权'},403);
  if(req.method==='OPTIONS')return new Response(null,{status:204,headers:cors});
  const token=req.headers.get('authorization');
  if(!token?.startsWith('Bearer '))return reply({error:'请先登录'},401);
  try{
    const auth=await fetch(`${Deno.env.get('SUPABASE_URL')}/auth/v1/user`,{headers:{apikey:Deno.env.get('SUPABASE_ANON_KEY')||'',Authorization:token}});
    if(!auth.ok)return reply({error:'登录已过期，请重新登录'},401);
    const user:any=await auth.json();
    if(!user.email_confirmed_at)return reply({error:'请先完成邮箱验证'},403);
    // Membership is checked in the database for every request; never trust browser claims.
    const member=await env.DB.prepare('SELECT email FROM peo_members WHERE user_id=? AND active=1').bind(user.id).first<{email:string}>();
    if(!member)return reply({error:'此账号尚未获得 PEO 工作台访问权限'},403);
    const route=new URL(req.url).pathname.split('/peo-api/')[1]||'';
    if(route==='health')return reply({status:'ok',workspace:env.PUBLIC_DATA_OWNER},200);
    const fn=routes[route]?.[req.method];
    if(!fn)return reply({error:'接口不存在'},404);
    const response=await requestUser.run({userId:env.PUBLIC_DATA_OWNER,displayName:user.email,email:user.email,fullName:null},()=>fn(req));
    const headers=new Headers(response.headers);Object.entries(cors).forEach(([k,v])=>headers.set(k,v));
    return new Response(response.body,{status:response.status,headers});
  }catch(e){console.error('PEO request failed',e instanceof Error?e.message:'unknown');return reply({error:'服务暂时不可用，请稍后重试'},503);}
}
Deno.serve(handler);
