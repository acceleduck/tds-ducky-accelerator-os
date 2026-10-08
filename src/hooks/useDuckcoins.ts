import { useCallback, useEffect, useState } from 'react';
import functions from '@/lib/shared/kliv-functions.js';

export interface SpinOutcome {
  ok: true;
  slot: number;
  mult: number;
  payout: number;
  balance: number;
}

export interface SpinRefusal {
  ok: false;
  reason: string;
  message: string;
  balance?: number;
}

export interface DuckcoinsApi {
  balance: number | null;
  ready: boolean;
  spin: (bet: number) => Promise<SpinOutcome | SpinRefusal>;
  award: (game: string, score: number) => Promise<number>;
  refresh: () => Promise<void>;
}

interface HouseResponse {
  ok?: boolean;
  reason?: string;
  message?: string;
  balance?: number;
  slot?: number;
  mult?: number;
  payout?: number;
  coins?: number;
  dailyCap?: boolean;
}

export function useDuckcoins(): DuckcoinsApi {
  const [balance, setBalance] = useState<number | null>(null);
  const [ready, setReady] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const res = await functions.post<HouseResponse>('duckcoins-house', { action: 'balance' });
      if (typeof res.balance === 'number') setBalance(res.balance);
    } catch {
      // house unreachable — keep the last known balance
    } finally {
      setReady(true);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const spin = useCallback(async (bet: number): Promise<SpinOutcome | SpinRefusal> => {
    try {
      const res = await functions.post<HouseResponse>('duckcoins-house', { action: 'spin', bet });
      if (res.ok && typeof res.slot === 'number') {
        if (typeof res.balance === 'number') setBalance(res.balance);
        return {
          ok: true,
          slot: res.slot,
          mult: res.mult ?? 0,
          payout: res.payout ?? 0,
          balance: res.balance ?? 0,
        };
      }
      if (typeof res.balance === 'number') setBalance(res.balance);
      return {
        ok: false,
        reason: res.reason ?? 'refused',
        message: res.message ?? 'The pond house refused that drop',
        balance: res.balance,
      };
    } catch {
      return { ok: false, reason: 'offline', message: 'Could not reach the pond house — try again' };
    }
  }, []);

  const award = useCallback(async (game: string, score: number): Promise<number> => {
    try {
      const res = await functions.post<HouseResponse>('duckcoins-house', { action: 'award', game, score });
      if (typeof res.balance === 'number') setBalance(res.balance);
      return typeof res.coins === 'number' ? res.coins : 0;
    } catch {
      return 0;
    }
  }, []);

  return { balance, ready, spin, award, refresh };
}
