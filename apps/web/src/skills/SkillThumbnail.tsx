import { useState, type CSSProperties, type SyntheticEvent } from 'react';
import type { SkillInfo } from '../../../../packages/contracts';
import { mediaUrl } from '../api';
import { Icon } from '../ui';
import { getSkillPreview } from './skill-preview';

/** Shared by the library and selection cards. Video-only packages get a still frame. */
export function SkillThumbnail({ files, alt = '' }: { files: SkillInfo['files']; alt?: string }) {
  const preview = getSkillPreview(files);
  const [failedImage, setFailedImage] = useState<string | null>(null);
  const [failedVideo, setFailedVideo] = useState<string | null>(null);
  const [readyImage, setReadyImage] = useState<string | null>(null);
  const [readyVideo, setReadyVideo] = useState<string | null>(null);
  const image = preview?.image && failedImage !== preview.image.mediaId ? preview.image : undefined;
  const video = !image && preview?.video && failedVideo !== preview.video.mediaId ? preview.video : undefined;
  const ready = image ? readyImage === image.mediaId : video ? readyVideo === video.mediaId : false;
  const mediaStyle: CSSProperties = { display: 'block', width: '100%', height: '100%', objectFit: 'cover', pointerEvents: 'none', margin: 0, opacity: ready ? 1 : 0 };
  const videoReady = (event: SyntheticEvent<HTMLVideoElement>) => {
    if (event.currentTarget.readyState >= 2 && video) setReadyVideo(video.mediaId);
  };

  return <span className="skill-thumbnail-media" role={alt ? 'img' : undefined} aria-label={alt || undefined} aria-hidden={alt ? undefined : true}
    style={{ display: 'block', position: 'relative', width: '100%', height: '100%', minWidth: 0, minHeight: 0, flex: '1 1 auto', overflow: 'hidden' }}>
    {image ? <img key={image.mediaId} src={mediaUrl(image.mediaId)} alt="" loading="lazy" style={mediaStyle}
      onLoad={() => setReadyImage(image.mediaId)} onError={() => setFailedImage(image.mediaId)}/>
      : video ? <video key={video.mediaId} src={mediaUrl(video.mediaId)} muted playsInline preload="metadata" aria-hidden="true" style={mediaStyle}
        onLoadedMetadata={event => {
          const element = event.currentTarget;
          // Seeking requests a decoded frame in WebView2; metadata alone may leave it blank.
          const frame = Number.isFinite(element.duration) && element.duration > 0 ? Math.min(0.1, element.duration / 2) : 0.1;
          try { element.currentTime = frame; } catch { /* loadeddata remains the fallback. */ }
          videoReady(event);
        }}
        onLoadedData={videoReady} onSeeked={videoReady} onError={() => setFailedVideo(video.mediaId)}/>
        : null}
    {!ready ? <span className="skill-thumbnail-placeholder" style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 6, color: 'var(--muted)', fontSize: 12, background: 'var(--surface)' }}>
      <Icon name="image"/><span>{image || video ? '封面加载中…' : preview ? '预览素材加载失败' : '未提供预览素材'}</span>
    </span> : null}
  </span>;
}
