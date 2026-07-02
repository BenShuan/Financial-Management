import type { LucideIcon, LucideProps } from "lucide-react";
import { cn } from "@/lib/utils";

type IconProps = Omit<LucideProps, "ref"> & {
  icon: LucideIcon;
};

export function Icon({ icon: IconComp, className, strokeWidth = 1.5, ...props }: IconProps) {
  return <IconComp strokeWidth={strokeWidth} className={cn("size-4", className)} {...props} />;
}
