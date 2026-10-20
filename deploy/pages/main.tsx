import React, {useState,useEffect,lazy,Suspense} from 'react';
import {createRoot} from 'react-dom/client';
import {configureTransport} from '../../lib/transport';
import {accessToken,session,signIn,signOut} from './session';
import {API_URL,SUPABASE_KEY} from './config';
import '../../app/globals.css';
const FeedbackApp=lazy(()=>import('../../app/feedback-app'));
const PeoCycle=lazy(()=>import('../../app/peo-cycle/view'));
configureTransport(async(path,init)=>{
  const token=await accessToken(); const headers=new Headers(init?.headers);
  headers.set('Authorization',`Bearer ${token}`);headers.set('apikey',SUPABASE_KEY);
  return fetch(API_URL+path.replace(/^\/api/,''),{...init,headers,cache:'no-store'});
});
function App(){
  const [user,setUser]=useState(session());const [path,setPath]=useState(location.hash.slice(1)||'/');
  const [error,setError]=useState('');const [busy,setBusy]=useState(false);const [sync,setSync]=useState(0);
  useEffect(()=>{const update=()=>setUser(session());const route=()=>setPath(location.hash.slice(1)||'/');window.addEventListener('peo-session',update);window.addEventListener('hashchange',route);return()=>{window.removeEventListener('peo-session',update);window.removeEventListener('hashchange',route);};},[]);
  if(!user)return <main className="cloud-login"><h1>PEO 协作工作台</h1><p>登录后可导入、审核和导出共享数据。</p><form onSubmit={async e=>{e.preventDefault();const form=new FormData(e.currentTarget);setBusy(true);setError('');try{await signIn(String(form.get('email')),String(form.get('password')));}catch(e){setError((e as Error).message);}finally{setBusy(false);}}}><label>邮箱<input name="email" type="email" required autoComplete="username"/></label><label>密码<input name="password" type="password" required autoComplete="current-password"/></label><p role="alert">{error}</p><button disabled={busy}>{busy?'正在登录…':'登录'}</button></form><p>仅限已获授权的组员。登录状态保存在当前标签页。</p></main>;
  return <><aside className="cloud-toolbar"><span>{user.user?.email} · 共享测试空间</span><button onClick={()=>{if(confirm('刷新将关闭当前编辑窗口。请先保存修改，是否继续？'))setSync(x=>x+1);}}>刷新共享数据</button><button onClick={()=>{if(confirm('未保存的修改将丢失，是否退出？'))void signOut();}}>退出登录</button></aside><Suspense fallback={<p className="p-6">正在加载工作台…</p>}><div key={sync}>{path==='/peo-cycle'?<PeoCycle/>:<FeedbackApp/>}</div></Suspense></>;
}
createRoot(document.getElementById('root')!).render(<App/>);
