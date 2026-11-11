export type CanvasProvider = 'vmnh' | 'libtv';

/** Stored plans identify their target; legacy plans belong to LibTV. */
export function canvasProjectUrl(provider: CanvasProvider, projectId: string, _localBaseUrl?: string): string {
  if (provider === 'libtv') return `https://www.liblib.tv/canvas?projectId=${encodeURIComponent(projectId)}`;
  // V-MNH chooses a fresh port on launch. Resolve its current address through
  // the workbench instead of keeping a stale port in task/history links.
  return `/api/canvas/open?provider=vmnh&projectId=${encodeURIComponent(projectId)}`;
}

export interface CanvasConnection { available: boolean; connected: boolean; version?: string; accountName?: string; error?: string; provider?: CanvasProvider; url?: string; label?: string; }
export interface CanvasProjects {
  projects: { id: string; name: string; workspaceId?: string }[];
  workspaces: { id: string; name: string }[]; total: number;
}
export interface CanvasImportStep {
  key: string; label: string; status: 'pending' | 'running' | 'succeeded'; nodeKey?: string;
}
/** Frozen identity only; never original paths, account credentials or the media ledger. */
export interface CanvasProductBinding {
  groupNumber: number; selectionId: string; productUid: string;
  category: 'men' | 'women'; sku: string; name: string;
  shopName: string; market: 'US'; productId: string;
  sourceHash: string; sourceUpdatedAt: string; selectedAt: string;
}
export interface CanvasImportInfo {
  projectName?: string;
  id: string; taskId: string; resultId: string; provider: CanvasProvider;
  status: 'queued' | 'running' | 'succeeded' | 'failed' | 'unknown';
  progress: number; projectId: string | null; projectUrl: string | null; error: string | null;
  steps: CanvasImportStep[]; createdAt: string; updatedAt: string;
  productBindings?: CanvasProductBinding[];
}
