// Local workbench uses its own API. The Pages entry point installs the cloud transport.
let cloud: ((path: string, init?: RequestInit) => Promise<Response>) | undefined;
export function configureTransport(transport: typeof cloud) {cloud = transport;}
export function apiFetch(path: string, init?: RequestInit): Promise<Response> {return cloud ? cloud(path,init) : fetch(path,init);}
export async function downloadAttachment(id:string,name:string) {
  const response=await apiFetch('/api/files?id='+encodeURIComponent(id));
  if(!response.ok){const data:any=await response.json();throw new Error(data.error||'下载失败');}
  const url=URL.createObjectURL(await response.blob());const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
export const workspaceHref = (path:string) => cloud ? '#'+path : path;
