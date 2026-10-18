import type { HomeAssistant } from '../src/types';

export interface MockHass extends HomeAssistant {
  /** Inhalt von frontend/*_user_data für diesen Benutzer. */
  userData: Map<string, unknown>;
  /** Alle WebSocket-Aufrufe in Reihenfolge. */
  calls: { type: string; [key: string]: unknown }[];
  /** Lässt frontend/set_user_data fehlschlagen. */
  failSave: boolean;
  /** Lässt frontend/get_user_data nie antworten. */
  hangLoad: boolean;
}

export function mockHass(
  options: {
    userId?: string;
    userName?: string;
    timeZone?: string;
    isAdmin?: boolean;
    userData?: Record<string, unknown>;
  } = {},
): MockHass {
  const hass: MockHass = {
    user: {
      id: options.userId ?? 'user-1',
      name: options.userName ?? 'Jens',
      is_admin: options.isAdmin ?? false,
    },
    config: { time_zone: options.timeZone ?? 'Europe/Berlin' },
    language: 'de',
    userData: new Map(Object.entries(options.userData ?? {})),
    calls: [],
    failSave: false,
    hangLoad: false,
    callService: async () => undefined,
    callWS: async <T>(msg: { type: string; [key: string]: unknown }): Promise<T> => {
      hass.calls.push(msg);
      const key = msg.key as string;
      switch (msg.type) {
        case 'frontend/get_user_data':
          if (hass.hangLoad) {
            return new Promise<T>(() => {});
          }
          return { value: structuredClone(hass.userData.get(key) ?? null) } as T;
        case 'frontend/set_user_data':
          if (hass.failSave) {
            throw new Error('Verbindung verloren');
          }
          hass.userData.set(key, JSON.parse(JSON.stringify(msg.value)));
          return null as T;
        default:
          throw new Error(`Unerwarteter Aufruf: ${msg.type}`);
      }
    },
  };
  return hass;
}
