'use client';
import { workspaceHref } from '@/lib/transport';
import { useState, useEffect, useRef, useCallback } from 'react';
import {
  Plus,
  Upload,
  Download,
  Search,
  MessageSquareText,
  SlidersHorizontal,
  FolderTree,
  History,
  RotateCcw,
  ChevronLeft,
  ChevronRight,
  Check,
  PenLine,
  Tags,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Table,
  TableHeader,
  TableHead,
  TableBody,
  TableRow,
  TableCell,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { NativeSelect } from '@/components/ui/native-select';
import { Choice, Editor, HistoryList } from './editor';
import { ImportDialog } from './import-dialog';
import { VoiceLabelTable } from './voice-label-table';
import { relevanceStates, matchStates } from '@/lib/voice-labeling';
import { api, type HistoryItem } from '@/lib/client';
import {
  emptyRecord,
  kinds,
  expressionTypes,
  statuses,
  validUrl,
  type Feedback,
  type Feature,
  type Demand,
  type Theme,
  type InputRecord,
} from '@/lib/catalog';
type Meta = {
  features: Feature[];
  demands: Demand[];
  themes: Theme[];
  stats: { total: number; pending: number; confirmed: number };
  values: { source: string; version: string; city: string }[];
};
const blankMeta: Meta = {
  features: [],
  demands: [],
  themes: [],
  stats: { total: 0, pending: 0, confirmed: 0 },
  values: [],
};
export default function FeedbackApp({ readOnly = false }: { readOnly?: boolean }) {
  const [demandFilterQuery, setDemandFilterQuery] = useState('');
  const [voiceNavigationTarget, setVoiceNavigationTarget] = useState<HTMLDivElement | null>(null);
  const [meta, setMeta] = useState<Meta>(blankMeta),
    [rows, setRows] = useState<Feedback[]>([]),
    [total, setTotal] = useState(0),
    [filters, setFilters] = useState<Record<string, string>>({}),
    [search, setSearch] = useState(''),
    [page, setPage] = useState(0),
    [sort, setSort] = useState('association'),
    [tab, setTab] = useState('feedback'),
    [archiveTools, setArchiveTools] = useState(false),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(''),
    [message, setMessage] = useState(''),
    [refresh, setRefresh] = useState(0),
    [edit, setEdit] = useState<InputRecord | null>(null),
    [matchEdit, setMatchEdit] = useState<Feedback | null>(null),
    [matchDemand, setMatchDemand] = useState(''),
    [matchQ, setMatchQ] = useState(''),
    [importOpen, setImportOpen] = useState(false),
    [selected, setSelected] = useState<string[]>([]),
    [bulk, setBulk] = useState(false),
    [patch, setPatch] = useState<Record<string, string>>({}),
    [busy, setBusy] = useState(false),
    [dict, setDict] = useState<any>(null),
    [history, setHistory] = useState<HistoryItem[]>([]),
    [historyPage, setHistoryPage] = useState(0),
    [dictQ, setDictQ] = useState('');
  const [themeQ, setThemeQ] = useState('');
  const [activeTheme, setActiveTheme] = useState<Theme | null>(null);
  const [themeRows, setThemeRows] = useState<Feedback[]>([]);
  const [themeLoading, setThemeLoading] = useState(false);
  const sequence = useRef(0);
  const editorIsOpen = useRef(false);
  useEffect(() => {
    editorIsOpen.current = !!edit;
  }, [edit]);
  const params = useCallback(
    (offset = page * 30, limit = 30) =>
      new URLSearchParams({
        ...Object.fromEntries(Object.entries(filters).filter(([, v]) => v)),
        sort,
        offset: String(offset),
        limit: String(limit),
      }).toString(),
    [filters, sort, page],
  );
  useEffect(() => {
    const timer = setTimeout(() => {
      setFilters((f) => ({ ...f, q: search }));
      setPage(0);
    }, 250);
    return () => clearTimeout(timer);
  }, [search]);
  useEffect(() => {
    let live = true;
    api('?mode=meta')
      .then((d) => live && setMeta(d))
      .catch((e) => live && setError(e.message));
    return () => {
      live = false;
    };
  }, [refresh]);
  useEffect(() => {
    const seq = ++sequence.current;
    setLoading(true);
    setError('');
    api('?' + params())
      .then((d) => {
        if (seq === sequence.current) {
          setRows(d.rows);
          setTotal(d.total);
          setSelected([]);
        }
      })
      .catch((e) => seq === sequence.current && setError(e.message))
      .finally(() => seq === sequence.current && setLoading(false));
  }, [params, refresh]);
  useEffect(() => {
    if (tab !== 'history') return;
    let live = true;
    api('?mode=history&offset=' + historyPage * 50)
      .then((d) => live && setHistory(d.rows))
      .catch((e) => live && setError(e.message));
    return () => {
      live = false;
    };
  }, [tab, historyPage, refresh]);
  const reload = async (m: string) => {
    setMessage(m);
    setRefresh((x) => x + 1);
  };
  useEffect(() => {
    const context = (document as any).modelContext;
    if (!context?.registerTool) return;
    const lifecycle = new AbortController();
    const register = (tool: any) => {
      try {
        Promise.resolve(
          context.registerTool(tool, { signal: lifecycle.signal }),
        ).catch(() => {});
      } catch {
        /* Optional capability; normal UI remains available. */
      }
    };
    register({
      name: 'search_feedback',
      description:
        'Search this private feedback library by original voice or user demand; also applies the keyword to the visible filters.',
      inputSchema: {
        type: 'object',
        properties: { query: { type: 'string' } },
        required: ['query'],
        additionalProperties: false,
      },
      annotations: { readOnlyHint: false, untrustedContentHint: true },
      execute: async ({ query }: { query: string }) => {
        if (typeof query !== 'string' || query.length > 500)
          throw new Error('搜索关键词应为不超过 500 字的文本');
        setFilters({ q: query });
        setTab('feedback'); setArchiveTools(true);
        setPage(0);
        setSearch(query);
        const data = await api('?q=' + encodeURIComponent(query));
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({ total: data.total, records: data.rows }),
            },
          ],
        };
      },
    });
    register({
      name: 'open_new_feedback',
      description:
        'Open an unsaved new feedback draft for the user to review. Does not persist data.',
      inputSchema: {
        type: 'object',
        properties: { raw: { type: 'string' } },
        additionalProperties: false,
      },
      annotations: { readOnlyHint: false, untrustedContentHint: false },
      execute: async ({ raw = '' }: { raw?: string }) => {
        if (editorIsOpen.current)
          throw new Error('已有打开的反馈，请先保存或关闭后再新建');
        if (typeof raw !== 'string' || raw.length > 30000)
          throw new Error('原声应为不超过 30,000 字的文本');
        setEdit({ ...emptyRecord(), raw });
        return {
          content: [
            { type: 'text', text: 'Draft opened. User must review and save.' },
          ],
        };
      },
    });
    return () => lifecycle.abort();
  }, []);
  const setFilter = (k: string, v: string) => {
    setFilters((f) => ({
      ...f,
      [k]: v,
      ...(k === 'feature1' ? { feature2: '' } : {}),
    }));
    setPage(0);
  };
  const clear = () => {
    setFilters({});
    setSearch('');
    setDemandFilterQuery('');
    setPage(0);
  };
  const parents = [...new Set([
    ...meta.features.map((f) => f.parent),
    ...meta.demands.map((d) => d.feature1),
  ].filter(Boolean))].sort();
  const feature2Options = [...new Set([
    ...meta.features.filter((f) => !filters.feature1 || f.parent === filters.feature1).map((f) => f.name),
    ...meta.demands.filter((d) => !filters.feature1 || d.feature1 === filters.feature1).map((d) => d.feature2),
  ].filter(Boolean))].sort();
  const values = (key: 'source' | 'version' | 'city') =>
    [...new Set(meta.values.map((v) => v[key]).filter(Boolean))].sort();
  async function exportRows() {
    setBusy(true);
    setError('');
    try {
      const all: Feedback[] = [];
      for (let offset = 0; ; offset += 500) {
        const d = await api('?' + params(offset, 500));
        all.push(...d.rows);
        if (offset + 500 >= d.total) break;
        if (all.length >= 50000)
          throw new Error('请缩小筛选范围后导出，每次最多 50,000 条');
      }
      const { exportWorkbook } = await import('@/lib/excel');
      await exportWorkbook(
        all,
        'firefly-反馈库-' + new Date().toISOString().slice(0, 10) + '.xlsx',
      );
      setMessage(
        `已导出当前筛选结果 ${all.length} 条。附件为链接；已上传文件请从详情页单独下载。`,
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function saveDict() {
    setBusy(true);
    setError('');
    try {
      await api('', { action: 'dictionary', ...dict });
      setDict(null);
      await reload('分类 / 诉求已保存，关联反馈会同步显示新名称。');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function openTheme(theme: Theme) {
    setActiveTheme(theme);
    setThemeLoading(true);
    try {
      const data = await api('?theme_id=' + encodeURIComponent(theme.id) + '&sort=newest&limit=500');
      setThemeRows(data.rows);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setThemeLoading(false);
    }
  }
  async function saveTheme() {
    setBusy(true);
    setError('');
    try {
      await api('', { action: 'theme', ...dict });
      setDict(null);
      await reload('主题已保存。');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function applyBulk() {
    setBusy(true);
    setError('');
    try {
      const body = Object.fromEntries(
        Object.entries(patch)
          .filter(([, v]) => v)
          .map(([k, v]) => [k, k === 'archived' ? Number(v) : v]),
      );
      const out = await api('', {
        action: 'bulk',
        records: rows
          .filter((r) => selected.includes(r.id))
          .map((r) => ({ id: r.id, revision: r.revision })),
        patch: body,
      });
      const failed = out.results.filter((r: any) => r.error);
      setBulk(false);
      await reload(
        `已修改 ${out.results.length - failed.length} 条。${failed.length ? '有 ' + failed.length + ' 条因冲突未修改，请重新选择后重试。' : ''}`,
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function confirmMatch(row: Feedback) {
    const demandId = row.request_candidate_id || row.request_id;
    if (!demandId) return;
    setBusy(true);
    setError('');
    try {
      await api('', {
        action: 'match',
        id: row.id,
        revision: row.revision,
        demand_id: demandId,
        confirm: true,
      });
      await reload('匹配已人工确认，分数已更新并记录修改历史。');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function saveMatch() {
    if (!matchEdit) return;
    setBusy(true);
    setError('');
    try {
      await api('', {
        action: 'match',
        id: matchEdit.id,
        revision: matchEdit.revision,
        demand_id: matchDemand,
        confirm: false,
      });
      setMatchEdit(null);
      await reload(matchDemand ? '新匹配已保存为候选，请再点击“确认匹配”完成复核。' : '已清除诉求匹配并记录修改历史。');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const fieldCount = Object.entries(filters).filter(([k,v]) => k !== 'q' && v && !(k === 'archived' && v === '0')).length + (search.trim() ? 1 : 0);
  const matchingDemands = meta.demands.filter((d) =>
    [d.name, d.ao, d.uba, d.attribute, d.request_type, d.hardware_software, d.feature1, d.feature2]
      .join(' ').toLocaleLowerCase().includes(matchQ.toLocaleLowerCase()),
  );
  const matchDemandOptions = matchingDemands.slice(0, 100);
  const selectedDemand = meta.demands.find((d) => d.id === matchDemand);
  if (selectedDemand && !matchDemandOptions.some((d) => d.id === selectedDemand.id))
    matchDemandOptions.push(selectedDemand);
  return (
    <div className={'app-shell' + ((tab === 'feedback' && !archiveTools) ? ' label-workspace' : '')}>
      <header className="topbar">
        <div className="brand">
          <div className="brand-mark">f</div>
          <strong>
            firefly<span> / </span>座舱反馈库
          </strong>
          <span className="workspace-badge">PEO 工作台</span>
        </div>
        <a className="workspace-badge" href={workspaceHref("/peo-cycle")}>本期 PEO 汇总</a>
        <span className="private-label">
          <span />
          {readOnly ? '公开只读 · 修改请使用本地工作台' : '私有工作空间'}
        </span>
      </header>
      <div className="workspace">
        {<aside className="filters">
          <div className="voice-sidebar-navigation" ref={setVoiceNavigationTarget} hidden={tab !== 'feedback' || archiveTools} />
          <div className="section-heading">
            <SlidersHorizontal size={17} />
            <strong>反馈信息筛选</strong>
          </div>
          <label>
            搜索原声 / 用户诉求
            <div className="search-input">
              <Search size={16} />
              <Input
                placeholder="关键词、原声 ID 或诉求"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
          </label>
          <label>
            发帖 / 评论时间
            <div className="sidebar-inline-pair sidebar-date-range mt-2">
              <Input
                aria-label="起始日期"
                type="date"
                value={filters.from || ''}
                onChange={(e) => setFilter('from', e.target.value)}
              />
              <Input
                aria-label="结束日期"
                type="date"
                value={filters.to || ''}
                onChange={(e) => setFilter('to', e.target.value)}
              />
            </div>
          </label>
          <Choice label="声音来源" value={filters.source} options={values('source')} placeholder="全部来源" onChange={(v) => setFilter('source', v)} />
          <fieldset className="sidebar-filter-group">
            <legend>Feature 分类</legend>
            <div className="sidebar-inline-pair">
              <Choice label="一级分类" value={filters.feature1} options={parents} placeholder="全部一级" onChange={(v) => setFilter('feature1', v)} />
              <Choice label="二级分类" value={filters.feature2} options={feature2Options} placeholder="全部二级" onChange={(v) => setFilter('feature2', v)} />
            </div>
          </fieldset>
          <details className="sidebar-demand-picker">
            <summary>用户诉求<span>{meta.demands.find(d => d.id === filters.request_id)?.name || '全部诉求'}</span></summary>
            <Input aria-label="搜索用户诉求" placeholder="输入诉求关键词" value={demandFilterQuery} onChange={e => setDemandFilterQuery(e.target.value)} />
            <fieldset className="sidebar-demand-options" aria-label="用户诉求选项">
              <button type="button" aria-pressed={!filters.request_id} onClick={() => setFilter('request_id', '')}>全部诉求</button>
              {meta.demands.filter(d => d.name.toLocaleLowerCase().includes(demandFilterQuery.toLocaleLowerCase())).slice(0, 60).map(d => <button type="button" key={d.id} aria-pressed={filters.request_id === d.id} onClick={() => setFilter('request_id', d.id)}>{d.name}</button>)}
              {!meta.demands.some(d => d.name.toLocaleLowerCase().includes(demandFilterQuery.toLocaleLowerCase())) && <p>未找到匹配诉求</p>}
            </fieldset>
          </details>
          <div className="sidebar-inline-pair">
            {tab === 'feedback' && !archiveTools && <Choice label="建议 / 问题" value={filters.suggestion_issue} options={['建议', '问题']} placeholder="全部类型" onChange={(v) => setFilter('suggestion_issue', v)} />}
            <Choice label="体验 / 质量" value={filters.kind} options={['体验', '质量']} placeholder="全部属性" onChange={(v) => setFilter('kind', v)} />
          </div>
          <fieldset className="sidebar-filter-group">
            <legend>审核进度</legend>
            <Choice label="原声审核" value={filters.status} options={statuses} placeholder="全部进度" onChange={(v) => setFilter('status', v)} />
            {tab === 'feedback' && !archiveTools && <Choice label="诉求审核" value={filters.review} options={['待审核', '确认', '修改']} placeholder="全部进度" onChange={(v) => setFilter('review', v)} />}
          </fieldset>
          {tab === 'themes' && <Choice label="用户声音主题" value={filters.theme_id} options={meta.themes.filter(t => t.active)} placeholder="全部主题" onChange={(v) => setFilter('theme_id', v)} />}
          {archiveTools && <Choice label="资料状态" value={filters.archived || '0'} options={[{id:'0',name:'有效反馈'},{id:'1',name:'已归档'}]} onChange={(v) => setFilter('archived', v || '0')} />}
          <details className="sidebar-advanced">
            <summary>高级筛选<span>{['relevance','match','confidence','multi','expression_type','version','city'].filter(k => filters[k]).length || ''}</span></summary>
            <div className="sidebar-advanced-content">
              {tab === 'feedback' && !archiveTools && <>
                <Choice label="相关性" value={filters.relevance} options={relevanceStates} placeholder="全部相关性" onChange={(v) => setFilter('relevance', v)} />
                <fieldset className="sidebar-filter-group"><legend>诉求标签筛选</legend>
                  <Choice label="诉求库匹配" value={filters.match} options={matchStates} placeholder="全部匹配状态" onChange={(v) => setFilter('match', v)} />
                  <Choice label="标签置信度" value={filters.confidence} options={[{id:'low',name:'低于75分'},{id:'high',name:'90分及以上'},{id:'missing',name:'待 AI 识别'}]} placeholder="全部分数" onChange={(v) => setFilter('confidence', v)} />
                  <label className="voice-multi"><input type="checkbox" checked={filters.multi === '1'} onChange={(e) => setFilter('multi', e.target.checked ? '1' : '')} />只看多诉求</label>
                </fieldset>
              </>}
              <Choice label="表达类型" value={filters.expression_type} options={expressionTypes} placeholder="全部表达" onChange={(v) => setFilter('expression_type', v)} />
              <Choice label="软件版本" value={filters.version} options={values('version')} placeholder="全部版本" onChange={(v) => setFilter('version', v)} />
              <Choice label="IP 城市" value={filters.city} options={values('city')} placeholder="全部城市" onChange={(v) => setFilter('city', v)} />
            </div>
          </details>
          <Button variant="outline" onClick={clear}>
            <RotateCcw size={15} />
            重置筛选{fieldCount ? ' · ' + fieldCount : ''}
          </Button>
        </aside>}
        <main className="main">
          <div className="page-title">
            <div>
              <div className="eyebrow">FIREFLY · VOICE OF CUSTOMER</div>
              <h1>反馈库</h1>
              <p>汇集智能座舱体验，整理用户诉求，追溯每一次修订。</p>
            </div>
            <Button onClick={() => setEdit(emptyRecord())}>
              <Plus />
              新增反馈
            </Button>
          </div>
          {(tab !== 'feedback' || archiveTools) && <div className="stats">
            {[
              ['已入库反馈', meta.stats.total, '条'],
              ['待审核', meta.stats.pending, '条'],
              ['已确认', meta.stats.confirmed, '条'],
              ['分类体系', parents.length, '个一级 Feature'],
            ].map(([name, value, unit]) => (
              <div key={name}>
                <span>{name}</span>
                <strong>
                  {value}
                  <small>{unit}</small>
                </strong>
              </div>
            ))}
          </div>}
          {error && (
            <div className="error-box" role="alert">
              {error}{' '}
              <Button variant="ghost" onClick={() => setRefresh((x) => x + 1)}>
                重新加载
              </Button>
              {error.includes('登录') && (
                <a href="/signin-with-chatgpt?return_to=/" target="_top">
                  登录工作空间
                </a>
              )}
            </div>
          )}
          {message && (
            <div
              className="notice mb-4 flex justify-between items-center"
              role="status"
            >
              {message}
              <Button
                variant="ghost"
                aria-label="关闭提示"
                onClick={() => setMessage('')}
              >
                ×
              </Button>
            </div>
          )}
          <div className="content-card">
            <div className="card-toolbar">
              <Tabs value={tab} onValueChange={(v) => setTab(String(v))}>
                <TabsList variant="line">
                  <TabsTrigger value="feedback">
                    <MessageSquareText />
                    原声档案
                  </TabsTrigger>
                  <TabsTrigger value="themes">
                    <Tags />
                    主题与原声
                  </TabsTrigger>
                  <TabsTrigger value="dictionary">
                    <FolderTree />
                    分类与诉求
                  </TabsTrigger>
                  <TabsTrigger value="history">
                    <History />
                    修改历史
                  </TabsTrigger>
                </TabsList>
              </Tabs>
              {(tab !== 'feedback' || archiveTools) && <div className="actions">
                <Button
                  variant="outline"
                  onClick={() => setImportOpen(true)}
                  disabled={busy}
                >
                  <Upload />
                  导入 Excel
                </Button>
                <Button variant="outline" onClick={exportRows} disabled={busy}>
                  <Download />
                  {busy ? '处理中…' : '导出筛选结果'}
                </Button>
              </div>}
            </div>
            {tab === 'feedback' && <div className="archive-view-switch" role="group" aria-label="档案操作视图"><Button variant={!archiveTools?'default':'outline'} onClick={()=>setArchiveTools(false)}>原声与审核</Button><Button variant={archiveTools?'default':'outline'} onClick={()=>setArchiveTools(true)}>归档与批量整理</Button></div>}
            {(tab === 'feedback' && !archiveTools) && <VoiceLabelTable navigationTarget={voiceNavigationTarget} demands={meta.demands} features={meta.features} refreshKey={refresh} archiveFilters={filters} setArchiveFilters={setFilters} search={search} setSearch={setSearch} onChanged={() => setRefresh(x => x + 1)} onOpen={voice => setEdit(voice)} />}
            {tab === 'feedback' && archiveTools && (
              <>
                {filters.candidate === '1' && (
                  <div className="notice mx-5 mt-4">
                    候选由正文命中诉求核心词生成，匹配分是规则排序分，不是模型概率或正式关联；请查看原声上下文后再采纳，不匹配可直接清除。
                  </div>
                )}
                <div className="table-footer">
                  <span>
                    {loading
                      ? '正在读取…'
                      : `共 ${total} 条${filters.archived === '1' ? '已归档' : ''}反馈`}
                    <span className="muted"> · 每行一条原声</span>
                  </span>
                  <NativeSelect
                    aria-label="排序方式"
                    value={sort}
                    onChange={(e) => {
                      setSort(e.target.value);
                      setPage(0);
                    }}
                  >
                    <option value="association">诉求关联优先 · 正式 / 候选 / 未关联</option>
                    <option value="newest">发布时间 · 新到旧</option>
                    <option value="oldest">发布时间 · 旧到新</option>
                    <option value="updated">最近修改</option>
                  </NativeSelect>
                  <Button
                    variant={filters.candidate === '1' ? 'default' : 'outline'}
                    onClick={() => {
                      const showingCandidates = filters.candidate === '1';
                      setFilters(showingCandidates ? {} : { candidate: '1', archived: '0' });
                      setSearch('');
                      setPage(0);
                      setTab('feedback'); setArchiveTools(true);
                    }}
                  >
                    {filters.candidate === '1' ? '退出候选筛选' : '筛选候选待审核'}
                  </Button>
                </div>
                {selected.length > 0 && (
                  <div className="bulk-bar">
                    <span>已选择本页 {selected.length} 条</span>
                    <div className="actions">
                      <Button variant="ghost" onClick={() => setSelected([])}>
                        取消选择
                      </Button>
                      <Button
                        onClick={() => {
                          setPatch({});
                          setBulk(true);
                        }}
                      >
                        <PenLine size={15} />
                        批量编辑
                      </Button>
                    </div>
                  </div>
                )}
                {!loading && rows.length === 0 ? (
                  <div className="empty-state">
                    <div className="empty-icon">
                      <MessageSquareText size={30} />
                    </div>
                    <h2>
                      {meta.stats.total
                        ? '没有符合筛选条件的反馈'
                        : '建立你的第一份反馈档案'}
                    </h2>
                    <p>
                      {meta.stats.total
                        ? '可以调整筛选条件，或查看已归档的反馈。'
                        : '导入历史 Excel，或手动录入一条真实原声。'}
                      <br />
                      诉求与分类可以随时修订，原始证据始终保留。
                    </p>
                    <Button
                      onClick={() =>
                        meta.stats.total ? clear() : setImportOpen(true)
                      }
                    >
                      {meta.stats.total ? '重置筛选' : '导入历史反馈'}
                    </Button>
                  </div>
                ) : (
                  <div className="table-wrap">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="pl-4">
                            <Checkbox
                              aria-label="选择本页所有反馈"
                              checked={
                                rows.length > 0 &&
                                selected.length === rows.length
                              }
                              disabled={loading}
                              onCheckedChange={(v) =>
                                setSelected(v ? rows.map((r) => r.id) : [])
                              }
                            />
                          </TableHead>
                          {[
                            '反馈原声',
                            '采集 / 互动',
                            '用户诉求',
                            '诉求标签',
                            '诉求候选（待确认）',
                            '匹配分数',
                            '人工确认 / 编辑匹配',
                            '用户声音主题',
                            '一级 Feature',
                            '二级 Feature',
                            '体验 / 质量',
                            '版本',
                            '发帖 / 评论时间',
                            '链接',
                            '附件',
                            'IP城市',
                            '审核状态',
                          ].map((h) => (
                            <TableHead className="resizable-head" key={h}>
                              {h}
                            </TableHead>
                          ))}
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {rows.map((r) => (
                          <TableRow key={r.id}>
                            <TableCell>
                              <Checkbox
                                aria-label={'选择反馈 ' + r.id.slice(0, 8)}
                                checked={selected.includes(r.id)}
                                disabled={loading}
                                onCheckedChange={(v) =>
                                  setSelected((s) =>
                                    v
                                      ? [...s, r.id]
                                      : s.filter((x) => x !== r.id),
                                  )
                                }
                              />
                            </TableCell>
                            <TableCell className="raw-cell">
                              <button
                                className="text-left w-full hover:text-primary"
                                onClick={() => setEdit(r)}
                              >
                                <span className="ellipsis">{r.raw}</span>
                                {r.source_type === '评论' && r.post_context && (
                                  <span className="muted block mt-2 text-xs">
                                    原帖：<span className="ellipsis">{r.post_context}</span>
                                  </span>
                                )}
                                {r.source_type === '评论' && r.parent_context && (
                                  <span className="muted block mt-1 text-xs">
                                    回复：<span className="ellipsis">{r.parent_context}</span>
                                  </span>
                                )}
                                <span className="small-link block mt-2">
                                  {r.source} · {r.source_type} ·{' '}
                                  {r.id.slice(0, 8)} ↗
                                </span>
                              </button>
                            </TableCell>
                            <TableCell className="min-w-[220px] max-w-[280px] whitespace-normal">
                              <div className="text-xs space-y-1">
                                <div>帖子 {r.post_id || '—'}{r.parent_comment_id ? ` · 回复 ${r.parent_comment_id}` : ''}</div>
                                <div>
                                  {r.like_count === null ? '赞 —' : `赞 ${r.like_count}`}
                                  {r.source_type === '帖子'
                                    ? ` · 评 ${r.comment_count ?? '—'} · 藏 ${r.collect_count ?? '—'} · 转 ${r.share_count ?? '—'}`
                                    : ` · 回复 ${r.reply_count ?? '—'}`}
                                </div>
                                <div className="muted">
                                  采集 {r.captured_at || '未知'}{r.crawl_keyword ? ` · ${r.crawl_keyword}` : ''}
                                </div>
                              </div>
                            </TableCell>
                            <TableCell className="min-w-[220px] max-w-[270px] whitespace-normal">
                              {r.request_name || (
                                <span className="muted">待归纳</span>
                              )}
                            </TableCell>
                            <TableCell className="min-w-[200px] max-w-[280px] whitespace-normal">
                              {r.request_id ? (
                                <span className="text-xs">
                                  UBA {r.request_uba || '—'} · {r.request_attribute || '—'} · {r.request_type || '—'} · {r.request_hardware_software || '—'}
                                </span>
                              ) : <span className="muted">关联诉求后继承</span>}
                            </TableCell>
                            <TableCell className="min-w-[260px] max-w-[340px] whitespace-normal">
                              {r.request_candidate_name ? (
                                <div className="space-y-1">
                                  <div className="font-medium">{r.request_candidate_name}</div>
                                  <div className="muted text-xs">{r.request_candidate_reason}</div>
                                  <div className="muted text-xs">候选诉求标签：UBA {r.candidate_uba || '—'} · {r.candidate_attribute || '—'} · {r.candidate_request_type || '—'} · {r.candidate_hardware_software || '—'}</div>
                                  <div className="muted text-xs">Feature：{r.candidate_feature1 || '—'} / {r.candidate_feature2 || '—'}</div>
                                  <div className="flex gap-2">
                                    <Button size="sm" variant="ghost" disabled={busy} onClick={async () => {
                                      setBusy(true);
                                      try {
                                        await api('', { action: 'edit', id: r.id, revision: r.revision, patch: { request_candidate_id: '', request_candidate_score: 0, request_candidate_reason: '' } });
                                        await reload('已清除该候选建议。');
                                      } catch (e) { setError((e as Error).message); }
                                      finally { setBusy(false); }
                                    }}>清除候选</Button>
                                  </div>
                                </div>
                              ) : <span className="muted">—</span>}
                            </TableCell>
                            <TableCell className="min-w-[110px]">
                              {r.request_id || r.request_candidate_id ? (
                                <div className="space-y-1">
                                  <span className="badge">{r.request_match_score ?? r.request_candidate_score ?? 0}/100</span>
                                  <span className="muted block text-xs">{r.request_match_status || '待确认'}</span>
                                </div>
                              ) : (
                                <span className="muted">—</span>
                              )}
                            </TableCell>
                            <TableCell className="min-w-[170px]">
                              <div className="flex flex-wrap gap-2">
                                {(r.request_id || r.request_candidate_id) && r.request_match_status !== '已确认' && (
                                  <Button size="sm" disabled={busy} onClick={() => confirmMatch(r)}>确认匹配</Button>
                                )}
                                {r.request_match_status === '已确认' && <span className="badge confirmed">已确认</span>}
                                <Button size="sm" variant={r.request_candidate_id && !r.request_id ? 'outline' : 'default'} disabled={busy} onClick={() => {
                                  setMatchEdit(r);
                                  setMatchDemand(r.request_candidate_id || r.request_id || '');
                                  setMatchQ('');
                                }}>{r.request_id || r.request_candidate_id ? '编辑匹配' : '匹配诉求'}</Button>
                              </div>
                            </TableCell>
                            <TableCell>{r.theme_name || <span className="muted">未归类</span>}</TableCell>
                            <TableCell>{r.feature1 || '待分类'}</TableCell>
                            <TableCell>{r.feature2 || '待分类'}</TableCell>
                            <TableCell>
                              <span className="badge">{r.expression_type || '待判断'}</span><br />
                              <span
                                className={
                                  'badge ' +
                                  (r.kind === '质量'
                                    ? 'quality'
                                    : r.kind === '体验'
                                      ? 'experience'
                                      : '')
                                }
                              >
                                {r.kind}
                              </span>
                            </TableCell>
                            <TableCell>
                              {r.version || <span className="muted">未知</span>}
                            </TableCell>
                            <TableCell>
                              {r.published_at || (
                                <span className="muted">未知</span>
                              )}
                            </TableCell>
                            <TableCell>
                              {validUrl(r.url) ? (
                                <a
                                  className="small-link"
                                  href={r.url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                >
                                  查看原文 ↗
                                </a>
                              ) : (
                                '—'
                              )}
                            </TableCell>
                            <TableCell>
                              {r.file_count || r.attachment_links ? (
                                <Button
                                  variant="ghost"
                                  onClick={() => setEdit(r)}
                                >
                                  查看附件
                                </Button>
                              ) : (
                                '—'
                              )}
                            </TableCell>
                            <TableCell>{r.city || '未知'}</TableCell>
                            <TableCell>
                              <span
                                className={
                                  'badge ' +
                                  (r.status === '已确认' ? 'confirmed' : '')
                                }
                              >
                                {r.status}
                              </span>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
                <div className="table-footer">
                  <span>
                    第 {page + 1} / {Math.max(1, Math.ceil(total / 30))} 页 ·
                    每页 30 条
                  </span>
                  <div className="actions">
                    <Button
                      variant="outline"
                      disabled={page === 0 || loading}
                      aria-label="上一页"
                      onClick={() => setPage((p) => p - 1)}
                    >
                      <ChevronLeft />
                    </Button>
                    <Button
                      variant="outline"
                      disabled={(page + 1) * 30 >= total || loading}
                      aria-label="下一页"
                      onClick={() => setPage((p) => p + 1)}
                    >
                      <ChevronRight />
                    </Button>
                  </div>
                </div>
              </>
            )}
            {tab === 'themes' && (
              <div className="p-5">
                <div className="theme-workspace">
                  <section className="theme-list-panel">
                    <div className="flex gap-2 items-center mb-4">
                      <Input aria-label="查找主题" placeholder="搜索主题" value={themeQ} onChange={(e) => setThemeQ(e.target.value)} />
                    </div>
                    <div className="theme-list">
                      {meta.themes.filter((t) => t.active && (t.name + t.description + t.keywords).toLowerCase().includes(themeQ.toLowerCase())).map((theme) => (
                        <button key={theme.id} className={'theme-row ' + (activeTheme?.id === theme.id ? 'selected' : '')} onClick={() => openTheme(theme)}>
                          <span><strong>{theme.name}</strong><small>{theme.description || '暂无主题说明'}</small></span>
                          <b>{theme.count}</b>
                        </button>
                      ))}
                      {!meta.themes.some((t) => t.active) && <div className="empty-state"><h2>还没有用户声音主题</h2><p>在“分类与诉求”里新建主题，之后可在原声详情中进行归类。</p></div>}
                    </div>
                  </section>
                  <section className="theme-voices-panel">
                    {activeTheme ? <>
                      <div className="theme-panel-heading"><div><div className="eyebrow">主题原声 · 按发布时间倒序</div><h2>{activeTheme.name}</h2><p>{activeTheme.description}</p></div>
                        <Button variant="outline" onClick={() => { setFilters((f) => ({ ...f, theme_id: activeTheme.id, archived: '0' })); setTab('feedback'); setArchiveTools(true); setPage(0); }}>查看筛选结果 / 下载</Button>
                      </div>
                      {activeTheme.keywords && <p className="theme-keywords">匹配词：{activeTheme.keywords}</p>}
                      {themeLoading ? <p className="muted p-5">正在加载原声…</p> : themeRows.length ? <div className="theme-voice-list">{themeRows.map((row) => <article className="theme-voice" key={row.id}>
                        <button className="text-left" onClick={() => setEdit(row)}><p>{row.raw}</p><span>{row.source} · {row.source_type} · {row.published_at || '时间未知'} · {row.status}</span></button>
                        <Button variant="ghost" size="sm" onClick={() => setEdit(row)}>编辑标注</Button>
                      </article>)}</div> : <div className="empty-state"><h2>这个主题下还没有原声</h2><p>可以在反馈详情中为原声选择该主题。</p></div>}
                      {themeRows.length >= 500 && <p className="muted mt-3">仅显示最近 500 条。需要更完整的下载时，可通过“查看筛选结果 / 下载”进入筛选导出。</p>}
                    </> : <div className="empty-state"><div className="empty-icon"><Tags size={30} /></div><h2>选择一个主题</h2><p>查看该主题下的用户原声，按发布时间从新到旧排列。</p></div>}
                  </section>
                </div>
              </div>
            )}
            {tab === 'dictionary' && (
              <>
                <div className="p-5">
                  <div className="notice">
                    临时 Feature v0.1 ·
                    分类表示研究主题，不代表该功能已上线。重命名会同步影响关联反馈的显示；原始入库快照不变。
                  </div>
                  <div className="actions mt-4 flex-wrap">
                    <Input
                      className="max-w-[300px]"
                      placeholder="查找分类或用户诉求"
                      value={dictQ}
                      onChange={(e) => setDictQ(e.target.value)}
                    />
                    <Button
                      variant="outline"
                      onClick={() =>
                        setDict({ type: 'feature', parent: '', name: '' })
                      }
                    >
                      <Plus />
                      新增 Feature
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => setDict({ type: 'demand', name: '' })}
                    >
                      <Plus />
                      新增标准诉求
                    </Button>
                    <Button variant="outline" onClick={() => setDict({ type: 'theme', name: '', description: '', keywords: '', feature_id: '', active: 1 })}>
                      <Plus />新增主题
                    </Button>
                  </div>
                </div>
                <div className="dict-grid">
                  {parents.map((p) => {
                    const fs = meta.features.filter(
                      (f) => f.parent === p && (p + f.name).includes(dictQ),
                    );
                    return fs.length ? (
                      <section className="dict-card" key={p}>
                        <h3>
                          {p}{' '}
                          <span className="muted font-normal">{fs.length}</span>
                        </h3>
                        <div className="dict-items">
                          {fs.map((f) => (
                            <Button
                              key={f.id}
                              variant="outline"
                              size="sm"
                              onClick={() => setDict({ type: 'feature', ...f })}
                            >
                              {f.name}
                              <span className="muted">{f.count || 0}</span>
                              <PenLine size={12} />
                            </Button>
                          ))}
                        </div>
                      </section>
                    ) : null;
                  })}
                </div>
                <div className="p-5 border-t">
                  <h2>用户声音主题</h2>
                  <p className="muted mt-2 mb-4">主题用于聚合同类原声；关键词参与本地分类推荐，可用逗号分隔。</p>
                  <div className="dict-items">
                    {meta.themes.filter((t) => (t.name + t.description + t.keywords).includes(dictQ)).map((t) => <Button key={t.id} variant="outline" onClick={() => setDict({ type: 'theme', ...t })}>{t.name} · {t.count}{!t.active ? ' · 已停用' : ''}<PenLine size={12} /></Button>)}
                    {!meta.themes.length && <p className="muted">尚无主题，新增主题后可在原声中归类。</p>}
                  </div>
                </div>
                <div className="p-5 border-t">
                  <h2>标准用户诉求</h2>
                  <p className="muted mt-2 mb-4">
                    共 {meta.demands.length.toLocaleString()} 条。可搜索诉求名称、UBA、属性、类型或 Feature；选中可查看与编辑。
                  </p>
                  <div className="dict-items">
                    {meta.demands
                      .filter((d) =>
                        [d.name, d.ao, d.uba, d.attribute, d.request_type, d.hardware_software, d.feature1, d.feature2]
                          .join(' ')
                          .toLocaleLowerCase()
                          .includes(dictQ.toLocaleLowerCase()),
                      )
                      .slice(0, 100)
                      .map((d) => (
                        <Button
                          key={d.id}
                          variant="outline"
                          onClick={() => setDict({ type: 'demand', ...d })}
                        >
                          <span className="text-left">
                            <span className="block">{d.name} · {d.count}</span>
                            <span className="muted block text-xs">
                              UBA {d.uba || '—'} · {d.attribute || '—'} · {d.request_type || '—'} · {d.hardware_software || '—'}
                              {d.feature1 || d.feature2 ? ` · ${d.feature1}${d.feature2 ? ` / ${d.feature2}` : ''}` : ''}
                              {d.lifecycle_status ? ` · ${d.lifecycle_status}` : ''}
                              {d.ao ? ` · AO ${d.ao}` : ''}
                            </span>
                          </span>
                          <PenLine size={12} />
                        </Button>
                      ))}
                    {meta.demands.length > 0 && !meta.demands.some((d) =>
                      [d.name, d.ao, d.uba, d.attribute, d.request_type, d.hardware_software, d.feature1, d.feature2]
                        .join(' ').toLocaleLowerCase().includes(dictQ.toLocaleLowerCase()),
                    ) && <p className="muted">没有匹配的诉求，请换一个名称或标签搜索。</p>}
                    {meta.demands.filter((d) =>
                      [d.name, d.ao, d.uba, d.attribute, d.request_type, d.hardware_software, d.feature1, d.feature2]
                        .join(' ').toLocaleLowerCase().includes(dictQ.toLocaleLowerCase()),
                    ).length > 100 && <p className="muted">结果较多，仅显示前 100 条，请继续输入缩小范围。</p>}
                    {!meta.demands.length && (
                      <p className="muted">
                        尚无标准诉求。录入或导入时可以逐步归纳。
                      </p>
                    )}
                  </div>
                </div>
              </>
            )}
            {tab === 'history' && (
              <>
                <div className="notice m-5">
                  保留新增、导入、编辑、归档与分类修订记录。反馈的最新一次修改可在详情页撤销；存在后续修改时不会覆盖。
                </div>
                <HistoryList
                  items={history}
                  features={meta.features}
                  demands={meta.demands}
                />
                <div className="table-footer">
                  <span>第 {historyPage + 1} 页</span>
                  <div className="actions">
                    <Button
                      variant="outline"
                      disabled={!historyPage}
                      onClick={() => setHistoryPage((p) => p - 1)}
                    >
                      上一页
                    </Button>
                    <Button
                      variant="outline"
                      disabled={history.length < 50}
                      onClick={() => setHistoryPage((p) => p + 1)}
                    >
                      下一页
                    </Button>
                  </div>
                </div>
              </>
            )}
          </div>
          <footer>
            firefly PEO · 用户声音档案　/　数据按账号私有保存 · 统计不含归档反馈
            · 时间为 UTC+8
          </footer>
        </main>
      </div>
      <Editor
        record={edit}
        features={meta.features}
        demands={meta.demands}
        themes={meta.themes}
        onClose={() => setEdit(null)}
        onSaved={reload}
      />
      <Dialog open={!!matchEdit} onOpenChange={(open) => !open && !busy && setMatchEdit(null)}>
        <DialogContent className="!max-w-[620px]" showCloseButton={!busy}>
          <DialogHeader>
            <DialogTitle>确认 / 编辑诉求匹配</DialogTitle>
            <DialogDescription>
              选择最贴切的标准诉求后，系统会重新计算规则分并保存为候选；再点击列表中的“确认匹配”完成人工复核。选择“未匹配”可清除当前关联。
            </DialogDescription>
          </DialogHeader>
          {error && <div className="error-box">{error}</div>}
          {matchEdit && <div className="space-y-4">
            <div className="rounded-md bg-muted/40 p-3 text-sm whitespace-pre-wrap">{matchEdit.raw}</div>
            <Input
              value={matchQ}
              onChange={(e) => setMatchQ(e.target.value)}
              placeholder="搜索标准诉求名称或标签"
            />
            <Choice
              label="标准用户诉求"
              value={matchDemand}
              options={matchDemandOptions}
              placeholder="未匹配"
              onChange={setMatchDemand}
            />
            <p className="muted text-xs">匹配分是规则排序分，不是概率。正式关联和候选都要经过人工确认。</p>
          </div>}
          <DialogFooter>
            <Button variant="outline" disabled={busy} onClick={() => setMatchEdit(null)}>取消</Button>
            <Button disabled={busy} onClick={saveMatch}>{busy ? '保存中…' : '保存为候选，待确认'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <ImportDialog
        open={importOpen}
        onClose={() => setImportOpen(false)}
        onSaved={reload}
      />
      <Dialog open={!!dict} onOpenChange={(v) => !v && !busy && setDict(null)}>
        <DialogContent showCloseButton={!busy}>
          <DialogHeader>
            <DialogTitle>
              {dict?.id ? '编辑' : '新增'}
              {dict?.type === 'feature' ? ' Feature' : dict?.type === 'theme' ? '用户声音主题' : '标准诉求'}
            </DialogTitle>
            <DialogDescription>
              使用清晰、可复用的名称。修改名称会同步显示在关联反馈中。
            </DialogDescription>
          </DialogHeader>
          {error && <div className="error-box">{error}</div>}
          {dict?.type === 'feature' && (
            <label>
              一级 Feature
              <Input
                value={dict.parent}
                onChange={(e) => setDict({ ...dict, parent: e.target.value })}
              />
            </label>
          )}
          {dict?.type === 'theme' && <>
            <Choice label="关联二级 Feature（用于自动建议）" value={dict?.feature_id} options={meta.features.map((f) => ({ id: f.id, name: `${f.parent} / ${f.name}` }))} placeholder="不关联" onChange={(v) => setDict({ ...dict, feature_id: v })} />
            <label>主题说明<Textarea className="mt-2 w-full" rows={3} maxLength={500} value={dict?.description || ''} onChange={(e) => setDict({ ...dict, description: e.target.value })} /></label>
            <label>关键词（逗号分隔）<Input value={dict?.keywords || ''} onChange={(e) => setDict({ ...dict, keywords: e.target.value })} placeholder="例如：蓝牙断连，钥匙，自动解锁" /></label>
            <label className="flex gap-2 items-center"><Checkbox checked={dict?.active !== 0} onCheckedChange={(v) => setDict({ ...dict, active: v ? 1 : 0 })} />启用主题</label>
          </>}
          <label>
            {dict?.type === 'feature' ? '二级 Feature' : '用户诉求'}
            <Input
              value={dict?.name || ''}
              onChange={(e) => setDict({ ...dict, name: e.target.value })}
            />
          </label>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDict(null)}
              disabled={busy}
            >
              取消
            </Button>
            <Button onClick={dict?.type === 'theme' ? saveTheme : saveDict} disabled={busy || !dict?.name}>
              保存
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={bulk} onOpenChange={(v) => !busy && setBulk(v)}>
        <DialogContent className="!max-w-[580px]" showCloseButton={!busy}>
          <DialogHeader>
            <DialogTitle>批量编辑 {selected.length} 条反馈</DialogTitle>
            <DialogDescription>
              只有明确选择的字段会修改。每条反馈都会保留修改记录。
            </DialogDescription>
          </DialogHeader>
          {error && <div className="error-box">{error}</div>}
          <div className="form-grid">
            <Choice
              label="体验 / 质量"
              value={patch.kind}
              options={kinds}
              placeholder="不修改"
              onChange={(v) => setPatch({ ...patch, kind: v })}
            />
            <Choice
              label="审核状态"
              value={patch.status}
              options={statuses}
              placeholder="不修改"
              onChange={(v) => setPatch({ ...patch, status: v })}
            />
            <div className="wide">
              <Choice
                label="标准用户诉求"
                value={patch.request_id}
                options={meta.demands}
                placeholder="不修改"
                onChange={(v) => setPatch({ ...patch, request_id: v })}
              />
            </div>
            <div className="wide">
              <Choice
                label="Feature（一级 / 二级）"
                value={patch.feature_id}
                options={meta.features.map((f) => ({
                  id: f.id,
                  name: f.parent + ' / ' + f.name,
                }))}
                placeholder="不修改"
                onChange={(v) => setPatch({ ...patch, feature_id: v })}
              />
            </div>
            <Choice
              label="归档状态"
              value={patch.archived}
              options={[
                { id: '1', name: '归档（可恢复）' },
                { id: '0', name: '恢复为有效反馈' },
              ]}
              placeholder="不修改"
              onChange={(v) => setPatch({ ...patch, archived: v })}
            />
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              disabled={busy}
              onClick={() => setBulk(false)}
            >
              取消
            </Button>
            <Button
              disabled={busy || !Object.values(patch).some(Boolean)}
              onClick={applyBulk}
            >
              <Check />
              {busy ? '保存中…' : '确认修改 ' + selected.length + ' 条'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
