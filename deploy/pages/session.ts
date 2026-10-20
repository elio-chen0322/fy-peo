import { SUPABASE_URL, SUPABASE_KEY } from './config';
type Session = {access_token:string;refresh_token:string;expires_at:number;user?:{email?:string}};
const key = 'fy-peo-session';
export function session(): Session | null {try {return JSON.parse(sessionStorage.getItem(key)||'null');} catch{return null;}}
export function saveSession(data: any) {
  const value = {...data,expires_at:Date.now()+Number(data.expires_in||3600)*1000};
  sessionStorage.setItem(key,JSON.stringify(value)); window.dispatchEvent(new Event('peo-session'));
}
export async function signIn(email:string,password:string) {
  if(!SUPABASE_KEY)throw new Error('管理员尚未完成 Supabase 连接配置');
  const r=await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`,{method:'POST',headers:{apikey:SUPABASE_KEY,'Content-Type':'application/json'},body:JSON.stringify({email,password})});
  if(!r.ok)throw new Error('登录失败，请检查账号、密码和邮箱验证状态');
  saveSession(await r.json());
}
let refreshing: Promise<string> | undefined;
export async function accessToken(): Promise<string> {
  const current=session(); if(!current)throw new Error('请先登录');
  if(current.expires_at>Date.now()+60000)return current.access_token;
  if(!refreshing)refreshing=(async()=>{
    const r=await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=refresh_token`,{method:'POST',headers:{apikey:SUPABASE_KEY,'Content-Type':'application/json'},body:JSON.stringify({refresh_token:current.refresh_token})});
    if(!r.ok){sessionStorage.removeItem(key);window.dispatchEvent(new Event('peo-session'));throw new Error('登录已过期，请重新登录');}
    const data:any=await r.json();saveSession(data);return data.access_token as string;
  })().finally(()=>{refreshing=undefined;});
  return refreshing;
}
export async function signOut() {
  const current=session(); sessionStorage.removeItem(key);window.dispatchEvent(new Event('peo-session'));
  if(current)await fetch(`${SUPABASE_URL}/auth/v1/logout`,{method:'POST',headers:{apikey:SUPABASE_KEY,Authorization:`Bearer ${current.access_token}`}}).catch(()=>{});
}
