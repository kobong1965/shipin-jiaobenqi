import { useEffect, useRef, useState } from 'react';
import type { SkillInfo } from '../../../../packages/contracts';
import { Icon } from '../ui';
import { getSkillPreview } from '../skills/skill-preview';
import { SkillPreviewModal } from '../skills/SkillPreviewModal';
import { SkillThumbnail } from '../skills/SkillThumbnail';

export function SkillSelectionCard({ skill, selected, disabled = false, onSelect }: {
  skill: SkillInfo; selected: boolean; disabled?: boolean; onSelect: () => void;
}) {
  const [open, setOpen] = useState(false);
  const previewButton = useRef<HTMLButtonElement>(null);
  const wasOpen = useRef(false);
  const preview = getSkillPreview(skill.files);
  useEffect(() => {
    if (wasOpen.current && !open) previewButton.current?.focus({ preventScroll: true });
    wasOpen.current = open;
  }, [open]);

  return <article className={`skill-card skill-selection-card compact-skill-card ${selected ? 'selected' : ''}`} aria-label={skill.name}>
    <div className="card-meta"><span className="duration">{Math.round(skill.duration * 100) / 100}s</span></div>
    {preview ? <button ref={previewButton} type="button" className="skill-preview-thumb" aria-label={`${preview.video ? '播放效果视频' : '查看参考图片'}：${skill.name}`} onClick={() => setOpen(true)}>
      <SkillThumbnail files={skill.files}/>
      <span className="skill-preview-action" aria-hidden="true">{preview.video ? <span className="preview-play"><Icon name="play"/></span> : <Icon name="image"/>}</span>
      <span className="skill-preview-caption">{preview.video ? '预览' : '看图'}</span>
    </button> : <div className="skill-preview-thumb skill-preview-empty" role="img" aria-label={`${skill.name}未提供预览素材`} title="此 Skill 包没有附带视频或封面，可到脚本库补传"><Icon name="image"/><span>未提供预览素材</span></div>}
    <button type="button" className="skill-select-button" disabled={disabled} aria-label={`选择脚本：${skill.name}`} aria-pressed={selected} onClick={onSelect}>
      <span className="skill-card-copy"><span className="skill-card-title" title={skill.name}>{skill.name}</span></span>
      <span className="card-bottom"><span className="select-mark" aria-hidden="true"><Icon name={selected ? 'check' : 'plus'}/></span></span>
    </button>
    {open && preview ? <SkillPreviewModal name={skill.name} version={skill.version} preview={preview} onClose={() => setOpen(false)}/> : null}
  </article>;
}

