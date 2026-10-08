// Inline stroke icons (MIT-compatible, hand-drawn for this project). 24×24 grid.
const P: Record<string, string> = {
  play: 'M7 5l12 7-12 7z',
  pause: 'M8 5v14M16 5v14',
  prev: 'M18 6l-8 6 8 6M6 6v12',
  next: 'M6 6l8 6-8 6M18 6v12',
  end: 'M5 6l7 6-7 6M12 6l7 6-7 6M20 5v14',
  reset: 'M4 12a8 8 0 1 0 2.3-5.7M4 4v5h5',
  shuffle: 'M4 7h3c5 0 5 10 10 10h3M4 17h3c2 0 3-1.5 4-3M14 9.5C15 8 16 7 17 7h3M18 4l3 3-3 3M18 14l3 3-3 3',
  'arrow-right': 'M5 12h14M13 6l6 6-6 6',
  'arrow-left': 'M19 12H5M11 6l-6 6 6 6',
  home: 'M4 11l8-7 8 7v9h-5v-6H9v6H4z',
  map: 'M9 4L3 6v14l6-2 6 2 6-2V4l-6 2-6-2zM9 4v14M15 6v14',
  lab: 'M9 3h6M10 3v6L4.5 18a2 2 0 0 0 1.7 3h11.6a2 2 0 0 0 1.7-3L14 9V3M7 14h10',
  gym: 'M3 10v4M6 7v10M18 7v10M21 10v4M6 12h12',
  review: 'M20 11a8 8 0 0 0-14.6-4.5M4 4v4h4M4 13a8 8 0 0 0 14.6 4.5M20 20v-4h-4',
  timer: 'M12 8v5l3 2M9 2h6M12 21a8 8 0 1 0 0-16 8 8 0 0 0 0 16z',
  trophy: 'M8 4h8v5a4 4 0 0 1-8 0zM8 6H4v1a4 4 0 0 0 4 4M16 6h4v1a4 4 0 0 1-4 4M12 13v4M8 21h8M9 17h6v4H9z',
  settings: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z',
  flame: 'M12 22c4 0 7-2.8 7-7 0-5-5-7-5-12-3 2-4 5-4 7-1-1-2-2-2-4-2 2-3 5-3 9 0 4.2 3 7 7 7z',
  check: 'M5 12.5l4.5 4.5L19 7',
  x: 'M6 6l12 12M18 6L6 18',
  lock: 'M6 11h12v10H6zM8 11V7a4 4 0 0 1 8 0v4',
  bolt: 'M13 2L4 14h7l-1 8 9-12h-7z',
  eye: 'M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z',
  code: 'M8 7l-5 5 5 5M16 7l5 5-5 5M14 4l-4 16',
  bug: 'M9 7a3 3 0 0 1 6 0M8 9h8v5a4 4 0 0 1-8 0zM4 10l4 1M20 10l-4 1M4 18l4-2M20 18l-4-2M3 14h5M16 14h5M12 13v5',
  crown: 'M3 7l4.5 4L12 4l4.5 7L21 7l-2 12H5z',
  bulb: 'M9 18h6M10 21h4M12 3a6 6 0 0 0-4 10.5c.7.7 1 1.5 1 2.5h6c0-1 .3-1.8 1-2.5A6 6 0 0 0 12 3z',
  focus: 'M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5M12 13a1 1 0 1 0 0-2 1 1 0 0 0 0 2z',
  sun: 'M12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4',
  moon: 'M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z',
  download: 'M12 4v11M7 10l5 5 5-5M5 20h14',
  upload: 'M12 20V9M7 14l5-5 5 5M5 4h14',
  sound: 'M4 9v6h4l5 4V5L8 9zM16 9a4 4 0 0 1 0 6M18.5 6.5a8 8 0 0 1 0 11',
  mute: 'M4 9v6h4l5 4V5L8 9zM17 9l5 6M22 9l-5 6',
  book: 'M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2zM4 19V5M8 7h7',
  'chevron-down': 'M6 9l6 6 6-6',
  'chevron-right': 'M9 6l6 6-6 6',
  sparkle: 'M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8zM19 16l.8 2.2L22 19l-2.2.8L19 22l-.8-2.2L16 19l2.2-.8z',
  target: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM12 12h.01',
  star: 'M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z',
  run: 'M7 4l12 8-12 8z',
  terminal: 'M4 5h16v14H4zM7 9l3 3-3 3M12 15h5',
  trash: 'M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13',
  menu: 'M4 6h16M4 12h16M4 18h16',
  layers: 'M12 3l9 5-9 5-9-5zM3 13l9 5 9-5M3 17l9 5 9-5',
  cpu: 'M7 7h10v10H7zM10 2v3M14 2v3M10 19v3M14 19v3M2 10h3M2 14h3M19 10h3M19 14h3',
  cloud: 'M7 18a5 5 0 0 1-.8-9.9 6 6 0 0 1 11.5 1.6A4 4 0 0 1 17 18z',
  brain: 'M9 4a3 3 0 0 0-3 3 3 3 0 0 0-2 5 3 3 0 0 0 2 5 3 3 0 0 0 6 1V5a2 2 0 0 0-3-1zM15 4a3 3 0 0 1 3 3 3 3 0 0 1 2 5 3 3 0 0 1-2 5 3 3 0 0 1-6 1',
  server: 'M4 4h16v6H4zM4 14h16v6H4zM8 7h.01M8 17h.01',
  window: 'M3 5h18v14H3zM3 9h18M6 7h.01M9 7h.01',
  graph: 'M6 6a2 2 0 1 0 0 .01M18 6a2 2 0 1 0 0 .01M12 18a2 2 0 1 0 0 .01M7.5 7.5l3.5 9M16.5 7.5l-3.5 9M8 6h8',
  certificate: 'M4 4h16v12H4zM8 8h8M8 11h5M15 16l-1 5 2.5-1.5L19 21l-1-5',
};

export type IconName = keyof typeof P | string;

export function Icon({ name, size = 18, stroke = 2, className, title }: { name: IconName; size?: number; stroke?: number; className?: string; title?: string }) {
  const filled = name === 'play' || name === 'run';
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={filled ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden={title ? undefined : true} role={title ? 'img' : undefined}>
      {title && <title>{title}</title>}
      <path d={P[name] ?? P.sparkle} />
    </svg>
  );
}
