import { type ReactElement } from "react";

interface VelataMarkProps {
  size?: number;
  className?: string;
}

export function VelataMark({ size = 28, className }: VelataMarkProps): ReactElement {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 512 512"
      fill="none"
      aria-hidden
      className={className}
    >
      <path
        d="M96 112 256 400"
        stroke="currentColor"
        strokeOpacity={0.45}
        strokeWidth={76}
        strokeLinecap="round"
      />
      <path d="M416 112 256 400" stroke="currentColor" strokeWidth={76} strokeLinecap="round" />
    </svg>
  );
}
