import { useCallback, useEffect, useRef, useState } from 'react';
import type { ResultRevision, TaskInfo } from '../../../../packages/contracts';
import type { CanvasConnection as Connection, CanvasProjects as Destinations, CanvasImportInfo } from '../../../../packages/canvas/contracts';
import { api } from '../api';
import { AsyncButton, Icon, Message, Modal } from '../ui';
import { useLoad, useWorkspace } from '../workspace';
import { CatalogIdentitySummary } from '../products/CatalogIdentitySummary';
import './canvas.css';

type Provider = 'vmnh' | 'libtv';
type ImportRecord = CanvasImportInfo & { provider?: Provider; projectName?: string | null };
type ProviderConnection = Connection & { url?: string; label?: string };
const providerNames: Record<Provider, string> = { vmnh: '本地 V-MNH', libtv: 'LibTV' };
const providerKey = 'workbench:canvas-provider';
const recordProvider = (record: ImportRecord) => record.provider ?? 'libtv';

function initialProvider(): Provider {
  try { return localStorage.getItem(providerKey) === 'libtv' ? 'libtv' : 'vmnh'; }
  catch { return 'vmnh'; }
}

function ImportProgress({ record, update, connected }: { record: ImportRecord; update: (record: ImportRecord) => void; connected: boolean }) {
  const [error, setError] = useState('');
  const active = record.status === 'queued' || record.status === 'running';
  useEffect(() => { window.dispatchEvent(new CustomEvent('workbench:tasks-changed')); }, [record.id, record.status]);
  useEffect(() => {
    if (!active) return;
    let mounted = true; let busy = false;
    const timer = setInterval(async () => {
      if (busy) return; busy = true;
      try { const next = await api<ImportRecord>(`/api/canvas/imports/${record.id}`); if (mounted) { setError(''); update(next); } }
      catch (e) { if (mounted) setError((e as Error).message); }
      finally { busy = false; }
    }, 1500);
    return () => { mounted = false; clearInterval(timer); };
  }, [active, record.id, update]);
  return <section className="canvas-import-status" aria-label="画布导入进度">
    <div className="canvas-progress-heading"><span className={`canvas-progress-icon ${record.status === 'succeeded' ? 'complete' : ''}`}><Icon name={record.status === 'succeeded' ? 'check' : 'import'}/></span><div><h3>{record.status === 'succeeded' ? '工作流已建立' : active ? '正在建立工作流' : record.status === 'unknown' ? '导入状态待核对' : '导入未完成'}</h3><small>{providerNames[recordProvider(record)]}</small></div><strong>{record.progress}%</strong></div>
    <progress max={100} value={record.progress} aria-label="工作流建立进度"/>
    <ol>{record.steps.map(step => <li key={step.key} data-status={step.status}><span aria-hidden="true">{step.status === 'succeeded' ? '✓' : step.status === 'running' ? '◌' : '·'}</span>{step.label}</li>)}</ol>
    {record.error || error ? <Message error>{record.error || error}</Message> : null}
    <div className="canvas-progress-actions">
      {record.projectUrl ? <a className="canvas-open" href={record.projectUrl} target="_blank" rel="noreferrer" aria-label={recordProvider(record) === 'vmnh' ? '打开本地画布' : '打开画布'}>{recordProvider(record) === 'vmnh' ? '打开本地画布' : '打开画布'}<Icon name="arrow"/></a> : null}
      {['failed', 'unknown'].includes(record.status) ? <AsyncButton disabled={!connected} action={async () => { update(await api<ImportRecord>(`/api/canvas/imports/${record.id}/retry`, 'POST', { key: crypto.randomUUID() })); }}>继续导入</AsyncButton> : null}
    </div>
    {recordProvider(record) === 'vmnh' && record.status === 'succeeded' ? <small className="canvas-local-open-hint">{record.projectName ? <>目标画布：<strong>{record.projectName}</strong>。打开本地画布后，按此名称选择；已打开的画布可刷新查看新增节点。</> : '打开本地画布后，选择本次导入的画布；已打开的画布可刷新查看新增节点。'}</small> : null}
  </section>;
}

function DestinationForm({ task, result, provider, connected, onImported }: { task: TaskInfo; result: ResultRevision; provider: Provider; connected: boolean; onImported: (record: ImportRecord) => void }) {
  const [mode, setMode] = useState<'new' | 'existing'>('new');
  const [workspace, setWorkspace] = useState(''); const [projectId, setProjectId] = useState('');
  const [name, setName] = useState(`${task.name.slice(0, 65)} · 视频工作流`);
  const [query, setQuery] = useState('');
  const [destinations, setDestinations] = useState<Destinations | null>(null);
  const [loading, setLoading] = useState(false); const [error, setError] = useState('');
  const [page, setPage] = useState(1); const [hasMore, setHasMore] = useState(false);
  const requestVersion = useRef(0);
  const loadPage = useCallback(async (nextPage: number) => {
    const version = ++requestVersion.current;
    setLoading(true); setError('');
    if (nextPage === 1) { setDestinations(null); setProjectId(''); setPage(1); setHasMore(false); }
    const parameters = new URLSearchParams({ provider, page: String(nextPage), pageSize: '50', ...(workspace ? { workspace } : {}) });
    try {
      const next = await api<Destinations>(`/api/canvas/projects?${parameters}`);
      if (version !== requestVersion.current) return;
      setDestinations(previous => ({ ...next, projects: [...new Map([
        ...(nextPage > 1 ? previous?.projects ?? [] : []), ...next.projects,
      ].map(project => [project.id, project])).values()] }));
      setPage(nextPage); setHasMore(next.projects.length > 0 && nextPage * 50 < next.total);
    } catch (e) { if (version === requestVersion.current) setError((e as Error).message); }
    finally { if (version === requestVersion.current) setLoading(false); }
  }, [provider, workspace]);
  useEffect(() => {
    if (mode === 'existing' && connected) void loadPage(1);
    return () => { requestVersion.current++; };
  }, [mode, connected, loadPage]);
  const { notify } = useWorkspace();
  const visibleProjects = destinations?.projects.filter(project => project.name.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase())) ?? [];
  const selectedProject = destinations?.projects.find(project => project.id === projectId);
  const valid = mode === 'new' ? Boolean(name.trim()) : Boolean(selectedProject);
  return <section className="canvas-destination" aria-label="选择导入画布">
    <div className="canvas-section-heading"><span className="canvas-step-number">2</span><h3>选择画布</h3></div>
    <div className="canvas-mode-switch" role="group" aria-label="画布导入方式">
      <button type="button" className={mode === 'new' ? 'active' : ''} aria-pressed={mode === 'new'} onClick={() => setMode('new')}><Icon name="plus"/>新建画布</button>
      <button type="button" className={mode === 'existing' ? 'active' : ''} aria-pressed={mode === 'existing'} onClick={() => setMode('existing')}><Icon name="create"/>已有画布</button>
    </div>
    {mode === 'new' ? <label className="canvas-name-field">画布名称<input aria-label="画布名称" value={name} maxLength={100} onChange={e => setName(e.target.value)} placeholder="为这次创作起个名字"/><small>在{providerNames[provider]}中建立独立画布，保留本次脚本和参考图。</small></label> : <div className="canvas-existing-fields">
      {destinations?.workspaces.length ? <label className="canvas-workspace-field">项目空间<select aria-label="项目空间" value={workspace} disabled={loading} onChange={e => { setWorkspace(e.target.value); setProjectId(''); setQuery(''); }}><option value="">全部项目空间</option>{provider === 'libtv' ? <option value="0">根目录</option> : null}{destinations.workspaces.map(item => <option value={item.id} key={item.id}>{item.name}</option>)}</select></label> : null}
      <div className="canvas-project-toolbar"><label className="canvas-search-field"><Icon name="search"/><input type="search" aria-label="搜索目标画布" value={query} onChange={e => setQuery(e.target.value)} placeholder="搜索已加载的画布"/></label><button type="button" className="icon-button" aria-label="刷新画布列表" title="刷新画布" disabled={!connected || loading} onClick={() => void loadPage(1)}><Icon name="refresh"/></button></div>
      {error ? <Message error>{error}<button type="button" className="text-button" disabled={loading || !connected} onClick={() => void loadPage(1)}>重新读取</button></Message> : null}
      {!connected ? <div className="canvas-project-empty">连接{providerNames[provider]}后读取画布列表。</div> : loading && !destinations ? <div className="canvas-project-empty" role="status">正在读取画布…</div> : !error && !visibleProjects.length ? <div className="canvas-project-empty">{query.trim() ? '没有找到匹配的画布，可调整搜索或加载更多。' : '还没有画布，可以选择“新建画布”。'}</div> : visibleProjects.length ? <div className="canvas-project-list" role="group" aria-label="目标画布列表">{visibleProjects.map(project => <button type="button" className={`canvas-project-option ${project.id === projectId ? 'selected' : ''}`} key={project.id} aria-pressed={project.id === projectId} title={project.name} onClick={() => setProjectId(project.id)}><span className="canvas-project-icon"><Icon name="create"/></span><span className="canvas-project-name">{project.name}</span><span className="canvas-project-check" aria-hidden="true">{project.id === projectId ? <Icon name="check"/> : null}</span></button>)}</div> : null}
      <div className="canvas-project-list-footer"><small>{selectedProject ? `已选择：${selectedProject.name}` : destinations ? `已加载 ${destinations.projects.length} / ${destinations.total} 个画布` : ''}</small>{hasMore ? <button type="button" className="text-button" disabled={loading} onClick={() => void loadPage(page + 1)}>{loading ? '正在读取…' : '加载更多画布'}</button> : null}</div>
      {provider === 'vmnh' ? <small className="canvas-existing-hint">导入后刷新本地画布，即可查看新增节点。</small> : null}
    </div>}
    <div className="canvas-submit-footer"><div><Icon name="check"/><span>只建立节点与连接，不自动生成</span></div><AsyncButton className="primary" disabled={!connected || !valid} action={async () => {
      const record = await api<ImportRecord>(`/api/tasks/${task.id}/canvas-imports`, 'POST', { provider, key: crypto.randomUUID(), resultId: result.id, ...(mode === 'new' ? { newProjectName: name.trim() } : { projectId }) });
      onImported(record); notify(`已提交${providerNames[provider]}导入`);
    }}><Icon name="import"/>{provider === 'vmnh' ? '导入本地画布' : '导入 LibTV'}</AsyncButton></div>
  </section>;
}

function ProviderPanel({ task, result, provider }: { task: TaskInfo; result: ResultRevision; provider: Provider }) {
  const connection = useLoad<ProviderConnection>(`/api/canvas/connection?provider=${provider}`);
  const history = useLoad<ImportRecord[]>(`/api/tasks/${task.id}/canvas-imports?resultId=${result.id}&provider=${provider}`);
  const [record, setRecord] = useState<ImportRecord | null>(null); const [newImport, setNewImport] = useState(false);
  const [reconnecting, setReconnecting] = useState(false);
  // Old records predate provider support and always belong to LibTV.
  const records = history.data?.filter(item => recordProvider(item) === provider) ?? [];
  const shown = record && recordProvider(record) === provider ? record : !newImport ? records[0] : null;
  const connected = !connection.error && connection.data?.available === true && connection.data.connected === true;
  const connectionBusy = connection.loading || reconnecting;
  const reconnect = async () => { setReconnecting(true); try { await connection.refresh(); } finally { setReconnecting(false); } };
  return <>
    <div className={`canvas-connection ${connected ? 'connected' : ''}`} role="status"><span className="canvas-connection-dot"/><div><strong>{connectionBusy ? `正在连接${providerNames[provider]}…` : connected ? `${providerNames[provider]}已连接` : `${providerNames[provider]}未连接`}</strong>{connected ? <small>{connection.data?.accountName || connection.data?.label || (provider === 'vmnh' ? '本机画布服务' : '当前 LibTV 账号')}</small> : null}</div><button type="button" className="text-button" disabled={connectionBusy} onClick={() => void reconnect()}><Icon name="refresh"/>{connectionBusy ? '连接中' : '重新连接'}</button></div>
    {!connectionBusy && !connected ? <Message error>{connection.error || connection.data?.error || (provider === 'vmnh' ? '请先打开本地 V-MNH 画布，再点击重新连接。' : '请先在本机登录 LibTV 官方 CLI，再点击重新连接。')}</Message> : null}
    {shown ? <><ImportProgress key={shown.id} record={shown} update={setRecord} connected={connected && !connectionBusy}/>{shown.status === 'succeeded' || shown.status === 'failed' || shown.status === 'unknown' ? <button type="button" className="canvas-another-import text-button" onClick={() => { setRecord(null); setNewImport(true); }}><Icon name="plus"/>导入到另一个画布</button> : null}</> : history.loading ? <div className="canvas-history-loading" role="status">正在读取导入记录…</div> : history.error ? <Message error>{history.error}<button type="button" className="text-button" onClick={() => void history.refresh()}>重新读取导入记录</button></Message> : <DestinationForm task={task} result={result} provider={provider} connected={connected && !connectionBusy} onImported={setRecord}/>}
    {records.length > 1 || (newImport && records.length > 0) ? <details className="canvas-import-history"><summary>此前的{providerNames[provider]}导入 · {records.length} 条</summary><div>{records.map(item => <button type="button" key={item.id} onClick={() => { setRecord(item); setNewImport(false); }}><span>{item.status === 'succeeded' ? '已导入' : item.status === 'failed' ? '导入未完成' : item.status === 'unknown' ? '待核对' : '导入中'}</span><time dateTime={item.createdAt}>{new Date(item.createdAt).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</time><Icon name="arrow"/></button>)}</div></details> : null}
  </>;
}

export function CanvasImportModal({ task, result, onClose }: { task: TaskInfo; result: ResultRevision; onClose: () => void }) {
  const [provider, setProvider] = useState<Provider>(initialProvider);
  const chooseProvider = (value: Provider) => { setProvider(value); try { localStorage.setItem(providerKey, value); } catch { /* Storage is optional. */ } };
  return <Modal title="导入画布" onClose={onClose}>
    <div className="canvas-import-dialog">
      <div className="canvas-import-summary"><span className="canvas-summary-icon"><Icon name="import"/></span><div><strong>{task.name}</strong><small>R{result.number} · {task.snapshot.media.filter(media => media.mime.startsWith('image/')).length} 张商品／参考图</small></div><span className="canvas-summary-tag">工作流导入</span></div>
      <section className="canvas-provider-section" aria-label="选择画布平台"><div className="canvas-section-heading"><span className="canvas-step-number">1</span><h3>导入到哪里</h3></div><div className="canvas-provider-options" role="group" aria-label="画布平台">
        <button type="button" className={`canvas-provider-card ${provider === 'vmnh' ? 'selected' : ''}`} aria-pressed={provider === 'vmnh'} onClick={() => chooseProvider('vmnh')}><span className="canvas-provider-icon"><Icon name="create"/></span><span className="canvas-provider-copy"><strong>本地 V-MNH</strong><small>本机画布 · 本地工作流</small></span><span className="canvas-provider-check" aria-hidden="true">{provider === 'vmnh' ? <Icon name="check"/> : null}</span></button>
        <button type="button" className={`canvas-provider-card ${provider === 'libtv' ? 'selected' : ''}`} aria-pressed={provider === 'libtv'} onClick={() => chooseProvider('libtv')}><span className="canvas-provider-icon"><Icon name="import"/></span><span className="canvas-provider-copy"><strong>LibTV</strong><small>LibTV 账号中的画布</small></span><span className="canvas-provider-check" aria-hidden="true">{provider === 'libtv' ? <Icon name="check"/> : null}</span></button>
      </div></section>
      <ProviderPanel key={`${provider}:${task.id}:${result.id}`} provider={provider} task={task} result={result}/>
      <CatalogIdentitySummary groups={task.snapshot.input.productGroups}/>
      <p className="canvas-import-footnote">导入后可在目标画布中继续编辑，确认模型、时长、比例和声音后再生成。</p>
    </div>
  </Modal>;
}
