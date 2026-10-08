import { useEffect, useRef, useState } from 'react';
import { RotateCw, Send, Wrench } from 'lucide-react';
import { KlivAgent } from '@/lib/shared/kliv-agent.js';
import type { KlivAgentConversation } from '@/lib/shared/kliv-agent.js';
import { DuckLogo } from '../DuckLogo';

// Created once at module scope and reused for every message.
const agent = new KlivAgent({ account: 'ac6qvf0f904ese4q6s8e03e54tvtt8q335' }).agent('ducky-ai');
const CONVO_KEY = 'ados:ducky-convo';

interface Msg {
  id: string;
  role: 'user' | 'ai';
  text: string;
}

const GREETING: Msg = {
  id: 'greet',
  role: 'ai',
  text: 'Quack! I’m Ducky — this OS’s own assistant. Ask me about the Scramjet tunnel, Duck Browser, the arcade and DuckCoins, custom wallpapers… or bring me your homework.',
};

const SUGGESTIONS = [
  'How do I get past a blocked site on my Chromebook?',
  'What can this OS do?',
  'Best Duckcade game for earning DuckCoins?',
  'Explain Scramjet tunnels like I’m five',
];

function errText(code: string | null): string {
  switch (code) {
    case 'rate_limited':
      return 'The flock is a little busy — try again in a moment.';
    case 'stream_error':
    case 'network_error':
      return 'The connection wobbled mid-quack. Try sending again.';
    default:
      return 'Ducky hit a snag — try sending that again.';
  }
}

export default function DuckyAiApp() {
  const [msgs, setMsgs] = useState<Msg[]>([GREETING]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toolNote, setToolNote] = useState<string | null>(null);
  const convoRef = useRef<KlivAgentConversation | null>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [msgs, busy, toolNote, error]);

  const ensureConvo = (): KlivAgentConversation => {
    if (!convoRef.current) {
      convoRef.current = agent.conversation(sessionStorage.getItem(CONVO_KEY) || undefined);
    }
    return convoRef.current;
  };

  const reset = () => {
    convoRef.current = null;
    sessionStorage.removeItem(CONVO_KEY);
    setMsgs([GREETING]);
    setError(null);
    setToolNote(null);
  };

  const send = async (raw?: string) => {
    const text = (raw ?? input).trim();
    if (!text || busy) return;
    setInput('');
    setError(null);
    setToolNote(null);
    setBusy(true);
    setMsgs((p) => [...p, { id: `u${Date.now()}`, role: 'user', text }]);

    try {
      const convo = ensureConvo();
      for await (const ev of convo.send(text)) {
        if (ev.type === 'message_start') {
          const mid = ev.messageId;
          setMsgs((p) => (p.some((m) => m.id === mid) ? p : [...p, { id: mid, role: 'ai', text: '' }]));
        } else if (ev.type === 'token') {
          const mid = ev.messageId;
          const chunk = ev.text;
          setMsgs((p) =>
            p
              .map((m) => (m.id === mid ? { ...m, text: m.text + chunk } : m))
              .concat(
                p.some((m) => m.id === mid)
                  ? []
                  : [{ id: mid, role: 'ai' as const, text: chunk }],
              ),
          );
        } else if (ev.type === 'tool') {
          if (ev.explanation) setToolNote(ev.explanation);
        } else if (ev.type === 'message_end') {
          setToolNote(null);
        } else if (ev.type === 'error') {
          setError(errText(ev.code));
        }
      }
      if (convo.id) sessionStorage.setItem(CONVO_KEY, convo.id);
    } catch (e) {
      const status = (e as { status?: number }).status;
      if (status === 404) {
        convoRef.current = null;
        sessionStorage.removeItem(CONVO_KEY);
        setError('That chat flew south — send it again and I’ll start a fresh one.');
      } else {
        setError(errText(status ? `http_${status}` : 'network_error'));
      }
    } finally {
      setBusy(false);
      setToolNote(null);
    }
  };

  return (
    <div className="flex h-full flex-col bg-[#0e1120]">
      {/* header */}
      <div className="flex shrink-0 items-center gap-3 border-b border-white/[0.07] bg-[#12162a] px-4 py-2.5">
        <DuckLogo size={28} />
        <div className="min-w-0 flex-1">
          <div className="text-sm font-bold leading-tight text-white">Ducky AI</div>
          <div className="text-[11px] text-white/40">The OS’s own assistant · knows every corner of AcceleDuck</div>
        </div>
        <button
          onClick={reset}
          aria-label="Start a new chat"
          title="Start a new chat"
          className="flex items-center gap-1.5 rounded-xl bg-white/[0.06] px-3 py-1.5 text-xs text-white/75 transition hover:bg-white/10"
        >
          <RotateCw size={12} /> New chat
        </button>
      </div>

      {/* messages */}
      <div ref={listRef} className="os-scroll min-h-0 flex-1 overflow-y-auto px-4 py-4">
        <div className="mx-auto flex max-w-2xl flex-col gap-3">
          {msgs.map((m) => (
            <div
              key={m.id}
              className={
                m.role === 'user'
                  ? 'self-end rounded-2xl rounded-br-md bg-[var(--os-accent)] px-3.5 py-2.5 text-sm leading-relaxed text-[#17131f] shadow'
                  : 'self-start rounded-2xl rounded-bl-md border border-white/[0.08] bg-white/[0.04] px-3.5 py-2.5 text-sm leading-relaxed text-white/85'
              }
            >
              {m.text || (busy && m.role === 'ai' ? (
                <span className="flex items-center gap-1 py-0.5">
                  <span className="duck-dot" />
                  <span className="duck-dot" />
                  <span className="duck-dot" />
                </span>
              ) : (
                '…'
              ))}
            </div>
          ))}
          {toolNote && (
            <div className="self-start flex items-center gap-1.5 text-[11px] italic text-white/40">
              <Wrench size={11} /> {toolNote}
            </div>
          )}
          {error && (
            <div className="self-center rounded-xl border border-red-400/25 bg-red-400/10 px-3.5 py-2 text-xs text-red-200">
              {error}
            </div>
          )}
        </div>
      </div>

      {/* composer */}
      <div className="shrink-0 border-t border-white/[0.07] bg-[#12162a] px-4 py-3">
        <div className="mx-auto max-w-2xl">
          {msgs.length <= 1 && !busy && (
            <div className="mb-2.5 flex flex-wrap gap-1.5">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  onClick={() => void send(s)}
                  className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-[11px] text-white/65 transition hover:border-[var(--os-accent)]/50 hover:text-white"
                >
                  {s}
                </button>
              ))}
            </div>
          )}
          <div className="flex items-center gap-2">
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && input.trim()) void send();
              }}
              placeholder="Ask Ducky anything…"
              aria-label="Message Ducky AI"
              disabled={busy}
              className="min-w-0 flex-1 rounded-full border border-white/10 bg-white/[0.06] px-4 py-2.5 text-sm text-white placeholder:text-white/30 focus:border-[var(--os-accent)] focus:outline-none disabled:opacity-50"
            />
            <button
              onClick={() => void send()}
              disabled={busy || !input.trim()}
              aria-label="Send message"
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[var(--os-accent)] text-[#17131f] transition hover:brightness-110 disabled:opacity-40"
            >
              <Send size={16} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
