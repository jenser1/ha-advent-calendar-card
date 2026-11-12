import { LitElement, css, html } from 'lit';
import { property, state } from 'lit/decorators.js';
import { COMMUNITY_CALENDAR } from '../edition';
import type { AdventCalendarCardConfig, HomeAssistant } from '../types';
import { fireConfigChanged, loadHaFormComponents } from './shared';
import './tab-doors';
import './tab-general';
import './tab-persons';
import './tab-shared';

export const EDITOR_TAG = 'advent-calendar-card-editor';

type Tab = 'general' | 'persons' | 'doors' | 'shared';

// In der Community-Edition gibt es keine eigenen Kalender, also nur „Allgemein“.
const TABS: { id: Tab; label: string }[] = COMMUNITY_CALENDAR
  ? [{ id: 'general', label: 'Allgemein' }]
  : [
      { id: 'general', label: 'Allgemein' },
      { id: 'persons', label: 'Personen' },
      { id: 'doors', label: 'Türchen' },
      { id: 'shared', label: 'Gemeinsam' },
    ];

/**
 * Visueller Editor der Karte. Jeder Tab ist ein eigenes Element, das bei Änderungen
 * `config-changed` mit der kompletten neuen Config meldet; YAML bleibt gleichwertig.
 */
export class AdventCalendarCardEditor extends LitElement {
  @property({ attribute: false }) hass?: HomeAssistant;
  @state() private config?: AdventCalendarCardConfig;
  @state() private tab: Tab = 'general';

  setConfig(config: AdventCalendarCardConfig): void {
    this.config = config;
  }

  connectedCallback(): void {
    super.connectedCallback();
    void loadHaFormComponents().then(() => this.requestUpdate());
  }

  private onConfigChanged(event: CustomEvent<{ config: AdventCalendarCardConfig }>): void {
    // Die Tabs melden an den Editor; nach außen geht genau ein Event vom Editor selbst.
    event.stopPropagation();
    this.config = event.detail.config;
    fireConfigChanged(this, this.config);
  }

  static styles = css`
    :host {
      display: block;
    }

    .tabs[hidden] {
      display: none;
    }

    .tabs {
      display: flex;
      flex-wrap: wrap;
      gap: 4px;
      margin-bottom: 16px;
      border-bottom: 1px solid var(--divider-color, rgba(0, 0, 0, 0.12));
    }

    .tab {
      font: inherit;
      padding: 8px 14px;
      border: none;
      border-bottom: 2px solid transparent;
      background: transparent;
      color: var(--secondary-text-color);
      cursor: pointer;
    }

    .tab[aria-selected='true'] {
      border-bottom-color: var(--primary-color, #03a9f4);
      color: var(--primary-color, #03a9f4);
      font-weight: 500;
    }
  `;

  private renderTab(config: AdventCalendarCardConfig) {
    switch (this.tab) {
      case 'general':
        return html`<advent-calendar-editor-general .hass=${this.hass} .config=${config}></advent-calendar-editor-general>`;
      case 'persons':
        return html`<advent-calendar-editor-persons .hass=${this.hass} .config=${config}></advent-calendar-editor-persons>`;
      case 'doors':
        return html`<advent-calendar-editor-doors .hass=${this.hass} .config=${config}></advent-calendar-editor-doors>`;
      default:
        return html`<advent-calendar-editor-shared .hass=${this.hass} .config=${config}></advent-calendar-editor-shared>`;
    }
  }

  render() {
    const config = this.config;
    if (!config) {
      return html``;
    }
    return html`
      <div class="tabs" role="tablist" ?hidden=${TABS.length < 2}>
        ${TABS.map(
          (tab) => html`
            <button
              class="tab"
              role="tab"
              aria-selected=${this.tab === tab.id ? 'true' : 'false'}
              @click=${() => (this.tab = tab.id)}
            >
              ${tab.label}
            </button>
          `,
        )}
      </div>
      <div @config-changed=${this.onConfigChanged}>${this.renderTab(config)}</div>
    `;
  }
}

if (!customElements.get(EDITOR_TAG)) {
  customElements.define(EDITOR_TAG, AdventCalendarCardEditor);
}

declare global {
  interface HTMLElementTagNameMap {
    'advent-calendar-card-editor': AdventCalendarCardEditor;
  }
}
