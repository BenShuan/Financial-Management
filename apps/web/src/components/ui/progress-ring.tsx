import { cn } from "@/lib/utils";

interface ProgressRingProps {
  /** 0–100; clamped for the stroke, shown as-is in the center when showLabel. */
  percent: number;
  size?: number;
  strokeWidth?: number;
  /** CSS color for the progress stroke (e.g. "oklch(var(--primary))"). */
  color?: string;
  showLabel?: boolean;
  className?: string;
}

export function ProgressRing({
  percent,
  size = 76,
  strokeWidth = 9,
  color = "oklch(var(--primary))",
  showLabel = false,
  className,
}: ProgressRingProps) {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const clamped = Math.min(Math.max(percent, 0), 100);
  const offset = circumference * (1 - clamped / 100);
  return (
    <div className={cn("relative inline-flex items-center justify-center", className)}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="oklch(var(--border) / 0.6)"
          strokeWidth={strokeWidth}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </svg>
      {showLabel ? (
        <span className="absolute text-lg font-extrabold">{Math.round(percent)}%</span>
      ) : null}
    </div>
  );
}
