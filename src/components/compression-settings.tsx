"use client";

import { useEffect, useState } from "react";
import type { CompressionSettings as CompressionSettingsType, JpegCompressionMode } from "@/lib/image-types";
import type { OutputFormat } from "@/lib/utils";
import { Gauge, ImageIcon, Maximize2, Settings2 } from "lucide-react";
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

  const [localQuality, setLocalQuality] = useState(settings.quality.toString());

  useEffect(() => {
    setLocalQuality(settings.quality.toString());
  }, [settings.quality]);

  const handleQualityInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setLocalQuality(val);

    const parsed = parseInt(val, 10);
    if (!isNaN(parsed) && parsed >= 1 && parsed <= 100) {
      onChange({ ...settings, quality: parsed });
    }
  };

  const handleQualityBlur = () => {
    const parsed = parseInt(localQuality, 10);
    if (isNaN(parsed) || parsed < 1) {
      update("quality", 1);
      setLocalQuality("1");
    } else if (parsed > 100) {
      update("quality", 100);
      setLocalQuality("100");
    } else {
      update("quality", parsed);
      setLocalQuality(parsed.toString());
    }
  };

  return (
    <Card className="overflow-hidden">
      <CardHeader className="flex-row items-center gap-3 space-y-0 border-b bg-muted/30">
        <div className="flex h-9 w-9 items-center justify-center rounded-md bg-primary/10 text-primary">
          <Settings2 className="h-4 w-4" />
        </div>
        <div>
          <CardTitle>Configurações</CardTitle>
          <p className="mt-1 text-xs text-muted-foreground">Defina o resultado final</p>
        </div>
      </CardHeader>
      <CardContent className="grid gap-5 p-5">
        <div className="flex items-center justify-between gap-4 rounded-md bg-muted/55 p-3">
          <Label htmlFor="preserve-dimensions">Manter dimensoes originais</Label>
          <Switch
            id="preserve-dimensions"
            checked={settings.preserveOriginalDimensions}
            disabled={disabled}
            onCheckedChange={(checked) => update("preserveOriginalDimensions", checked)}
          />
        </div>

        <div className="grid gap-3">
          <div className="flex items-center gap-2">
            <Maximize2 className="h-3.5 w-3.5 text-muted-foreground" />
            <Label>Dimensões máximas</Label>
          </div>
          <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
          <Input
            id="max-width"
            type="number"
            min={1}
            value={settings.maxWidth}
            disabled={disabled || settings.preserveOriginalDimensions}
            aria-label="Largura máxima"
            onChange={(event) => update("maxWidth", Number(event.target.value) || 1)}
          />
          <span className="text-xs font-medium text-muted-foreground">×</span>
          <Input
            id="max-height"
            type="number"
            min={1}
            value={settings.maxHeight}
            disabled={disabled || settings.preserveOriginalDimensions}
            aria-label="Altura máxima"
            onChange={(event) => update("maxHeight", Number(event.target.value) || 1)}
          />
          </div>
          <p className="text-xs text-muted-foreground">
            {settings.preserveOriginalDimensions
              ? "A imagem sera exportada com a mesma largura e altura do arquivo original."
              : "Largura × altura em pixels"}
          </p>
        </div>

        <div className="grid gap-3 border-t pt-5">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <Gauge className="h-3.5 w-3.5 text-muted-foreground" />
              <Label htmlFor="quality-input">Qualidade</Label>
            </div>
            <div className="flex items-center gap-1">
              <Input
                id="quality-input"
                type="number"
                min={1}
                max={100}
                value={localQuality}
                disabled={disabled}
                onChange={handleQualityInputChange}
                onBlur={handleQualityBlur}
                className="h-8 w-16 px-2 text-center text-sm font-medium [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
              />
              <span className="text-sm font-medium text-muted-foreground">%</span>
            </div>
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

        <div className="grid gap-2 border-t pt-5">
          <div className="flex items-center gap-2">
            <ImageIcon className="h-3.5 w-3.5 text-muted-foreground" />
            <Label>Formato de saída</Label>
          </div>
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

        {settings.outputFormat === "jpeg" ? (
          <div className="grid gap-2 border-t pt-5">
            <div className="flex items-center gap-2">
              <Gauge className="h-3.5 w-3.5 text-muted-foreground" />
              <Label>Modo JPG</Label>
            </div>
            <Select
              value={settings.jpegCompressionMode}
              disabled={disabled}
              onValueChange={(value) => update("jpegCompressionMode", value as JpegCompressionMode)}
            >
              <SelectTrigger>
                <SelectValue placeholder="Modo de compressao" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="fast">Rapida</SelectItem>
                <SelectItem value="balanced">Balanceada</SelectItem>
                <SelectItem value="max">Compressao maxima</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              {settings.jpegCompressionMode === "fast"
                ? "Prioriza velocidade. Costuma gerar arquivos maiores."
                : settings.jpegCompressionMode === "balanced"
                  ? "Equilibra tempo de processamento e tamanho final."
                  : "Prioriza menor tamanho. Costuma demorar mais para concluir."}
            </p>
          </div>
        ) : null}

        <div className="flex items-center justify-between gap-4 rounded-md bg-muted/55 p-3">
          <Label htmlFor="aspect">Manter proporção</Label>
          <Switch
            id="aspect"
            checked={settings.keepAspectRatio}
            disabled={disabled || settings.preserveOriginalDimensions}
            onCheckedChange={(checked) => update("keepAspectRatio", checked)}
          />
        </div>

        <div className="flex items-center justify-between gap-4 rounded-md bg-muted/55 p-3">
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
