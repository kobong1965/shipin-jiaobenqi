// The installed build imports its shared UI helpers as e/i/m/o/p/r/s/u and React as g.
function v({ initial, onSaved, onClose }) {
  const Modal = e, UploadDrop = u, Icon = o, Notice = p;
  const [styleNumber, setStyleNumber] = g.useState(initial?.styleNumber ?? '');
  const [name, setName] = g.useState(initial?.name ?? '');
  const [category, setCategory] = g.useState(initial?.category ?? 'uncategorized');
  const [media, setMedia] = g.useState(initial?.media ?? []);
  const [busy, setBusy] = g.useState(false);
  const [error, setError] = g.useState('');
  const saving = g.useRef(false);
  const hasProductImage = media.some(image => image.role === 'product');
  const canSave = styleNumber.trim().length > 0 && hasProductImage && !busy;
  const categories = [
    ['uncategorized', '未分类'],
    ['us-men', '美区男装'],
    ['us-women', '美区女装'],
    ['douyin-clothing', '抖音服装'],
  ];

  async function upload(files) {
    setBusy(true);
    setError('');
    try {
      const result = await m(files, i, image => setMedia(previous => [
        ...previous,
        { id: image.id, name: image.name, role: previous.length ? 'detail' : 'product' },
      ]));
      if (result.failures.length) throw Error(`已上传 ${result.succeeded} 张；未成功：${result.failures.join('；')}`);
    } finally { setBusy(false); }
  }

  async function save() {
    if (saving.current || !canSave) return;
    saving.current = true;
    setBusy(true);
    setError('');
    try {
      onSaved(await s(initial ? `/api/product-sets/${initial.id}` : '/api/product-sets', initial ? 'PUT' : 'POST', {
        styleNumber: styleNumber.trim(),
        name: name.trim(),
        category,
        media: media.map(({ id, role }) => ({ id, role })),
      }));
    } catch (error) {
      setError(error instanceof Error ? error.message : '保存未成功，请重试');
    } finally {
      saving.current = false;
      setBusy(false);
    }
  }

  return <Modal title={initial ? '修改产品图套' : '新建产品图套'} onClose={() => { if (!busy) onClose(); }}>
    <form className="product-set-editor" onSubmit={event => { event.preventDefault(); save(); }}>
      <div className="field-grid">
        <label>款号<input autoFocus required maxLength={80} autoComplete="off" value={styleNumber} disabled={busy} onChange={event => setStyleNumber(event.target.value)} /></label>
        <label>商品名称<input maxLength={100} value={name} disabled={busy} onChange={event => setName(event.target.value)} /></label>
        <label>分类<select aria-label="图套分类" value={category} disabled={busy} onChange={event => setCategory(event.target.value)}>
          {categories.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select></label>
      </div>
      <div className="product-set-image-grid">
        {media.map((image, index) => <div className="product-set-image" key={image.id}>
          <a href={r(image.id)} target="_blank" rel="noreferrer" aria-label={`查看原图：${image.name}`}><img src={r(image.id)} alt={image.name} /></a>
          <label>
            <span className="sr-only">图套图片 {index + 1} 用途</span>
            <select aria-label={`图套图片 ${index + 1} 用途`} value={image.role} disabled={busy} onChange={event => setMedia(previous => previous.map(item => item.id === image.id ? { ...item, role: event.target.value } : item))}>
              <option value="product">主商品图</option><option value="detail">同款细节</option><option value="comparison">对比商品</option>
            </select>
          </label>
          <button type="button" className="text-button" aria-label={`移除图套图片 ${index + 1}`} disabled={busy} onClick={() => setMedia(previous => previous.filter(item => item.id !== image.id))}>移除</button>
        </div>)}
      </div>
      <UploadDrop label={media.length ? '补充图片' : '上传图片'} inputLabel="上传图套图片" kind="image" multiple maxFiles={12 - media.length} disabled={busy || media.length >= 12} hint={`${media.length} / 12 张 · PNG / JPG / WEBP · 单张 ≤ 20 MB`} onFiles={upload} />
      {media.length > 0 && !hasProductImage ? <Notice error>至少保留一张主商品图。</Notice> : null}
      {error ? <Notice error>{error}</Notice> : null}
      <div className="modal-footer">
        <button type="button" disabled={busy} onClick={onClose}>取消</button>
        <button type="submit" className="primary" aria-label="保存产品图套" aria-busy={busy || undefined} disabled={!canSave}><Icon name="save" />{busy ? '处理中' : '保存'}</button>
      </div>
    </form>
  </Modal>;
}
