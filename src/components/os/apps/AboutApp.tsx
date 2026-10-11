import { Gamepad2, MessageCircle, Music2, ShieldCheck, Terminal as TerminalIcon } from 'lucide-react';
import { DuckLogo } from '../DuckLogo';

const HIGHLIGHTS = [
  {
    icon: ShieldCheck,
    title: 'Scramjet tunnels',
    text: 'Connect to pond servers worldwide. The handshake runs on a real server engine; stats are demo-simulated and saved to your account.',
  },
  {
    icon: MessageCircle,
    title: 'DuckChat',
    text: 'A public lounge, your own little servers, private messages and (simulated) voice calls with anyone on the OS.',
  },
  {
    icon: Music2,
    title: 'Duck Beats',
    text: 'Paste YouTube or Spotify links into your own playlist and play them right inside the OS — saved to your account.',
  },
  {
    icon: Gamepad2,
    title: 'Duckcade',
    text: 'A dozen mini-games — maze warfare in Duck War 3, the 3D drift racer, Plinko Pond and more — on a shared leaderboard with DuckCoins.',
  },
  {
    icon: TerminalIcon,
    title: 'Duck Terminal',
    text: 'Type neofetch, connect tokyo, speedtest, chat or games — the shell drives the whole OS.',
  },
];

export default function AboutApp() {
  return (
    <div className="os-scroll h-full overflow-y-auto p-6">
      <div className="flex flex-col items-center gap-3 text-center">
        <DuckLogo size={72} />
        <div>
          <div className="text-xl font-bold text-white">AcceleDuck OS</div>
          <div className="mt-0.5 text-sm text-white/45">The TDS Ducky Accelerator — quack without a trace.</div>
        </div>
        <div className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-[11px] text-white/50">
          Version 1.1 · Ducky build 2026.10
        </div>
      </div>

      <div className="mt-6 flex flex-col gap-2.5">
        {HIGHLIGHTS.map((h) => (
          <div key={h.title} className="flex gap-3.5 rounded-2xl border border-white/[0.08] bg-white/[0.03] p-4">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[var(--os-accent-soft)]">
              <h.icon size={17} style={{ color: 'var(--os-accent)' }} />
            </span>
            <div>
              <div className="text-sm font-semibold text-white/90">{h.title}</div>
              <div className="mt-0.5 text-xs leading-relaxed text-white/50">{h.text}</div>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-5 rounded-2xl border border-dashed border-white/10 p-4 text-center text-[11px] leading-relaxed text-white/35">
        Heads-up: this is a demo operating system experience. Tunnel throughput, tracker counts and
        call audio are simulated — your account, chats, scores, sessions and settings are real and
        private to you.
      </div>
    </div>
  );
}
