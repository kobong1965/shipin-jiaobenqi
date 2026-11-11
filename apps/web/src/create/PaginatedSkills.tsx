import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import type { SkillInfo } from '../../../../packages/contracts';
import { SKILL_CATEGORIES, skillCategory } from '../skills/SkillCategory';
import { SkillSelectionCard } from './SkillSelectionCard';

export function PaginatedSkills({ skills, selectedIds, busy, onSelect }: {
  skills: SkillInfo[]; selectedIds: string[]; busy: boolean; onSelect: (skill: SkillInfo) => void;
}) {
  const viewport = useRef<HTMLDivElement>(null);
  const [category, setCategory] = useState('all');
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(0);
  const [layout, setLayout] = useState({ columns: 4, rows: 2 });
  const filtered = skills.filter(s => (category === 'all' || skillCategory(s) === category) && (!query.trim() || s.name.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase())));
  const pageSize = layout.columns * layout.rows;
  const pages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const current = Math.min(page, pages - 1);
  useLayoutEffect(() => {
    const node = viewport.current;
    if (!node) return;
    const observer = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      if (width < 1 || height < 1) return;
      const font = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
      const columns = Math.max(1, Math.min(8, Math.floor((width + 12) / (10 * font + 12))));
      const rows = Math.max(1, Math.min(4, Math.floor((height + 12) / (11.5 * font + 12))));
      setLayout(old => old.columns === columns && old.rows === rows ? old : { columns, rows });
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);
  const oldSize = useRef(pageSize);
  useEffect(() => {
    if (oldSize.current !== pageSize) {
      const previous = oldSize.current;
      setPage(value => Math.floor(value * previous / pageSize));
      oldSize.current = pageSize;
    }
  }, [pageSize]);
  useEffect(() => { setPage(value => Math.min(value, pages - 1)); }, [pages]);
  return <>
    <div className="skill-picker-toolbar">
      <div className="skill-category-tabs" role="group" aria-label="脚本分类">
        {[{ value: 'all', label: '全部' }, ...SKILL_CATEGORIES, { value: '', label: '未分类' }].map(item => <button type="button" key={item.value} aria-pressed={category === item.value} className={category === item.value ? 'active' : ''} onClick={() => { setCategory(item.value); setPage(0); }}>{item.label}<span>{skills.filter(s => item.value === 'all' || skillCategory(s) === item.value).length}</span></button>)}
      </div>
      <input type="search" aria-label="搜索脚本" placeholder="搜索脚本" value={query} onChange={e => { setQuery(e.target.value); setPage(0); }}/>
    </div>
    <div ref={viewport} className="paged-skill-viewport" role="region" aria-label="分页脚本">
      {filtered.length ? <div className="skill-grid compact-skill-grid paged-skill-grid" style={{ '--skill-columns': layout.columns, '--skill-rows': layout.rows } as CSSProperties}>
        {filtered.slice(current * pageSize, (current + 1) * pageSize).map(skill => <SkillSelectionCard key={skill.versionId} skill={skill} selected={selectedIds.includes(skill.versionId)} disabled={busy} onSelect={() => onSelect(skill)}/>)}
      </div> : <div className="paged-skill-empty">{query ? '没有找到匹配的脚本' : '此分类暂无脚本，可在脚本库设置分类或导入新脚本。'}</div>}
    </div>
    <nav className="skill-pagination" aria-label="脚本翻页">
      <span className="skill-page-summary" role="status">{filtered.length ? `${current * pageSize + 1}–${Math.min((current + 1) * pageSize, filtered.length)} / ${filtered.length} 个` : '0 个脚本'}<small>每页 {layout.rows} 行 · {layout.columns} 列</small></span>
      <div className="inline"><button type="button" aria-label="上一页脚本" disabled={current === 0} onClick={() => setPage(current - 1)}>上一页</button><label className="skill-page-jump"><select aria-label="脚本页码" value={current} onChange={e => setPage(Number(e.target.value))}>{Array.from({ length: pages }, (_, i) => <option key={i} value={i}>第 {i + 1} / {pages} 页</option>)}</select></label><button type="button" aria-label="下一页脚本" disabled={current >= pages - 1} onClick={() => setPage(current + 1)}>下一页</button></div>
    </nav>
  </>;
}
