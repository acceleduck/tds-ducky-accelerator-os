import { useEffect, useState } from 'react';
import { Loader2, LogIn, UserRound } from 'lucide-react';
import { useAuth, authErrorToMessage } from '@/hooks/useAuth';
import { useSettings } from '@/hooks/useSettings';
import { useProfile } from '@/hooks/useProfile';
import { useNow } from '@/hooks/useNow';
import { DuckLogo } from './DuckLogo';
import { UserAvatar } from './UserAvatar';

export function LockScreen({ onUnlock }: { onUnlock?: () => void }) {
  const { user, signIn, signUp } = useAuth();
  const { settings } = useSettings();
  const profile = useProfile();
  const now = useNow(true, 1000);
  const [revealed, setRevealed] = useState(false);

  useEffect(() => {
    const onKey = () => setRevealed(true);
    window.addEventListener('keydown', onKey, { once: true });
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // When a signed-in user locks the screen, any keypress unlocks it again.
  useEffect(() => {
    if (!user || !revealed || !onUnlock) return;
    const onKey = () => onUnlock();
    window.addEventListener('keydown', onKey, { once: true });
    return () => window.removeEventListener('keydown', onKey);
  }, [user, revealed, onUnlock]);

  return (
    <div
      className={`os-root wall-${settings.wallpaper} fixed inset-0 overflow-hidden`}
      onPointerDown={() => setRevealed(true)}
    >
      {/* clock face */}
      <div
        className={`pointer-events-none absolute inset-0 flex flex-col items-center transition-all duration-500 ${
          revealed ? '-translate-y-16 opacity-70' : 'justify-center opacity-100'
        }`}
      >
        <div className="text-[13vw] font-semibold leading-none tracking-tight text-white drop-shadow-2xl sm:text-8xl">
          {now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </div>
        <div className="mt-3 text-lg text-white/70">
          {now.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' })}
        </div>
        {!revealed && (
          <div className="absolute bottom-16 text-sm text-white/45">
            Click anywhere or press any key to sign in
          </div>
        )}
      </div>

      {/* sign-in card */}
      {revealed && (
        <div className="absolute inset-0 flex items-center justify-center p-4">
          {user ? (
            <div className="menu-pop os-glass-strong flex w-[min(380px,92vw)] flex-col items-center gap-5 rounded-2xl p-8 shadow-2xl">
              <UserAvatar name={profile.name} pfp={profile.pfp} seed={user.userUuid} size={64} />
              <div className="text-center">
                <div className="text-lg font-medium text-white">Welcome back, {profile.name}</div>
                <div className="mt-1 text-sm text-white/50">{user.email}</div>
              </div>
              <button
                onClick={onUnlock}
                className="flex items-center gap-2 rounded-xl bg-[var(--os-accent)] px-6 py-2.5 text-sm font-semibold text-[#17131f] transition hover:brightness-110"
              >
                <UserRound size={16} /> Unlock
              </button>
              <div className="text-xs text-white/35">…or press any key</div>
            </div>
          ) : (
            <LoginCard signIn={signIn} signUp={signUp} />
          )}
        </div>
      )}
    </div>
  );
}

function LoginCard({
  signIn,
  signUp,
}: {
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string, name?: string) => Promise<void>;
}) {
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    if (mode === 'signup' && password.length < 8) {
      setError('Password needs at least 8 characters.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      if (mode === 'signin') await signIn(email.trim(), password);
      else await signUp(email.trim(), password);
    } catch (err) {
      setError(authErrorToMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <form
      onSubmit={submit}
      className="menu-pop os-glass-strong flex w-[min(400px,92vw)] flex-col gap-4 rounded-2xl p-7 shadow-2xl"
    >
      <div className="flex flex-col items-center gap-2.5">
        <DuckLogo size={54} />
        <div className="text-lg font-semibold text-white">AcceleDuck OS</div>
        <div className="text-xs text-white/45">Quack without a trace.</div>
      </div>

      <div className="flex rounded-xl bg-white/5 p-1 text-sm">
        {(['signin', 'signup'] as const).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => { setMode(m); setError(''); }}
            className={`flex-1 rounded-lg py-1.5 font-medium transition ${
              mode === m ? 'bg-[var(--os-accent)] text-[#17131f]' : 'text-white/60 hover:text-white'
            }`}
          >
            {m === 'signin' ? 'Sign in' : 'Create account'}
          </button>
        ))}
      </div>

      <label className="flex flex-col gap-1.5 text-xs text-white/60">
        Email
        <input
          type="email"
          required
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="rounded-xl border border-white/10 bg-white/5 px-3.5 py-2.5 text-sm text-white placeholder:text-white/30 focus:border-[var(--os-accent)] focus:outline-none"
          placeholder="you@pond.dev"
        />
      </label>

      <label className="flex flex-col gap-1.5 text-xs text-white/60">
        Password
        <input
          type="password"
          required
          minLength={8}
          autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="rounded-xl border border-white/10 bg-white/5 px-3.5 py-2.5 text-sm text-white placeholder:text-white/30 focus:border-[var(--os-accent)] focus:outline-none"
          placeholder="8+ chars, upper & lower, number, symbol"
        />
      </label>

      {error && <div className="rounded-lg bg-red-500/15 px-3 py-2 text-xs text-red-300">{error}</div>}

      <button
        type="submit"
        disabled={busy}
        className="flex items-center justify-center gap-2 rounded-xl bg-[var(--os-accent)] py-2.5 text-sm font-semibold text-[#17131f] transition hover:brightness-110 disabled:opacity-60"
      >
        {busy ? <Loader2 size={16} className="animate-spin" /> : <LogIn size={16} />}
        {mode === 'signin' ? 'Sign in' : 'Create account'}
      </button>

      <div className="text-center text-[11px] text-white/30">
        Your sessions, chats and scores are saved to your account.
      </div>
    </form>
  );
}
