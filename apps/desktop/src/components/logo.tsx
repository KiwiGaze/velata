import { type ReactElement } from "react";

interface VelataMarkProps {
  size?: number;
  className?: string;
}

interface MarkPaths {
  back: string;
  front: string;
}

const COMPACT_BELOW = 20;

const STANDARD: MarkPaths = {
  back: "M166 108 H274 A58 58 0 0 1 331 156 H238 A82 82 0 0 0 156 238 V331 A58 58 0 0 1 108 274 V166 A58 58 0 0 1 166 108 Z",
  front:
    "M238 180 H346 A58 58 0 0 1 404 238 V346 A58 58 0 0 1 346 404 H238 A58 58 0 0 1 180 346 V238 A58 58 0 0 1 238 180 Z",
};

const COMPACT: MarkPaths = {
  back: "M146 82 H266 A64 64 0 0 1 329 134 H246 A112 112 0 0 0 134 246 V329 A64 64 0 0 1 82 266 V146 A64 64 0 0 1 146 82 Z",
  front:
    "M246 182 H366 A64 64 0 0 1 430 246 V366 A64 64 0 0 1 366 430 H246 A64 64 0 0 1 182 366 V246 A64 64 0 0 1 246 182 Z",
};

export function VelataMark({ size = 28, className }: VelataMarkProps): ReactElement {
  const paths = size < COMPACT_BELOW ? COMPACT : STANDARD;
  return (
    <svg width={size} height={size} viewBox="0 0 512 512" aria-hidden className={className}>
      <path d={paths.back} fill="currentColor" />
      <path d={paths.front} fill="currentColor" />
    </svg>
  );
}
