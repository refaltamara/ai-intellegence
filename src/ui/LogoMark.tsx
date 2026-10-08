/**
 * The mark: an orange-to-pink rounded square with five sound bars, the middle one peach. It replaces
 * the letter "F" in the sidebar, the CMS and the sign-in pages; app/icon.svg (the browser tab) is the
 * same drawing. No hooks, so it renders in server and client components alike.
 */
export function LogoMark({ size = 34 }: { size?: number }) {
  return (
    <svg className="mark logo" width={size} height={size} viewBox="0 0 120 120" aria-hidden="true" focusable="false">
      <defs>
        <linearGradient id="fl-mark-g" x1="0.24" y1="0.09" x2="0.7" y2="0.99">
          <stop offset="0" stopColor="#FF9047" />
          <stop offset="1" stopColor="#FF516A" />
        </linearGradient>
      </defs>
      <rect width="120" height="120" rx="38.4" fill="url(#fl-mark-g)" />
      <g fill="#FFF">
        <rect x="19.6" y="46" width="10.4" height="28" rx="5.2" />
        <rect x="37.2" y="34" width="10.4" height="52" rx="5.2" />
        <rect x="72.4" y="36" width="10.4" height="48" rx="5.2" />
        <rect x="90" y="46" width="10.4" height="28" rx="5.2" />
      </g>
      <rect x="54.8" y="24" width="10.4" height="72" rx="5.2" fill="#FFD2BE" />
    </svg>
  );
}
