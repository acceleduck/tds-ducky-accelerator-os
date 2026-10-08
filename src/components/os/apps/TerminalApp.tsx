import { useEffect, useRef, useState } from 'react';
import db from '@/lib/shared/kliv-database.js';
import { useAuth } from '@/hooks/useAuth';
import { useProxySession } from '@/hooks/useProxySession';
import { useWindows } from '@/hooks/useWindows';
import { SERVERS, bestServer, findServers, rollPing } from '@/lib/os/servers';
import { displayName } from '@/lib/os/chat';

const BOOT_TIME = Date.now();

interface Line {
  kind: 'in' | 'out' | 'err' | 'sys';
  text: string;
}

const HELP_TEXT = `Available commands:
  help            show this list
  connect [name]  connect to a pond server (e.g. connect tokyo)
  disconnect      close the tunnel
  status          tunnel & session info
  servers         list pond servers
  speedtest       quick pond speed check (saves the result)
  chat            open DuckChat
  games           open the Duckcade
  whoami          who are you
  neofetch        duck system info
  date            current date & time
  echo <text>     repeat text
  clear           clear the screen
  exit            close this window`;

const DUCK_ASCII = [
  '      _',
  '   __(.)<   QUACK!',
  '   \\___)',
];

export default function TerminalApp({ windowId }: { windowId: string }) {
  const { user } = useAuth();
  const proxy = useProxySession();
  const { openApp, closeWindow } = useWindows();
  const [lines, setLines] = useState<Line[]>([
    { kind: 'sys', text: 'AcceleDuck OS — ducksh 1.1 (build 2026.10)' },
    { kind: 'sys', text: "Type 'help' to see what this duck can do." },
  ]);
  const [input, setInput] = useState('');
  const [history, setHistory] = useState<string[]>([]);
  const [histIdx, setHistIdx] = useState(-1);
  const [busy, setBusy] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [lines]);

  const push = (...newLines: Line[]) => setLines((prev) => [...prev, ...newLines]);

  const run = async (raw: string) => {
    const cmdline = raw.trim();
    push({ kind: 'in', text: cmdline });
    if (!cmdline) return;
    setHistory((h) => [cmdline, ...h]);
    setHistIdx(-1);

    const [cmd, ...args] = cmdline.split(/\s+/);
    const arg = args.join(' ');

    switch (cmd.toLowerCase()) {
      case 'help':
        push({ kind: 'out', text: HELP_TEXT });
        break;
      case 'clear':
        setLines([]);
        break;
      case 'echo':
        push({ kind: 'out', text: arg });
        break;
      case 'date':
        push({ kind: 'out', text: new Date().toString() });
        break;
      case 'whoami':
        push({ kind: 'out', text: `${displayName(user?.email)} <${user?.email ?? 'anonymous'}>` });
        break;
      case 'servers':
        push({
          kind: 'out',
          text: SERVERS.map((s) => `${s.flag} ${s.id.padEnd(14)} ${s.name} (${s.city}) ~${s.basePing}ms`).join('\n'),
        });
        break;
      case 'status': {
        if (proxy.status === 'connected' && proxy.server) {
          push({
            kind: 'out',
            text: [
              `tunnel:   UP (scramjet)`,
              `server:   ${proxy.server.name} — ${proxy.server.city}`,
              `ping:     ${proxy.ping} ms`,
              `session:  ${Math.round((Date.now() - (proxy.startedAt ?? Date.now())) / 60000)} min`,
              `tunnel:   ${proxy.tunnel?.tunnel_id ?? 'local'}`,
              `rotor:    ${proxy.tunnel?.obfuscation ?? 'n/a'}`,
            ].join('\n'),
          });
        } else if (proxy.status === 'connecting') {
          push({ kind: 'out', text: `tunnel: connecting… (${proxy.message})` });
        } else {
          push({ kind: 'out', text: 'tunnel: DOWN — run: connect <server>, or plain "connect" for the best pond' });
        }
        break;
      }
      case 'connect': {
        if (proxy.status === 'connecting' || proxy.status === 'disconnecting') {
          push({ kind: 'err', text: 'busy — wait for the current tunnel op to finish' });
          break;
        }
        const target = arg ? findServers(arg)[0] : bestServer();
        if (!target) {
          push({ kind: 'err', text: `no pond matches "${arg}" — try: ${SERVERS.slice(0, 3).map((s) => s.id).join(', ')}` });
          break;
        }
        setBusy(true);
        push({ kind: 'sys', text: `negotiating scramjet handshake with ${target.name}…` });
        await proxy.connect(target);
        push({ kind: 'out', text: `connected → ${target.name} (${proxy.ping || rollPing(target)} ms)` });
        setBusy(false);
        break;
      }
      case 'disconnect':
        setBusy(true);
        await proxy.disconnect();
        push({ kind: 'out', text: 'tunnel closed — traffic is direct' });
        setBusy(false);
        break;
      case 'speedtest': {
        setBusy(true);
        push({ kind: 'sys', text: 'measuring pond bandwidth…' });
        const server = proxy.server ?? bestServer();
        const ping = rollPing(server);
        const down = Math.round(260 + Math.random() * 640);
        const up = Math.round(130 + Math.random() * 340);
        try {
          await db.insertOne('speed_tests', {
            server_id: server.id,
            download_mbps: down,
            upload_mbps: up,
            ping_ms: ping,
          });
          push({ kind: 'out', text: `↓ ${down} Mbps   ↑ ${up} Mbps   ping ${ping} ms — saved` });
        } catch {
          push({ kind: 'err', text: 'measured, but saving failed' });
        }
        setBusy(false);
        break;
      }
      case 'chat':
        openApp('chat', 'DuckChat', 960, 640);
        push({ kind: 'sys', text: 'opening DuckChat…' });
        break;
      case 'games':
      case 'arcade':
        openApp('arcade', 'Duckcade', 920, 640);
        push({ kind: 'sys', text: 'opening the Duckcade…' });
        break;
      case 'neofetch': {
        const uptime = Math.max(1, Math.round((Date.now() - BOOT_TIME) / 60000));
        const info = [
          `${displayName(user?.email)}@acceleduck`,
          '─'.repeat(24),
          'OS:       AcceleDuck OS 1.1 (Ducky)',
          'Engine:   Scramjet/1 tunnel protocol',
          'Tunnel:   ' + (proxy.status === 'connected' ? `UP → ${proxy.server?.name}` : 'down'),
          'Ponds:    10 servers online',
          `Uptime:   ${uptime} min`,
          'Shell:    ducksh 1.1',
        ];
        const rows = Math.max(DUCK_ASCII.length, info.length);
        const out: string[] = [];
        for (let i = 0; i < rows; i++) {
          out.push(`${(DUCK_ASCII[i] ?? '').padEnd(14)}${info[i] ?? ''}`);
        }
        push({ kind: 'out', text: out.join('\n') });
        break;
      }
      case '/acceleduckinc':
        openApp('staff', 'AcceleDuck Inc', 480, 640);
        push({ kind: 'sys', text: 'opening AcceleDuck Inc staff console…' });
        break;
      case 'exit':
        closeWindow(windowId);
        break;
      case 'sudo':
        push({ kind: 'err', text: 'nice try. this duck answers to no one.' });
        break;
      default:
        push({ kind: 'err', text: `command not found: ${cmd} — try 'help'` });
    }
  };

  return (
    <div
      className="os-mono flex h-full flex-col bg-[#0a0d18] text-[13px]"
      onClick={() => inputRef.current?.focus()}
    >
      <div ref={scrollRef} className="os-scroll min-h-0 flex-1 overflow-y-auto p-3.5">
        {lines.map((line, i) => (
          <pre
            key={i}
            className={`whitespace-pre-wrap break-words ${
              line.kind === 'in'
                ? 'text-white/90'
                : line.kind === 'err'
                  ? 'text-red-400'
                  : line.kind === 'sys'
                    ? 'text-white/40'
                    : 'text-emerald-300/90'
            }`}
          >
            {line.kind === 'in' ? `$ ${line.text}` : line.text}
          </pre>
        ))}
        {busy && <pre className="text-white/40">…</pre>}
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (busy) return;
          const text = input;
          setInput('');
          void run(text);
        }}
        className="flex shrink-0 items-center gap-2 border-t border-white/[0.07] px-3.5 py-2.5"
      >
        <span className="text-[var(--os-accent)]">$</span>
        <input
          ref={inputRef}
          autoFocus
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              e.currentTarget.form?.requestSubmit();
            } else if (e.key === 'ArrowUp') {
              e.preventDefault();
              const next = Math.min(history.length - 1, histIdx + 1);
              if (history[next] != null) {
                setHistIdx(next);
                setInput(history[next]);
              }
            } else if (e.key === 'ArrowDown') {
              e.preventDefault();
              const next = histIdx - 1;
              setHistIdx(next);
              setInput(next >= 0 ? history[next] ?? '' : '');
            }
          }}
          aria-label="Terminal input"
          spellCheck={false}
          className="min-w-0 flex-1 bg-transparent text-white caret-[var(--os-accent)] outline-none placeholder:text-white/25"
          placeholder={busy ? 'wait…' : 'type a command — try neofetch'}
        />
      </form>
    </div>
  );
}
