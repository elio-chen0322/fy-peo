'use client';
import { apiFetch, workspaceHref, downloadAttachment } from '@/lib/transport';
import { createPortal } from 'react-dom';
import { Fragment, useCallback, useEffect, useRef, useState } from 'react';
import {
  Upload,
  Download,
  Plus,
  ChevronLeft,
  ChevronRight,
  Check,
  RotateCcw,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { NativeSelect } from '@/components/ui/native-select';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Choice } from './editor';
import { type Demand, type Feature, validUrl } from '@/lib/catalog';
import {
  voiceHeaders, labelHeaders, screenHeaders,
  type VoiceLabel,
  aiFinal,
  matchStates,
  relevanceStates,
  excludedScreen,
} from '@/lib/voice-labeling';

const PAGE_SIZE = 10;

async function request(query = '', body?: any) {
  const r = await apiFetch(
    '/api/voice-labels' + query,
    body
      ? {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        }
      : { cache: 'no-store' },
  );
  let d: any;
  try {
    d = await r.json();
  } catch {
    throw new Error('服务正在更新或暂时无法读取，请刷新页面后重试。');
  }
  if (!r.ok) throw new Error(d.error || '操作失败');
  return d;
}
function Score({ value, source }: { value: number | null; source: string }) {
  return value === null ? (
    <span className="muted">
      {source === '人工' ? '人工填写' : '待 AI 识别'}
    </span>
  ) : (
    <span
      className={
        'badge ' + (value < 75 ? 'quality' : value >= 90 ? 'confirmed' : '')
      }
    >
      {value} / 100
    </span>
  );
}
export function VoiceLabelTable({
  navigationTarget,
  demands,
  features,
  onChanged,
  onOpen,
  refreshKey = 0,
  archiveFilters, setArchiveFilters, search, setSearch,
}: {
  navigationTarget: HTMLDivElement | null;
  demands: Demand[];
  features: Feature[];
  onChanged: () => void;
  onOpen: (voice: any) => void;
  refreshKey?: number;
  archiveFilters:Record<string,string>;
  setArchiveFilters:React.Dispatch<React.SetStateAction<Record<string,string>>>;
  search:string;
  setSearch:(value:string)=>void;
}) {
  const [rows, setRows] = useState<any[]>([]),
    [stats, setStats] = useState<any>({}),
    [total, setTotal] = useState(0),
    [offset, setOffset] = useState(0),
    [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [message, setMessage] = useState(''),
    [refresh, setRefresh] = useState(0);
  const [view, setView] = useState('kept'),
    [actor, setActor] = useState('');
  const query=search;
  const filters:Record<string,string>={...archiveFilters,attribute:archiveFilters.kind||''};
  const [dialog, setDialog] = useState<any>(null),
    [form, setForm] = useState<any>({}),
    [demandQ, setDemandQ] = useState(''),
    [cases, setCases] = useState<any[] | null>(null),
    [queue, setQueue] = useState<any[] | null>(null),
    [importPreview, setImportPreview] = useState<any[] | null>(null);
  useEffect(()=>{const timer=setInterval(()=>setRefresh(n=>n+1),30000);return()=>clearInterval(timer);},[]);
  const [fieldsView,setFieldsView]=useState('review'),[showRules,setShowRules]=useState(false);
  const picker = useRef<HTMLInputElement>(null),
    seq = useRef(0);
  const params = useCallback(
    (o = offset, l = PAGE_SIZE) =>
      new URLSearchParams({
        view,
        ...(fieldsView==='labels'?{has_labels:'1'}:{}),
        ...filters,
        q: query,
        offset: String(o),
        limit: String(l),
      }).toString(),
    [view, query, archiveFilters, offset, fieldsView],
  );
  useEffect(()=>setOffset(0),[archiveFilters,search]);
  useEffect(() => {
    const n = ++seq.current;
    setLoading(true);
    request('?' + params())
      .then((d) => {
        if (n === seq.current) {
          setRows(d.rows);
          setStats(d.stats);
          setTotal(d.total);
          setActor(d.reviewer);
        }
      })
      .catch((e) => n === seq.current && setError(e.message))
      .finally(() => n === seq.current && setLoading(false));
  }, [params, refresh, refreshKey]);
  const changed = (m: string) => {
    setMessage(m);
    setRefresh((x) => x + 1);
    onChanged();
  };
  const activeDemands = demands.filter(
    (d) =>
      d.lifecycle_status === '启用' &&
      d.feature1 &&
      d.feature2 &&
      ['Need', 'Issue'].includes(d.request_type) &&
      ['体验', '质量'].includes(d.attribute) &&
      !/作废|测试诉求/.test(d.name),
  );
  const demandOptions = activeDemands
    .filter(
      (d) =>
        !demandQ ||
        [d.name, d.feature1, d.feature2, d.request_type, d.attribute]
          .join(' ')
          .toLowerCase()
          .includes(demandQ.toLowerCase()),
    )
    .slice(0, 150);
  const chosen = activeDemands.find((d) => d.id === form['诉求ID']);
  if (chosen && !demandOptions.some((d) => d.id === chosen.id))
    demandOptions.push(chosen);
  const selectedDemand = activeDemands.find((d) => d.id === form['诉求ID']);
  const importedReviewCount =
    importPreview?.reduce(
      (n, r) =>
        n +
        (['确认', '修改'].includes(r.review?.state) ? 1 : 0) +
        r.labels.filter((l: any) => ['确认', '修改'].includes(l.review?.state))
          .length,
      0,
    ) || 0;
  const openLabel = (item: any, label?: VoiceLabel) => {
    setError('');
    setDemandQ('');
    setDialog({ kind: label ? 'label' : 'add', item, label });
    const draft=item.reviews?.find((q:any)=>q.scope==='label'&&q.target_id===label?.id);
    setForm({
      ...label?.final,
      ...draft?.proposal.value,
      fragment: label?.fragment || '',
      reviewer: draft?.proposal.reviewer || label?.reviewer || actor,
      note: draft?.proposal.note ?? label?.note ?? '',
      匹配状态: draft?.proposal.value?.['匹配状态'] || label?.final['匹配状态'] || '匹配已有诉求',
    });
  };
  const openScreen = (item: any) => {
    setError('');
    setDialog({ kind: 'screen', item });
    const draft=item.reviews?.find((q:any)=>q.scope==='screen');
    setForm({
      relevance: item.screen?.relevance || '待确认',
      demandness: item.screen?.demandness || '待确认',
      reviewer: item.screen?.reviewer || actor,
      note: item.screen?.note || '',
      ...draft?.proposal,
    });
  };
  async function save() {
    setBusy(true);
    setError('');
    try {
      const { item, label, kind } = dialog;
      if (kind === 'screen')
        await request('', {
          action: 'review_screen',
          feedback_id: item.voice.id,
          revision: item.screen.revision,
          ...form,
        });
      else {
        const value = Object.fromEntries(
          [
            '诉求ID',
            '诉求名称',
            '一级Feature',
            '二级Feature',
            '建议/问题',
            '体验/质量',
            '匹配状态',
          ].map((k) => [k, form[k] || '']),
        );
        if (kind === 'add')
          await request('', {
            action: 'add_label',
            feedback_id: item.voice.id,
            fragment: form.fragment,
            value,
          });
        else
          await request('', {
            action: 'review_label',
            id: label.id,
            revision: label.revision,
            value,
            reviewer: form.reviewer,
            note: form.note,
          });
      }
      setDialog(null);
      changed(
        kind === 'add'
          ? '已添加独立诉求，待审核；其他标签未改动。'
          : '审核草稿已保存。全部审核好后，点击“提交给 Codex 学习”统一提交。',
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function confirm(item: any, label: VoiceLabel) {
    openLabel(item, label);
  }
  async function allRows() {
    const all: any[] = [];
    for (let i = 0; ;) {
      const d = await request('?' + params(i, 80));
      all.push(...d.rows);
      if (all.length >= d.total) break;
      if (!d.rows.length) throw new Error('分页数据发生变化，请重新导出');
      i += d.rows.length;
      if (all.length > 10000)
        throw new Error('请缩小范围到10,000条原声以内再导出');
    }
    return all;
  }
  async function exportFile(task = false) {
    setBusy(true);
    setError('');
    try {
      const all = await allRows();
      const { downloadBlob } = await import('@/lib/excel');
      if (task) {
        // Same prepare contract as the skill; the source 26 columns remain intact.
        const { voiceHeaders } = await import('@/lib/voice-labeling');
        const bytes = new TextEncoder();
        const sha = async (v: any) =>
          Array.from(
            new Uint8Array(
              await crypto.subtle.digest(
                'SHA-256',
                bytes.encode(JSON.stringify(v)),
              ),
            ),
          )
            .map((x) => x.toString(16).padStart(2, '0'))
            .join('');
        const records = await Promise.all(
          all.map(async (item) => ({
            voice_id: item.raw[20],
            raw: item.raw,
            raw_hash: await sha(item.raw),
            body: item.raw[1] || '',
            title: item.raw[2] || '',
            post_context: item.raw[15] || '',
            reply_context: item.raw[16] || '',
            context_status: item.raw[13] || '',
            post_id: item.raw[21],
            parent_id: item.raw[24],
          })),
        );
        downloadBlob(
          new Blob(
            [
              JSON.stringify(
                {
                  source: 'PEO本地网站',
                  source_sha256: await sha(all.map((r) => r.raw)),
                  headers: voiceHeaders,
                  records,
                  prepared_at: new Date().toISOString(),
                  hash_format: 'js-json-v1',
                },
                null,
                2,
              ),
            ],
            { type: 'application/json' },
          ),
          'PEO原声_待打标任务.json',
        );
        changed(
          `已导出${all.length}条原声，交给 peo-voice-label 完成语义判断后导入结果。`,
        );
      } else {
        const { exportLabels } = await import('@/lib/voice-label-excel');
        await exportLabels(all, activeDemands);
        setMessage(
          `已导出${all.length}条原声及其全部独立诉求，保留原26列和人工审核字段。`,
        );
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function chooseFile(file?: File) {
    if (!file) return;
    setBusy(true);
    setError('');
    try {
      const { parseLabelFile } = await import('@/lib/voice-label-excel');
      const records = await parseLabelFile(file);
      if (!records.length) throw new Error('文件中没有原声');
      setImportPreview(records);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
      if (picker.current) picker.current.value = '';
    }
  }
  async function importFile() {
    if (!importPreview) return;
    setBusy(true);
    setError('');
    const failures: any[] = [];
    let imported = 0,
      applied = 0;
    const reviewMode = importedReviewCount > 0;
    const records = reviewMode
      ? importPreview.filter(
          (r) =>
            ['确认', '修改'].includes(r.review?.state) ||
            r.labels.some((l: any) =>
              ['确认', '修改'].includes(l.review?.state),
            ),
        )
      : importPreview;
    try {
      for (let i = 0; i < records.length; i += 10) {
        const d = await request('', {
          action: reviewMode ? 'import_review' : 'import',
          records: records.slice(i, i + 10),
        });
        for (const r of d.results) {
          applied += r.applied || 0;
          r.error ? failures.push(r) : imported++;
        }
        setMessage(
          `正在导入 ${Math.min(i + 10, records.length)} / ${records.length}`,
        );
      }
      setImportPreview(null);
      changed(
        `${reviewMode ? `已保存${applied}项人工审核草稿，全部审核好后请统一提交给 Codex 学习。` : `已导入/更新${imported}条原声。已人工审核的标签保留。`}${failures.length ? `另有${failures.length}条失败，请查看原因。` : ''}`,
      );
      if (failures.length)
        setError(failures.map((r) => `${r.voice_id}：${r.error}`).join('\n'));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function learning() {
    setBusy(true);
    try {
      setCases((await request('?mode=learning')).rows);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const feature1 = [
    ...new Set([
      ...features.map((f) => f.parent),
      ...activeDemands.map((d) => d.feature1),
    ]),
  ].sort();
  const feature2 = (parent: string) =>
    [
      ...new Set([
        ...features
          .filter((f) => !parent || f.parent === parent)
          .map((f) => f.name),
        ...activeDemands
          .filter((d) => !parent || d.feature1 === parent)
          .map((d) => d.feature2),
      ]),
    ].sort();
  return (
    <section className="voice-review" aria-label="原声多诉求打标审核">
      <div className="voice-review-intro">
        <div>
          <h2>原声与诉求审核</h2>
          <p>
            先筛相关性，再逐个诉求核对标签、上下文和置信度。一条原声可以包含多个诉求。
          </p>
        </div>
        <div className="actions">
          <input
            ref={picker}
            type="file"
            accept=".json,.xlsx"
            hidden
            onChange={(e) => chooseFile(e.target.files?.[0])}
          />
          <Button
            variant="outline"
            disabled={busy}
            onClick={() => picker.current?.click()}
          >
            <Upload size={16} />
            导入原声 / 打标结果
          </Button>
          <Button
            variant="outline"
            disabled={busy}
            onClick={() => exportFile(true)}
          >
            导出待打标任务
          </Button>
          <Button
            variant="outline"
            disabled={busy}
            onClick={() => exportFile()}
          >
            <Download size={16} />
            导出审核 Excel
          </Button>
        </div>
      </div>
      <div className="voice-review-submit">
        <div><strong>已审核未提交 {stats.review_drafts || 0} 项</strong><p>先逐条保存审核草稿，全部审好后统一提交。将提交所有页面的审核草稿，未审核项不会一起提交。</p></div>
        <Button disabled={busy || !stats.review_drafts} onClick={async()=>{setBusy(true);setError('');try{const r=await request('',{action:'submit_review_drafts'});changed(r.submitted?`已将 ${r.submitted} 项审核提交给 Codex；核对通过后保存更正并生成学习案例。`:'暂无未提交的审核草稿。');}catch(e){setError((e as Error).message);}finally{setBusy(false);}}}>
          {busy?'处理中…':`提交给 Codex 学习（${stats.review_drafts || 0}）`}
        </Button>
      </div>
      <div className="voice-review-stats">
        <span>
          明确诉求原声 <b>{stats.actionable || 0}</b>
        </span>
        <span>
          诉求标签 <b>{stats.labels || 0}</b>（已匹配 {stats.matched_labels || 0} / 待新增 {stats.new_labels || 0}）
        </span>
        <span>
          标签待审 <b>{stats.pending || 0}</b>
        </span>
        <span>
          待确认原声 <b>{stats.uncertain || 0}</b>
        </span>
        <button onClick={async()=>{try{setQueue((await request('?mode=verification_queue')).rows);}catch(e){setError((e as Error).message);}}}>
          审核记录与核对队列 <b>{stats.verification_pending || 0}</b>
        </button>
        <button onClick={learning}>
          已审核学习案例 <b>{stats.learning || 0}</b>
        </button>
      </div>
      {navigationTarget && createPortal(<>
      <div className="section-heading"><strong>原声范围</strong></div>
      <div className="voice-review-views" role="group" aria-label="原声视图">
        {[
          ['kept', `明确诉求 ${stats.actionable || 0}`],
          ['pending', `待确认 ${stats.uncertain || 0}`],
          ['all', `全部原声 ${stats.total || 0}`],
          ['excluded', `已剔除 ${stats.excluded || 0}`],
        ].map(([k, n]) => (
          <Button
            key={k}
            variant={view === k ? 'default' : 'outline'}
            onClick={() => {
              setView(k);
              setOffset(0);
            }}
          >
            {n}
          </Button>
        ))}
        <span>原声与互动量按原声ID去重，诉求逐条审核。</span>
      </div>
      </>, navigationTarget)}
      <div className="voice-display-toolbar">
        <Choice label="显示方式" value={fieldsView} options={[{id:'review',name:'审核视图'},{id:'labels',name:'诉求打标表 · 61列'},{id:'screen',name:'原声筛选表 · 38列'}]} onChange={v => {setFieldsView(v || 'review');setOffset(0);if(v && v !== 'review')setView('all');}} />
        <Button variant="outline" onClick={() => setShowRules(true)}>规则与表头</Button>
      </div>
      {message && (
        <div className="notice" role="status">
          {message}
        </div>
      )}
      {error && (
        <div className="error-box" role="alert">
          {error}
        </div>
      )}
      {fieldsView!=='review'&&<div className="voice-review-table-wrap voice-complete-fields"><table><thead><tr>{[...voiceHeaders,...(fieldsView==='labels'?labelHeaders:screenHeaders)].map(h=><th key={h}>{h}</th>)}<th>操作</th></tr></thead><tbody>{rows.flatMap(item=>(fieldsView==='labels'?item.labels:[null]).map((l:any,index:number)=>{
       const draft=item.reviews?.find((q:any)=>fieldsView==='labels'?q.scope==='label'&&q.target_id===l?.id:q.scope==='screen');
       const data=fieldsView==='labels'?{...l?.ai}: {...item.screen?.ai};
       const row=fieldsView==='labels'?l:item.screen;
       data['审核状态']=draft?.status==='草稿'?'草稿':draft?.status||row?.review_status||'待审核';data['审核人']=draft?.proposal.reviewer||row?.reviewer||'';data['审核备注']=draft?.proposal.note||row?.note||'';
       if(fieldsView==='labels'&&(draft||l?.review_status!=='待审核')){const value=draft?.proposal.value||l?.final||{};for(const [k,v] of Object.entries(value))data['人工'+k]=v;}
       if(fieldsView==='screen'&&(draft||row?.review_status!=='待审核')){data['人工相关性']=draft?.proposal.relevance||row?.relevance;data['人工诉求性']=draft?.proposal.demandness||row?.demandness;}
       return <tr key={item.voice.id+':'+index}>{[...item.raw,...(fieldsView==='labels'?labelHeaders:screenHeaders).map(h=>data[h]??'')].map((v:any,j:number)=><td key={j} title={String(v??'')}>{String(v??'')}</td>)}<td><Button size="sm" onClick={()=>fieldsView==='labels'&&l?openLabel(item,l):openScreen(item)}>审核</Button></td></tr>;
       }))}</tbody></table></div>}
      {fieldsView==='review'&&<div className="voice-review-table-wrap">
        <table className="voice-review-table">
          <thead>
            <tr>
              {[
                '用户原声与上下文',
                '相关性 / 原声筛选',
                '诉求片段',
                '用户诉求',
                '一级 / 二级 Feature',
                '建议 / 问题',
                '体验 / 质量',
                '置信度与证据',
                '人工审核',
              ].map((h) => (
                <th key={h}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((item) => {
              const labels = item.labels.length ? item.labels : [null];
              const screenDraft=item.reviews?.find((q:any)=>q.scope==='screen');
              return (
                <Fragment key={item.voice.id}>
                  {labels.map((l: VoiceLabel | null, index: number) => {const draft=item.reviews?.find((q:any)=>q.scope==='label'&&q.target_id===l?.id);return (
                    <tr
                      key={l?.id || 'empty'}
                      className={index === 0 ? 'voice-group-start' : ''}
                    >
                      {index === 0 && (
                        <td rowSpan={labels.length} className="voice-original">
                          <div className="voice-source">
                            <span>
                              {item.voice.source} · {item.raw[0]}
                            </span>
                            {item.voice.label_total > 1 && (
                              <span className="badge">
                                {labels.length === item.voice.label_total
                                  ? `${labels.length} 个诉求`
                                  : `显示${labels.length} / 共${item.voice.label_total}诉求`}
                              </span>
                            )}
                          </div>
                          <p className="voice-body">{item.raw[1]}</p>
                          {(item.raw[2] || item.raw[15] || item.raw[16]) && (
                            <details>
                              <summary>查看帖子与回复上下文</summary>
                              {item.raw[2] && (
                                <p>
                                  <b>帖子标题：</b>
                                  {item.raw[2]}
                                </p>
                              )}
                              {item.raw[15] && (
                                <p>
                                  <b>帖子背景：</b>
                                  {item.raw[15]}
                                </p>
                              )}
                              {item.raw[16] && (
                                <p>
                                  <b>回复上下文：</b>
                                  {item.raw[16]}
                                </p>
                              )}
                            </details>
                          )}
                          <div className="voice-meta">
                            {item.raw[3] || '昵称未提供'} · 点赞{' '}
                            {item.raw[6] ?? '—'}
                            <br />
                            {item.raw[5] || '时间未提供'}
                            <br />
                            上下文：{item.raw[13] || '待确认'}
                          </div>
                          <div className="actions mt-3">
                            {validUrl(item.raw[25]) && (
                              <a
                                href={item.raw[25]}
                                target="_blank"
                                rel="noopener noreferrer"
                              >
                                查看原文 ↗
                              </a>
                            )}
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => onOpen(item.voice)}
                            >
                              原声档案
                            </Button>
                          </div>
                        </td>
                      )}
                      {index === 0 && (
                        <td rowSpan={labels.length}>
                          <span className="badge">
                            {item.screen?.relevance || '待确认'}
                          </span>
                          <p>{item.screen?.demandness || '待确认'}</p>
                          <small>
                            {item.screen?.ai['筛选依据'] ||
                              '尚未完成相关性识别'}
                          </small>
                          <p className="muted">
                            {screenDraft?.status === '草稿'?'已审核 · 未提交':screenDraft?.status || item.screen?.review_status || '待审核'}
                            {item.screen?.confidence !== null &&
                            item.screen?.confidence !== undefined
                              ? ` · ${item.screen.confidence}/100`
                              : ''}
                          </p>
                          {screenDraft&&<p className="muted">审核意见：{screenDraft.proposal.relevance} · {screenDraft.proposal.demandness}</p>}
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => openScreen(item)}
                          >
                            审核原声筛选
                          </Button>
                          <Button
                            className="mt-3"
                            size="sm"
                            variant="ghost"
                            disabled={
                              item.screen && excludedScreen(item.screen)
                            }
                            onClick={() => openLabel(item)}
                          >
                            <Plus size={14} />
                            添加独立诉求
                          </Button>
                        </td>
                      )}
                      <td>
                        {l?.fragment || (
                          <span className="muted">
                            尚无独立诉求；相关无诉求也会保留
                          </span>
                        )}
                      </td>
                      <td>
                        {l ? (
                          <>
                            <strong>{l.final['诉求名称'] || '未匹配'}</strong>
                            <p>
                              <span className="badge">
                                {l.final['匹配状态']}
                              </span>
                            </p>
                            <small>{l.source}</small>
                          </>
                        ) : (
                          <span className="muted">待识别</span>
                        )}
                      </td>
                      <td>
                        {l ? (
                          <>
                            <div>{l.final['一级Feature'] || '待判断'}</div>
                            <div className="muted mt-2">
                              {l.final['二级Feature'] || '待判断'}
                            </div>
                          </>
                        ) : (
                          '—'
                        )}
                      </td>
                      <td>{l?.final['建议/问题'] || '—'}</td>
                      <td>
                        <span
                          className={
                            l?.final['体验/质量'] === '质量'
                              ? 'badge quality'
                              : 'badge'
                          }
                        >
                          {l?.final['体验/质量'] || '—'}
                        </span>
                      </td>
                      <td>
                        {l ? (
                          <>
                            <Score value={l.confidence} source={l.source} />
                            <p className="muted">
                              文字召回{' '}
                              {l.text_score === null
                                ? '—'
                                : `${l.text_score}/100`}
                            </p>
                            <details>
                              <summary>判断依据与各维分数</summary>
                              <p>
                                {l.ai['匹配依据'] ||
                                  '历史候选尚无AI语义判断依据'}
                              </p>
                              {[
                                '语义置信度',
                                '一级Feature置信度',
                                '二级Feature置信度',
                                '建议/问题置信度',
                                '体验/质量置信度',
                              ].map((k) => (
                                <p key={k}>
                                  {k}：{l.ai[k] ?? '—'}
                                </p>
                              ))}
                              <p>引用证据：{l.ai['引用证据'] || '未提供'}</p>
                              <p>风险：{l.ai['风险标记'] || '未标记'}</p>
                              <p>规则版本：{l.rule_version || '未提供'}</p>
                            </details>
                          </>
                        ) : (
                          '—'
                        )}
                      </td>
                      <td>
                        {l ? (
                          <>
                            <span
                              className={
                                'badge ' +
                                (l.review_status !== '待审核'
                                  ? 'confirmed'
                                  : '')
                              }
                            >
                              {draft?.status==='草稿'?'已审核 · 未提交':draft?.status || l.review_status}
                            </span>
                            {draft&&<p className="muted">审核意见：{draft.proposal.value?.['诉求名称']||draft.proposal.value?.['匹配状态']}<br/>{draft.proposal.value?.['一级Feature']} / {draft.proposal.value?.['二级Feature']}<br/>{draft.proposal.value?.['建议/问题']} · {draft.proposal.value?.['体验/质量']}</p>}
                            <p className="muted">{l.reviewer}</p>
                            <Button
                              size="sm"
                              variant={
                                l.review_status === '待审核'
                                  ? 'default'
                                  : 'outline'
                              }
                              disabled={busy}
                              onClick={() => confirm(item, l)}
                            >
                              {l.review_status === '待审核' ? (
                                <>
                                  <Check size={14} />
                                  审核此诉求
                                </>
                              ) : (
                                '修改此诉求'
                              )}
                            </Button>
                            <p className="muted mt-2">{l.note}</p>
                          </>
                        ) : (
                          '—'
                        )}
                      </td>
                    </tr>
                  );})}
                </Fragment>
              );
            })}
          </tbody>
        </table>
        {!loading && !rows.length && (
          <div className="empty-state">
            <h3>当前没有符合条件的原声</h3>
            <p>可调整筛选，或导入原声总表与 skill 打标结果。</p>
          </div>
        )}
        {loading && <div className="voice-loading">正在读取…</div>}
      </div>}
      <div className="table-footer">
        <span>
          共 {total} 条原声 · 第 {Math.floor(offset / PAGE_SIZE) + 1} /{' '}
          {Math.max(1, Math.ceil(total / PAGE_SIZE))} 页 · 每页 {PAGE_SIZE} 条 · 一原声可展开多条诉求
        </span>
        <div className="actions">
          <Button
            variant="outline"
            disabled={offset === 0 || loading}
            onClick={(e) => { setOffset((o) => Math.max(0, o - PAGE_SIZE)); e.currentTarget.closest('main')?.scrollTo({top:0}); }}
          >
            <ChevronLeft size={16} />
            上一页
          </Button>
          <Button
            variant="outline"
            disabled={offset + PAGE_SIZE >= total || loading}
            onClick={(e) => { setOffset((o) => o + PAGE_SIZE); e.currentTarget.closest('main')?.scrollTo({top:0}); }}
          >
            下一页
            <ChevronRight size={16} />
          </Button>
        </div>
      </div>
      <Dialog
        open={!!dialog}
        onOpenChange={(v) => !busy && !v && setDialog(null)}
      >
        <DialogContent className="voice-review-dialog">
          <DialogHeader>
            <DialogTitle>
              {dialog?.kind === 'screen'
                ? '审核原声相关性'
                : dialog?.kind === 'add'
                  ? '添加独立诉求'
                  : '审核独立诉求'}
            </DialogTitle>
            <DialogDescription>
              核对当前作者的正文和上下文，保存为审核草稿。全部审核好后，在原声档案统一提交给 Codex；通过后才生效并生成学习案例。
            </DialogDescription>
          </DialogHeader>
          {dialog && (
            <div className="voice-dialog-content">
              <div className="voice-dialog-evidence">
                <h3>当前原声</h3>
                <p>{dialog.item.raw[1]}</p>
                {dialog.item.raw[15] && (
                  <>
                    <h4>帖子背景</h4>
                    <p>{dialog.item.raw[15]}</p>
                  </>
                )}
                {dialog.item.raw[16] && (
                  <>
                    <h4>回复上下文</h4>
                    <p>{dialog.item.raw[16]}</p>
                  </>
                )}
              </div>
              <div className="voice-dialog-form">
                {dialog.kind === 'screen' ? (
                  <>
                    <Choice
                      label="相关性"
                      value={form.relevance}
                      options={relevanceStates}
                      onChange={(v) =>
                        setForm((f: any) => ({
                          ...f,
                          relevance: v,
                          ...(v === '不相关' ? { demandness: '无诉求' } : {}),
                        }))
                      }
                    />
                    <Choice
                      label="诉求性"
                      value={form.demandness}
                      options={['有诉求', '无诉求', '待确认']}
                      onChange={(v) =>
                        setForm((f: any) => ({ ...f, demandness: v }))
                      }
                    />
                  </>
                ) : (
                  <>
                    {dialog.kind === 'add' ? (
                      <label>
                        诉求原文片段
                        <Textarea
                          value={form.fragment}
                          onChange={(e) =>
                            setForm((f: any) => ({
                              ...f,
                              fragment: e.target.value,
                            }))
                          }
                        />
                      </label>
                    ) : (
                      <p>
                        <b>诉求片段：</b>
                        {form.fragment}
                      </p>
                    )}
                    <Choice
                      label="匹配状态"
                      value={form['匹配状态']}
                      options={matchStates}
                      onChange={(v) =>
                        setForm((f: any) => ({
                          ...f,
                          匹配状态: v,
                          ...(v !== '匹配已有诉求'
                            ? {
                                诉求ID: '',
                                诉求名称: '',
                                一级Feature: '',
                                二级Feature: '',
                                '建议/问题': '待判断',
                                '体验/质量': '待判断',
                              }
                            : {}),
                        }))
                      }
                    />
                    {form['匹配状态'] === '匹配已有诉求' ? (
                      <>
                        <Input
                          aria-label="搜索标准诉求"
                          placeholder="搜索诉求名称、Feature、建议/问题"
                          value={demandQ}
                          onChange={(e) => setDemandQ(e.target.value)}
                        />
                        <Choice
                          label="标准诉求"
                          value={form['诉求ID']}
                          options={demandOptions.map((d) => ({
                            id: d.id,
                            name: `${d.name} · ${d.feature2} · ${d.request_type === 'Need' ? '建议' : '问题'} · ${d.attribute}`,
                          }))}
                          onChange={(v) =>
                            setForm((f: any) => ({ ...f, 诉求ID: v }))
                          }
                        />
                        {selectedDemand && (
                          <div className="notice">
                            {selectedDemand.feature1} /{' '}
                            {selectedDemand.feature2}
                            <br />
                            {selectedDemand.request_type === 'Need'
                              ? '建议'
                              : '问题'}{' '}
                            · {selectedDemand.attribute}
                          </div>
                        )}
                      </>
                    ) : !['无诉求', '不匹配'].includes(form['匹配状态']) ? (
                      <>
                        <label>
                          诉求名称
                          <Input
                            value={form['诉求名称'] || ''}
                            onChange={(e) =>
                              setForm((f: any) => ({
                                ...f,
                                诉求名称: e.target.value,
                              }))
                            }
                          />
                        </label>
                        <Choice
                          label="一级 Feature"
                          value={form['一级Feature']}
                          options={feature1}
                          onChange={(v) =>
                            setForm((f: any) => ({
                              ...f,
                              一级Feature: v,
                              二级Feature: '',
                            }))
                          }
                        />
                        <Choice
                          label="二级 Feature"
                          value={form['二级Feature']}
                          options={feature2(form['一级Feature'] || '')}
                          onChange={(v) =>
                            setForm((f: any) => ({ ...f, 二级Feature: v }))
                          }
                        />
                        <Choice
                          label="建议 / 问题"
                          value={form['建议/问题']}
                          options={['建议', '问题', '待判断', '不适用']}
                          onChange={(v) =>
                            setForm((f: any) => ({ ...f, '建议/问题': v }))
                          }
                        />
                        <Choice
                          label="体验 / 质量"
                          value={form['体验/质量']}
                          options={['体验', '质量', '待判断', '不适用']}
                          onChange={(v) =>
                            setForm((f: any) => ({ ...f, '体验/质量': v }))
                          }
                        />
                      </>
                    ) : (
                      <p className="muted">
                        只拒绝当前这一条关联，其他诉求保持原样。
                      </p>
                    )}
                  </>
                )}
                {dialog.kind !== 'add' && (
                  <>
                    <label>
                      审核人
                      <Input
                        value={form.reviewer || ''}
                        onChange={(e) =>
                          setForm((f: any) => ({
                            ...f,
                            reviewer: e.target.value,
                          }))
                        }
                      />
                    </label>
                    <label>
                      审核备注
                      <Textarea
                        value={form.note || ''}
                        onChange={(e) =>
                          setForm((f: any) => ({ ...f, note: e.target.value }))
                        }
                      />
                    </label>
                  </>
                )}
              </div>
            </div>
          )}
          {error && (
            <div role="alert" className="error-box">
              {error}
            </div>
          )}
          <DialogFooter>
            <Button
              variant="outline"
              disabled={busy}
              onClick={() => setDialog(null)}
            >
              取消
            </Button>
            <Button disabled={busy} onClick={save}>
              {busy
                ? '正在保存…'
                : dialog?.kind === 'add'
                  ? '添加并留待审核'
                  : '保存审核草稿'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog
        open={!!importPreview}
        onOpenChange={(v) => !busy && !v && setImportPreview(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>导入预览</DialogTitle>
            <DialogDescription>
              {importedReviewCount
                ? '本次只回写已完成审核的行，将核对网站原声、AI快照和审核版本，保存为审核草稿；全部审好后，点击统一提交按钮交给 Codex 核对。'
                : '保留原26列与上下文，已有人工审核不覆盖。新打标结果作为待审核候选导入。'}
            </DialogDescription>
          </DialogHeader>
          <p>
            {importPreview?.length || 0} 条原声，
            {importPreview?.reduce((n, r) => n + r.labels.length, 0) || 0}{' '}
            条独立诉求。
          </p>
          {importedReviewCount > 0 && (
            <p>
              其中 {importedReviewCount} 项已人工审核，将保存为审核草稿，统一提交并通过核对后参与案例学习。
            </p>
          )}
          <p>相关无诉求和已剔除原声也会保留，便于复核。</p>
          <DialogFooter>
            <Button
              variant="outline"
              disabled={busy}
              onClick={() => setImportPreview(null)}
            >
              取消
            </Button>
            <Button disabled={busy} onClick={importFile}>
              {busy ? '导入中…' : '确认导入'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog
        open={!!cases}
        onOpenChange={(v) => !busy && !v && setCases(null)}
      >
        <DialogContent className="voice-learning-dialog">
          <DialogHeader>
            <DialogTitle>人工审核学习案例</DialogTitle>
            <DialogDescription>
              只有人工提交且 Codex 核对通过的结果参与案例学习。可撤回案例，原声与审核历史保留。
            </DialogDescription>
          </DialogHeader>
          <div className="voice-learning-list">
            {!cases?.length && (
              <p>尚无学习案例。人工修改经 Codex 核对通过后会出现在这里。</p>
            )}
            {cases?.map((c) => (
              <article key={c.id}>
                <b>{c.payload.intent || '原声相关性审核'}</b>
                <p>{c.payload.body}</p>
                <p className="muted">
                  {c.payload.reviewer} · {c.payload.changed ? '修改' : '确认'} ·{' '}
                  {new Date(c.created_at).toLocaleString('zh-CN')}
                </p>
                <p>{JSON.stringify(c.payload.after)}</p>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={busy}
                  onClick={async () => {
                    setBusy(true);
                    try {
                      await request('', {
                        action: 'revoke_learning',
                        id: c.id,
                      });
                      setCases(
                        (old) => old?.filter((x) => x.id !== c.id) || [],
                      );
                      changed('已撤回学习案例，其他审核不受影响。');
                    } catch (e) {
                      setError((e as Error).message);
                    } finally {
                      setBusy(false);
                    }
                  }}
                >
                  <RotateCcw size={14} />
                  撤回学习
                </Button>
              </article>
            ))}
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={async () => {
                const { downloadBlob } = await import('@/lib/excel');
                downloadBlob(
                  new Blob(
                    [
                      cases?.map((c) => JSON.stringify(c.payload)).join('\n') +
                        '\n',
                    ],
                    { type: 'application/x-ndjson' },
                  ),
                  'PEO人工审核案例.jsonl',
                );
              }}
            >
              导出学习案例
            </Button>
            <Button onClick={() => setCases(null)}>关闭</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={queue!==null} onOpenChange={o=>{if(!o)setQueue(null);}}>
        <DialogContent className="voice-review-dialog">
          <DialogHeader><DialogTitle>审核记录与核对队列</DialogTitle><DialogDescription>草稿仅保存供你继续审核；点击统一提交按钮后，Codex 才会核对。后台每 5 分钟检查已提交记录，需电脑及 Codex 保持运行。</DialogDescription></DialogHeader>
          <div className="voice-learning-list">
            {!queue?.length&&<p>暂无审核记录。先逐条保存审核草稿，再统一提交。</p>}
            {queue?.map(q=><article key={q.id}>
              <b>{q.status} · {q.snapshot.fragment||'原声相关性'}</b>
              <p>{q.snapshot.raw?.[1]}</p>
              <p className="muted">审核人：{q.proposal.reviewer} · 基线版本 {q.snapshot.revision} · {new Date(q.created_at).toLocaleString('zh-CN')}</p>
              <p>提交修改：{JSON.stringify(q.proposal.value||{相关性:q.proposal.relevance,诉求性:q.proposal.demandness})}</p>
              {q.verification_reason&&<p>核对理由：{q.verification_reason}</p>}
              <details><summary>查看原声上下文与 AI 快照</summary><p>帖子背景：{q.snapshot.raw?.[15]||'无'}</p><p>回复上下文：{q.snapshot.raw?.[16]||'无'}</p><pre style={{whiteSpace:'pre-wrap'}}>{JSON.stringify(q.snapshot.ai,null,2)}</pre></details>
              {['草稿','待Codex核对','待人工处理'].includes(q.status)&&<Button variant="outline" size="sm" onClick={async()=>{try{const d=await request('?mode=detail&id='+encodeURIComponent(q.feedback_id));setQueue(null);if(q.scope==='label'){const l=d.labels.find((x:any)=>x.id===q.target_id);if(!l)throw new Error('标签已不存在');openLabel(d,l);setForm({...l.final,...q.proposal.value,fragment:l.fragment,reviewer:q.proposal.reviewer,note:q.proposal.note});}else{openScreen(d);setForm(q.proposal);}}catch(e){setError((e as Error).message);}}}>重新核对并修改</Button>}
              {q.status==='草稿'&&<Button variant="outline" size="sm" onClick={async()=>{try{await request('',{action:'discard_draft',id:q.id});setQueue((await request('?mode=verification_queue')).rows);changed('已放弃此项审核草稿。');}catch(e){setError((e as Error).message);}}}>放弃草稿</Button>}
              {q.status==='待Codex核对'&&<Button variant="outline" size="sm" onClick={async()=>{try{await request('',{action:'withdraw_verification',id:q.id});setQueue((await request('?mode=verification_queue')).rows);changed('已撤回待核对修改。');}catch(e){setError((e as Error).message);}}}>撤回提交</Button>}
            </article>)}
          </div>
          <DialogFooter><Button variant="outline" onClick={async()=>{try{setQueue((await request('?mode=verification_queue')).rows);}catch(e){setError((e as Error).message);}}}>刷新核对结果</Button><Button onClick={()=>setQueue(null)}>关闭</Button></DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={showRules} onOpenChange={setShowRules}><DialogContent className="voice-review-dialog"><DialogHeader><DialogTitle>智能打标规则与示例表头</DialogTitle><DialogDescription>与“原声智能打标_8条审核示例.xlsx”一致：原26列不改动，AI判断与人工更正分开。</DialogDescription></DialogHeader><div className="voice-learning-list"><ol><li>先判断萤火虫汽车相关性，再判断当前作者是否表达明确问题或建议；不把帖子和父评论的诉求直接赋给当前作者。</li><li>无明确诉求和不相关内容移出诉求主表，保留在“已剔除”；正文缺失、指代不明或证据不足进入“待确认”。</li><li>一条原声可拆多个独立诉求，分别打标、打分和审核；同义表达合并。</li><li>先文字召回，再综合语义、一级和二级Feature、建议/问题、体验/质量判断。文字匹配分不等于AI置信度。</li><li>匹配已有诉求必须沿用原ID及四维；无合适项标记待新增，分类缺口明确留空，不强配。</li><li>综合分=语义50%＋一级15%＋二级15%＋建议/问题10%＋体验/质量10%，上限取相关性及四维最低分；上下文缺失、风险或待新增最高79分。分类未覆盖时维度置信度为0，需人工补充。分数不是校准概率。</li><li>AI结果全部待审核；人工先保存草稿，统一提交给Codex核对，通过才写入学习案例。</li></ol><h3>原声总表 · 26列</h3><p>{voiceHeaders.join(' ｜ ')}</p><h3>诉求打标追加 · 35列</h3><p>{labelHeaders.join(' ｜ ')}</p><h3>原声筛选追加 · 12列</h3><p>{screenHeaders.join(' ｜ ')}</p></div><DialogFooter><Button onClick={()=>setShowRules(false)}>关闭</Button></DialogFooter></DialogContent></Dialog>
    </section>
  );
}
