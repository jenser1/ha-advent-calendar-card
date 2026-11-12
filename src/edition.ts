import type { DoorContent } from './types';

/** Fest eingebauter Kalender der Community-Edition: dieselben Türchen für alle. */
export interface CommunityCalendar {
  year: number;
  doors: Record<number, DoorContent | null>;
}

/**
 * undefined in der Vollversion. Beim Bauen der Community-Edition ersetzt
 * rollup.config.mjs dieses Modul durch die Inhalte aus content/ – deshalb
 * steht hier nichts außer dieser Konstante.
 */
export const COMMUNITY_CALENDAR: CommunityCalendar | undefined = undefined;
