import { env } from 'cloudflare:workers';
export async function POST(req: Request) {
  const config = env as unknown as Record<string,string>;
  const fail = (error: string, status: number) => Response.json({error}, {status,headers:{'Cache-Control':'no-store'}});
  if (config.DEPLOYMENT_MODE !== 'team') return fail('此环境未开启组员登录',404);
  if (req.headers.get('origin') !== new URL(req.url).origin) return fail('请求来源不匹配',403);
  if (!config.SUPABASE_URL || !config.SUPABASE_PUBLISHABLE_KEY || !config.TEAM_EMAILS) return fail('管理员尚未完成登录配置',503);
  const raw = await req.text();
  if (raw.length > 4096) return fail('请求过大',413);
  let input;
  try {input = JSON.parse(raw);} catch {return fail('请求格式错误',400);}
  const email = String(input.email || '').trim().toLowerCase();
  if (!config.TEAM_EMAILS.split(',').map(x=>x.trim().toLowerCase()).includes(email)) return fail('账号或密码不正确，或尚未获得访问权限',401);
  try {
    const r = await fetch(`${config.SUPABASE_URL}/auth/v1/token?grant_type=password`,{method:'POST',headers:{apikey:config.SUPABASE_PUBLISHABLE_KEY,'Content-Type':'application/json'},body:JSON.stringify({email,password:String(input.password || '')})});
    if (!r.ok) return fail('账号或密码不正确，或尚未获得访问权限',401);
    const data = await r.json() as {user?: {email_confirmed_at?: string}; access_token?: string; expires_in?: number};
    if (!data.user?.email_confirmed_at || !data.access_token) return fail('请先完成邮箱验证',401);
    return Response.json({ok:true},{headers:{'Cache-Control':'no-store','Set-Cookie':`peo_access=${encodeURIComponent(data.access_token)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${Math.min(Number(data.expires_in)||3600,3600)}`}});
  } catch {return fail('登录服务暂时不可用，请稍后重试',503);}
}
export async function DELETE(req: Request) {
  if (req.headers.get('origin') !== new URL(req.url).origin) return Response.json({error:'请求来源不匹配'},{status:403});
  return Response.json({ok:true},{headers:{'Cache-Control':'no-store','Set-Cookie':'peo_access=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0'}});
}
