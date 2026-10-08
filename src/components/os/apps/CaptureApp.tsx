import { useEffect, useRef, useState } from 'react';
import { Camera, Circle, Image as ImageIcon, Loader2, Square, Video, X } from 'lucide-react';
import { toast } from 'sonner';
import content from '@/lib/shared/kliv-content.js';
import { FILES_DIR, stampName } from '@/lib/os/files';

function fmtElapsed(s: number): string {
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
}

function recorderMime(): string {
  const options = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm', 'video/mp4'];
  if (typeof MediaRecorder === 'undefined') return '';
  return options.find((t) => MediaRecorder.isTypeSupported(t)) ?? '';
}

/**
 * Duck Cam — the OS camera and screen recorder.
 *  - Camera tab: take pictures from your webcam.
 *  - Screen tab: record the tab or window your game is running in (share that
 *    tab when the browser asks).
 * Every capture is uploaded straight to the Files app, ready to play back or
 * download back out.
 */
export default function CaptureApp() {
  const [mode, setMode] = useState<'camera' | 'screen'>('camera');
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [starting, setStarting] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [recording, setRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [lastSaved, setLastSaved] = useState<{ path: string; name: string } | null>(null);

  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<number | null>(null);

  const stopStream = () => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setStream(null);
    if (videoRef.current) videoRef.current.srcObject = null;
  };

  // When the source ends on its own (user pressed "stop sharing"), stop cleanly.
  useEffect(() => {
    if (!stream) return;
    stream.getVideoTracks()[0]?.addEventListener('ended', () => {
      stopRecordingIfAny();
      stopStream();
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stream]);

  const stopRecordingIfAny = () => {
    if (recorderRef.current && recorderRef.current.state !== 'inactive') {
      recorderRef.current.stop();
    }
    if (timerRef.current) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
    setRecording(false);
  };

  useEffect(() => {
    return () => {
      stopRecordingIfAny();
      streamRef.current?.getTracks().forEach((t) => t.stop());
      if (timerRef.current) window.clearInterval(timerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const save = async (blob: Blob, name: string): Promise<string | null> => {
    try {
      const file = new File([blob], name, { type: blob.type });
      const meta = await content.uploadFile(file, FILES_DIR);
      return meta.path;
    } catch {
      toast.error('Could not save to Files — check your connection');
      return null;
    }
  };

  const startPreview = async () => {
    setErr(null);
    setStarting(true);
    stopStream();
    try {
      const media =
        mode === 'camera'
          ? await navigator.mediaDevices.getUserMedia({
              video: { width: { ideal: 1280 }, height: { ideal: 720 } },
              audio: false,
            })
          : await navigator.mediaDevices.getDisplayMedia({
              video: { frameRate: 30 },
              audio: true,
            });
      streamRef.current = media;
      setStream(media);
      if (videoRef.current) {
        videoRef.current.srcObject = media;
        await videoRef.current.play().catch(() => undefined);
      }
    } catch (e) {
      const name = e instanceof DOMException ? e.name : '';
      setErr(
        name === 'NotAllowedError'
          ? 'Your browser blocked access. Allow the camera/screen permission — if this app is inside a preview frame, open the site in its own tab first.'
          : mode === 'camera'
            ? 'No camera found on this device.'
            : 'Screen capture was cancelled or is unavailable here. Try opening the site in its own tab.',
      );
    } finally {
      setStarting(false);
    }
  };

  const snap = async () => {
    const video = videoRef.current;
    if (!video || !stream) return;
    setBusy(true);
    try {
      const canvas = document.createElement('canvas');
      canvas.width = video.videoWidth || 1280;
      canvas.height = video.videoHeight || 720;
      canvas.getContext('2d')?.drawImage(video, 0, 0, canvas.width, canvas.height);
      const blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob((b) => resolve(b), 'image/png'),
      );
      if (!blob) throw new Error('no image');
      const name = stampName('photo', 'png');
      const path = await save(blob, name);
      if (path) {
        setLastSaved({ path, name });
        toast.success('Photo saved to Files');
      }
    } catch {
      toast.error('The photo did not capture — try again');
    } finally {
      setBusy(false);
    }
  };

  const startRecording = async () => {
    if (!stream) await startPreview();
    const media = streamRef.current;
    if (!media) return;
    const mime = recorderMime();
    try {
      chunksRef.current = [];
      const recorder = new MediaRecorder(media, mime ? { mimeType: mime } : undefined);
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      recorder.onstop = async () => {
        const type = recorder.mimeType || 'video/webm';
        const blob = new Blob(chunksRef.current, { type });
        const ext = type.includes('mp4') ? 'mp4' : 'webm';
        const name = stampName('recording', ext as 'webm');
        setBusy(true);
        const path = await save(blob, name);
        setBusy(false);
        if (path) {
          setLastSaved({ path, name });
          toast.success('Recording saved to Files');
        }
      };
      recorder.start(1000);
      recorderRef.current = recorder;
      setRecording(true);
      setElapsed(0);
      timerRef.current = window.setInterval(() => setElapsed((s) => s + 1), 1000);
    } catch {
      toast.error('Recording is not supported in this browser');
    }
  };

  const stopRecording = () => stopRecordingIfAny();

  return (
    <div className="flex h-full flex-col">
      {/* mode tabs */}
      <div className="flex items-center gap-1.5 border-b border-white/[0.07] px-4 py-2.5">
        <button
          onClick={() => {
            stopRecordingIfAny();
            stopStream();
            setMode('camera');
            setErr(null);
          }}
          className={`flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs transition ${
            mode === 'camera' ? 'bg-[var(--os-accent)] font-semibold text-[#17131f]' : 'text-white/60 hover:bg-white/10'
          }`}
        >
          <Camera size={13} /> Camera
        </button>
        <button
          onClick={() => {
            stopRecordingIfAny();
            stopStream();
            setMode('screen');
            setErr(null);
          }}
          className={`flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs transition ${
            mode === 'screen' ? 'bg-[var(--os-accent)] font-semibold text-[#17131f]' : 'text-white/60 hover:bg-white/10'
          }`}
        >
          <Video size={13} /> Screen record
        </button>
        {stream && (
          <button
            onClick={() => {
              stopRecordingIfAny();
              stopStream();
            }}
            aria-label="Stop preview"
            className="ml-auto flex items-center gap-1 rounded-xl bg-white/[0.06] px-2.5 py-1.5 text-[11px] text-white/60 hover:bg-white/10 hover:text-white"
          >
            <X size={12} /> Stop preview
          </button>
        )}
      </div>

      {/* preview */}
      <div className="relative min-h-0 flex-1 bg-black">
        <video
          ref={videoRef}
          playsInline
          muted
          className="h-full w-full object-contain"
          data-testid="capture-preview"
        />
        {!stream && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-6 text-center">
            {starting ? (
              <Loader2 size={26} className="animate-spin text-white/50" />
            ) : (
              <>
                {mode === 'camera' ? (
                  <Camera size={34} className="text-white/25" />
                ) : (
                  <Video size={34} className="text-white/25" />
                )}
                <div className="text-sm text-white/70">
                  {mode === 'camera'
                    ? 'Take fun pictures with your webcam'
                    : 'Record the tab or window your game runs in — pick it when the browser asks'}
                </div>
                <button
                  onClick={() => void startPreview()}
                  className="rounded-xl bg-[var(--os-accent)] px-5 py-2 text-xs font-semibold text-[#17131f] transition hover:brightness-110"
                >
                  {mode === 'camera' ? 'Start camera' : 'Choose what to record'}
                </button>
                {err && <div className="max-w-sm text-[11px] leading-relaxed text-red-300">{err}</div>}
              </>
            )}
          </div>
        )}
        {recording && (
          <div className="absolute left-3 top-3 flex items-center gap-1.5 rounded-full bg-red-600/90 px-2.5 py-1 text-[11px] font-semibold text-white">
            <Circle size={8} className="fill-white" /> REC {fmtElapsed(elapsed)}
          </div>
        )}
      </div>

      {/* controls */}
      <div className="flex items-center gap-2 border-t border-white/[0.07] px-4 py-3">
        {mode === 'camera' ? (
          <button
            onClick={() => void snap()}
            disabled={!stream || busy}
            className="flex items-center gap-1.5 rounded-xl bg-[var(--os-accent)] px-4 py-2 text-xs font-semibold text-[#17131f] transition hover:brightness-110 disabled:opacity-40"
          >
            {busy ? <Loader2 size={13} className="animate-spin" /> : <Camera size={13} />} Take photo
          </button>
        ) : recording ? (
          <button
            onClick={stopRecording}
            aria-label="Stop recording"
            data-testid="stop-recording"
            className="flex items-center gap-1.5 rounded-xl bg-red-600 px-4 py-2 text-xs font-semibold text-white transition hover:brightness-110"
          >
            <Square size={12} /> Stop &amp; save
          </button>
        ) : (
          <button
            onClick={() => void startRecording()}
            disabled={busy || starting}
            aria-label="Start recording"
            data-testid="start-recording"
            className="flex items-center gap-1.5 rounded-xl bg-[var(--os-accent)] px-4 py-2 text-xs font-semibold text-[#17131f] transition hover:brightness-110 disabled:opacity-40"
          >
            {busy ? <Loader2 size={13} className="animate-spin" /> : <Circle size={11} className="fill-current" />}
            {stream ? 'Start recording' : 'Pick a screen & record'}
          </button>
        )}
        {lastSaved && (
          <a
            href={lastSaved.path}
            download={lastSaved.name}
            className="flex min-w-0 items-center gap-1.5 rounded-xl bg-white/[0.06] px-3 py-2 text-[11px] text-white/70 transition hover:bg-white/10 hover:text-white"
          >
            <ImageIcon size={12} className="shrink-0" />
            <span className="truncate">{lastSaved.name}</span>
            <span className="shrink-0 text-white/35">· saved to Files</span>
          </a>
        )}
        <div className="ml-auto text-[10px] text-white/35">Captures land in the Files app</div>
      </div>
    </div>
  );
}
