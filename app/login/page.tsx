'use client';
import { useState } from 'react';
export default function Login() {
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  return <main style={{maxWidth:420,margin:'12vh auto',padding:24}}>
    <h1>PEO 协作工作台</h1><p>使用已邀请的组员账号登录，共享数据与审核结果。</p>
    <form onSubmit={async e => {
      e.preventDefault(); setBusy(true); setError('');
      const form = new FormData(e.currentTarget);
      try {
        const r = await fetch('/api/team-session', {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:form.get('email'),password:form.get('password')})});
        if (!r.ok) { const result = await r.json() as {error?: string}; throw new Error(result.error || '登录失败'); }
        const path = new URLSearchParams(location.search).get('return_to') || '/';
        const target = new URL(path, location.origin);
        location.assign(target.origin === location.origin ? target.pathname + target.search : '/');
      } catch (e) {setError(e instanceof Error ? e.message : '登录失败，请重试');}
      finally {setBusy(false);}
    }}>
      <label>邮箱<input name="email" type="email" autoComplete="username" required style={{display:'block',width:'100%',padding:12,margin:'8px 0 20px',border:'1px solid #aaa',borderRadius:8}} /></label>
      <label>密码<input name="password" type="password" autoComplete="current-password" required style={{display:'block',width:'100%',padding:12,margin:'8px 0 20px',border:'1px solid #aaa',borderRadius:8}} /></label>
      <p role="alert">{error}</p><button disabled={busy} style={{padding:'12px 24px',background:'#d9fb66',borderRadius:8}}>{busy ? '正在登录…' : '登录'}</button>
    </form><p style={{marginTop:24,fontSize:13}}>会话到期后请重新登录。请联系管理员开通账号。</p>
  </main>;
}
