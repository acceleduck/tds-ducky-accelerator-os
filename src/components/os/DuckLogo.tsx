export function DuckLogo({ size = 48, className = '' }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      className={className}
      aria-hidden="true"
      focusable="false"
    >
      <ellipse cx="33" cy="41" rx="21" ry="13.5" fill="#f5c518" />
      <path d="M17 33c-5-3-6.5-8-3.5-11 2.3-2.3 6.3-.8 8 2.2z" fill="#f5c518" />
      <path d="M18 34c-4.5-2.6-6-7-3.4-9.6 2-2 5.4-.9 7.2 1.7z" fill="#eab308" />
      <circle cx="25" cy="21" r="11.5" fill="#f5c518" />
      <path d="M35.5 17.5 47 21l-11.5 5.5z" fill="#ff9500" />
      <circle cx="27.5" cy="18" r="2.2" fill="#17203a" />
      <ellipse cx="35" cy="44" rx="10" ry="6" fill="#eab308" />
    </svg>
  );
}
