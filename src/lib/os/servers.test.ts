// @kliv-spec-derived — from user intent: "each pond server shows a plausible, stable latency"
import { describe, it, expect } from 'vitest';
import { SERVERS, bestServer, findServers, isValidEndpointUrl, rollPing, signalBars } from './servers';

// @kliv-spec-derived — from user intent: "the proxy's connection endpoint must use the public Wisp server"
describe('wisp connection endpoint', () => {
  it('configures the public Wisp relay with a live websocket endpoint', () => {
    const wisp = SERVERS.find((s) => s.id === 'mercury-wisp');
    expect(wisp?.endpoint).toBe('wss://wisp.mercurywork.shop/');
    expect(isValidEndpointUrl(wisp?.endpoint ?? '')).toBe(true);
  });

  it('makes the Wisp relay the default best connection', () => {
    expect(bestServer().id).toBe('mercury-wisp');
  });

  it('accepts only websocket endpoint addresses', () => {
    expect(isValidEndpointUrl('wss://wisp.mercurywork.shop/')).toBe(true);
    expect(isValidEndpointUrl('ws://example.com')).toBe(true);
    expect(isValidEndpointUrl('https://example.com')).toBe(false);
    expect(isValidEndpointUrl('not a url')).toBe(false);
    expect(isValidEndpointUrl('')).toBe(false);
  });
});

describe('pond servers', () => {
  it('rolls pings within 30% of the base ping', () => {
    for (const s of SERVERS) {
      for (let i = 0; i < 40; i++) {
        const p = rollPing(s);
        expect(Number.isInteger(p)).toBe(true);
        expect(p).toBeGreaterThanOrEqual(Math.floor(s.basePing * 0.7) - 1);
        expect(p).toBeLessThanOrEqual(Math.ceil(s.basePing * 1.3) + 1);
      }
    }
  });

  it('finds servers by name, city or id', () => {
    expect(findServers('tokyo')[0].id).toBe('tokyo-pond');
    expect(findServers('Rubber')[0].id).toBe('rubber-uk');
    expect(findServers('frankfurt')[0].id).toBe('duckburg-eu');
    expect(findServers('').length).toBe(SERVERS.length);
  });

  it('has unique ids and a best server with the lowest ping', () => {
    expect(new Set(SERVERS.map((s) => s.id)).size).toBe(SERVERS.length);
    expect(bestServer().basePing).toBe(Math.min(...SERVERS.map((s) => s.basePing)));
  });

  it('grades signal bars consistently', () => {
    expect(signalBars(20)).toBe(4);
    expect(signalBars(80)).toBe(3);
    expect(signalBars(120)).toBe(2);
    expect(signalBars(300)).toBe(1);
  });
});
