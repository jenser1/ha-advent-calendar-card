import { css, html } from 'lit';
import { isSafeUrl } from './url';

export type VideoSource =
  | { kind: 'youtube'; id: string; start?: number }
  | { kind: 'file'; src: string };

export const videoStyles = css`
  .video {
    display: block;
    width: 100%;
    aspect-ratio: 16 / 9;
    border: 0;
    border-radius: 10px;
    background: #000;
  }
`;

const YOUTUBE_ID = /^[A-Za-z0-9_-]{11}$/;
const VIDEO_FILE = /\.(mp4|m4v|webm|ogg|ogv|mov)$/i;

/** „90“, „90s“ oder „1m30s“ → Sekunden. */
function parseStart(value: string | null): number | undefined {
  if (!value) {
    return undefined;
  }
  const match = /^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s?)?$/.exec(value);
  if (!match || !match[0]) {
    return undefined;
  }
  const [, h = '0', m = '0', s = '0'] = match;
  const seconds = Number(h) * 3600 + Number(m) * 60 + Number(s);
  return seconds > 0 ? seconds : undefined;
}

/** Erkennt YouTube-Links (watch, youtu.be, shorts, embed) und eigene Videodateien. */
export function parseVideo(value: string): VideoSource | undefined {
  const raw = value.trim();
  let url: URL;
  try {
    url = new URL(raw, 'http://relative.invalid');
  } catch {
    return undefined;
  }
  const host = url.hostname.replace(/^(www|m)\./, '');
  const start = parseStart(url.searchParams.get('t') ?? url.searchParams.get('start'));

  let id: string | undefined;
  if (host === 'youtube.com' || host === 'youtube-nocookie.com') {
    const [, first, second] = url.pathname.split('/');
    id = first === 'watch' ? (url.searchParams.get('v') ?? undefined) : undefined;
    if (first === 'shorts' || first === 'embed' || first === 'live') {
      id = second;
    }
  } else if (host === 'youtu.be') {
    id = url.pathname.slice(1);
  }
  if (id !== undefined) {
    return YOUTUBE_ID.test(id) ? { kind: 'youtube', id, start } : undefined;
  }

  if (isSafeUrl(raw) && VIDEO_FILE.test(url.pathname)) {
    return { kind: 'file', src: raw };
  }
  return undefined;
}

export function youtubeEmbedUrl(id: string, start?: number): string {
  return `https://www.youtube-nocookie.com/embed/${id}${start ? `?start=${start}` : ''}`;
}

export function renderVideo(value: string) {
  const source = parseVideo(value);
  if (!source) {
    return html``;
  }
  if (source.kind === 'file') {
    return html`<video class="video" src=${source.src} controls preload="metadata"></video>`;
  }
  return html`
    <iframe
      class="video"
      src=${youtubeEmbedUrl(source.id, source.start)}
      title="YouTube-Video"
      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
      referrerpolicy="strict-origin-when-cross-origin"
      allowfullscreen
    ></iframe>
  `;
}
