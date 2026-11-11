import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import type { AppContext } from '../../apps/api/context';
import { AppError } from '../../apps/api/context';
import { ownedMedia, mediaBytes } from '../storage/private-files';
import { canvasError } from './cli';
import type { CanvasPlan } from './planner';
import type { ImportRow } from './import-service';
import { planCanvasLayout } from './layout';
import { VmnhClient, VmnhClientError, type VmnhProjectDocument as VmnhProject, type VmnhMedia } from './vmnh-client';

type LocalPlan = CanvasPlan & { localMedia?: Record<string, { id: string; url: string; width?: number; height?: number }>; localProjectName?: string };
type Node = Record<string, any>;
export const vmnhNodeId = (importId: string, key: string) => 'sw-' + createHash('sha256').update(importId + ':' + key).digest('hex').slice(0, 40);
export function validateVmnhPlan(plan: CanvasPlan) {
  if (plan.materials.some(material => material.mime === 'video/mp4')) throw new Error('此脚本必须携带原对标视频，但当前本地 V-MNH 的视频生成节点不支持原视频输入；请选择 LibTV 导入。必需素材不会被省略。');
}
export function planVmnhLayout(plan: LocalPlan) {
  // V-MNH image nodes have a native width of 656px, regardless of canvasWidth.
  // Reserve their real aspect-ratio height as well as the title/toolbar area.
  const mediaHeight = Math.max(736, ...plan.materials.map(material => {
    const media = plan.localMedia?.[material.sourceId ?? material.id];
    return media?.width && media.height ? Math.ceil(656 * media.height / media.width) + 80 : 1248;
  }));
  return planCanvasLayout(plan, { mediaSize: { width: 656, height: mediaHeight }, textWidth: 656, videoSize: { width: 656, height: 600 } });
}

/** Append a complete workflow without changing any existing node or project setting. */
export function mergeVmnhPlan(project: VmnhProject, importId: string, plan: LocalPlan) {
  validateVmnhPlan(plan);
  const layout = planVmnhLayout(plan);
  const nodes = (project.nodes ?? []) as Node[];
  const groups = (project.groups ?? []) as Node[];
  const origin = plan.origin ?? { x: nodes.length ? Math.max(...nodes.map(node => {
    if (!Number.isFinite(node.x) || !Number.isFinite(node.y)) throw new Error('无法读取现有本地节点位置，已停止导入');
    return node.x + Math.max(656, Number(node.canvasWidth) || 0);
  })) + 400 : 0, y: 0 };
  const point = (key: string) => {
    const rect = layout.positions[key];
    if (!rect) throw new Error('本地工作流缺少节点布局');
    return { x: rect.x + origin.x, y: rect.y + origin.y, canvasWidth: rect.width, canvasHeight: rect.height };
  };
  const id = (key: string) => vmnhNodeId(importId, key);
  const groupFor = (key: string) => {
    const group = layout.groups.find(item => item.nodeKeys.includes(key));
    return group ? id('group:' + group.key) : undefined;
  };
  const additions: Node[] = [];
  const recordIds = new Set<string>();
  for (const material of plan.materials) {
    const media = plan.localMedia?.[material.sourceId ?? material.id];
    if (!media) throw new Error('本地画布素材尚未上传完整');
    additions.push({ id: id(material.id), ...point(material.id), type: material.mime.startsWith('video/') ? 'Video' : 'Image',
      kind: material.mime.startsWith('video/') ? 'video-input' : 'image-input', model: material.mime.startsWith('video/') ? 'video-upload' : 'image-upload',
      title: material.name, prompt: '', status: 'success', resultUrl: media.url, resultUrls: [media.url],
      ...(media.width && media.height ? { resultAspectRatio: `${media.width}/${media.height}` } : {}),
      aspectRatio: 'Auto', resolution: 'Auto', outputCount: 1, parentIds: [], groupId: groupFor(material.id), workbenchImportId: importId });
  }
  for (const batch of plan.batches) {
    const textIds: string[] = [];
    for (const text of batch.texts) {
      const nodeId = id(text.name);
      if (text.purpose === 'product-record') recordIds.add(nodeId); else textIds.push(nodeId);
      additions.push({ id: nodeId, ...point(text.name), type: 'Text', kind: 'prompt', title: text.name,
        prompt: text.content, textMode: 'editing', status: 'idle', model: '', aspectRatio: 'Auto', resolution: 'Auto',
        parentIds: [], groupId: groupFor(text.name), workbenchImportId: importId });
    }
    additions.push({ id: id(batch.video.name), ...point(batch.video.name), type: 'Video', kind: 'gpt-video', title: batch.video.name,
      // V-MNH concatenates this field with every connected Text parent's prompt.
      // The complete prompt is already preserved in those numbered text nodes.
      prompt: '完整遵循已连接的提示词文本，按编号顺序阅读，保留全部商品、分镜、动作、台词与声音要求。', status: 'idle', model: 'video-generator', videoModel: 'seedance-2.5-720p',
      aspectRatio: '9:16', resolution: '720p', outputCount: 1, videoGenerationMode: 'image-to-video',
      ...(batch.video.duration ? { videoDuration: batch.video.duration } : {}),
      parentIds: [...batch.materialIds.map(id), ...textIds], groupId: groupFor(batch.video.name), workbenchImportId: importId });
  }
  const newGroups = layout.groups.map(group => ({ id: id('group:' + group.key), nodeIds: group.nodeKeys.map(id), label: group.name, labelColor: '#665bd6', labelFontSize: 22, workbenchImportId: importId }));
  const existing = new Map(nodes.map(node => [node.id, node]));
  for (const node of additions) {
    const prior = existing.get(node.id);
    if (!prior) continue;
    if (prior.type !== node.type || prior.kind !== node.kind || prior.prompt !== node.prompt || prior.groupId !== node.groupId
      || JSON.stringify(prior.parentIds ?? []) !== JSON.stringify(node.parentIds)
      || (node.resultUrl && prior.resultUrl !== node.resultUrl)) throw new Error('本地画布中的导入节点已被修改，已保留现有内容；请另建工作流');
    if (node.kind === 'gpt-video' && (prior.resultUrl || prior.resultUrls?.length || prior.jobId || prior.status !== 'idle')) throw new Error('本地视频节点已有任务或结果，已保留现有内容；请另建工作流');
  }
  const existingGroups = new Map(groups.map(group => [group.id, group]));
  for (const group of newGroups) {
    const prior = existingGroups.get(group.id);
    if (prior && (prior.label !== group.label || JSON.stringify(prior.nodeIds) !== JSON.stringify(group.nodeIds))) throw new Error('本地导入分组已被修改，已保留现有画布');
  }
  if (additions.some(node => node.parentIds.some((parent: string) => recordIds.has(parent)))) throw new Error('商品资料节点不能作为视频生成输入');
  return { document: { ...project, nodes: [...nodes, ...additions.filter(node => !existing.has(node.id))], groups: [...groups, ...newGroups.filter(group => !existingGroups.has(group.id))] }, nodes: additions, groups: newGroups, origin };
}

/** One ETag-protected graph save. Retries reuse project IDs, media and node IDs. */
export class VmnhImportRunner {
  private chain: Promise<unknown> = Promise.resolve();
  private stopping = false;
  constructor(private context: AppContext, private client: VmnhClient) {}
  enqueue(id: string) {
    if (this.stopping) throw new AppError(503, '本地画布导入正在关闭，请稍后重试');
    this.chain = this.chain.then(() => this.run(id)).catch(error => console.error('[vmnh-import]', canvasError(error)));
  }
  async close() { this.stopping = true; await this.chain; }
  private async run(importId: string) {
    const db = this.context.db;
    const row = (await db.query("UPDATE canvas_imports SET status='running',error=null,updated_at=now() WHERE id=$1 AND status='queued' AND plan->>'provider'='vmnh' RETURNING *", [importId])).rows[0] as ImportRow | undefined;
    if (!row) return;
    const plan = row.plan as LocalPlan;
    const persist = () => db.query('UPDATE canvas_imports SET project_id=$2,plan=$3,steps=$4,updated_at=now() WHERE id=$1', [row.id, row.project_id, JSON.stringify(plan), JSON.stringify(row.steps)]);
    const mark = async (key: string, status: 'running' | 'succeeded', nodeKey?: string) => {
      const step = row.steps.find(item => item.key === key);
      if (!step) throw new Error('本地导入步骤记录缺失');
      step.status = status; if (nodeKey) step.nodeKey = nodeKey;
      await persist();
    };
    try {
      validateVmnhPlan(plan);
      plan.localBaseUrl = await this.client.resolveBaseUrl();
      await mark('canvas', 'running');
      if (!row.project_id) {
        row.project_id = 'workbench-' + row.id;
        await persist();
      }
      const projectId = row.project_id;
      if (projectId === 'workbench-' + row.id && row.new_project_name) await this.client.createProject(projectId, row.new_project_name);
      let snapshot = await this.client.getProject(projectId);
      plan.localProjectName = snapshot.document.name;
      await mark('canvas', 'succeeded');
      plan.localMedia ??= {};
      let knownMedia: VmnhMedia[] = await this.client.listMedia(projectId);
      for (const material of plan.materials) {
        await mark('media:' + material.id, 'running');
        const sourceId = material.sourceId ?? material.id;
        if (plan.localMedia[sourceId] && !knownMedia.some(item => item.id === plan.localMedia![sourceId].id)) throw new Error('先前导入的本地素材已被移除，请另建工作流，避免覆盖已编辑节点');
        if (!plan.localMedia[sourceId]) {
          const media = material.kind === 'benchmark'
            ? (await db.query(`SELECT m.* FROM media m WHERE m.id=$1 AND EXISTS (SELECT 1 FROM skill_files f JOIN skill_versions v ON v.id=f.version_id JOIN skills s ON s.id=v.skill_id WHERE f.media_id=m.id AND v.id=ANY($2::uuid[]) AND (s.owner_id=$3 OR s.visibility='public'))`, [sourceId, material.skillVersionIds ?? [], row.owner_id])).rows[0]
            : await ownedMedia(this.context, sourceId, row.owner_id);
          if (!media) throw new Error('原对标视频不存在或已无权访问');
          if (!['image/png', 'image/jpeg', 'image/webp'].includes(media.mime) && !(media.mime === 'video/mp4' && material.kind === 'benchmark')) throw new Error('本地画布只导入商品图、已确认图片和必需原对标');
          const bytes = await mediaBytes(this.context, media);
          const dimensions = media.mime.startsWith('image/') ? await sharp(bytes).metadata() : {};
          const digest = createHash('sha256').update(bytes).digest('hex');
          let uploaded = knownMedia.find(item => item.sha256 === digest && item.mime === media.mime);
          if (!uploaded) { uploaded = await this.client.uploadMedia(projectId, media.name, media.mime, bytes); knownMedia.push(uploaded); }
          plan.localMedia[sourceId] = { id: uploaded.id, url: uploaded.url, ...(dimensions.width && dimensions.height ? { width: dimensions.width, height: dimensions.height } : {}) };
          await persist();
        }
        await mark('media:' + material.id, 'succeeded');
      }
      // Re-read after uploads; upload side effects must not make the graph snapshot stale.
      snapshot = await this.client.getProject(projectId);
      const merged = mergeVmnhPlan(snapshot.document, row.id, plan);
      if (row.new_project_name && snapshot.document.nodes.length === 0) {
        const bounds = planVmnhLayout(plan).bounds;
        merged.document.viewport = { x: 40, y: 40, zoom: Math.max(0.08, Math.min(0.55, 1100 / Math.max(1, bounds.width), 650 / Math.max(1, bounds.height))) };
      }
      plan.origin = merged.origin; await persist();
      const backupRoot = path.join(this.context.dataRoot, 'canvas-backups');
      await mkdir(backupRoot, { recursive: true });
      await writeFile(path.join(backupRoot, row.id + '-' + Date.now() + '.json'), JSON.stringify(snapshot.document), { flag: 'wx' });
      for (const step of row.steps.filter(item => !item.key.startsWith('media:') && item.key !== 'canvas')) step.status = 'running';
      await persist();
      // Existing user content and settings are copied intact; conflict stops the write.
      await this.client.saveProject(projectId, merged.document, snapshot.etag);
      const saved = (await this.client.getProject(projectId)).document;
      const actual = new Map((saved.nodes as Node[]).map(node => [node.id, node]));
      for (const expected of merged.nodes) {
        const found = actual.get(expected.id);
        if (!found || found.prompt !== expected.prompt || JSON.stringify(found.parentIds ?? []) !== JSON.stringify(expected.parentIds) || (expected.resultUrl && found.resultUrl !== expected.resultUrl)) throw new Error('本地工作流尚未完整保存，请继续导入核对');
      }
      for (const expected of merged.groups) {
        const found = (saved.groups as Node[]).find(group => group.id === expected.id);
        if (!found || JSON.stringify(found.nodeIds) !== JSON.stringify(expected.nodeIds)) throw new Error('本地脚本分组尚未完整保存');
      }
      for (const step of row.steps) {
        step.status = 'succeeded';
        if (step.key.startsWith('media:')) step.nodeKey = vmnhNodeId(row.id, step.key.slice(6));
        if (step.key.startsWith('group:')) step.nodeKey = vmnhNodeId(row.id, step.key);
      }
      await persist();
      await db.query("UPDATE canvas_imports SET status='succeeded',error=null,updated_at=now() WHERE id=$1", [row.id]);
    } catch (error) {
      const message = error instanceof VmnhClientError && [409, 412, 428].includes(error.statusCode)
        ? '目标本地画布在导入期间发生变化，已保留最新内容；点击继续导入重新读取后追加。' : canvasError(error);
      await db.query("UPDATE canvas_imports SET status='failed',error=$2,updated_at=now() WHERE id=$1", [row.id, message]);
    }
  }
}
