"use client";

import { Progress } from "@/components/ui/progress";

type ProgressBarProps = {
  value: number;
  label: string;
};

export function ProgressBar({ value, label }: ProgressBarProps) {
  return (
    <div className="grid gap-2">
      <div className="flex items-center justify-between gap-4 text-sm">
        <span className="font-medium">{label}</span>
        <span className="text-muted-foreground">{Math.round(value)}%</span>
      </div>
      <Progress value={value} />
    </div>
  );
}
