import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ComponentType } from 'react';
import db from '@/lib/shared/kliv-database.js';
import { toast } from 'sonner';
import { Coins, Trophy } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { useDuckcoins } from '@/hooks/useDuckcoins';
import { displayName } from '@/lib/os/chat';
import type { GameProps } from '../games/shared';
import { DuckDash } from '../games/duckdash';
import { FactoryFright } from '../games/factoryfright';
import { PlinkoPond } from '../games/plinko';
import { DuckPoker } from '../games/poker';
import { GridironDuck } from '../games/gridiron';
import { LiquidSoccer } from '../games/liquidsoccer';
import { DuckWar3 } from '../games/duckwar3';
import { DuckDrift } from '../games/drift';
import { DuckHole } from '../games/hole';
import { DuckMerge } from '../games/merge';
import { DuckBlocks } from '../games/blocks';
import { DuckBlaster } from '../games/blaster';

interface GameDef {
  id: string;
  name: string;
  emoji: string;
  blurb: string;
  tag?: string;
  Component: ComponentType<GameProps>;
}

interface ScoreRow {
  _row_id: number;
  player_name: string;
  score: number;
  _created_at: number;
}

const GAMES: GameDef[] = [
  { id: 'duck-war-3', name: 'Duck War 3', emoji: '🪖', blurb: 'WW2 ticket war — flags, squads, grenades', tag: 'NEW', Component: DuckWar3 },
  { id: 'plinko', name: 'Plinko Pond', emoji: '🎰', blurb: 'Bet real DuckCoins, chase the ×2.5', tag: '💰 BETS', Component: PlinkoPond },
  { id: 'duck-drift', name: 'Duck Drift', emoji: '🏎️', blurb: 'Slide the lot, stack drift combos', tag: 'NEW', Component: DuckDrift },
  { id: 'duck-hole', name: 'Duck Hole', emoji: '🕳️', blurb: 'Swallow the whole map', tag: 'NEW', Component: DuckHole },
  { id: 'duck-merge', name: 'Duck Merge', emoji: '🧬', blurb: 'Merge ducks into DUCK PRIME', tag: 'NEW', Component: DuckMerge },
  { id: 'duck-blocks', name: 'Duck Blocks', emoji: '🧱', blurb: 'Falling-block puzzle', tag: 'NEW', Component: DuckBlocks },
  { id: 'duck-blaster', name: 'Duck Blaster', emoji: '🚀', blurb: 'Wave shooter vs space frogs', tag: 'NEW', Component: DuckBlaster },
  { id: 'duck-dash', name: 'Duck Dash', emoji: '🐤', blurb: 'Flap through the pipes', Component: DuckDash },
  { id: 'factory-fright', name: 'Factory Fright', emoji: '🏭', blurb: 'Escape the toy factory', Component: FactoryFright },
  { id: 'poker', name: 'Duck Poker', emoji: '🃏', blurb: 'Jacks-or-better video poker', Component: DuckPoker },
  { id: 'gridiron', name: 'Gridiron Duck', emoji: '🏈', blurb: 'Pixel football dash', Component: GridironDuck },
  { id: 'liquid-soccer', name: 'Liquid Soccer', emoji: '💧', blurb: 'Wobbly 1v1 soccer', Component: LiquidSoccer },
];

const MEDALS = ['🥇', '🥈', '🥉'];

export default function DuckcadeApp() {
  const { user } = useAuth();
  const myName = displayName(user?.email);
  const coins = useDuckcoins();
  const [game, setGame] = useState(GAMES[0].id);
  const [board, setBoard] = useState<ScoreRow[]>([]);
  const [lastScore, setLastScore] = useState<number | null>(null);

  const loadBoard = useCallback(async () => {
    try {
      setBoard(await db.query<ScoreRow>('game_scores', { game: `eq.${game}`, order: 'score.desc', limit: '10' }));
    } catch {
      // keep previous board
    }
  }, [game]);

  useEffect(() => {
    void loadBoard();
  }, [loadBoard]);

  const submitScore = useCallback(
    async (value: number) => {
      setLastScore(value);
      if (value <= 0) return;
      try {
        await db.insertOne('game_scores', { game, player_name: myName, score: value });
        await loadBoard();
      } catch {
        toast.error('Could not save score');
      }
      const earned = await coins.award(game, value);
      if (earned > 0) toast.success(`🪙 +${earned} DuckCoins earned!`);
    },
    // coins.award is stable
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [game, myName, loadBoard],
  );

  const def = useMemo(() => GAMES.find((g) => g.id === game) ?? GAMES[0], [game]);
  const Active = def.Component;

  return (
    <div className="flex h-full flex-col lg:flex-row">
      <div className="flex min-h-0 flex-1 flex-col">
        <div className="flex items-center justify-between gap-2 border-b border-white/[0.06] px-3 py-2">
          <div
            className="flex items-center gap-1.5 rounded-xl border border-[var(--os-accent)]/40 bg-[var(--os-accent-soft)] px-3 py-1.5 text-sm font-semibold text-[var(--os-accent)]"
            title="Earn DuckCoins in every game (up to 300/day) — spend them on Plinko Pond bets"
          >
            <Coins size={15} />
            <span aria-label="DuckCoins balance">{coins.balance == null ? '…' : coins.balance.toLocaleString()} DuckCoins</span>
          </div>
          <div className="hidden text-[10px] text-white/35 sm:block">
            earn by playing · bet in Plinko Pond · +300/day max
          </div>
        </div>
        <div className="os-scroll flex gap-1.5 overflow-x-auto border-b border-white/[0.06] p-3">
          {GAMES.map((g) => (
            <button
              key={g.id}
              onClick={() => setGame(g.id)}
              title={g.blurb}
              className={`flex shrink-0 items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-medium transition ${
                game === g.id
                  ? 'bg-[var(--os-accent)] text-[#17131f]'
                  : 'bg-white/[0.05] text-white/70 hover:bg-white/10'
              }`}
            >
              <span>{g.emoji}</span>
              {g.name}
              {g.tag && game !== g.id && (
                <span className={`rounded-full px-1.5 py-0.5 text-[9px] font-bold ${g.tag === 'NEW' ? 'bg-emerald-500/20 text-emerald-300' : 'bg-amber-500/20 text-amber-300'}`}>
                  {g.tag}
                </span>
              )}
            </button>
          ))}
        </div>
        <div className="os-scroll min-h-0 flex-1 overflow-y-auto p-4">
          <div className="mb-3 text-xs text-white/40">{def.blurb} · playing as {myName}</div>
          <Active onScore={submitScore} coins={coins} />
        </div>
      </div>

      <aside className="os-scroll w-full shrink-0 overflow-y-auto border-t border-white/[0.06] p-4 lg:w-64 lg:border-l lg:border-t-0">
        <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-white/40">
          <Trophy size={12} className="text-[var(--os-accent)]" /> {def.name} — top 10
        </div>
        {lastScore != null && (
          <div className="mb-3 rounded-xl border border-[var(--os-accent)]/40 bg-[var(--os-accent-soft)] px-3 py-2 text-xs text-white/85">
            Last run: <b>{lastScore}</b> pts
          </div>
        )}
        {board.length === 0 ? (
          <div className="rounded-xl border border-dashed border-white/10 py-6 text-center text-xs text-white/35">
            No scores yet — be the first duck on the board!
          </div>
        ) : (
          <div className="overflow-hidden rounded-xl border border-white/[0.08]">
            {board.map((row, i) => (
              <div
                key={row._row_id}
                className={`flex items-center gap-2 px-3 py-2 text-xs ${
                  i % 2 === 0 ? 'bg-white/[0.03]' : ''
                }`}
              >
                <span className="w-6 text-center">{MEDALS[i] ?? i + 1}</span>
                <span className="min-w-0 flex-1 truncate text-white/80">{row.player_name}</span>
                <span className="font-semibold tabular-nums text-[var(--os-accent)]">{Number(row.score)}</span>
              </div>
            ))}
          </div>
        )}
        <div className="mt-3 text-[10px] leading-relaxed text-white/30">
          The leaderboard is shared with everyone using AcceleDuck OS. Duck War 3 bots even borrow
          names from this board. Every finished run pays DuckCoins into your wallet — up to 300 a
          day — and Plinko Pond bets spend them.
        </div>
      </aside>
    </div>
  );
}
