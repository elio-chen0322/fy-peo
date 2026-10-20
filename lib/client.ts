import { apiFetch, workspaceHref, downloadAttachment } from '@/lib/transport';
export async function api(query = '', body?: unknown): Promise<any> {
  const r = await apiFetch(
    '/api/library' + query,
    body
      ? {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        }
      : { cache: 'no-store' },
  );
  const data: any = await r.json();
  if (!r.ok) throw new Error(data.error || '请求失败');
  return data;
}
export type HistoryItem = {
  id: string;
  feedback_id: string;
  action: string;
  before_json: string;
  after_json: string;
  after_revision: number;
  created_at: string;
  actor: string;
};
