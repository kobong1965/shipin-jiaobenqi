import type { TaskSummary } from '../../../../packages/contracts';
import { Icon, Message } from '../ui';
import { useWorkspace } from '../workspace';
import { TaskMedia } from './TaskMedia';
import { taskDisplayStatus } from './task-display-status';
import { assignedProviderLabel, taskQueueCounts } from './task-routing';
import { useTaskSummaries } from './use-task-summaries';
import './tasks.css';

export function TaskCard({ task, selected }: { task: TaskSummary; selected: boolean }) {
  const { navigate } = useWorkspace();
  const progress = task.progress;
  const status = taskDisplayStatus(progress, task.status);
  const failed = status.tone === 'issue';
  const provider = assignedProviderLabel(task.latestJob);
  const complete = status.tone === 'ready';
  const label = complete ? '完成' : '未完';
  const canvasLabels = { not_uploaded: '未上传画布', uploading: '上传画布中', uploaded: '已上传画布', failed: '画布上传失败', unknown: '画布待确认' };
  const canvasStatus = task.canvasUpload?.status ?? 'unknown';
  const uploaded = canvasStatus === 'uploaded';
  const canvasLabel = uploaded ? '已传' : '未传';
  const canvasDescription = canvasLabels[canvasStatus];
  const description = [progress?.label || status.label, canvasDescription, provider].filter(Boolean).join(' · ');
  return <article className={`task-card ${selected ? 'selected' : ''} ${failed ? 'task-issue' : ''}`} aria-label={task.name}>
    <TaskMedia task={task} onOpen={() => navigate(`task/${task.id}`)}/>
    <button type="button" className="task-card-open" onClick={() => navigate(`task/${task.id}`)}
      aria-label={`查看任务详情：${task.name}。生成${complete ? '已完成' : '未完成'}，${canvasDescription}`} title={description}>
      <span className="task-card-body">
        <span className={`task-state task-state-${complete ? 'complete' : 'incomplete'}`} title={`生成状态：${progress?.label || status.label}`}>
          <Icon name={complete ? 'check' : 'history'}/>{label}
        </span>
        <span className={`task-state task-canvas-state task-state-${uploaded ? 'complete' : 'incomplete'}`} data-canvas-status={canvasStatus} title={`画布状态：${canvasDescription}`}>
          <Icon name="upload"/>{canvasLabel}
        </span>
      </span>
    </button>
  </article>;
}

export function TaskBoard({ route }: { route: string }) {
  const { start } = useWorkspace();
  const tasks = useTaskSummaries('/api/task-board');
  const counts = taskQueueCounts(tasks.data ?? []);
  return <aside className="task-board" aria-label="任务栏">
    <header className="task-board-header"><div><h2>任务栏</h2>{counts.running > 0 ? <span className="tag blue">{counts.running} 个生成中</span> : null}{counts.queued > 0 ? <span className="tag gray">{counts.queued} 个排队中</span> : null}</div><button onClick={() => start()} aria-label="新建任务"><Icon name="plus"/>新建</button></header>
    {tasks.error ? <Message error>{tasks.error}<button onClick={() => void tasks.refresh()}>刷新</button></Message> : null}
    <div className="task-board-list" tabIndex={0} aria-label="任务列表">
      {tasks.data?.map(task => <TaskCard key={task.id} task={task} selected={route === `task/${task.id}`}/>)}
      {!tasks.data?.length ? <div className="task-board-empty">{tasks.loading ? '正在读取任务…' : '暂无任务'}</div> : null}
    </div>
  </aside>;
}

