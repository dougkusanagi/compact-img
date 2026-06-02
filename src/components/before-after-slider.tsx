"use client";

import { useState } from "react";
import { Slider } from "@/components/ui/slider";

type BeforeAfterSliderProps = {
  beforeUrl: string;
  afterUrl?: string;
  alt: string;
};

export function BeforeAfterSlider({ beforeUrl, afterUrl, alt }: BeforeAfterSliderProps) {
  const [position, setPosition] = useState(50);

  if (!afterUrl) {
    return (
      <div className="flex aspect-video items-center justify-center overflow-hidden rounded-lg border bg-muted">
        <img src={beforeUrl} alt={alt} className="h-full w-full object-contain" />
      </div>
    );
  }

  return (
    <div className="grid gap-3">
      <div className="relative aspect-video overflow-hidden rounded-lg border bg-muted">
        <img src={beforeUrl} alt={`${alt} original`} className="absolute inset-0 h-full w-full object-contain" />
        <div className="absolute inset-0 overflow-hidden" style={{ width: `${position}%` }}>
          <img src={afterUrl} alt={`${alt} compactada`} className="h-full w-full object-contain" />
        </div>
        <div className="absolute inset-y-0 w-0.5 bg-white shadow" style={{ left: `${position}%` }} />
        <div className="absolute left-3 top-3 rounded bg-black/65 px-2 py-1 text-xs font-medium text-white">
          Depois
        </div>
        <div className="absolute right-3 top-3 rounded bg-black/65 px-2 py-1 text-xs font-medium text-white">
          Antes
        </div>
      </div>
      <Slider min={0} max={100} step={1} value={[position]} onValueChange={([value]) => setPosition(value)} />
    </div>
  );
}
