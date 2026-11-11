import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import { MAX_PRODUCT_GROUPS, MAX_TASK_IMAGES, type ProductGroup, type ProductImageSet } from '../../../../packages/contracts';
import type { CatalogSnapshot } from '../../../../packages/contracts/product-catalog';
import { api } from '../api';
import { useLoad } from '../workspace';
import { Empty, Icon, Message, Modal } from '../ui';
import type { ProductChoice } from '../products/product-choice';
import { catalogOptions, manualOptions, savedOptions, optionLabel, optionShop, type PickerOption } from '../products/picker-options';
import { ProductChoiceGrid } from './ProductChoiceGrid';
import './product-set-picker.css';

export function ProductSetPicker({ initialGroups = [], initialIds = [], allowCatalog = false, onChoose, onClose }: {
  initialGroups?: ProductGroup[]; initialIds?: string[]; allowCatalog?: boolean; onChoose: (sets: ProductChoice[]) => void; onClose: () => void;
}) {
  const sets = useLoad<ProductImageSet[]>('/api/product-sets');
  const [catalog, setCatalog] = useState<CatalogSnapshot | null>(null);
  const [catalogError, setCatalogError] = useState('');
  const [catalogLoading, setCatalogLoading] = useState(allowCatalog);
  const [syncing, setSyncing] = useState(false);
  const [shop, setShop] = useState('');
  const [page, setPage] = useState(0);
  const [layout, setLayout] = useState({ columns: 4, rows: 2 });
  const viewport = useRef<HTMLDivElement>(null);
  const [selected, setSelected] = useState<PickerOption[]>(() => savedOptions(initialGroups.length ? initialGroups : initialIds.map(id => ({ productSetId: id, styleNumber: '已选图套', name: '', mediaIds: [] }))));
  const [selecting, setSelecting] = useState(false); const [error, setError] = useState('');
  const active = useRef(true); const closeHandler = useRef(onClose); closeHandler.current = onClose;
  useEffect(() => {
    active.current = true;
    const invalidate = () => { active.current = false; closeHandler.current(); };
    window.addEventListener('hashchange', invalidate);
    if (allowCatalog) void api<CatalogSnapshot>('/api/product-catalog').then(value => { if (active.current) setCatalog(value); })
      .catch(failure => { if (active.current) setCatalogError(failure.message); }).finally(() => { if (active.current) setCatalogLoading(false); });
    return () => { active.current = false; window.removeEventListener('hashchange', invalidate); };
  }, [allowCatalog]);
  const options = [...(allowCatalog && catalog ? catalogOptions(catalog) : []), ...manualOptions(sets.data ?? [])];
  const visible = options.filter(option => !shop || optionShop(option) === shop);
  const shops = [...new Set(options.map(optionShop))].sort((a, b) => a.localeCompare(b, 'zh-CN'));
  const pageSize = layout.columns * layout.rows;
  const pages = Math.max(1, Math.ceil(visible.length / pageSize));
  const current = Math.min(page, pages - 1);
  useLayoutEffect(() => {
    const node = viewport.current;
    if (!node) return;
    const observer = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      if (width < 1 || height < 1) return;
      const style = getComputedStyle(node);
      const font = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
      const gap = parseFloat(style.getPropertyValue('--product-picker-gap')) || 10;
      const columns = Math.max(1, Math.floor((width + gap) / (9.5 * font + gap)));
      const rows = Math.max(1, Math.floor((height + gap) / (12.75 * font + gap)));
      setLayout(old => old.columns === columns && old.rows === rows ? old : { columns, rows });
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);
  const previousSize = useRef(pageSize);
  useEffect(() => {
    if (previousSize.current !== pageSize) {
      const oldSize = previousSize.current;
      setPage(value => Math.floor(value * oldSize / pageSize));
      previousSize.current = pageSize;
    }
  }, [pageSize]);
  useEffect(() => { setPage(value => Math.min(value, pages - 1)); }, [pages]);
  useEffect(() => { if (shop && !shops.includes(shop)) { setShop(''); setPage(0); } }, [shop, shops.join('\n')]);
  const count = new Set(selected.flatMap(option => option.imageKeys)).size;
  const busy = selecting || syncing;
  function toggle(option: PickerOption) {
    if (busy) return; setError('');
    if (selected.some(item => item.key === option.key)) { setSelected(items => items.filter(item => item.key !== option.key)); return; }
    if (option.disabledReason) { setError(option.disabledReason); return; }
    if (selected.length >= MAX_PRODUCT_GROUPS) { setError(`最多选择 ${MAX_PRODUCT_GROUPS} 个款号`); return; }
    const images = new Set([...selected, option].flatMap(item => item.imageKeys));
    if (images.size > MAX_TASK_IMAGES) { setError(`所选图套共 ${images.size} 张图，最多支持 ${MAX_TASK_IMAGES} 张，请减少图套`); return; }
    setSelected(items => [...items, option]);
  }
  function move(index: number, direction: number) {
    setSelected(items => { const next = [...items]; [next[index], next[index + direction]] = [next[index + direction], next[index]]; return next; });
  }
  function close() { active.current = false; onClose(); }
  async function syncCatalog() {
    if (busy) return; setSyncing(true); setCatalogError('');
    try {
      const next = await api<CatalogSnapshot>('/api/product-catalog/sync', 'POST');
      if (!active.current) return;
      setCatalog(next);
      if (selected.some(item => item.request)) { setSelected(items => items.filter(item => !item.request)); setError('产品表已刷新，请重新勾选未载入的产品；已保存款号仍保留原绑定。'); }
    } catch (failure) { if (active.current) setCatalogError((failure as Error).message); }
    finally { if (active.current) setSyncing(false); }
  }
  async function choose() {
    if (busy || !selected.length) return;
    const unavailable = selected.find(option => option.disabledReason || (!option.savedUrl && !option.request));
    if (unavailable) { setError(unavailable.disabledReason || '款号资料不可用，请重新选择'); return; }
    const route = location.hash; setSelecting(true); setError('');
    try {
      const latest: ProductChoice[] = [];
      for (const option of selected) {
        if (!active.current || location.hash !== route) return;
        latest.push(option.savedUrl ? await api<ProductChoice>(option.savedUrl)
          : await api<ProductChoice>('/api/product-catalog/selections', 'POST', option.request));
      }
      const total = new Set(latest.flatMap(set => set.media.map(file => file.id))).size;
      if (total > MAX_TASK_IMAGES) throw new Error(`图套已更新，现有 ${total} 张图，超过 ${MAX_TASK_IMAGES} 张；请调整选择，不会删图`);
      if (active.current && location.hash === route) onChoose(latest);
    } catch (failure) { if (active.current) setError((failure as Error).message); }
    finally { if (active.current) setSelecting(false); }
  }
  return <Modal title="选择款号" onClose={close} className="product-set-picker-modal" headerActions={<div className="product-picker-toolbar">
    <label className="product-picker-shop-filter"><select aria-label="店铺分类" value={shop} disabled={busy} onChange={event => { setShop(event.target.value); setPage(0); }}><option value="">全部店铺 · {options.length} 款</option>{shops.map(name => <option key={name} value={name}>{name} · {options.filter(option => optionShop(option) === name).length} 款</option>)}</select></label>
    {allowCatalog ? <button type="button" className="product-picker-sync" disabled={busy} onClick={() => void syncCatalog()}><Icon name="refresh"/>{syncing ? '同步中…' : '同步产品表'}</button> : null}
    <button type="button" onClick={close}>取消</button>
    <button type="button" className="primary" aria-label="使用所选款号" disabled={busy || !selected.length || sets.loading || catalogLoading} aria-busy={selecting || undefined} onClick={() => void choose()}>{selecting ? '载入中' : '使用'}</button>
  </div>}>
    <div className="product-picker-dialog">
    <div className="product-picker-selection-bar"><span className="product-picker-selected-count" role="status">已选 {selected.length} / {MAX_PRODUCT_GROUPS} 套 · {count} / {MAX_TASK_IMAGES} 张</span>
    {selected.length ? <ol className="product-set-selected-order" aria-label="已选款号">{selected.map((option, index) => {
      const label = optionLabel(option);
      return <li key={option.key} title={`${label} · ${optionShop(option)}`}><span><b>{index + 1}</b>{option.styleNumber}</span><div className="inline">
        <button type="button" aria-label={`上移款号：${label}`} disabled={busy || index === 0} onClick={() => move(index, -1)}>←</button>
        <button type="button" aria-label={`下移款号：${label}`} disabled={busy || index === selected.length - 1} onClick={() => move(index, 1)}>→</button>
        <button type="button" aria-label={`移除款号：${label}`} disabled={busy} onClick={() => toggle(option)}><Icon name="close"/></button>
      </div></li>;
    })}</ol> : <span className="product-picker-hint">点击主图选择，可跨页多选</span>}
    </div>
    {sets.error || error ? <Message error>{sets.error || error}{sets.error ? <button onClick={() => void sets.refresh()}>重试图套</button> : null}</Message> : null}
    {catalogError || catalog?.stale ? <Message error>{catalogError || catalog?.error || '产品资料已过期，请重新同步'}</Message> : null}
    <div ref={viewport} className="product-picker-viewport" role="region" aria-label="分页款号" style={{ '--product-columns': layout.columns } as CSSProperties}>
      {sets.loading || catalogLoading ? <Message>正在读取款号…</Message> : visible.length ? <ProductChoiceGrid options={visible.slice(current * pageSize, (current + 1) * pageSize)} selected={selected} disabled={busy} toggle={toggle}/>
        : <Empty title={shop ? '此店铺暂无可选款号' : '暂无可选款号'}><p>{allowCatalog ? '同步产品表，或在素材页保存图套后选择。' : '可在素材页保存款号和产品图片。'}</p></Empty>}
    </div>
    <nav className="product-picker-pagination" aria-label="款号翻页">
      <span className="product-picker-page-summary" role="status">{visible.length ? `${current * pageSize + 1}–${Math.min((current + 1) * pageSize, visible.length)} / ${visible.length} 款` : '0 款'}<small>每页 {layout.rows} 行 · {layout.columns} 列</small></span>
      <div className="inline"><button type="button" aria-label="上一页款号" disabled={current === 0} onClick={() => setPage(current - 1)}>上一页</button><span className="product-picker-page-number" aria-label="款号页码">{current + 1} / {pages}</span><button type="button" aria-label="下一页款号" disabled={current >= pages - 1} onClick={() => setPage(current + 1)}>下一页</button></div>
    </nav>
    </div>
  </Modal>;
}

