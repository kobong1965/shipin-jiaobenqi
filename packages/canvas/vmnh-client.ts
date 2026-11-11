import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { homedir } from 'node:os';
import path from 'node:path';
import type { CanvasConnection, CanvasProjects } from './contracts';
import { canvasError } from './cli';

export interface VmnhProjectDocument {
  schemaVersion: number; id: string; name: string; nodes: any[]; groups: any[];
  viewport: { x: number; y: number; zoom: number }; settings?: Record<string, unknown>;
  createdAt?: string; updatedAt?: string; [key: string]: unknown;
}
export interface VmnhMedia {
  id: string; projectId: string; kind: 'image' | 'video' | 'audio'; mime: string;
  bytes: number; sha256: string; url: string; relativePath?: string;
  createdAt?: string; source?: Record<string, unknown>; [key: string]: unknown;
}
export class VmnhClientError extends Error {
  constructor(message: string, public statusCode = 503, public code = 'VMNH_UNAVAILABLE') { super(message); this.name = 'VmnhClientError'; }
}

interface ClientOptions {
  discoveryFile?: string;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
  readDiscovery?: (filename: string) => Promise<string>;
}

const idPattern = /^[A-Za-z0-9_-]{1,128}$/;
const assertId = (id: string) => {
  if (typeof id !== 'string' || !idPattern.test(id)) throw new VmnhClientError('本地画布编号无效', 400, 'VMNH_INVALID_PROJECT_ID');
  return encodeURIComponent(id);
};
const localOrigin = (value: unknown) => {
  if (typeof value !== 'string') throw new VmnhClientError('本地 V-MNH 服务地址无效');
  let url: URL;
  try { url = new URL(value); } catch { throw new VmnhClientError('本地 V-MNH 服务地址无效'); }
  if (url.protocol !== 'http:' || !['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname)
    || url.username || url.password || url.pathname !== '/' || url.search || url.hash) {
    throw new VmnhClientError('本地 V-MNH 连接仅支持本机 HTTP 地址');
  }
  return url.origin;
};
const projectDocument = (value: unknown, id?: string): VmnhProjectDocument => {
  const item = value as VmnhProjectDocument | null;
  if (!item || typeof item !== 'object' || item.schemaVersion !== 1 || !idPattern.test(item.id) || (id && item.id !== id)
    || typeof item.name !== 'string' || !Array.isArray(item.nodes) || !Array.isArray(item.groups)
    || !item.viewport || ![item.viewport.x, item.viewport.y, item.viewport.zoom].every(Number.isFinite)) {
    throw new VmnhClientError('本地 V-MNH 返回的画布内容格式不正确', 502, 'VMNH_INVALID_RESPONSE');
  }
  return item;
};
const mediaRecord = (value: unknown, projectId: string): VmnhMedia => {
  const item = value as VmnhMedia | null;
  if (!item || typeof item !== 'object' || !idPattern.test(item.id) || item.projectId !== projectId
    || !['image', 'video', 'audio'].includes(item.kind) || typeof item.mime !== 'string'
    || !Number.isSafeInteger(item.bytes) || item.bytes < 1 || !/^[a-f0-9]{64}$/i.test(item.sha256)
    || item.url !== `/api/vela/projects/${encodeURIComponent(projectId)}/media/${encodeURIComponent(item.id)}/file`) {
    throw new VmnhClientError('本地 V-MNH 返回的素材信息格式不正确', 502, 'VMNH_INVALID_RESPONSE');
  }
  return item;
};

/** Native companion client. No browser Origin, cookies or pairing secrets are forwarded. */
export class VmnhClient {
  private readonly discoveryFile: string;
  private readonly timeoutMs: number;
  private readonly fetchImpl: typeof fetch;
  private readonly readDiscovery: (filename: string) => Promise<string>;
  constructor(options: ClientOptions = {}) {
    this.discoveryFile = options.discoveryFile ?? path.join(process.env.APPDATA || path.join(homedir(), 'AppData', 'Roaming'), 'Vela AI视频画布', 'runtime-discovery.json');
    this.timeoutMs = options.timeoutMs ?? 15000;
    this.fetchImpl = options.fetchImpl ?? globalThis.fetch;
    this.readDiscovery = options.readDiscovery ?? (filename => readFile(filename, 'utf8'));
  }

  private async request(base: string, route: string, options: { method?: 'GET' | 'POST' | 'PUT'; body?: unknown; etag?: string; timeoutMs?: number } = {}) {
    const origin = localOrigin(base);
    if (!route.startsWith('/api/vela/')) throw new VmnhClientError('不支持的本地画布接口', 400, 'VMNH_INVALID_ROUTE');
    const headers: Record<string, string> = { Accept: 'application/json' };
    if (options.body !== undefined) headers['Content-Type'] = 'application/json';
    if (options.etag) headers['If-Match'] = options.etag;
    let response: Response;
    try {
      response = await this.fetchImpl(origin + route, {
        method: options.method ?? 'GET', headers,
        body: options.body === undefined ? undefined : JSON.stringify(options.body),
        redirect: 'manual', signal: AbortSignal.timeout(options.timeoutMs ?? this.timeoutMs),
      });
    } catch (error) {
      if (error instanceof Error && ['TimeoutError', 'AbortError'].includes(error.name)) {
        throw new VmnhClientError('本地 V-MNH 响应超时，请核对画布后再继续导入', 504, 'VMNH_TIMEOUT');
      }
      throw new VmnhClientError('无法连接本地 V-MNH，请先打开本地画布软件');
    }
    if (response.status >= 300 && response.status < 400) throw new VmnhClientError('本地 V-MNH 返回跳转地址，已停止连接', 502, 'VMNH_REDIRECT_BLOCKED');
    let value: any;
    try {
      if (Number(response.headers.get('Content-Length')) > 64 * 1024 * 1024) throw new Error('response too large');
      const text = await response.text();
      if (text.length > 64 * 1024 * 1024) throw new Error('response too large');
      value = JSON.parse(text);
    } catch { throw new VmnhClientError('本地 V-MNH 未返回有效的画布结果', 502, 'VMNH_INVALID_RESPONSE'); }
    if (!response.ok) {
      const message = response.status === 404 ? '本地画布项目不存在或已删除'
        : [409, 412, 428].includes(response.status) ? '本地画布已由其他窗口更新，未覆盖现有内容；请重新读取画布后继续导入'
          : [401, 403].includes(response.status) ? '本地 V-MNH 拒绝连接，请在本地画布中检查连接状态'
            : `本地 V-MNH 操作失败（HTTP ${response.status}）${typeof value?.error === 'string' ? `：${canvasError(value.error).slice(0, 400)}` : ''}`;
      throw new VmnhClientError(message, response.status, typeof value?.code === 'string' ? value.code : 'VMNH_REQUEST_FAILED');
    }
    return { value, response };
  }

  private async discover(): Promise<{ base: string; health: Record<string, any> }> {
    let discovery: { schemaVersion?: number; service?: string; baseUrl?: string };
    try {
      const text = await this.readDiscovery(this.discoveryFile);
      if (text.length > 65536) throw new Error('discovery too large');
      discovery = JSON.parse(text.replace(/^\uFEFF/, ''));
    } catch { throw new VmnhClientError('未找到正在运行的本地 V-MNH，请先打开本地画布软件'); }
    if (discovery?.service !== 'vela-control' || discovery.schemaVersion !== 1) throw new VmnhClientError('本地 V-MNH 服务发现信息不匹配');
    const base = localOrigin(discovery.baseUrl);
    const { value: health } = await this.request(base, '/api/vela/health', { timeoutMs: Math.min(this.timeoutMs, 5000) });
    if (health?.ok !== true || health.service !== 'vela-control' || !Number.isInteger(health.protocolVersion) || health.protocolVersion < 1) {
      throw new VmnhClientError('此本机端口不是兼容的 V-MNH 画布服务', 502, 'VMNH_INCOMPATIBLE_SERVICE');
    }
    return { base, health };
  }

  async resolveBaseUrl(): Promise<string> { return (await this.discover()).base; }

  async connection(): Promise<CanvasConnection> {
    try {
      const { base, health } = await this.discover();
      return { provider: 'vmnh', available: true, connected: true, url: base, label: '本地 V-MNH', accountName: '本机画布', version: `Vela 协议 ${health.protocolVersion}` };
    } catch (error) {
      return { provider: 'vmnh', available: false, connected: false, label: '本地 V-MNH', error: canvasError(error) };
    }
  }

  async projects(page = 1, pageSize = 50): Promise<CanvasProjects> {
    if (!Number.isInteger(page) || page < 1 || !Number.isInteger(pageSize) || pageSize < 1 || pageSize > 100) throw new VmnhClientError('本地画布分页参数无效', 400, 'VMNH_INVALID_PAGE');
    const base = await this.resolveBaseUrl();
    const { value } = await this.request(base, '/api/vela/projects');
    if (!Array.isArray(value) || value.some(item => !item || typeof item.id !== 'string' || !idPattern.test(item.id) || typeof item.name !== 'string')) throw new VmnhClientError('本地 V-MNH 画布列表格式不正确', 502, 'VMNH_INVALID_RESPONSE');
    return { projects: value.slice((page - 1) * pageSize, page * pageSize).map(item => ({ id: item.id, name: item.name || '未命名画布' })), workspaces: [], total: value.length };
  }

  async getProject(id: string): Promise<{ document: VmnhProjectDocument; etag: string }> {
    const encoded = assertId(id);
    const base = await this.resolveBaseUrl();
    const { value, response } = await this.request(base, `/api/vela/projects/${encoded}`);
    const etag = response.headers.get('ETag');
    if (!etag || !/^"(?:wb-)?[a-f0-9]{64}"$/i.test(etag)) throw new VmnhClientError('本地画布没有返回有效版本号，已停止写入以保护现有内容', 502, 'VMNH_MISSING_REVISION');
    return { document: projectDocument(value, id), etag };
  }

  async createProject(id: string, name: string): Promise<VmnhProjectDocument> {
    assertId(id);
    if (typeof name !== 'string' || !name.trim() || name.length > 150) throw new VmnhClientError('请输入有效的本地画布名称', 400, 'VMNH_INVALID_NAME');
    try { return (await this.getProject(id)).document; }
    catch (error) { if (!(error instanceof VmnhClientError) || error.statusCode !== 404) throw error; }
    const base = await this.resolveBaseUrl();
    try {
      const { value } = await this.request(base, '/api/vela/projects', { method: 'POST', body: { schemaVersion: 1, id, name: name.trim(), nodes: [], groups: [], viewport: { x: 0, y: 0, zoom: 1 }, settings: {} } });
      return projectDocument(value, id);
    } catch (error) {
      // A simultaneous recovery may already have created this deterministic id.
      // Never repeat a whole-project POST against an existing canvas.
      if (error instanceof VmnhClientError && [409, 412, 428].includes(error.statusCode)) return (await this.getProject(id)).document;
      throw error;
    }
  }

  async listMedia(projectId: string): Promise<VmnhMedia[]> {
    const encoded = assertId(projectId);
    const base = await this.resolveBaseUrl();
    const { value } = await this.request(base, `/api/vela/projects/${encoded}/media`);
    if (!Array.isArray(value)) throw new VmnhClientError('本地 V-MNH 素材列表格式不正确', 502, 'VMNH_INVALID_RESPONSE');
    return value.map(item => mediaRecord(item, projectId));
  }

  async uploadMedia(projectId: string, fileName: string, mime: string, bytes: Buffer): Promise<VmnhMedia> {
    const encoded = assertId(projectId);
    if (!Buffer.isBuffer(bytes) || bytes.length < 1 || bytes.length > 100 * 1024 * 1024) throw new VmnhClientError('本地画布单个素材须在 100 MB 以内', 400, 'VMNH_MEDIA_SIZE');
    if (!['image/png', 'image/jpeg', 'image/webp', 'video/mp4'].includes(mime)) throw new VmnhClientError('本地画布导入不支持此素材格式', 400, 'VMNH_MEDIA_TYPE');
    const name = path.basename(fileName).replace(/[\x00-\x1f\x7f]/g, '').slice(0, 255) || '画布素材';
    const base = await this.resolveBaseUrl();
    const { value } = await this.request(base, `/api/vela/projects/${encoded}/media`, { method: 'POST', timeoutMs: Math.max(this.timeoutMs, 90000), body: { data: `data:${mime};base64,${bytes.toString('base64')}`, fileName: name } });
    const result = mediaRecord(value, projectId);
    if (result.mime !== mime || result.bytes !== bytes.length || result.sha256.toLowerCase() !== createHash('sha256').update(bytes).digest('hex')) throw new VmnhClientError('本地画布保存的素材与上传文件不一致', 502, 'VMNH_MEDIA_MISMATCH');
    return result;
  }

  async saveProject(id: string, document: VmnhProjectDocument, etag: string): Promise<VmnhProjectDocument> {
    const encoded = assertId(id);
    projectDocument(document, id);
    if (typeof etag !== 'string' || !/^"(?:wb-)?[a-f0-9]{64}"$/i.test(etag)) throw new VmnhClientError('保存本地画布前必须重新读取有效版本号', 409, 'VMNH_MISSING_REVISION');
    const base = await this.resolveBaseUrl();
    const { value } = await this.request(base, `/api/vela/projects/${encoded}`, { method: 'PUT', body: document, etag });
    return projectDocument(value, id);
  }
}
