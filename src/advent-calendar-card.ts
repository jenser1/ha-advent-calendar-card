import { LitElement, css, html, nothing } from 'lit';
import { state } from 'lit/decorators.js';
import { repeat } from 'lit/directives/repeat.js';
import { version } from '../package.json';
import {
  runEffects,
  runSharedEffects,
  setHelperValue,
  sharedEffectMarker,
  sharedEffectNotice,
  validateEffect,
} from './blocks/effect';
import {
  controlMusic,
  musicControlFor,
  restoreVolumes,
  runSimpleEffects,
  validateSimpleEffects,
  type MusicAction,
} from './blocks/simple-effect';
import { adventSunday } from './advent-sundays';
import {
  SHARED_FILE,
  communityDoors,
  contentFile,
  fileName,
  isComplete,
  loadCalendarContent,
  serverPath,
  usesJson,
  validateCommunityConfig,
  validateContentConfig,
  withFileDoors,
  type CalendarContent,
} from './content-source';
import {
  DOOR_COUNT,
  daysUntilDoor,
  effectiveToday,
  formatGermanDate,
  getDoorStatus,
  isSameDate,
  isSeasonOver,
  parseDebugDate,
  type DoorStatus,
  type EffectiveToday,
} from './date-logic';
import { OPEN_ANIMATION_MS, type AdventCalendarDoor } from './door';
import { DEFAULT_EMPTY_TEXT } from './door-dialog';
import { COMMUNITY_CALENDAR } from './edition';
import { EDITOR_TAG } from './editor/advent-calendar-card-editor';
import {
  findCalendar,
  resolveDoor,
  validatePersonConfig,
  type CalendarMatch,
} from './persons';
import {
  isDone,
  isOpened,
  loadState,
  markOpened,
  openedCount,
  resetState,
  setTaskDone,
  storageKey,
  withTaskDone,
  type CalendarState,
} from './storage';
import './snow';
import {
  colorMode,
  doorColor,
  prefersReducedMotion,
  resolveTheme,
  shuffledDays,
  themeStyles,
} from './themes';
import type { AdventCalendarCardConfig, HomeAssistant } from './types';

export const CARD_TAG = 'advent-calendar-card';

// So oft wird geprüft, ob ein neuer Tag begonnen hat (z. B. Wandtablet über Mitternacht).
const DAY_CHECK_INTERVAL_MS = 60_000;

const COMMUNITY_DOORS = COMMUNITY_CALENDAR && communityDoors(COMMUNITY_CALENDAR);

/**
 * Kalender des Benutzers. In der Community-Edition sehen alle denselben; solange
 * der Benutzer unbekannt ist, wird neutral angezeigt.
 */
function calendarFor(
  config: AdventCalendarCardConfig,
  user: HomeAssistant['user'],
): CalendarMatch | undefined {
  if (COMMUNITY_DOORS) {
    return { calendar: { doors: COMMUNITY_DOORS } };
  }
  return user ? findCalendar(config, user) : { calendar: {} };
}

export class AdventCalendarCard extends LitElement {
  @state() private config?: AdventCalendarCardConfig;
  @state() private today?: EffectiveToday;
  /** Gespeicherter Stand; undefined, solange er nicht geladen ist. */
  @state() private calendar?: CalendarState;
  @state() private loadFailed = false;
  /** Türchen, dessen Inhalt gerade im Dialog angezeigt wird. */
  @state() private openDay?: number;
  /** Türchen aus den JSON-Dateien (content_source: json); undefined, solange sie nicht geladen sind. */
  @state() private content?: CalendarContent;

  private _hass?: HomeAssistant;
  private dayTimer?: number;
  /** Benutzer und Schlüssel, zu denen `calendar` gehört. */
  private calendarId?: string;
  private loadRequest = 0;
  /** Dateien, zu denen `content` gehört. */
  private contentId?: string;
  private contentIncomplete = false;
  private contentRequest = 0;
  private wasConnected = false;

  get hass(): HomeAssistant | undefined {
    return this._hass;
  }

  // Bewusst nicht reaktiv: HA setzt hass bei jeder Zustandsänderung neu.
  // Neu berechnet bzw. gezeichnet wird nur, wenn sich Benutzer, Zeitzone,
  // Admin-Status oder hell/dunkel ändern.
  set hass(hass: HomeAssistant | undefined) {
    const previous = this._hass;
    this._hass = hass;
    // Lautstärke zurückstellen, sobald die Musik eines Türchens zu Ende ist.
    restoreVolumes(hass);
    if (
      previous?.user?.id !== hass?.user?.id ||
      previous?.user?.name !== hass?.user?.name ||
      previous?.user?.is_admin !== hass?.user?.is_admin ||
      previous?.config.time_zone !== hass?.config.time_zone
    ) {
      this.refresh();
      this.requestUpdate();
    } else if (previous?.themes?.darkMode !== hass?.themes?.darkMode) {
      this.requestUpdate();
    } else if (this.openDay !== undefined && this.musicStateChanged(previous, hass)) {
      // Musik-Tasten im offenen Türchen aktuell halten (Pause ↔ Weiter).
      this.requestUpdate();
    }
  }

  private musicStateChanged(previous: HomeAssistant | undefined, hass: HomeAssistant | undefined): boolean {
    const entity = this.config?.effect_music?.entity_id;
    return !!entity && previous?.states?.[entity] !== hass?.states?.[entity];
  }

  private onMusicControl(event: CustomEvent<{ action: MusicAction; volume?: number }>): void {
    const hass = this._hass;
    const day = this.openDay;
    const user = hass?.user;
    if (!hass || day === undefined || !this.config) {
      return;
    }
    const match = user ? calendarFor(this.config, user) : undefined;
    const variables = { tag: day, person: match?.person ?? user?.name ?? '' };
    void this.reportEffectErrors(
      controlMusic(hass, this.config.effect_music, event.detail.action, variables, event.detail.volume).then(
        (errors) => [errors],
      ),
    );
  }

  /** Dunkles Design laut HA; ohne Angabe von HA zählt die Einstellung des Geräts. */
  private get darkMode(): boolean {
    const darkMode = this._hass?.themes?.darkMode;
    return darkMode ?? window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false;
  }

  static getStubConfig(): Omit<AdventCalendarCardConfig, 'type'> {
    return { title: 'Adventskalender' };
  }

  /** Visueller Editor im Dashboard-Editor von HA. */
  static getConfigElement(): HTMLElement {
    return document.createElement(EDITOR_TAG);
  }

  setConfig(config: AdventCalendarCardConfig): void {
    if (!config) {
      throw new Error('Ungültige Konfiguration.');
    }
    if (COMMUNITY_CALENDAR) {
      validateCommunityConfig(config, COMMUNITY_CALENDAR);
    }
    const { year, debug_date: debugDate } = config;
    if (year !== undefined && (!Number.isInteger(year) || year < 2000 || year > 2100)) {
      throw new Error('„year“ muss eine Jahreszahl sein, z. B. 2026.');
    }
    if (debugDate != null && debugDate !== '' && !parseDebugDate(debugDate)) {
      throw new Error('„debug_date“ muss ein Datum im Format JJJJ-MM-TT sein, z. B. 2026-12-05.');
    }
    if (config.empty_text !== undefined && typeof config.empty_text !== 'string') {
      throw new Error('„empty_text“ muss ein Text sein.');
    }
    if (config.effect != null) {
      validateEffect(config.effect, 'effect');
    }
    validateSimpleEffects(config);
    for (const option of ['snow', 'shuffle', 'advent_candles'] as const) {
      if (config[option] !== undefined && typeof config[option] !== 'boolean') {
        throw new Error(`„${option}“ muss true oder false sein.`);
      }
    }
    validatePersonConfig(config);
    validateContentConfig(config);
    this.config = config;
    this.refresh();
  }

  getCardSize(): number {
    return 8;
  }

  // Layout im Abschnitte-Dashboard: standardmäßig volle Breite.
  getGridOptions() {
    return { columns: 12, min_columns: 6 };
  }

  connectedCallback(): void {
    super.connectedCallback();
    // Beim Zurückkehren auf die Ansicht frisch laden: Auf einem anderen Gerät
    // könnte inzwischen ein Türchen geöffnet worden sein.
    this.refresh({ reload: this.wasConnected });
    this.wasConnected = true;
    this.dayTimer = window.setInterval(() => this.refresh(), DAY_CHECK_INTERVAL_MS);
    document.addEventListener('visibilitychange', this.onVisibilityChange);
  }

  disconnectedCallback(): void {
    super.disconnectedCallback();
    window.clearInterval(this.dayTimer);
    document.removeEventListener('visibilitychange', this.onVisibilityChange);
  }

  private onVisibilityChange = (): void => {
    if (document.visibilityState === 'visible') {
      this.refresh({ reload: true });
    }
  };

  /** Bestimmt „heute“ neu und lädt bei Bedarf den passenden Speicherstand und die Inhaltsdateien. */
  private refresh({ reload = false } = {}): void {
    this.refreshToday();
    void this.loadCalendar(reload);
    void this.loadContent(reload);
  }

  private refreshToday(): void {
    const next = effectiveToday({
      now: new Date(),
      timeZone: this._hass?.config.time_zone,
      debugDate: this.config?.debug_date,
      isAdmin: this._hass?.user?.is_admin === true,
    });
    const current = this.today;
    if (!current || current.debug !== next.debug || !isSameDate(current.date, next.date)) {
      this.today = next;
    }
  }

  private get year(): number | undefined {
    return this.today && (COMMUNITY_CALENDAR?.year ?? this.config?.year ?? this.today.date.year);
  }

  private get storageKey(): string | undefined {
    const year = this.year;
    return year === undefined ? undefined : storageKey(year, this.today!.debug);
  }

  /** Kennung aus Benutzer und Schlüssel; ändert sie sich, gehört der geladene Stand nicht mehr dazu. */
  private get currentCalendarId(): string | undefined {
    const userId = this._hass?.user?.id;
    const key = this.storageKey;
    return userId && key ? `${userId}/${key}` : undefined;
  }

  private async loadCalendar(reload: boolean): Promise<void> {
    const hass = this._hass;
    const key = this.storageKey;
    const id = this.currentCalendarId;
    // Nach einem Fehler wird bei jedem Aufruf (spätestens minütlich) erneut geladen.
    if (!hass || !key || !id || (!reload && !this.loadFailed && id === this.calendarId)) {
      return;
    }
    if (id !== this.calendarId) {
      // Anderer Benutzer oder anderes Jahr: alten Stand nicht weiter anzeigen.
      this.calendar = undefined;
      this.calendarId = id;
      this.openDay = undefined;
    }
    const request = ++this.loadRequest;
    try {
      const calendar = await loadState(hass, key);
      if (request === this.loadRequest) {
        this.calendar = calendar;
        this.loadFailed = false;
      }
    } catch (err) {
      if (request === this.loadRequest) {
        console.error('[advent-calendar-card] Laden fehlgeschlagen:', err);
        this.loadFailed = true;
      }
    }
  }

  /**
   * Lädt bei content_source: json die Dateien des Benutzers – zu denselben Zeitpunkten
   * wie den Speicherstand. Fehlt etwas oder ist es fehlerhaft, wird es bei jedem
   * Prüfen (spätestens minütlich) erneut geladen.
   */
  private async loadContent(reload: boolean): Promise<void> {
    const config = this.config;
    const user = this._hass?.user;
    const year = this.year;
    const match = config && user ? findCalendar(config, user) : undefined;
    if (!config || !usesJson(config) || !match || year === undefined) {
      this.content = undefined;
      this.contentId = undefined;
      return;
    }
    const id = [
      contentFile(config, fileName(match.person), year).url,
      contentFile(config, SHARED_FILE, year).url,
    ].join(' ');
    if (!reload && !this.contentIncomplete && id === this.contentId) {
      return;
    }
    if (id !== this.contentId) {
      this.content = undefined;
      this.contentId = id;
      this.openDay = undefined;
    }
    const request = ++this.contentRequest;
    const content = await loadCalendarContent(config, match.person, year);
    if (request === this.contentRequest) {
      this.content = content;
      this.contentIncomplete = !isComplete(content);
    }
  }

  private onDoorClick(
    door: AdventCalendarDoor,
    day: number,
    status: DoorStatus | undefined,
    daysLeft: number,
  ): void {
    if (status === 'locked') {
      door.wobble();
      this.toast(daysLeft === 1 ? 'Noch 1 Tag!' : `Noch ${daysLeft} Tage!`);
    } else if (status === 'openable') {
      door.playOpening();
      void this.openDoor(day);
      // Erst aufklappen lassen, dann den Inhalt zeigen.
      if (prefersReducedMotion()) {
        this.openDay = day;
      } else {
        window.setTimeout(() => (this.openDay = day), OPEN_ANIMATION_MS);
      }
    } else if (status === 'opened') {
      this.openDay = day;
    }
  }

  private async openDoor(day: number): Promise<void> {
    const hass = this._hass;
    const key = this.storageKey;
    const id = this.currentCalendarId;
    const before = this.calendar;
    const user = hass?.user;
    if (!hass || !key || !before || !user || !this.config) {
      return;
    }
    const config = this.config;
    const match = calendarFor(config, user);
    const year = this.year!;
    const test = this.today!.debug;
    // Sofort anzeigen, Speichern läuft im Hintergrund.
    this.calendar = { ...before, opened: { ...before.opened, [day]: new Date().toISOString() } };
    try {
      const { state, newlyOpened } = await markOpened(hass, key, day, new Date());
      if (id === this.currentCalendarId) {
        this.calendar = state;
      }
      // Erst nach Bestätigung durch den Server: So löst ein Türchen, das schon
      // auf einem anderen Gerät geöffnet wurde, den Effekt nicht noch einmal aus.
      if (newlyOpened && match) {
        const resolved = withFileDoors(config, match.calendar, this.content);
        const door = resolveDoor(resolved.config, resolved.calendar, day);
        const variables = { tag: day, person: match.person ?? user.name };
        const once =
          config.shared?.effect_once === false
            ? undefined
            : { helper: config.shared?.effect_helper, marker: sharedEffectMarker(year, day, test) };
        void this.reportEffectErrors(
          Promise.all([
            // Eigener Effekt aus der Karten-Config: bei jedem Türchen, auch ohne Inhalt.
            runEffects(hass, config.effect, variables),
            // Licht und Musik aus dem Editor (effect_light, effect_music).
            runSimpleEffects(hass, config, variables),
            runEffects(hass, door.personal?.effect, variables),
            runSharedEffects(hass, door.shared?.effect, variables, once),
          ]),
        );
      }
    } catch (err) {
      console.error('[advent-calendar-card] Speichern fehlgeschlagen:', err);
      if (id === this.currentCalendarId) {
        this.calendar = before;
      }
      this.toast('Türchen konnte nicht gespeichert werden. Bitte nochmal versuchen.');
    }
  }

  private async reportEffectErrors(results: Promise<string[][]>): Promise<void> {
    const errors = (await results).flat();
    if (errors.length > 0) {
      console.warn('[advent-calendar-card] Effekt nicht möglich:', errors);
      this.toast(`Effekt nicht möglich: ${errors.join(' · ')}`);
    }
  }

  private async onTaskToggle(
    event: CustomEvent<{ day: number; done: boolean; shared: boolean }>,
  ): Promise<void> {
    const { day, done, shared } = event.detail;
    const hass = this._hass;
    const key = this.storageKey;
    const id = this.currentCalendarId;
    const before = this.calendar;
    if (!hass || !key || !before) {
      return;
    }
    this.calendar = withTaskDone(before, day, done, shared, new Date());
    try {
      const state = await setTaskDone(hass, key, day, done, new Date(), shared);
      if (id === this.currentCalendarId) {
        this.calendar = state;
      }
    } catch (err) {
      console.error('[advent-calendar-card] Speichern fehlgeschlagen:', err);
      if (id === this.currentCalendarId) {
        this.calendar = before;
      }
      this.toast('Konnte nicht gespeichert werden. Bitte nochmal versuchen.');
    }
  }

  private async resetTestData(): Promise<void> {
    const hass = this._hass;
    const key = this.storageKey;
    if (!hass || !key || !this.today?.debug) {
      return;
    }
    try {
      this.calendar = await resetState(hass, key);
      // Auch den Test-Merker für gemeinsame Effekte löschen (echte Merker bleiben).
      const helper = this.config?.shared?.effect_helper;
      if (helper && hass.states?.[helper]?.state.startsWith('test:')) {
        await setHelperValue(hass, helper, '');
      }
      this.toast('Testdaten zurückgesetzt.');
    } catch (err) {
      console.error('[advent-calendar-card] Zurücksetzen fehlgeschlagen:', err);
      this.toast('Testdaten konnten nicht zurückgesetzt werden.');
    }
  }

  private toast(message: string): void {
    this.dispatchEvent(
      new CustomEvent('hass-notification', {
        detail: { message },
        bubbles: true,
        composed: true,
      }),
    );
  }


  render() {
    const year = this.year;
    if (!this.config || !this.today || year === undefined) {
      return nothing;
    }
    const { date: today, debug } = this.today;
    const title = this.config.title ?? `Adventskalender ${year}`;
    const header = title ? html`<h1 class="card-header">${title}</h1>` : nothing;
    const user = this._hass?.user;
    // Solange der Benutzer unbekannt ist, ist auch calendar undefined: Türchen bleiben neutral.
    const match = calendarFor(this.config, user);

    const theme = resolveTheme(match?.calendar.theme, this.config.theme);
    const mode = colorMode(theme, this.darkMode);
    const snow = this.config.snow ? html`<advent-calendar-snow></advent-calendar-snow>` : nothing;

    const json = usesJson(this.config);
    const content = json && match ? this.content : undefined;
    // Ohne Datei keine Türchen – sonst würden sie leer geöffnet und „verbraucht“.
    const missingFile = content?.personal.status === 'missing' ? content.personal.path : undefined;

    if (!match || missingFile) {
      const where = missingFile && serverPath(missingFile);
      const message = match
        ? 'Dein Kalender ist noch nicht fertig 🎅'
        : 'Für dich gibt’s noch keinen Kalender 🎅';
      return html`
        <ha-card class="theme-${theme} ${mode}">
          ${header}
          <div class="no-calendar">${message}</div>
          ${missingFile && user?.is_admin
            ? html`<div class="missing-file">
                Datei fehlt: ${missingFile}${where ? html`<br />Auf dem Server: ${where}` : nothing}
              </div>`
            : nothing}
          ${snow}
        </ha-card>
      `;
    }

    // Im JSON-Modus lassen sich Türchen erst öffnen, wenn alle Dateien fehlerfrei geladen sind.
    const ready = !json || (content !== undefined && isComplete(content));
    const contentErrors = content
      ? [content.personal, content.shared].flatMap((file) =>
          file.status === 'error' ? [file.message] : [],
        )
      : [];
    const resolved = withFileDoors(this.config, match.calendar, content);
    const calendar = this.calendar;
    // Pro Benutzer und Jahr fest gemischt; solange der Benutzer unbekannt ist, 1–24.
    const days =
      this.config.shuffle === false || !user
        ? Array.from({ length: DOOR_COUNT }, (_, i) => i + 1)
        : shuffledDays(`${user.id}-${year}`);
    const openDay = this.openDay;
    const door =
      openDay === undefined ? {} : resolveDoor(resolved.config, resolved.calendar, openDay);
    const notice = user?.is_admin
      ? sharedEffectNotice(resolved.config.shared, this._hass?.states)
      : undefined;

    return html`
      <ha-card class="theme-${theme} ${mode}">
        ${header}
        ${debug
          ? html`
              <div class="debug">
                <span>
                  🧪 Testmodus: heute ist der ${formatGermanDate(today)}.
                  Geöffnete Türchen werden getrennt gespeichert.
                </span>
                <button class="reset" @click=${this.resetTestData}>Testdaten zurücksetzen</button>
              </div>
            `
          : nothing}
        ${this.loadFailed
          ? html`<div class="error">Gespeicherter Stand konnte nicht geladen werden.</div>`
          : nothing}
        ${contentErrors.map((message) => html`<div class="error">${message}</div>`)}
        ${notice ? html`<div class="notice">${notice}</div>` : nothing}
        <div class="doors">
          ${repeat(
            days,
            (day) => day,
            (day) => {
              const status =
                calendar && ready
                  ? getDoorStatus(day, year, today, isOpened(calendar, day))
                  : undefined;
              const color = doorColor(theme, mode, day);
              return html`
                <advent-calendar-door
                  .day=${day}
                  .status=${status}
                  style=${color ? `--advent-door-bg: ${color}` : ''}
                  @click=${(event: Event) =>
                    this.onDoorClick(
                      event.currentTarget as AdventCalendarDoor,
                      day,
                      status,
                      daysUntilDoor(day, year, today),
                    )}
                ></advent-calendar-door>
              `;
            },
          )}
        </div>
        ${calendar && isSeasonOver(year, today)
          ? html`<div class="stats">${openedCount(calendar)}/${DOOR_COUNT} geöffnet</div>`
          : nothing}
        <advent-calendar-dialog
          .open=${openDay !== undefined}
          .day=${openDay ?? 0}
          .content=${door.personal ?? null}
          .sharedContent=${door.shared ?? null}
          .emptyText=${this.config.empty_text ?? DEFAULT_EMPTY_TEXT}
          .taskDone=${!!calendar && openDay !== undefined && isDone(calendar, openDay)}
          .sharedTaskDone=${!!calendar && openDay !== undefined && isDone(calendar, openDay, true)}
          .advent=${openDay !== undefined && this.config.advent_candles !== false
            ? adventSunday(year, openDay)
            : undefined}
          .music=${openDay !== undefined
            ? musicControlFor(this._hass, this.config.effect_music, openDay)
            : undefined}
          @advent-dialog-close=${() => (this.openDay = undefined)}
          @task-toggle=${this.onTaskToggle}
          @music-control=${this.onMusicControl}
        ></advent-calendar-dialog>
        ${snow}
      </ha-card>
    `;
  }

  static styles = [
    themeStyles,
    css`
    :host {
      display: block;
    }

    ha-card {
      container-type: inline-size;
      position: relative;
      overflow: hidden;
      --ha-card-background: var(--advent-bg, var(--card-background-color));
    }

    /* Inhalte über dem Schnee */
    ha-card > :not(advent-calendar-snow) {
      position: relative;
      z-index: 1;
    }

    .card-header {
      color: var(--advent-text, var(--primary-text-color));
    }

    .debug,
    .error,
    .notice {
      margin: 0 16px 12px;
      padding: 6px 10px;
      border-radius: 8px;
      font-size: 0.9em;
    }

    .notice {
      background: var(--secondary-background-color, #f2f2f2);
      color: var(--primary-text-color);
    }

    .debug {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 6px 12px;
      background: var(--warning-color, #ffa600);
      color: #000;
    }

    .debug span {
      flex: 1 1 200px;
    }

    .reset {
      font: inherit;
      padding: 4px 10px;
      border-radius: 6px;
      border: 1px solid rgba(0, 0, 0, 0.4);
      background: rgba(255, 255, 255, 0.6);
      color: inherit;
      cursor: pointer;
    }

    .error {
      background: var(--error-color, #db4437);
      color: #fff;
    }

    .debug:first-child,
    .error:first-child,
    .notice:first-child {
      margin-top: 16px;
    }

    .doors {
      display: grid;
      grid-template-columns: repeat(4, minmax(0, 1fr));
      gap: 8px;
      padding: 16px;
    }

    .card-header + .doors,
    .debug + .doors,
    .error + .doors,
    .notice + .doors {
      padding-top: 0;
    }

    .stats {
      padding: 0 16px 16px;
      text-align: center;
      color: var(--advent-muted, var(--secondary-text-color));
    }

    .no-calendar {
      padding: 16px 16px 24px;
      text-align: center;
      font-size: 1.1em;
      color: var(--advent-muted, var(--secondary-text-color));
    }

    .no-calendar:first-child {
      padding-top: 24px;
    }

    .missing-file {
      margin: -12px 16px 24px;
      text-align: center;
      font-size: 0.85em;
      overflow-wrap: anywhere;
      color: var(--advent-muted, var(--secondary-text-color));
    }

    @container (min-width: 480px) {
      .doors {
        grid-template-columns: repeat(6, minmax(0, 1fr));
        gap: 12px;
      }
    }
  `,
  ];
}

if (!customElements.get(CARD_TAG)) {
  customElements.define(CARD_TAG, AdventCalendarCard);

  window.customCards = window.customCards ?? [];
  window.customCards.push({
    type: CARD_TAG,
    name: 'Adventskalender',
    description: COMMUNITY_CALENDAR
      ? `Der Community-Adventskalender ${COMMUNITY_CALENDAR.year} – jeden Tag ein neues Türchen.`
      : 'Ein eigener Adventskalender für jede Person im Haushalt.',
    preview: true,
    documentationURL: 'https://github.com/jenser1/ha-advent-calendar-card',
  });

  const edition = COMMUNITY_CALENDAR ? ` Community ${COMMUNITY_CALENDAR.year}` : '';
  console.info(
    `%c ADVENT-CALENDAR-CARD %c v${version}${edition} `,
    'color: #fff; background: #b71c1c; font-weight: 700;',
    'color: #b71c1c; background: #fff; font-weight: 700;',
  );
}

declare global {
  interface HTMLElementTagNameMap {
    'advent-calendar-card': AdventCalendarCard;
  }
}
