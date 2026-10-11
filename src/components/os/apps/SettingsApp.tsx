import { useEffect, useRef, useState } from 'react';
import { Check, ImagePlus, KeyRound, Link2, Loader2, LogOut, Palette, Phone, Play, Trash2, Upload, UserRound } from 'lucide-react';
import { toast } from 'sonner';
import content from '@/lib/shared/kliv-content.js';
import { useAuth, authErrorToMessage } from '@/hooks/useAuth';
import { useProfile } from '@/hooks/useProfile';
import { useSettings, ACCENTS, WALLPAPERS, WALLPAPER_FITS, wallpaperStyle } from '@/hooks/useSettings';
import type { WallpaperFit } from '@/hooks/useSettings';
import { pfpProblem, sanitizeDisplayName } from '@/lib/os/profile';
import { emailToUsername } from '@/lib/os/username';
import { RINGTONES, playRingtone } from '@/lib/os/ringtone';
import { DuckLogo } from '../DuckLogo';
import { UserAvatar } from '../UserAvatar';

const MAX_UPLOAD_BYTES = 6 * 1024 * 1024;

export default function SettingsApp() {
  const { settings, accentHex, update } = useSettings();
  const { user, signOut, updatePassword } = useAuth();
  const profile = useProfile();
  const [urlInput, setUrlInput] = useState('');
  const [uploading, setUploading] = useState(false);
  const [ringtoneUploading, setRingtoneUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const ringtoneRef = useRef<HTMLInputElement>(null);

  /* account editing */
  const [nameInput, setNameInput] = useState('');
  const [nameBusy, setNameBusy] = useState(false);
  const [pfpBusy, setPfpBusy] = useState(false);
  const pfpRef = useRef<HTMLInputElement>(null);
  const [pwCur, setPwCur] = useState('');
  const [pwNew, setPwNew] = useState('');
  const [pwConfirm, setPwConfirm] = useState('');
  const [pwBusy, setPwBusy] = useState(false);
  const [pwErr, setPwErr] = useState<string | null>(null);

  useEffect(() => {
    setNameInput(profile.rawName);
  }, [profile.rawName]);

  const customActive = settings.wallpaper === 'custom' && !!settings.customWallpaper;
  const preview = customActive ? wallpaperStyle(settings) : null;


  const saveName = async () => {
    const clean = sanitizeDisplayName(nameInput);
    if (!clean) {
      toast.error('Pick a name with at least one letter.');
      return;
    }
    setNameBusy(true);
    try {
      await profile.save({ name: clean });
      toast.success('Name saved — chat and the lock screen will use it');
    } catch {
      toast.error('Could not save your name — try again.');
    } finally {
      setNameBusy(false);
    }
  };

  const onPfp = async (file: File | undefined | null) => {
    if (!file) return;
    const problem = pfpProblem(file);
    if (problem) {
      toast.error(problem);
      return;
    }
    setPfpBusy(true);
    try {
      const meta = await content.uploadFile(file, 'pfps');
      await profile.save({ pfp: meta.path });
      toast.success('Profile picture updated');
    } catch {
      toast.error('The upload got its feathers wet — try again.');
    } finally {
      setPfpBusy(false);
      if (pfpRef.current) pfpRef.current.value = '';
    }
  };

  const removePfp = async () => {
    const old = profile.pfp;
    setPfpBusy(true);
    try {
      await profile.save({ pfp: null });
      if (old && old.startsWith('/content/')) {
        try {
          await content.deleteFile(old);
        } catch {
          // file already gone — the profile is cleared either way
        }
      }
      toast.success('Picture removed');
    } catch {
      toast.error('Could not remove the picture — try again.');
    } finally {
      setPfpBusy(false);
    }
  };

  const changePassword = async () => {
    setPwErr(null);
    if (pwNew.length < 8) {
      setPwErr('New password needs at least 8 characters.');
      return;
    }
    if (pwNew !== pwConfirm) {
      setPwErr("The new passwords don't match.");
      return;
    }
    setPwBusy(true);
    try {
      await updatePassword(pwCur, pwNew);
      toast.success('Password changed');
      setPwCur('');
      setPwNew('');
      setPwConfirm('');
    } catch (err) {
      setPwErr(authErrorToMessage(err));
    } finally {
      setPwBusy(false);
    }
  };

  const applyUrl = () => {
    const t = urlInput.trim();
    if (!t) return;
    if (!/^https?:\/\/\S+$/i.test(t) && !t.startsWith('/content/')) {
      toast.error('That doesn’t look like an image link.');
      return;
    }
    update({ wallpaper: 'custom', customWallpaper: t });
    setUrlInput('');
    toast.success('Custom background applied');
  };

  const onFile = async (file: File | undefined | null) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      toast.error('Wallpapers need to be images (JPG, PNG, GIF or WebP).');
      return;
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      toast.error('That image is over 6 MB — try a smaller one.');
      return;
    }
    setUploading(true);
    try {
      const meta = await content.uploadFile(file, 'wallpapers');
      update({ wallpaper: 'custom', customWallpaper: meta.path });
      toast.success('Custom background uploaded');
    } catch {
      toast.error('The upload got its feathers wet — try again.');
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const onRingtone = async (file: File | undefined | null) => {
    if (!file) return;
    if (!/^audio\//.test(file.type) && !/\.(mp3|ogg|wav|m4a|aac)$/i.test(file.name)) {
      toast.error('Ringtones need to be an audio file (MP3, OGG or WAV).');
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      toast.error('Keep ringtones under 2 MB.');
      return;
    }
    setRingtoneUploading(true);
    try {
      const meta = await content.uploadFile(file, 'ringtones');
      update({ callRingtone: `custom:${meta.path}` });
      toast.success('Custom ringtone saved');
    } catch {
      toast.error('The upload got its feathers wet — try again.');
    } finally {
      setRingtoneUploading(false);
      if (ringtoneRef.current) ringtoneRef.current.value = '';
    }
  };

  return (
    <div className="os-scroll h-full overflow-y-auto p-5">
      {/* personalization */}
      <section className="rounded-2xl border border-white/[0.08] bg-white/[0.03] p-5">
        <div className="mb-4 flex items-center gap-2 text-sm font-semibold text-white/85">
          <Palette size={15} className="text-[var(--os-accent)]" /> Personalization
        </div>

        <div className="text-xs font-semibold uppercase tracking-wider text-white/40">Accent</div>
        <div className="mt-2.5 flex flex-wrap gap-2.5">
          {ACCENTS.map((a) => (
            <button
              key={a.id}
              onClick={() => update({ accent: a.id })}
              title={a.name}
              aria-label={`Accent ${a.name}`}
              className="flex h-10 w-10 items-center justify-center rounded-full transition hover:scale-110"
              style={{
                background: a.hex,
                outline: settings.accent === a.id ? `2px solid ${a.hex}` : 'none',
                outlineOffset: 3,
              }}
            >
              {settings.accent === a.id && <Check size={16} className="text-[#17131f]" />}
            </button>
          ))}
        </div>

        <div className="mt-5 text-xs font-semibold uppercase tracking-wider text-white/40">Wallpaper</div>
        <div className="mt-2.5 grid grid-cols-2 gap-2.5 sm:grid-cols-4">
          {WALLPAPERS.map((w) => (
            <button
              key={w.id}
              onClick={() => update({ wallpaper: w.id })}
              className={`overflow-hidden rounded-xl border text-left transition ${
                settings.wallpaper === w.id ? 'border-[var(--os-accent)]' : 'border-white/10 hover:border-white/30'
              }`}
            >
              <div className={`wall-${w.id} h-16 w-full`} />
              <div className="flex items-center justify-between px-2.5 py-1.5 text-[11px] text-white/70">
                {w.name}
                {settings.wallpaper === w.id && <Check size={12} style={{ color: accentHex }} />}
              </div>
            </button>
          ))}
        </div>

        {/* custom background */}
        <div className="mt-4 rounded-2xl border border-white/10 bg-white/[0.03] p-3.5">
          <div className="text-xs font-semibold text-white/70">Custom background</div>

          {preview && (
            <div
              aria-label="Custom background preview"
              className="mt-2.5 h-24 w-full rounded-xl border border-white/10 bg-[#0b0e1a]"
              style={preview}
            />
          )}

          <div className="mt-2.5 flex flex-col gap-2 sm:flex-row">
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              onChange={(e) => void onFile(e.target.files?.[0])}
              aria-label="Upload a wallpaper image"
              className="hidden"
            />
            <button
              onClick={() => fileRef.current?.click()}
              disabled={uploading}
              className="flex items-center justify-center gap-1.5 rounded-xl bg-[var(--os-accent)] px-4 py-2 text-xs font-semibold text-[#17131f] transition hover:brightness-110 disabled:opacity-50"
            >
              <Upload size={13} /> {uploading ? 'Uploading…' : 'Upload image'}
            </button>
            <div className="relative min-w-0 flex-1">
              <Link2 size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/35" />
              <input
                value={urlInput}
                onChange={(e) => setUrlInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && applyUrl()}
                placeholder="…or paste any image link (https://…)"
                aria-label="Custom background image link"
                className="w-full rounded-xl border border-white/10 bg-white/[0.04] py-2 pl-8 pr-3 text-xs text-white placeholder:text-white/30 focus:border-[var(--os-accent)] focus:outline-none"
              />
            </div>
            <button
              onClick={applyUrl}
              disabled={!urlInput.trim()}
              className="rounded-xl border border-white/15 px-4 py-2 text-xs font-medium text-white/85 transition hover:bg-white/10 disabled:opacity-40"
            >
              Apply
            </button>
          </div>

          {customActive && (
            <div className="mt-2.5 flex flex-wrap items-center gap-2">
              <span className="text-[11px] text-white/40">Fit:</span>
              {WALLPAPER_FITS.map((f) => (
                <button
                  key={f.id}
                  onClick={() => update({ wallpaperFit: f.id as WallpaperFit })}
                  className={`rounded-full px-3 py-1 text-[11px] font-medium transition ${
                    settings.wallpaperFit === f.id
                      ? 'bg-[var(--os-accent)] text-[#17131f]'
                      : 'bg-white/[0.05] text-white/60 hover:bg-white/10'
                  }`}
                >
                  {f.name}
                </button>
              ))}
              <button
                onClick={() => update({ wallpaper: WALLPAPERS[0].id })}
                className="ml-auto flex items-center gap-1 rounded-full border border-white/10 px-3 py-1 text-[11px] text-white/50 transition hover:border-red-400/40 hover:text-red-200"
              >
                <Trash2 size={11} /> Remove
              </button>
            </div>
          )}

          <div className="mt-2.5 text-[11px] leading-relaxed text-white/30">
            JPG, PNG, GIF or WebP up to 6 MB — saved to your account and applied instantly.
          </div>
        </div>
        <div className="mt-3 text-[11px] text-white/30">All personalization is saved to your account instantly.</div>
      </section>

      {/* calls */}
      <section className="mt-4 rounded-2xl border border-white/[0.08] bg-white/[0.03] p-5">
        <div className="mb-4 flex items-center gap-2 text-sm font-semibold text-white/85">
          <Phone size={15} className="text-[var(--os-accent)]" /> Calls
        </div>
        <div className="text-xs font-semibold uppercase tracking-wider text-white/40">Incoming call ringtone</div>
        <div className="mt-2.5 flex flex-wrap gap-2">
          {RINGTONES.map((r) => {
            const active = settings.callRingtone === r.id;
            return (
              <button
                key={r.id}
                onClick={() => update({ callRingtone: r.id })}
                className={`flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-medium transition ${
                  active ? 'bg-[var(--os-accent)] text-[#17131f]' : 'bg-white/[0.05] text-white/60 hover:bg-white/10'
                }`}
              >
                {r.name}
                {active && <Check size={12} />}
              </button>
            );
          })}
          {settings.callRingtone.startsWith('custom:') && (
            <span className="flex items-center gap-1.5 rounded-full bg-[var(--os-accent)] px-3.5 py-1.5 text-xs font-semibold text-[#17131f]">
              Custom <Check size={12} />
            </span>
          )}
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button
            onClick={() => playRingtone(settings.callRingtone, false)}
            className="flex items-center gap-1.5 rounded-xl border border-white/15 px-4 py-2 text-xs font-medium text-white/85 transition hover:bg-white/10"
          >
            <Play size={13} /> Preview
          </button>
          <input
            ref={ringtoneRef}
            type="file"
            accept="audio/*"
            onChange={(e) => void onRingtone(e.target.files?.[0])}
            aria-label="Upload a ringtone"
            className="hidden"
          />
          <button
            onClick={() => ringtoneRef.current?.click()}
            disabled={ringtoneUploading}
            className="flex items-center gap-1.5 rounded-xl bg-[var(--os-accent)] px-4 py-2 text-xs font-semibold text-[#17131f] transition hover:brightness-110 disabled:opacity-50"
          >
            <Upload size={13} /> {ringtoneUploading ? 'Uploading…' : 'Upload your own'}
          </button>
          {settings.callRingtone.startsWith('custom:') && (
            <button
              onClick={() => update({ callRingtone: RINGTONES[0].id })}
              className="flex items-center gap-1.5 rounded-full border border-white/10 px-3 py-1.5 text-[11px] text-white/50 transition hover:border-red-400/40 hover:text-red-200"
            >
              <Trash2 size={11} /> Use preset
            </button>
          )}
        </div>
        <div className="mt-2.5 text-[11px] leading-relaxed text-white/30">
          Plays when a call comes in — MP3, OGG or WAV up to 2 MB, saved to your account.
        </div>
      </section>

      {/* account */}
      <section className="mt-4 rounded-2xl border border-white/[0.08] bg-white/[0.03] p-5">
        <div className="mb-4 flex items-center gap-2 text-sm font-semibold text-white/85">
          <UserRound size={15} className="text-[var(--os-accent)]" /> Account
        </div>

        <div className="flex items-center gap-4">
          <UserAvatar
            name={profile.name}
            pfp={profile.pfp}
            seed={user?.userUuid}
            size={72}
            className="ring-2 ring-white/15"
          />
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-medium text-white">{profile.name}</div>
            <div className="truncate text-xs text-white/45">@{emailToUsername(user?.email)} · signs in with this username</div>
          </div>
          <button
            onClick={() => void signOut()}
            className="flex items-center gap-1.5 rounded-xl bg-white/10 px-4 py-2 text-xs text-white/80 transition hover:bg-white/15"
          >
            <LogOut size={13} /> Sign out
          </button>
        </div>

        {/* profile picture */}
        <div className="mt-4 rounded-2xl border border-white/10 bg-white/[0.03] p-3.5">
          <div className="text-xs font-semibold text-white/70">Profile picture</div>
          <div className="mt-1 text-[11px] leading-relaxed text-white/35">
            Pick any image from your device — a screenshot, a selfie, duck art. It shows on the lock
            screen, start menu and next to your chat messages.
          </div>
          <input
            ref={pfpRef}
            type="file"
            accept="image/*"
            onChange={(e) => void onPfp(e.target.files?.[0])}
            aria-label="Upload a profile picture"
            className="hidden"
          />
          <div className="mt-2.5 flex flex-wrap items-center gap-2">
            <button
              onClick={() => pfpRef.current?.click()}
              disabled={pfpBusy}
              className="flex items-center gap-1.5 rounded-xl bg-[var(--os-accent)] px-4 py-2 text-xs font-semibold text-[#17131f] transition hover:brightness-110 disabled:opacity-50"
            >
              {pfpBusy ? <Loader2 size={13} className="animate-spin" /> : <ImagePlus size={13} />}
              {pfpBusy ? 'Uploading…' : profile.pfp ? 'Replace picture' : 'Upload picture'}
            </button>
            {profile.pfp && (
              <button
                onClick={() => void removePfp()}
                disabled={pfpBusy}
                className="flex items-center gap-1.5 rounded-full border border-white/10 px-3 py-1.5 text-[11px] text-white/50 transition hover:border-red-400/40 hover:text-red-200 disabled:opacity-40"
              >
                <Trash2 size={11} /> Remove
              </button>
            )}
          </div>
        </div>

        {/* display name */}
        <div className="mt-3 rounded-2xl border border-white/10 bg-white/[0.03] p-3.5">
          <div className="text-xs font-semibold text-white/70">Display name</div>
          <div className="mt-2 flex flex-col gap-2 sm:flex-row">
            <input
              id="acct-name"
              value={nameInput}
              onChange={(e) => setNameInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void saveName();
              }}
              maxLength={24}
              aria-label="Display name"
              placeholder="How other ducks see you"
              className="min-w-0 flex-1 rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-xs text-white placeholder:text-white/30 focus:border-[var(--os-accent)] focus:outline-none"
            />
            <button
              onClick={() => void saveName()}
              disabled={nameBusy || nameInput.trim() === profile.rawName}
              className="flex items-center justify-center gap-1.5 rounded-xl bg-[var(--os-accent)] px-4 py-2 text-xs font-semibold text-[#17131f] transition hover:brightness-110 disabled:opacity-40"
            >
              {nameBusy && <Loader2 size={12} className="animate-spin" />} Save name
            </button>
          </div>
        </div>

        {/* password */}
        <div className="mt-3 rounded-2xl border border-white/10 bg-white/[0.03] p-3.5">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-white/70">
            <KeyRound size={12} className="text-[var(--os-accent)]" /> Change password
          </div>
          <div className="mt-2 grid gap-2 sm:grid-cols-3">
            <input
              type="password"
              value={pwCur}
              onChange={(e) => setPwCur(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void changePassword();
              }}
              aria-label="Current password"
              placeholder="Current password"
              autoComplete="current-password"
              className="rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-xs text-white placeholder:text-white/30 focus:border-[var(--os-accent)] focus:outline-none"
            />
            <input
              type="password"
              value={pwNew}
              onChange={(e) => setPwNew(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void changePassword();
              }}
              aria-label="New password"
              placeholder="New password (8+)"
              autoComplete="new-password"
              className="rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-xs text-white placeholder:text-white/30 focus:border-[var(--os-accent)] focus:outline-none"
            />
            <input
              type="password"
              value={pwConfirm}
              onChange={(e) => setPwConfirm(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void changePassword();
              }}
              aria-label="Confirm new password"
              placeholder="Repeat it"
              autoComplete="new-password"
              className="rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-xs text-white placeholder:text-white/30 focus:border-[var(--os-accent)] focus:outline-none"
            />
          </div>
          {pwErr && <div className="mt-2 text-[11px] text-red-300">{pwErr}</div>}
          <button
            onClick={() => void changePassword()}
            disabled={pwBusy || !pwCur || !pwNew}
            className="mt-2.5 flex items-center gap-1.5 rounded-xl bg-[var(--os-accent)] px-4 py-2 text-xs font-semibold text-[#17131f] transition hover:brightness-110 disabled:opacity-40"
          >
            {pwBusy && <Loader2 size={12} className="animate-spin" />} Change password
          </button>
        </div>

      </section>

      {/* about */}
      <section className="mt-4 rounded-2xl border border-white/[0.08] bg-white/[0.03] p-5">
        <div className="flex items-center gap-3">
          <DuckLogo size={40} />
          <div>
            <div className="text-sm font-semibold text-white">AcceleDuck OS 1.2</div>
            <div className="text-xs text-white/40">TDS Ducky Accelerator · Ducky Labs · build 2026.10</div>
          </div>
        </div>
        <div className="mt-3 text-[11px] leading-relaxed text-white/35">
          Sessions, chats, scores and settings are stored in your account. The Scramjet handshake and
          tunnel loading are real server round-trips; throughput numbers are demo-simulated.
        </div>
      </section>
    </div>
  );
}
