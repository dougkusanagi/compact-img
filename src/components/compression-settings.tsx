"use client";

import type { CompressionSettings as CompressionSettingsType } from "@/lib/image-types";
import type { OutputFormat } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";

type CompressionSettingsProps = {
  settings: CompressionSettingsType;
  onChange: (settings: CompressionSettingsType) => void;
  disabled?: boolean;
};

export function CompressionSettings({ settings, onChange, disabled }: CompressionSettingsProps) {
  const update = <K extends keyof CompressionSettingsType>(key: K, value: CompressionSettingsType[K]) => {
    onChange({ ...settings, [key]: value });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Configuracoes</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-5 sm:grid-cols-2 xl:grid-cols-1">
        <div className="grid gap-2">
          <Label htmlFor="max-width">Largura maxima</Label>
          <Input
            id="max-width"
            type="number"
            min={1}
            value={settings.maxWidth}
            disabled={disabled}
            onChange={(event) => update("maxWidth", Number(event.target.value) || 1)}
          />
        </div>

        <div className="grid gap-2">
          <Label htmlFor="max-height">Altura maxima</Label>
          <Input
            id="max-height"
            type="number"
            min={1}
            value={settings.maxHeight}
            disabled={disabled}
            onChange={(event) => update("maxHeight", Number(event.target.value) || 1)}
          />
        </div>

        <div className="grid gap-3 sm:col-span-2 xl:col-span-1">
          <div className="flex items-center justify-between gap-4">
            <Label>Qualidade</Label>
            <span className="text-sm font-medium">{settings.quality}%</span>
          </div>
          <Slider
            min={1}
            max={100}
            step={1}
            value={[settings.quality]}
            disabled={disabled}
            onValueChange={([value]) => update("quality", value)}
          />
        </div>

        <div className="grid gap-2">
          <Label>Formato de saida</Label>
          <Select
            value={settings.outputFormat}
            disabled={disabled}
            onValueChange={(value) => update("outputFormat", value as OutputFormat)}
          >
            <SelectTrigger>
              <SelectValue placeholder="Formato" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="jpeg">JPG</SelectItem>
              <SelectItem value="webp">WEBP</SelectItem>
              <SelectItem value="png">PNG</SelectItem>
              <SelectItem value="avif">AVIF</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="flex items-center justify-between gap-4 rounded-md border p-3">
          <Label htmlFor="aspect">Manter proporcao</Label>
          <Switch
            id="aspect"
            checked={settings.keepAspectRatio}
            disabled={disabled}
            onCheckedChange={(checked) => update("keepAspectRatio", checked)}
          />
        </div>

        <div className="flex items-center justify-between gap-4 rounded-md border p-3">
          <Label htmlFor="metadata">Remover metadados</Label>
          <Switch
            id="metadata"
            checked={settings.stripMetadata}
            disabled={disabled}
            onCheckedChange={(checked) => update("stripMetadata", checked)}
          />
        </div>
      </CardContent>
    </Card>
  );
}
