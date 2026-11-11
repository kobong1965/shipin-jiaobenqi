// Installed-workbench customization. Compiled by build-style-picker.mjs.
// Host bindings: l (React), te (Dialog), oe/p (API), wc/xc/Cc/Tc (canonical option helpers).
const STYLE_CATEGORIES = [
  ['us-men', '美区男装'], ['us-women', '美区女装'], ['douyin-clothing', '抖音服装'],
];
const styleCategoryLabel = category => STYLE_CATEGORIES.find(([id]) => id === category)?.[1] || '未分类';

function Dc({ initialGroups = [], initialIds = [], allowCatalog = false, onChoose, onClose }) {
  const Dialog = te;
  const manual = oe('/api/product-sets');
  const [catalog, setCatalog] = l.useState(null);
  const [catalogLoading, setCatalogLoading] = l.useState(allowCatalog);
  const [category, setCategory] = l.useState('');
  const [selected, setSelected] = l.useState(() => wc(initialGroups.length ? initialGroups : initialIds.map(id => ({ productSetId: id, styleNumber: '已选图套', name: '', mediaIds: [] }))));
  const [busy, setBusy] = l.useState(false);
  const [error, setError] = l.useState('');
  const [page, setPage] = l.useState(0);
  const [layout, setLayout] = l.useState({ columns: 4, rows: 2 });
  const alive = l.useRef(true);
  const closeRef = l.useRef(onClose);
  const stageRef = l.useRef(null);
  closeRef.current = onClose;
  l.useEffect(() => {
    alive.current = true;
    const leave = () => { alive.current = false; closeRef.current(); };
    window.addEventListener('hashchange', leave);
    if (allowCatalog) p('/api/product-catalog').then(value => { if (alive.current) setCatalog(value); })
      .catch(() => { /* Private image sets remain usable when the legacy catalogue is absent. */ })
      .finally(() => { if (alive.current) setCatalogLoading(false); });
    return () => { alive.current = false; window.removeEventListener('hashchange', leave); };
  }, [allowCatalog]);

  l.useLayoutEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const measure = () => {
      const { width, height } = stage.getBoundingClientRect();
      if (!width || !height) return;
      const gap = 12;
      const columns = Math.max(1, Math.floor((width + gap) / ((width < 420 ? 112 : 132) + gap)));
      const cardWidth = (width - (columns - 1) * gap) / columns;
      const rows = Math.max(1, Math.floor((height + gap) / (Math.max(150, cardWidth * .92 + 58) + gap)));
      setLayout(previous => previous.columns === columns && previous.rows === rows ? previous : { columns, rows });
    };
    const observer = new ResizeObserver(measure);
    observer.observe(stage);
    measure();
    return () => observer.disconnect();
  }, []);

  const options = [
    ...(allowCatalog && catalog ? Cc(catalog).map(option => ({ ...option, category: option.category === 'men' ? 'us-men' : 'us-women' })) : []),
    ...xc(manual.data || []).map((option, index) => ({ ...option, category: manual.data[index].category || 'uncategorized' })),
  ];
  const filtered = options.filter(option => !category || option.category === category);
  const pageSize = layout.columns * layout.rows;
  const previousSize = l.useRef(pageSize);
  l.useEffect(() => {
    const oldSize = previousSize.current;
    previousSize.current = pageSize;
    setPage(previous => Math.floor(previous * oldSize / pageSize));
  }, [pageSize]);
  const pages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const currentPage = Math.min(page, pages - 1);
  l.useEffect(() => { if (page !== currentPage) setPage(currentPage); }, [page, currentPage]);
  const visible = filtered.slice(currentPage * pageSize, (currentPage + 1) * pageSize);
  const imageCount = new Set(selected.flatMap(option => option.imageKeys)).size;

  function toggle(option) {
    if (busy) return;
    setError('');
    if (selected.some(item => item.key === option.key)) { setSelected(items => items.filter(item => item.key !== option.key)); return; }
    if (option.disabledReason) { setError(option.disabledReason); return; }
    if (selected.length >= 6) { setError('最多选择 6 个款号'); return; }
    const count = new Set([...selected, option].flatMap(item => item.imageKeys)).size;
    if (count > 36) { setError(`所选图套共 ${count} 张图，最多支持 36 张，请减少图套`); return; }
    setSelected(items => [...items, option]);
  }
  function move(index, offset) {
    setSelected(items => {
      const next = [...items];
      [next[index], next[index + offset]] = [next[index + offset], next[index]];
      return next;
    });
  }
  function close() { alive.current = false; onClose(); }
  async function useSelected() {
    if (busy || !selected.length) return;
    const invalid = selected.find(option => option.disabledReason || (!option.savedUrl && !option.request));
    if (invalid) { setError(invalid.disabledReason || '款号资料不可用，请重新选择'); return; }
    const route = location.hash;
    setBusy(true); setError('');
    try {
      const sets = [];
      for (const option of selected) {
        if (!alive.current || location.hash !== route) return;
        sets.push(option.savedUrl ? await p(option.savedUrl) : await p('/api/product-catalog/selections', 'POST', option.request));
      }
      const count = new Set(sets.flatMap(set => set.media.map(image => image.id))).size;
      if (count > 36) throw Error(`图套已更新，现有 ${count} 张图，超过 36 张；请调整选择，不会删图`);
      if (alive.current && location.hash === route) onChoose(sets);
    } catch (failure) { if (alive.current) setError(failure.message); }
    finally { if (alive.current) setBusy(false); }
  }

  return <Dialog title="选择款号" onClose={close} className="style-picker" actions={
    <div className="style-picker-actions">
      <span role="status">{selected.length} / 6 套 · {imageCount} / 36 张</span>
      <button type="button" onClick={close}>取消</button>
      <button type="button" className="primary" aria-label="使用所选款号" disabled={busy || !selected.length || manual.loading || catalogLoading} aria-busy={busy || undefined} onClick={() => void useSelected()}>{busy ? '载入中…' : '使用'}</button>
    </div>
  }>
    <div className="style-picker-content">
      <div className="style-picker-toolbar">
        <label htmlFor="style-picker-category">分类</label>
        <select id="style-picker-category" aria-label="款号分类" value={category} disabled={busy} onChange={event => { setCategory(event.target.value); setPage(0); }}>
          <option value="">全部分类</option>
          {STYLE_CATEGORIES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          {options.some(option => option.category === 'uncategorized') ? <option value="uncategorized">未分类</option> : null}
        </select>
        <span className="style-picker-total">共 {filtered.length} 款</span>
      </div>
      {manual.error || error ? <div className="style-picker-error" role="alert">{manual.error || error}{manual.error ? <button type="button" onClick={() => void manual.refresh()}>重试</button> : null}</div> : null}
      {selected.length ? <ol className="style-picker-selected" aria-label="已选款号">
        {selected.map((option, index) => <li key={option.key}>
          <span title={Tc(option)}><b>{index + 1}</b> {option.styleNumber}</span>
          <div>
            <button type="button" aria-label={`上移款号：${option.styleNumber}`} disabled={busy || index === 0} onClick={() => move(index, -1)}>↑</button>
            <button type="button" aria-label={`下移款号：${option.styleNumber}`} disabled={busy || index === selected.length - 1} onClick={() => move(index, 1)}>↓</button>
            <button type="button" aria-label={`移除款号：${option.styleNumber}`} disabled={busy} onClick={() => toggle(option)}>×</button>
          </div>
        </li>)}
      </ol> : null}
      <div ref={stageRef} className="style-picker-stage">
        {manual.loading || catalogLoading ? <div className="style-picker-empty" role="status">正在读取款号…</div> : visible.length ?
          <div className="style-picker-grid" style={{ gridTemplateColumns: `repeat(${layout.columns}, minmax(0, 1fr))`, gridTemplateRows: `repeat(${layout.rows}, minmax(0, 1fr))` }}>
            {visible.map(option => {
              const order = selected.findIndex(item => item.key === option.key);
              return <button key={option.key} type="button" className={`style-picker-card${order >= 0 ? ' selected' : ''}`} aria-label={`选择款号：${Tc(option)}，${styleCategoryLabel(option.category)}`} aria-pressed={order >= 0} disabled={busy || !!option.disabledReason} title={option.disabledReason || (option.binding ? Tc(option) : undefined)} onClick={() => toggle(option)}>
                <div className="style-picker-image">{option.coverUrl ? <img src={option.coverUrl} alt="" loading="lazy" /> : <span>暂无图片</span>}</div>
                {order >= 0 ? <span className="style-picker-order" aria-label={`已选第 ${order + 1} 组`}>{order + 1} ✓</span> : null}
                <div className="style-picker-caption"><strong>{option.styleNumber}</strong><span>{styleCategoryLabel(option.category)}</span></div>
              </button>;
            })}
          </div> : <div className="style-picker-empty">{options.length ? '此分类暂无款号' : '暂无可选款号'}</div>}
      </div>
      <nav className="style-picker-pagination" aria-label="款号分页">
        <span aria-live="polite">第 {currentPage + 1} / {pages} 页 · 每页 {pageSize} 款</span>
        <button type="button" aria-label="上一页款号" disabled={busy || currentPage === 0} onClick={() => setPage(currentPage - 1)}>上一页</button>
        <button type="button" aria-label="下一页款号" disabled={busy || currentPage >= pages - 1} onClick={() => setPage(currentPage + 1)}>下一页</button>
      </nav>
    </div>
  </Dialog>;
}
