import {
  LitElement,
  css,
  html,
  nothing,
  type ReactiveController,
  type ReactiveControllerHost,
} from 'lit';
import { property, state } from 'lit/decorators.js';
import {
  loadContentFile,
  serverPath,
  toContentJson,
  type ContentFile,
  type Doors,
  type FileContent,
} from '../content-source';
import { effectiveToday } from '../date-logic';
import type { AdventCalendarCardConfig, HomeAssistant, SharedDoorContent } from '../types';
import { editorStyles } from './shared';

/** Jahr, für das die Karte gerade Dateien lädt ({year} im Pfad). */
export function editorYear(config: AdventCalendarCardConfig, hass: HomeAssistant | undefined): number {
  return (
    config.year ??
    effectiveToday({
      now: new Date(),
      timeZone: hass?.config.time_zone,
      debugDate: config.debug_date,
      isAdmin: hass?.user?.is_admin === true,
    }).date.year
  );
}

export function filledCount(doors: Doors<SharedDoorContent> | null | undefined): number {
  return Object.values(doors ?? {}).filter((door) => door && Object.keys(door).length > 0).length;
}

/**
 * Lädt Inhaltsdateien für einen Editor-Tab. Der Editor kann sie nur lesen;
 * „Neu laden“ holt sie nach einer Änderung frisch vom Server.
 */
export class ContentFileController implements ReactiveController {
  private readonly host: ReactiveControllerHost;
  private readonly files = new Map<string, FileContent<SharedDoorContent>>();
  /** Laufende Anfrage je URL; nur die neueste zählt. */
  private readonly pending = new Map<string, number>();
  private request = 0;

  constructor(host: ReactiveControllerHost) {
    this.host = host;
    host.addController(this);
  }

  hostConnected(): void {}

  /** Inhalt der Datei; undefined, solange sie lädt. Beim ersten Aufruf startet das Laden. */
  get(file: ContentFile, allowMode: boolean): FileContent<SharedDoorContent> | undefined {
    if (!this.files.has(file.url) && !this.pending.has(file.url)) {
      void this.load(file, allowMode);
    }
    return this.files.get(file.url);
  }

  reload(file: ContentFile, allowMode: boolean): void {
    this.files.delete(file.url);
    void this.load(file, allowMode);
    this.host.requestUpdate();
  }

  private async load(file: ContentFile, allowMode: boolean): Promise<void> {
    const request = ++this.request;
    this.pending.set(file.url, request);
    const content = await loadContentFile<SharedDoorContent>(file, allowMode);
    if (this.pending.get(file.url) === request) {
      this.pending.delete(file.url);
      this.files.set(file.url, content);
      this.host.requestUpdate();
    }
  }
}

/** Pfad, Ort auf dem Server und Ladestatus einer Datei, mit „Neu laden“. */
export function renderFileBox(
  file: ContentFile,
  content: FileContent<SharedDoorContent> | undefined,
  options: { missingText: string; onReload: () => void },
) {
  const where = serverPath(file.path);
  let status;
  if (!content) {
    status = html`<p class="hint file-status">⏳ Wird geladen …</p>`;
  } else if (content.status === 'ok') {
    const count = filledCount(content.doors);
    status = html`<p class="hint file-status">
      ✔ Geladen – ${count === 1 ? '1 Türchen' : `${count} Türchen`} gefüllt.
    </p>`;
  } else if (content.status === 'missing') {
    status = html`<p class="error-text file-status">${options.missingText}</p>`;
  } else {
    status = html`<p class="error-text file-status">⚠️ ${content.message}</p>`;
  }
  return html`
    <div class="box file">
      <div class="box-header">
        <span class="file-path">📄 ${file.path}</span>
        <button class="button small reload" @click=${options.onReload}>↻ Neu laden</button>
      </div>
      ${where ? html`<p class="hint">Auf dem Server: ${where}</p>` : nothing}
      ${status}
    </div>
  `;
}

/** Inhalt eines Türchens aus der Datei, nur zum Lesen. */
export function renderFileDoor(day: number, door: SharedDoorContent | null | undefined) {
  return door && Object.keys(door).length > 0
    ? html`<pre class="file-door">${JSON.stringify(door, null, 2)}</pre>`
    : html`<p class="hint file-door-empty">In der Datei steht für Türchen ${day} nichts.</p>`;
}

export const fileStyles = css`
  .file-path {
    overflow-wrap: anywhere;
    font-family: var(--code-font-family, monospace);
    font-weight: normal;
  }

  .file-door {
    margin: 0;
    padding: 8px 10px;
    border-radius: 8px;
    background: var(--secondary-background-color, #f2f2f2);
    font-family: var(--code-font-family, monospace);
    font-size: 0.85em;
    white-space: pre-wrap;
    overflow-wrap: anywhere;
  }
`;

function download(name: string, text: string): void {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * Macht aus Türchen der YAML eine fertige Datei: herunterladen oder als Text kopieren.
 * Im JSON-Modus (YAML-Türchen werden dort ignoriert) lassen sie sich danach entfernen.
 * Event: `remove-yaml-doors`.
 */
export class AdventCalendarEditorJsonExport extends LitElement {
  @property({ attribute: false }) doors?: Doors<SharedDoorContent> | null;
  @property({ attribute: false }) file?: ContentFile;
  /** content_source: json */
  @property({ type: Boolean }) json = false;

  @state() private confirmRemove = false;

  static styles = [
    editorStyles,
    css`
      summary {
        cursor: pointer;
        color: var(--secondary-text-color);
        font-size: 0.9em;
      }

      details.export[open] > summary {
        margin-bottom: 8px;
      }

      .actions {
        display: flex;
        flex-wrap: wrap;
        gap: 6px;
      }

      textarea {
        box-sizing: border-box;
        width: 100%;
        margin-top: 8px;
        font-family: var(--code-font-family, monospace);
        font-size: 0.85em;
        color: var(--primary-text-color);
        background: var(--secondary-background-color, #f2f2f2);
        border: 1px solid var(--divider-color, rgba(0, 0, 0, 0.12));
        border-radius: 8px;
        padding: 8px;
      }
    `,
  ];

  protected willUpdate(changed: Map<string, unknown>): void {
    // file wird bei jedem Zeichnen neu gebaut; nur ein anderer Pfad zählt als Wechsel.
    const previousFile = changed.get('file') as ContentFile | undefined;
    if (changed.has('doors') || (changed.has('file') && previousFile?.url !== this.file?.url)) {
      this.confirmRemove = false;
    }
  }

  private removeDoors(): void {
    this.confirmRemove = false;
    this.dispatchEvent(new CustomEvent('remove-yaml-doors'));
  }

  render() {
    const file = this.file;
    const count = filledCount(this.doors);
    if (!file || count === 0) {
      return nothing;
    }
    const name = file.path.split('/').pop() ?? file.path;
    const where = serverPath(file.path) ?? file.path;
    const text = toContentJson(this.doors);
    const doorsLabel = count === 1 ? '1 Türchen' : `${count} Türchen`;
    const body = html`
      <p class="hint">
        ${this.json
          ? `In der YAML stehen noch ${doorsLabel} – mit content_source: json werden sie ignoriert. Lade sie als Datei herunter und lege sie unter ${where} ab.`
          : `Für content_source: json die ${doorsLabel} als Datei herunterladen und unter ${where} ablegen.`}
      </p>
      <div class="actions">
        <button class="button download" @click=${() => download(name, text)}>
          ⬇ ${name} herunterladen
        </button>
        ${this.json && !this.confirmRemove
          ? html`<button class="button danger remove-yaml" @click=${() => (this.confirmRemove = true)}>
              Aus der YAML entfernen
            </button>`
          : nothing}
        ${this.json && this.confirmRemove
          ? html`<span class="confirm">
              ${doorsLabel} aus der YAML löschen?
              <button class="button small danger confirm-remove" @click=${this.removeDoors}>Ja, löschen</button>
              <button class="button small" @click=${() => (this.confirmRemove = false)}>Abbrechen</button>
            </span>`
          : nothing}
      </div>
      <details class="show-json">
        <summary>JSON anzeigen (zum Kopieren)</summary>
        <textarea
          readonly
          rows="12"
          .value=${text}
          @focus=${(event: Event) => (event.target as HTMLTextAreaElement).select()}
        ></textarea>
      </details>
    `;
    return this.json
      ? html`<div class="box export">${body}</div>`
      : html`<details class="export">
          <summary>📄 Als JSON-Datei exportieren</summary>
          <div class="section">${body}</div>
        </details>`;
  }
}

if (!customElements.get('advent-calendar-editor-json-export')) {
  customElements.define('advent-calendar-editor-json-export', AdventCalendarEditorJsonExport);
}

declare global {
  interface HTMLElementTagNameMap {
    'advent-calendar-editor-json-export': AdventCalendarEditorJsonExport;
  }
}
