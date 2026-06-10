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
      <div className="flex aspect-video items-center justify-center overflow-hidden rounded-lg border bg-[linear-gradient(45deg,hsl(var(--muted))_25%,transparent_25%,transparent_75%,hsl(var(--muted))_75%),linear-gradient(45deg,hsl(var(--muted))_25%,transparent_25%,transparent_75%,hsl(var(--muted))_75%)] bg-[length:20px_20px] bg-[position:0_0,10px_10px]">
        <img src={beforeUrl} alt={alt} className="h-full w-full object-contain" />
      </div>
    );
  }

  return (
    <div className="grid gap-3">
      <div className="relative aspect-video overflow-hidden rounded-lg border bg-muted shadow-inner">
        <img src={beforeUrl} alt={`${alt} original`} className="absolute inset-0 h-full w-full object-contain" />
        <div
          className="absolute inset-0"
          style={{ clipPath: `inset(0 ${100 - position}% 0 0)` }}
        >
          <img
            src={afterUrl}
            alt={`${alt} compactada`}
            className="absolute inset-0 h-full w-full object-contain"
          />
        </div>
        <div
          className="pointer-events-none absolute inset-y-0 w-0.5 -translate-x-1/2 bg-white shadow-md"
          style={{ left: `${position}%` }}
        >
          <div className="absolute left-1/2 top-1/2 flex h-8 w-8 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border-2 border-white bg-primary text-[10px] font-bold text-white shadow-lg">
            ↔
          </div>
        </div>
        <div className="absolute left-3 top-3 rounded-full bg-black/65 px-2.5 py-1 text-[11px] font-semibold text-white backdrop-blur">
          Depois
        </div>
        <div className="absolute right-3 top-3 rounded-full bg-black/65 px-2.5 py-1 text-[11px] font-semibold text-white backdrop-blur">
          Antes
        </div>
      </div>
      <Slider
        min={0}
        max={100}
        step={1}
        value={[position]}
        onValueChange={([value]) => setPosition(value)}
        aria-label="Proporção visível entre a imagem depois e antes"
      />
    </div>
  );
}
