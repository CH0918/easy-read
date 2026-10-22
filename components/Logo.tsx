import type { SVGProps } from 'react';

export function Logo(props: SVGProps<SVGSVGElement>) {
  return (
    <svg width="40" height="40" viewBox="0 0 128 128" fill="none" aria-hidden="true" {...props}>
      <rect width="128" height="128" rx="34" fill="currentColor" />
      <path d="M30 37c12-3 23 0 34 8v50c-11-8-22-11-34-8V37Z" fill="#FFFFFF" />
      <path d="M70 45c9-6 18-9 28-8v50c-10-1-19 2-28 8V45Z" fill="#E5E5E5" />
      <path
        d="M39 51c6 0 11 2 16 5M39 63c6 0 11 2 16 5M39 75c6 0 11 2 16 5"
        stroke="#171717"
        strokeWidth="3.5"
        strokeLinecap="round"
      />
      <path d="m94 19 3.3 9.7L107 32l-9.7 3.3L94 45l-3.3-9.7L81 32l9.7-3.3L94 19Z" fill="#FFFFFF" />
    </svg>
  );
}

export function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <div className="brand">
      <Logo />
      <div>
        <span className="brand-name">
          Margin<span className="brand-dot">.</span>
        </span>
        {!compact && <span className="brand-caption">页边 · AI 阅读伴侣</span>}
      </div>
    </div>
  );
}
