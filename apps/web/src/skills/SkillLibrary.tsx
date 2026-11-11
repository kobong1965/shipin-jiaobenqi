import { useState } from 'react';
import { SkillThumbnail } from './SkillThumbnail';
import { getSkillPreview } from './skill-preview';
import { SkillPreviewModal } from './SkillPreviewModal';
import { api, mediaUrl, upload } from '../api';
import { useLoad, useWorkspace } from '../workspace';
import { Empty, Message, Modal, AsyncButton, kindLabel } from '../ui';
import { FileDropzone } from '../uploads/FileDropzone';
import { SkillImport } from './SkillImport';
import { SkillCategoryFilter, SkillCategorySelect, skillCategory, visibleSkillTags, type SkillCategoryValue, type SkillCategoryFilterValue } from './SkillCategory';
import type { SkillInfo } from '../../../../packages/contracts';

export function SkillLibrary() {
  const { user, start, notify } = useWorkspace(); const { data, error, loading, refresh, setData } = useLoad<SkillInfo[]>('/api/skills');
  const [previewSkill, setPreviewSkill] = useState<SkillInfo | null>(null);
  const [category, setCategory] = useState<SkillCategoryFilterValue>('all');
  const [savingCategories, setSavingCategories] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false); const [query, setQuery] = useState(''); const [importing, setImporting] = useState(false); const [detail, setDetail] = useState<(SkillInfo & { versions?: { id: string; number: number }[] }) | null>(null); const [editing, setEditing] = useState<SkillInfo | undefined>(undefined); const [operationError, setOperationError] = useState('');
  async function show(id: string, version?: string) { setOperationError(''); try { setDetail(await api(`/api/skills/${id}${version ? `?version=${version}` : ''}`)); } catch (e) { setOperationError((e as Error).message); } }
  function useSkill(skill: SkillInfo) { start({ selections: [{ id: skill.id, versionId: skill.versionId, duration: skill.duration }], targetDuration: skill.duration }); }
  async function changeCategory(skill: SkillInfo, value: SkillCategoryValue) {
    if (savingCategories.includes(skill.id)) return;
    setSavingCategories(current => [...current, skill.id]); setOperationError('');
    try {
      await api(`/api/skills/${skill.id}/category`, 'PATCH', { category: value || null });
      const patch = (current: SkillInfo) => ({ ...current, category: value || null, tags: [...visibleSkillTags(current.tags), ...(value ? [`category:${value}`] : [])] });
      setData(current => current?.map(item => item.id === skill.id ? patch(item) : item) ?? null);
      setDetail(current => current?.id === skill.id ? { ...current, ...patch(current) } : current);
      window.dispatchEvent(new CustomEvent('workbench:skills-changed'));
      notify('脚本分类已保存');
    } catch (failure) { setOperationError((failure as Error).message); }
    finally { setSavingCategories(current => current.filter(id => id !== skill.id)); }
  }
  const visible = data?.filter(skill => (category === 'all' || skillCategory(skill) === category)
    && `${skill.name} ${visibleSkillTags(skill.tags).join(' ')}`.toLowerCase().includes(query.trim().toLowerCase())) ?? [];
  return <><div className="toolbar"><input aria-label="搜索脚本" value={query} onChange={e => setQuery(e.target.value)} placeholder="搜索名称或标签…"/><button className="primary" onClick={() => setImporting(true)}>＋ 导入脚本</button></div><div className="skill-library-category-bar"><SkillCategoryFilter value={category} onChange={setCategory} skills={data ?? []}/></div>{error || operationError ? <Message error>{error || operationError}</Message> : null}{loading ? <Message>正在读取脚本库…</Message> : data?.length ? visible.length ? <div className="library-grid">{visible.map(skill => {
    const preview = getSkillPreview(skill.files);
    return <article className="skill-card skill-library-card" key={skill.id}>{preview ? <button type="button" className="skill-library-preview" aria-label={`${preview.video ? '播放效果视频' : '查看参考图片'}：${skill.name}`} onClick={() => setPreviewSkill(skill)}><SkillThumbnail files={skill.files} alt={`${skill.name}视频封面`}/>{preview.video ? <span className="library-cover-play" aria-hidden="true">▶</span> : null}</button> : <div className="skill-library-preview missing-cover"><span>未提供预览素材</span></div>}<div className="card-meta"><span className="tag">{kindLabel[skill.kind]}</span><span className="duration">{skill.duration}s</span></div><h3>{skill.name}</h3><p>{visibleSkillTags(skill.tags).join(' · ') || '已保存的脚本'}</p><small>v{skill.version} · {skill.visibility === 'public' ? '公共库' : '我的私人脚本'} · {skill.files.some(f => f.mime === 'video/mp4' && f.mediaId) ? '有效果视频' : '可补传效果视频'}</small><SkillCategorySelect value={skillCategory(skill)} label="脚本分类" ariaLabel={`${skill.name}的分类`} disabled={skill.ownerId !== user.id || savingCategories.includes(skill.id)} onChange={value => void changeCategory(skill, value)}/><div className="card-bottom"><button className="text-button" onClick={() => void show(skill.id)}>查看脚本</button><button onClick={() => useSkill(skill)}>使用这个脚本</button></div></article>;
  })}</div> : <div className="skill-library-filter-empty"><p>{query.trim() ? '没有找到匹配的脚本' : '这个分类还没有脚本'}</p><button onClick={() => { setQuery(''); setCategory('all'); }}>查看全部脚本</button></div> : error ? null : <Empty title="把验证过的好脚本留下来"><p>支持 ZIP Skill 包和 Markdown 文件。<br/>“停车场上衣”这类完整脚本，导入后即可重复换款。</p><button onClick={() => setImporting(true)}>导入第一个脚本</button></Empty>}
  {previewSkill && getSkillPreview(previewSkill.files) ? <SkillPreviewModal name={previewSkill.name} version={previewSkill.version} preview={getSkillPreview(previewSkill.files)!} onClose={() => setPreviewSkill(null)}/> : null}
  {importing || editing ? <SkillImport existing={editing} initialCategory={category === 'all' ? undefined : category} onClose={() => { setImporting(false); setEditing(undefined); }} onDone={() => { setImporting(false); setEditing(undefined); setDetail(null); void refresh(); window.dispatchEvent(new CustomEvent('workbench:skills-changed')); notify('脚本已保存，旧版本仍保留'); }}/> : null}
  {detail && !editing ? <Modal title={detail.name} onClose={() => { if (!uploading) setDetail(null); }}><div className="inline between"><div className="tags"><span className="tag blue">{kindLabel[detail.kind]}</span><span className="tag gray">{detail.duration} 秒</span><span className="tag gray">{detail.visibility === 'public' ? '公共脚本' : '私人脚本'}</span></div><label>查看版本<select value={detail.versionId} onChange={e => void show(detail.id, e.target.value)}>{detail.versions?.map(v => <option key={v.id} value={v.id}>v{v.number}</option>)}</select></label></div><p className="muted section-space">{detail.source || '未填写来源说明'}</p>{detail.files.filter(f => f.mime === 'video/mp4' && f.mediaId).map(f => <video key={f.path} src={mediaUrl(f.mediaId!)} controls preload="metadata"/>)}{!detail.files.some(f => f.mime === 'video/mp4') ? <Message>尚未添加效果视频；脚本仍可正常使用。</Message> : null}{detail.missing.length ? <Message>缺少引用：{detail.missing.join('、')}</Message> : null}<pre className="source-text">{detail.text}</pre><details className="advanced"><summary>引用资料</summary><div>{detail.files.filter(f => f.text && !/(^|\/)SKILL\.md$/i.test(f.path)).map(f => <details key={f.path}><summary>{f.path}</summary><pre className="source-text">{f.text}</pre></details>)}</div></details>{detail.ownerId === user.id ? <div className="section-space"><FileDropzone label="补传效果视频或封面" kind="preview" disabled={uploading} onFiles={async files => { const file = files[0]; setUploading(true); setOperationError(''); try { const saved = await upload(file); await api(`/api/skills/${detail.id}/preview`, 'POST', { mediaId: saved.id }); await show(detail.id); await refresh(); notify('预览素材已保存'); } finally { setUploading(false); } }}/></div> : null}<div className="modal-footer">{detail.ownerId === user.id ? <><button disabled={uploading} onClick={() => setEditing(detail)}>更新此脚本</button></> : <AsyncButton action={async () => { await api(`/api/skills/${detail.id}/fork`, 'POST', {}); await refresh(); setDetail(null); notify('已另存为私人副本'); }}>另存私人副本</AsyncButton>}<button className="primary" onClick={() => { useSkill(detail); setDetail(null); }}>使用这个脚本</button></div></Modal> : null}</>;
}

