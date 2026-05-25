import Link from "next/link";

export function Logo({
  size = 28,
  href = "/",
  asLink = true,
}: {
  size?: number;
  href?: string;
  asLink?: boolean;
}) {
  const inner = (
    <span className="inline-flex items-center gap-2 select-none">
      <svg
        width={size}
        height={size}
        viewBox="0 0 40 40"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden
      >
        <path
          d="M20 4c-7 0-12 5-12 11 0 4 2 7 5 9-1 3-1 6 1 8 2 2 5 2 7 0 2 2 5 2 7 0 2-2 2-5 1-8 3-2 5-5 5-9 0-6-5-11-12-11Z"
          fill="#0e7c7b"
        />
        <circle cx="14" cy="16" r="2.2" fill="#fbf9f3" />
        <circle cx="26" cy="16" r="2.2" fill="#fbf9f3" />
        <path d="M14 23c2 2 4 3 6 3s4-1 6-3" stroke="#fbf9f3" strokeWidth="1.8" strokeLinecap="round" fill="none" />
      </svg>
      <span className="font-display text-[1.35rem] tracking-tight font-semibold leading-none">
        MindKit
      </span>
    </span>
  );
  if (!asLink) return inner;
  return (
    <Link
      href={href}
      aria-label="Retour à l'atelier MindKit"
      className="inline-flex items-center transition-opacity hover:opacity-80"
    >
      {inner}
    </Link>
  );
}
