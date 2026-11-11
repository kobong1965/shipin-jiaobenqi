import type { SkillInfo } from '../../../../packages/contracts';
import './skill-category.css';

export const SKILL_CATEGORIES = [
  { value: 'us-men', label: '美区男装' },
  { value: 'cn-douyin', label: '国内抖音服装' },
  { value: 'us-women', label: '美区女装' },
] as const;

export type SkillCategoryValue = '' | typeof SKILL_CATEGORIES[number]['value'];
export type SkillCategoryFilterValue = 'all' | SkillCategoryValue;

export function skillCategory(skill: Pick<SkillInfo, 'tags'> & { category?: string | null }): SkillCategoryValue {
  const value = skill.category === undefined
    ? skill.tags.find(tag => tag.startsWith('category:'))?.slice('category:'.length)
    : skill.category;
  return SKILL_CATEGORIES.some(category => category.value === value) ? value as SkillCategoryValue : '';
}

export function skillCategoryLabel(value: SkillCategoryValue) {
  return SKILL_CATEGORIES.find(category => category.value === value)?.label ?? '未分类';
}

export function visibleSkillTags(tags: readonly string[]) {
  return tags.filter(tag => !tag.startsWith('category:'));
}

export function SkillCategoryFilter({ value, onChange, skills, label = '筛选脚本分类' }: {
  value: SkillCategoryFilterValue; onChange: (value: SkillCategoryFilterValue) => void;
  skills?: readonly SkillInfo[]; label?: string;
}) {
  const options: { value: SkillCategoryFilterValue; label: string }[] = [
    { value: 'all', label: '全部' }, ...SKILL_CATEGORIES, { value: '', label: '未分类' },
  ];
  return <div className="skill-category-filter" role="group" aria-label={label}>
    {options.map(option => <button key={option.value || 'uncategorized'} type="button"
      className={value === option.value ? 'active' : ''} aria-pressed={value === option.value}
      onClick={() => onChange(option.value)}>
      {option.label}{skills ? <span className="skill-category-count">{option.value === 'all' ? skills.length : skills.filter(skill => skillCategory(skill) === option.value).length}</span> : null}
    </button>)}
  </div>;
}

export function SkillCategorySelect({ value, onChange, label = '脚本分类', ariaLabel, disabled = false }: {
  value: SkillCategoryValue; onChange: (value: SkillCategoryValue) => void; label?: string; ariaLabel?: string; disabled?: boolean;
}) {
  return <label className="skill-category-select"><span>{label}</span><select aria-label={ariaLabel ?? label} value={value} disabled={disabled}
    onChange={event => onChange(event.target.value as SkillCategoryValue)}>
    <option value="">未分类</option>
    {SKILL_CATEGORIES.map(category => <option key={category.value} value={category.value}>{category.label}</option>)}
  </select></label>;
}
