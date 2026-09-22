"use client";

import { useEffect, useState } from "react";
import type {
  CompressionSettings as CompressionSettingsType,
  DownloadPreferences,
  JpegCompressionMode
} from "@/lib/image-types";
import type { OutputFormat } from "@/lib/utils";
import { CircleHelp, Download, Gauge, ImageIcon, Link2, Maximize2, Settings2, Unlink } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";

type CompressionSettingsProps = {
  settings: CompressionSettingsType;
  onChange: (settings: CompressionSettingsType) => void;
  downloadPreferences: DownloadPreferences;
  onDownloadPreferencesChange: (preferences: DownloadPreferences) => void;
  isDesktop?: boolean;
  disabled?: boolean;
};

export function CompressionSettings({
  settings,
  onChange,
  downloadPreferences,
  onDownloadPreferencesChange,
  isDesktop = false,
  disabled
}: CompressionSettingsProps) {
  const update = <K extends keyof CompressionSettingsType>(key: K, value: CompressionSettingsType[K]) => {
    onChange({ ...settings, [key]: value });
  };

  const updateDownload = <K extends keyof DownloadPreferences>(
    key: K,
    value: DownloadPreferences[K]
  ) => {
    onDownloadPreferencesChange({ ...downloadPreferences, [key]: value });
  };

  const resizeMode = settings.preserveOriginalDimensions
    ? "original"
    : settings.keepAspectRatio
      ? "maximum"
      : "custom";

  const setResizeMode = (mode: "original" | "maximum" | "custom") => {
    onChange({
      ...settings,
      preserveOriginalDimensions: mode === "original",
      keepAspectRatio: mode === "maximum"
    });
  };

  const applyResolutionPreset = (maxWidth: number, maxHeight: number) => {
    onChange({
      ...settings,
      preserveOriginalDimensions: false,
      keepAspectRatio: false,
      maxWidth,
      maxHeight
    });
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
        {isDesktop ? (
          <div className="order-6 grid gap-4 border-t pt-5">
            <div className="flex items-center gap-2">
              <Download className="h-3.5 w-3.5 text-muted-foreground" />
              <Label>Download</Label>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="download-mode">Destino do download</Label>
              <select
                id="download-mode"
                value={downloadPreferences.mode}
                disabled={disabled}
                onChange={(event) => updateDownload("mode", event.target.value as DownloadPreferences["mode"])}
                className="flex h-10 w-full rounded-md border border-input bg-white px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
              >
                <option value="same-folder">Mesma pasta</option>
                <option value="choose-location">Escolher local</option>
              </select>
            </div>
            {downloadPreferences.mode === "same-folder" ? (
              <>
                <div className="flex items-center justify-between gap-3 rounded-md bg-muted/55 p-3">
                  <Label htmlFor="auto-download" className="text-sm leading-tight">
                    Baixar automaticamente
                  </Label>
                  <Switch
                    id="auto-download"
                    checked={downloadPreferences.autoDownload}
                    disabled={disabled}
                    onCheckedChange={(checked) => updateDownload("autoDownload", checked)}
                  />
                </div>
                <div className="flex items-center justify-between gap-3 rounded-md bg-muted/55 p-3">
                  <Label htmlFor="remove-after-download" className="text-sm leading-tight">
                    Remover da fila após baixar
                  </Label>
                  <Switch
                    id="remove-after-download"
                    checked={downloadPreferences.removeAfterDownload}
                    disabled={disabled}
                    onCheckedChange={(checked) => updateDownload("removeAfterDownload", checked)}
                  />
                </div>
                <div className="grid gap-3 rounded-md bg-muted/55 p-3">
                  <div className="flex items-center justify-between gap-3">
                    <Label htmlFor="save-in-subfolder" className="text-sm leading-tight">
                      Salvar em subpasta
                    </Label>
                    <Switch
                      id="save-in-subfolder"
                      checked={downloadPreferences.saveInSubfolder}
                      disabled={disabled}
                      onCheckedChange={(checked) => updateDownload("saveInSubfolder", checked)}
                    />
                  </div>
                  {downloadPreferences.saveInSubfolder ? (
                    <>
                      <Input
                        id="subfolder-name"
                        value={downloadPreferences.subfolderName}
                        placeholder="imagens-compactadas"
                        disabled={disabled}
                        onChange={(event) => updateDownload("subfolderName", event.target.value)}
                        aria-label="Nome da subpasta"
                      />
                      <p className="text-xs leading-relaxed text-muted-foreground">
                        A subpasta será criada ao lado de cada imagem original.
                      </p>
                    </>
                  ) : null}
                </div>
              </>
            ) : null}
          </div>
        ) : null}

        <div className="order-1 grid gap-3 border-t pt-5">
          <div className="flex items-center gap-2">
            <Maximize2 className="h-3.5 w-3.5 text-muted-foreground" />
            <Label>Redimensionamento</Label>
            <div className="group relative ml-auto">
              <button
                type="button"
                aria-label="Ajuda sobre redimensionamento"
                className="flex h-7 w-7 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <CircleHelp className="h-4 w-4" />
              </button>
              <div
                role="tooltip"
                className="pointer-events-none invisible absolute right-0 top-full z-20 mt-2 w-72 rounded-lg border bg-card p-3 text-left text-xs leading-relaxed text-muted-foreground opacity-0 shadow-lg transition-all group-hover:visible group-hover:opacity-100 group-focus-within:visible group-focus-within:opacity-100"
              >
                <p><strong className="text-foreground">Original:</strong> mantém largura e altura do arquivo.</p>
                <p className="mt-1"><strong className="text-foreground">Proporção:</strong> encaixa a imagem dentro dos limites, preservando a proporção.</p>
                <p className="mt-1"><strong className="text-foreground">Customizado:</strong> aplica exatamente a largura e a altura informadas.</p>
              </div>
            </div>
          </div>
          <div className="grid grid-cols-3 rounded-lg border bg-muted/35 p-1" role="group" aria-label="Modo de redimensionamento">
            {[
              ["original", "Original"],
              ["maximum", "Proporção"],
              ["custom", "Customizado"]
            ].map(([mode, label]) => (
              <button
                key={mode}
                type="button"
                disabled={disabled}
                aria-pressed={resizeMode === mode}
                onClick={() => setResizeMode(mode as "original" | "maximum" | "custom")}
                className={
                  resizeMode === mode
                    ? "inline-flex items-center justify-center gap-1.5 rounded-md bg-primary px-2 py-2 text-xs font-semibold text-primary-foreground shadow-sm shadow-primary/20 transition-colors disabled:cursor-not-allowed disabled:opacity-50"
                    : "inline-flex items-center justify-center gap-1.5 rounded-md px-2 py-2 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
                }
              >
                {mode === "maximum" ? (resizeMode === mode ? <Link2 className="h-3.5 w-3.5" /> : <Unlink className="h-3.5 w-3.5" />) : null}
                <span>{label}</span>
              </button>
            ))}
          </div>
          {resizeMode !== "original" ? (
            <>
              <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
                <div className="grid gap-1.5">
                  <Label htmlFor="max-width" className="text-xs text-muted-foreground">Largura</Label>
                  <div className="relative">
                    <Input
                      id="max-width"
                      type="number"
                      min={1}
                      value={settings.maxWidth}
                      disabled={disabled}
                      aria-label="Largura máxima"
                      className="pr-9"
                      onChange={(event) => update("maxWidth", Number(event.target.value) || 1)}
                    />
                    <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-xs font-medium text-muted-foreground">px</span>
                  </div>
                </div>
                <span className="mt-6 text-xs font-medium text-muted-foreground">×</span>
                <div className="grid gap-1.5">
                  <Label htmlFor="max-height" className="text-xs text-muted-foreground">Altura</Label>
                  <div className="relative">
                    <Input
                      id="max-height"
                      type="number"
                      min={1}
                      value={settings.maxHeight}
                      disabled={disabled}
                      aria-label="Altura máxima"
                      className="pr-9"
                      onChange={(event) => update("maxHeight", Number(event.target.value) || 1)}
                    />
                    <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-xs font-medium text-muted-foreground">px</span>
                  </div>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <button type="button" disabled={disabled} onClick={() => applyResolutionPreset(1080, 1080)} className="rounded-full border bg-background px-3 py-1 text-xs font-medium text-muted-foreground transition-colors hover:border-primary/40 hover:text-primary disabled:cursor-not-allowed disabled:opacity-50">1:1</button>
                <button type="button" disabled={disabled} onClick={() => applyResolutionPreset(1920, 1080)} className="rounded-full border bg-background px-3 py-1 text-xs font-medium text-muted-foreground transition-colors hover:border-primary/40 hover:text-primary disabled:cursor-not-allowed disabled:opacity-50">16:9</button>
                <button type="button" disabled={disabled} onClick={() => applyResolutionPreset(1920, 1080)} className="rounded-full border bg-background px-3 py-1 text-xs font-medium text-muted-foreground transition-colors hover:border-primary/40 hover:text-primary disabled:cursor-not-allowed disabled:opacity-50">1080p</button>
                <button type="button" disabled={disabled} onClick={() => applyResolutionPreset(3840, 2160)} className="rounded-full border bg-background px-3 py-1 text-xs font-medium text-muted-foreground transition-colors hover:border-primary/40 hover:text-primary disabled:cursor-not-allowed disabled:opacity-50">4K</button>
              </div>
            </>
          ) : (
            <p className="text-xs text-muted-foreground">
              A imagem será exportada com a mesma largura e altura do arquivo original.
            </p>
          )}
        </div>

        <div className="order-2 grid gap-3 border-t pt-5">
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

        <div className="order-3 grid gap-2 border-t pt-5">
          <div className="flex items-center gap-2">
            <ImageIcon className="h-3.5 w-3.5 text-muted-foreground" />
            <Label>Formato de saída</Label>
          </div>
          <select
            value={settings.outputFormat}
            disabled={disabled}
            onChange={(event) => update("outputFormat", event.target.value as OutputFormat)}
            className="flex h-10 w-full rounded-md border border-input bg-white px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
          >
            <option value="jpeg">JPG</option>
            <option value="webp">WEBP</option>
            <option value="png">PNG</option>
            <option value="avif">AVIF</option>
          </select>
        </div>

        {settings.outputFormat === "jpeg" ? (
          <div className="order-4 grid gap-2 border-t pt-5">
            <div className="flex items-center gap-2">
              <Gauge className="h-3.5 w-3.5 text-muted-foreground" />
              <Label>Modo JPG</Label>
            </div>
            <select
              value={settings.jpegCompressionMode}
              disabled={disabled}
              onChange={(event) => update("jpegCompressionMode", event.target.value as JpegCompressionMode)}
              className="flex h-10 w-full rounded-md border border-input bg-white px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
            >
              <option value="fast">Rápida</option>
              <option value="balanced">Balanceada</option>
              <option value="max">Compressão máxima</option>
            </select>
            <p className="text-xs text-muted-foreground">
              {settings.jpegCompressionMode === "fast"
                ? "Prioriza velocidade. Costuma gerar arquivos maiores."
                : settings.jpegCompressionMode === "balanced"
                  ? "Equilibra tempo de processamento e tamanho final."
                  : "Prioriza menor tamanho. Costuma demorar mais para concluir."}
            </p>
          </div>
        ) : null}

        <div className="order-5 flex items-center justify-between gap-4 rounded-md bg-muted/55 p-3">
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
