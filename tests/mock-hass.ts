import type { HomeAssistant } from '../src/types';

export interface ServiceCall {
  domain: string;
  service: string;
  data?: Record<string, unknown>;
  target?: Record<string, unknown>;
  notifyOnError?: boolean;
}

export interface MockHass extends HomeAssistant {
  /** Inhalt von frontend/*_user_data für diesen Benutzer. */
  userData: Map<string, unknown>;
  /** Alle WebSocket-Aufrufe in Reihenfolge. */
  calls: { type: string; [key: string]: unknown }[];
  /** Alle hass.callService-Aufrufe in Reihenfolge. */
  serviceCalls: ServiceCall[];
  /** Lässt frontend/set_user_data fehlschlagen. */
  failSave: boolean;
  /** Lässt frontend/get_user_data nie antworten. */
  hangLoad: boolean;
  /** Lässt diesen Dienst („domain.service“) mit einem Fehler scheitern. */
  failService?: string;
}

export function mockHass(
  options: {
    userId?: string;
    userName?: string;
    timeZone?: string;
    isAdmin?: boolean;
    userData?: Record<string, unknown>;
    /** Verfügbare Dienste, z. B. ['script.turn_on', 'light.turn_on'] */
    services?: string[];
    /** Vorhandene Entitäten, z. B. ['script.advent_lichtshow'] */
    entities?: string[];
  } = {},
): MockHass {
  const services: Record<string, Record<string, unknown>> = {};
  for (const name of options.services ?? []) {
    const [domain, service] = name.split('.');
    services[domain] = { ...services[domain], [service]: {} };
  }

  const hass: MockHass = {
    user: {
      id: options.userId ?? 'user-1',
      name: options.userName ?? 'Jens',
      is_admin: options.isAdmin ?? false,
    },
    config: { time_zone: options.timeZone ?? 'Europe/Berlin' },
    language: 'de',
    states: Object.fromEntries((options.entities ?? []).map((id) => [id, { entity_id: id }])),
    services,
    userData: new Map(Object.entries(options.userData ?? {})),
    calls: [],
    serviceCalls: [],
    failSave: false,
    hangLoad: false,
    callService: async (domain, service, data, target, notifyOnError) => {
      hass.serviceCalls.push({ domain, service, data, target, notifyOnError });
      if (hass.failService === `${domain}.${service}`) {
        throw new Error('Unable to find referenced entities');
      }
      return undefined;
    },
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
