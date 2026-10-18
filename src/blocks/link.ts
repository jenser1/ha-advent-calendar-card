import { LitElement, css, html, nothing, type PropertyValues } from 'lit';
import { property, state } from 'lit/decorators.js';
import type { LinkBlock, LinkKind } from '../types';

export const LINK_KINDS: readonly LinkKind[] = ['github', 'video', 'shop', 'web'];

const ICONS: Record<LinkKind, string> = {
  github: 'mdi:github',
  video: 'mdi:play-circle',
  shop: 'mdi:shopping',
  web: 'mdi:web',
};

export const linkStyles = css`
  .link {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 12px 14px;
    border-radius: 12px;
    border: 1px solid var(--divider-color, rgba(0, 0, 0, 0.12));
    color: inherit;
    text-decoration: none;
  }

  .link:hover,
  .link:focus-visible {
    border-color: var(--primary-color, #03a9f4);
  }

  .link ha-icon {
    flex: none;
    color: var(--primary-color, #03a9f4);
    --mdc-icon-size: 32px;
  }

  .link-body {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
  }

  .link-title {
    font-weight: 600;
  }

  .link-description {
    font-size: 0.9em;
  }

  .link-meta {
    font-size: 0.85em;
    color: var(--secondary-text-color, #727272);
    overflow-wrap: anywhere;
  }
`;

/** `link` darf eine Adresse oder ein Objekt mit url, title, description und kind sein. */
export function normalizeLink(value: string | LinkBlock): LinkBlock {
  return typeof value === 'string' ? { url: value } : value;
}

export function parseGitHubRepo(url: string): { owner: string; repo: string } | undefined {
  try {
    const { hostname, pathname } = new URL(url);
    if (hostname !== 'github.com' && hostname !== 'www.github.com') {
      return undefined;
    }
    const [, owner, repo] = pathname.split('/');
    if (!owner || !repo) {
      return undefined;
    }
    return { owner, repo: repo.replace(/\.git$/, '') };
  } catch {
    return undefined;
  }
}

export interface RepoInfo {
  fullName: string;
  description?: string;
  stars: number;
}

const CACHE_PREFIX = 'advent-calendar-card:github:';
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const memoryCache = new Map<string, Promise<RepoInfo | undefined>>();

function readCache(name: string): RepoInfo | undefined {
  try {
    const raw = localStorage.getItem(CACHE_PREFIX + name);
    if (!raw) {
      return undefined;
    }
    const { at, info } = JSON.parse(raw) as { at: number; info: RepoInfo };
    return Date.now() - at < CACHE_TTL_MS ? info : undefined;
  } catch {
    return undefined;
  }
}

function writeCache(name: string, info: RepoInfo): void {
  try {
    localStorage.setItem(CACHE_PREFIX + name, JSON.stringify({ at: Date.now(), info }));
  } catch {
    // Ohne Speicher wird beim nächsten Mal einfach neu geladen.
  }
}

/** Lädt Name, Beschreibung und Sterne über die öffentliche GitHub-API; cached einen Tag. */
export function fetchRepoInfo(owner: string, repo: string): Promise<RepoInfo | undefined> {
  const name = `${owner}/${repo}`.toLowerCase();
  const cached = readCache(name);
  if (cached) {
    return Promise.resolve(cached);
  }
  let request = memoryCache.get(name);
  if (!request) {
    const url = `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`;
    // Über Promise.resolve(), damit auch ein synchroner Fehler von fetch() im catch landet.
    request = Promise.resolve()
      .then(() => fetch(url, { headers: { Accept: 'application/vnd.github+json' } }))
      .then(async (response) => {
        if (!response.ok) {
          return undefined;
        }
        const data = (await response.json()) as {
          full_name?: string;
          description?: string | null;
          stargazers_count?: number;
        };
        const info: RepoInfo = {
          fullName: data.full_name ?? `${owner}/${repo}`,
          description: data.description ?? undefined,
          stars: data.stargazers_count ?? 0,
        };
        writeCache(name, info);
        return info;
      })
      // Fehler (z. B. Rate-Limit) werden für diese Sitzung gemerkt, damit nicht bei jedem Öffnen neu gefragt wird.
      .catch(() => undefined);
    memoryCache.set(name, request);
  }
  return request;
}

const starFormat = new Intl.NumberFormat('de-DE');

function renderLinkCard(
  link: LinkBlock,
  kind: LinkKind,
  title: string,
  description: string | undefined,
  meta: string,
) {
  return html`
    <a class="link" href=${link.url} target="_blank" rel="noopener noreferrer">
      <ha-icon icon=${ICONS[kind]}></ha-icon>
      <span class="link-body">
        <span class="link-title">${title}</span>
        ${description ? html`<span class="link-description">${description}</span>` : nothing}
        <span class="link-meta">${meta}</span>
      </span>
    </a>
  `;
}

/** Link als Karte mit Symbol je nach Art; GitHub-Repos laden ihre Daten nach. */
export function renderLink(value: string | LinkBlock) {
  const link = normalizeLink(value);
  const kind = link.kind ?? 'web';
  if (kind === 'github' && parseGitHubRepo(link.url)) {
    return html`<advent-calendar-repo-card .link=${link}></advent-calendar-repo-card>`;
  }
  return renderLinkCard(link, kind, link.title ?? link.url, link.description, link.url);
}

/** GitHub-Repo-Karte: zeigt sofort title/url aus der Config und ergänzt Beschreibung und ⭐. */
export class AdventCalendarRepoCard extends LitElement {
  @property({ attribute: false }) link?: LinkBlock;
  @state() private info?: RepoInfo;

  static styles = linkStyles;

  protected willUpdate(changed: PropertyValues<this>): void {
    if (changed.has('link')) {
      this.info = undefined;
      const repo = this.link && parseGitHubRepo(this.link.url);
      if (repo) {
        const url = this.link!.url;
        void fetchRepoInfo(repo.owner, repo.repo).then((info) => {
          if (this.link?.url === url) {
            this.info = info;
          }
        });
      }
    }
  }

  render() {
    const link = this.link;
    if (!link) {
      return nothing;
    }
    const info = this.info;
    const repo = parseGitHubRepo(link.url);
    const fullName = info?.fullName ?? (repo ? `${repo.owner}/${repo.repo}` : link.url);
    const meta = info ? `⭐ ${starFormat.format(info.stars)} · ${fullName}` : fullName;
    return renderLinkCard(
      link,
      'github',
      link.title ?? fullName,
      link.description ?? info?.description,
      meta,
    );
  }
}

if (!customElements.get('advent-calendar-repo-card')) {
  customElements.define('advent-calendar-repo-card', AdventCalendarRepoCard);
}

declare global {
  interface HTMLElementTagNameMap {
    'advent-calendar-repo-card': AdventCalendarRepoCard;
  }
}
