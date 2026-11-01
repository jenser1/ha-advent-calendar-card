import { LitElement, css, html, nothing } from 'lit';
import { property, state } from 'lit/decorators.js';
import { normalizeLink } from '../blocks/link';
import type {
  DoorContent,
  EffectCall,
  HomeAssistant,
  LinkBlock,
  LinkKind,
  SharedDoorContent,
  SharedMode,
} from '../types';
import { SHARED_MODE_OPTIONS, editorStyles, type FormField } from './shared';

/** Auswahlwert für „Modus wie in den Einstellungen“ (ein leerer Wert ist in HAs Auswahlliste nicht wählbar). */
const DEFAULT_MODE = 'default';

export type BlockKey = 'text' | 'image' | 'task' | 'link' | 'video' | 'effect';

/** Reihenfolge der Buttons „Baustein hinzufügen“. */
const BLOCK_ORDER: BlockKey[] = ['text', 'image', 'task', 'link', 'video', 'effect'];

/** Schlüssel in der Config, die zu einem Baustein gehören (answer gehört zum Text). */
const MEMBERS: Record<BlockKey, (keyof DoorContent)[]> = {
  text: ['text', 'answer'],
  image: ['image'],
  task: ['task'],
  link: ['link'],
  video: ['video'],
  effect: ['effect'],
};

const LINK_KIND_OPTIONS: { value: LinkKind; label: string }[] = [
  { value: 'web', label: 'Webseite' },
  { value: 'shop', label: 'Shop-Angebot' },
  { value: 'video', label: 'Video' },
  { value: 'github', label: 'GitHub-Projekt' },
];

export const BLOCK_INFO: Record<
  BlockKey,
  { icon: string; label: string; schema: FormField[]; initial: Partial<DoorContent> }
> = {
  text: {
    icon: '📝',
    label: 'Text / Rätsel',
    schema: [
      { name: 'text', selector: { text: { multiline: true } } },
      { name: 'answer', selector: { text: { multiline: true } } },
    ],
    initial: { text: '' },
  },
  image: {
    icon: '🖼️',
    label: 'Bild / GIF',
    schema: [{ name: 'image', selector: { text: {} } }],
    initial: { image: '' },
  },
  task: {
    icon: '🎁',
    label: 'Gutschein / Aufgabe',
    schema: [{ name: 'task', selector: { text: { multiline: true } } }],
    initial: { task: '' },
  },
  link: {
    icon: '🔗',
    label: 'Link',
    schema: [
      { name: 'url', selector: { text: { type: 'url' } } },
      { name: 'title', selector: { text: {} } },
      { name: 'description', selector: { text: {} } },
      { name: 'kind', selector: { select: { mode: 'dropdown', options: LINK_KIND_OPTIONS } } },
    ],
    initial: { link: { url: '' } },
  },
  video: {
    icon: '🎬',
    label: 'Video',
    schema: [{ name: 'video', selector: { text: { type: 'url' } } }],
    initial: { video: '' },
  },
  effect: {
    icon: '✨',
    label: 'Effekt',
    schema: [{ name: 'effect', selector: { action: {} } }],
    initial: { effect: [] },
  },
};

const LABELS: Record<string, string> = {
  text: 'Text',
  answer: 'Lösung (optional – macht daraus ein Rätsel)',
  image: 'Bild-Adresse',
  task: 'Aufgabe oder Gutschein',
  url: 'Adresse',
  title: 'Titel (optional)',
  description: 'Beschreibung (optional)',
  kind: 'Art',
  video: 'Video-Adresse',
  effect: 'Aktionen beim ersten Öffnen',
};

const HELPERS: Record<string, string> = {
  image: 'z. B. /local/advent/jens/01.gif (Datei unter /config/www/advent/) oder https://…',
  url: 'https://…',
  kind: 'Bei „GitHub-Projekt“ lädt die Karte Beschreibung und ⭐ von GitHub.',
  video: 'YouTube-Link oder eigene Videodatei, z. B. /local/advent/schnee.mp4',
  effect: 'Läuft nur beim ersten Öffnen. Scripts bekommen tag und person mit.',
};

function blockOf(key: string): BlockKey | undefined {
  if (key === 'answer') {
    return 'text';
  }
  return (BLOCK_ORDER as string[]).includes(key) ? (key as BlockKey) : undefined;
}

/** Bausteine eines Türchens in der Reihenfolge aus der Config. */
export function blocksOf(content: DoorContent | null | undefined): BlockKey[] {
  const blocks: BlockKey[] = [];
  for (const key of Object.keys(content ?? {})) {
    const block = blockOf(key);
    if (block && !blocks.includes(block)) {
      blocks.push(block);
    }
  }
  return blocks;
}

function withoutUndefined(values: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(values).filter(([, value]) => value !== undefined));
}

/** Formulardaten eines Bausteins aus dem Türchen-Inhalt. */
function blockData(block: BlockKey, content: DoorContent): Record<string, unknown> {
  switch (block) {
    case 'text':
      return { text: content.text ?? '', answer: content.answer ?? '' };
    case 'link': {
      const link = normalizeLink(content.link ?? { url: '' });
      return {
        url: link.url ?? '',
        title: link.title ?? '',
        description: link.description ?? '',
        kind: link.kind ?? 'web',
      };
    }
    case 'effect': {
      const effect = content.effect;
      return { effect: Array.isArray(effect) ? effect : effect ? [effect] : [] };
    }
    default:
      return { [block]: content[block] ?? '' };
  }
}

/** Config-Werte eines Bausteins aus den Formulardaten. */
function blockValues(block: BlockKey, data: Record<string, unknown>): Partial<DoorContent> {
  const text = (name: string) => (typeof data[name] === 'string' ? (data[name] as string) : '');
  switch (block) {
    case 'text':
      return withoutUndefined({ text: text('text'), answer: text('answer') || undefined });
    case 'link': {
      const kind = data.kind as LinkKind | undefined;
      const link = withoutUndefined({
        url: text('url'),
        title: text('title') || undefined,
        description: text('description') || undefined,
        kind: kind && kind !== 'web' ? kind : undefined,
      }) as unknown as LinkBlock;
      return { link };
    }
    case 'effect':
      return { effect: (data.effect as EffectCall[] | undefined) ?? [] };
    default:
      return { [block]: text(block) };
  }
}

/**
 * Bearbeitet den Inhalt eines Türchens: Bausteine hinzufügen, ausfüllen, verschieben,
 * entfernen. Event: `content-changed` (detail: { content }, null = Türchen leer).
 */
export class AdventCalendarEditorDoor extends LitElement {
  @property({ attribute: false }) hass?: HomeAssistant;
  @property({ type: Number }) day = 0;
  @property({ attribute: false }) content?: SharedDoorContent | null;
  /** Gemeinsame Türchen: eigener Modus pro Türchen wählbar. */
  @property({ type: Boolean }) allowMode = false;
  /** Beschriftung des Modus, der ohne eigenen Wert gilt („Wie oben (…)“). */
  @property() defaultModeLabel = '';

  @state() private confirmClear = false;

  static styles = [
    editorStyles,
    css`
      .block-header {
        display: flex;
        align-items: center;
        gap: 6px;
        font-weight: 500;
      }

      .block-header .title {
        flex: 1;
      }

      .icon-button {
        width: 32px;
        height: 32px;
        border: none;
        border-radius: 50%;
        background: transparent;
        color: var(--secondary-text-color);
        font-size: 1em;
        cursor: pointer;
      }

      .icon-button:hover:not(:disabled) {
        background: var(--secondary-background-color, #f2f2f2);
      }

      .icon-button:disabled {
        opacity: 0.3;
        cursor: default;
      }

      .add {
        display: flex;
        flex-wrap: wrap;
        gap: 6px;
      }
    `,
  ];

  willUpdate(changed: Map<string, unknown>): void {
    if (changed.has('day')) {
      this.confirmClear = false;
    }
  }

  private emit(content: Partial<SharedDoorContent>): void {
    const next = Object.keys(content).length > 0 ? (content as SharedDoorContent) : null;
    this.dispatchEvent(new CustomEvent('content-changed', { detail: { content: next } }));
  }

  /** Modus pro Türchen setzen; er steht immer vorne im Türchen. */
  private setMode(mode: string): void {
    const { mode: _previous, ...rest } = this.content ?? {};
    const isMode = SHARED_MODE_OPTIONS.some((option) => option.value === mode);
    this.emit(isMode ? { mode: mode as SharedMode, ...rest } : rest);
  }

  private renderMode() {
    const options = [
      { value: DEFAULT_MODE, label: `Wie oben (${this.defaultModeLabel})` },
      ...SHARED_MODE_OPTIONS,
    ];
    return html`
      <ha-form
        class="mode"
        .hass=${this.hass}
        .data=${{ mode: this.content?.mode ?? DEFAULT_MODE }}
        .schema=${[{ name: 'mode', selector: { select: { mode: 'dropdown', options } } }]}
        .computeLabel=${() => 'Modus für dieses Türchen'}
        @value-changed=${(event: CustomEvent<{ value: { mode: string } }>) => {
          event.stopPropagation();
          this.setMode(event.detail.value.mode);
        }}
      ></ha-form>
    `;
  }

  /** Ersetzt (oder entfernt bei undefined) einen Baustein an seiner Stelle; neue kommen ans Ende. */
  private replaceBlock(block: BlockKey, values: Partial<DoorContent> | undefined): void {
    const members = MEMBERS[block] as string[];
    const next: Record<string, unknown> = {};
    let inserted = false;
    for (const [key, value] of Object.entries(this.content ?? {})) {
      if (members.includes(key)) {
        if (!inserted && values) {
          Object.assign(next, values);
        }
        inserted = true;
        continue;
      }
      next[key] = value;
    }
    if (!inserted && values) {
      Object.assign(next, values);
    }
    this.emit(next as Partial<DoorContent>);
  }

  private moveBlock(block: BlockKey, offset: -1 | 1): void {
    const content = (this.content ?? {}) as Record<string, unknown>;
    const order = blocksOf(this.content);
    const index = order.indexOf(block);
    const target = index + offset;
    if (target < 0 || target >= order.length) {
      return;
    }
    [order[index], order[target]] = [order[target], order[index]];
    // Andere Schlüssel (z. B. mode bei gemeinsamen Türchen) bleiben vorne.
    const next: Record<string, unknown> = Object.fromEntries(
      Object.entries(content).filter(([key]) => !blockOf(key)),
    );
    for (const name of order) {
      for (const key of MEMBERS[name]) {
        if (key in content) {
          next[key] = content[key];
        }
      }
    }
    this.emit(next as Partial<DoorContent>);
  }

  private renderBlock(block: BlockKey, index: number, count: number) {
    const info = BLOCK_INFO[block];
    return html`
      <div class="box block" data-block=${block}>
        <div class="block-header">
          <span class="title">${info.icon} ${info.label}</span>
          <button
            class="icon-button up"
            title="Nach oben"
            ?disabled=${index === 0}
            @click=${() => this.moveBlock(block, -1)}
          >
            ↑
          </button>
          <button
            class="icon-button down"
            title="Nach unten"
            ?disabled=${index === count - 1}
            @click=${() => this.moveBlock(block, 1)}
          >
            ↓
          </button>
          <button
            class="icon-button remove"
            title="Baustein entfernen"
            @click=${() => this.replaceBlock(block, undefined)}
          >
            ✕
          </button>
        </div>
        <ha-form
          .hass=${this.hass}
          .data=${blockData(block, this.content ?? {})}
          .schema=${info.schema}
          .computeLabel=${(field: FormField) => LABELS[field.name] ?? field.name}
          .computeHelper=${(field: FormField) => HELPERS[field.name]}
          @value-changed=${(event: CustomEvent<{ value: Record<string, unknown> }>) => {
            event.stopPropagation();
            this.replaceBlock(block, blockValues(block, event.detail.value));
          }}
        ></ha-form>
      </div>
    `;
  }

  render() {
    const blocks = blocksOf(this.content);
    const missing = BLOCK_ORDER.filter((block) => !blocks.includes(block));
    return html`
      <div class="section">
        ${this.allowMode ? this.renderMode() : nothing}
        ${blocks.length === 0
          ? html`<p class="hint">Türchen ${this.day} ist noch leer. Füge unten Bausteine hinzu.</p>`
          : blocks.map((block, index) => this.renderBlock(block, index, blocks.length))}
        ${missing.length > 0
          ? html`
              <div class="add">
                ${missing.map(
                  (block) => html`
                    <button
                      class="button small add-block"
                      data-block=${block}
                      @click=${() => this.replaceBlock(block, BLOCK_INFO[block].initial)}
                    >
                      ＋ ${BLOCK_INFO[block].icon} ${BLOCK_INFO[block].label}
                    </button>
                  `,
                )}
              </div>
            `
          : nothing}
        ${blocks.length > 0
          ? this.confirmClear
            ? html`
                <span class="confirm">
                  Alle Bausteine von Türchen ${this.day} löschen?
                  <button
                    class="button small danger"
                    @click=${() => {
                      this.confirmClear = false;
                      this.emit({});
                    }}
                  >
                    Ja, leeren
                  </button>
                  <button class="button small" @click=${() => (this.confirmClear = false)}>
                    Abbrechen
                  </button>
                </span>
              `
            : html`
                <button class="button small danger clear" @click=${() => (this.confirmClear = true)}>
                  Türchen leeren
                </button>
              `
          : nothing}
      </div>
    `;
  }
}

if (!customElements.get('advent-calendar-editor-door')) {
  customElements.define('advent-calendar-editor-door', AdventCalendarEditorDoor);
}

declare global {
  interface HTMLElementTagNameMap {
    'advent-calendar-editor-door': AdventCalendarEditorDoor;
  }
}
