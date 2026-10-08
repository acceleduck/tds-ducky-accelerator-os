import { useState } from 'react';
import { avatarColor, initials } from '@/lib/os/chat';

/**
 * One duck's avatar everywhere in the OS: their uploaded picture when set,
 * falling back to a colored initials bubble. If the picture file ever goes
 * missing, it quietly falls back instead of showing a broken image.
 */
export function UserAvatar({
  name,
  pfp,
  seed,
  size = 32,
  className = '',
}: {
  name: string;
  pfp?: string | null;
  seed?: string;
  size?: number;
  className?: string;
}) {
  const [broken, setBroken] = useState(false);

  if (pfp && !broken) {
    return (
      <img
        src={pfp}
        alt=""
        aria-hidden
        loading="lazy"
        onError={() => setBroken(true)}
        style={{ width: size, height: size }}
        className={`shrink-0 rounded-full object-cover ${className}`}
      />
    );
  }

  return (
    <span
      aria-hidden
      style={{
        width: size,
        height: size,
        background: avatarColor(seed ?? name),
        fontSize: Math.max(10, Math.round(size * 0.38)),
      }}
      className={`flex shrink-0 select-none items-center justify-center rounded-full font-bold text-white/95 ${className}`}
    >
      {initials(name)}
    </span>
  );
}
