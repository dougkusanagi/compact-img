"use client";

import { useEffect, useState } from "react";
import type {
  CompressionSettings as CompressionSettingsType,
  DownloadPreferences,
  JpegCompressionMode
} from "@/lib/image-types";
import type { OutputFormat } from "@/lib/utils";
import { ChevronDown, CircleHelp, Download, Gauge, ImageIcon, Link2, Maximize2, Settings2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { SegmentedControl } from "@/components/ui/segmented-control";

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
      keepAspectRatio: true,
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
        <div className="order-4 grid gap-3 border-t pt-5">
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
                <p className="mt-1"><strong className="text-foreground">Personalizado:</strong> limita largura e altura separadamente; pode mudar a proporção da imagem.</p>
              </div>
            </div>
          </div>
          <SegmentedControl
            options={[
              { value: "original", label: "Original" },
              { value: "maximum", label: <><Link2 className="h-3.5 w-3.5" />Proporção</> },
              { value: "custom", label: "Personalizado" }
            ]}
            value={resizeMode}
            onChange={setResizeMode}
            disabled={disabled}
            tone="primary"
            ariaLabel="Modo de redimensionamento"
            className="border border-slate-200/80 bg-slate-100/75"
          />
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
              <div className="flex flex-wrap gap-2" aria-label="Predefinições de resolução">
                <button
                  type="button"
                  disabled={disabled}
                  aria-pressed={!settings.preserveOriginalDimensions && settings.keepAspectRatio && settings.maxWidth === 1920 && settings.maxHeight === 1080}
                  onClick={() => applyResolutionPreset(1920, 1080)}
                  className="rounded-md border bg-background px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:border-primary/40 hover:text-primary aria-pressed:border-primary/35 aria-pressed:bg-primary/5 aria-pressed:text-primary disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Até 1080p <span className="ml-1 text-muted-foreground/75">1920 × 1080</span>
                </button>
                <button
                  type="button"
                  disabled={disabled}
                  aria-pressed={!settings.preserveOriginalDimensions && settings.keepAspectRatio && settings.maxWidth === 3840 && settings.maxHeight === 2160}
                  onClick={() => applyResolutionPreset(3840, 2160)}
                  className="rounded-md border bg-background px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:border-primary/40 hover:text-primary aria-pressed:border-primary/35 aria-pressed:bg-primary/5 aria-pressed:text-primary disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Até 4K <span className="ml-1 text-muted-foreground/75">3840 × 2160</span>
                </button>
              </div>
              {resizeMode === "custom" ? (
                <p className="text-xs leading-relaxed text-amber-700">
                  Largura e altura são ajustadas separadamente e podem alterar a proporção. Escolha “Proporção” para preservar o formato da imagem.
                </p>
              ) : null}
            </>
          ) : (
            <p className="text-xs text-muted-foreground">
              A imagem será exportada com a mesma largura e altura do arquivo original.
            </p>
          )}
        </div>

        <div className="order-2 grid gap-3 border-t pt-5">
          {settings.outputFormat === "png" ? (
            <div className="flex items-start gap-2 text-sm text-muted-foreground">
              <Gauge className="mt-0.5 h-4 w-4 shrink-0" />
              <p>PNG é sem perdas; o controle de qualidade não se aplica a esse formato.</p>
            </div>
          ) : (
            <>
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
                    className="h-9 w-16 px-2 text-center text-sm font-medium [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
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
                aria-label="Qualidade de saída"
              />
            </>
          )}
        </div>

        <div className="order-1 grid gap-2 border-t pt-5">
          <div className="flex items-center gap-2">
            <ImageIcon className="h-3.5 w-3.5 text-muted-foreground" />
            <Label htmlFor="output-format">Formato de saída</Label>
          </div>
          <select
            id="output-format"
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

        {settings.outputFormat === "jpeg" && isDesktop ? (
          <div className="order-3 grid gap-2 border-t pt-5">
            <div className="flex items-center gap-2">
              <Gauge className="h-3.5 w-3.5 text-muted-foreground" />
              <Label htmlFor="jpeg-compression-mode">Perfil de compressão JPEG</Label>
            </div>
            <select
              id="jpeg-compression-mode"
              value={settings.jpegCompressionMode}
              disabled={disabled}
              onChange={(event) => update("jpegCompressionMode", event.target.value as JpegCompressionMode)}
              className="flex h-10 w-full rounded-md border border-input bg-white px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
            >
              <option value="fast">Mais rápido</option>
              <option value="balanced">Equilibrado</option>
              <option value="max">Compressão máxima</option>
            </select>
            <p className="text-xs text-muted-foreground">
              {settings.jpegCompressionMode === "fast"
                ? "Prioriza velocidade. Costuma gerar arquivos maiores."
                : settings.jpegCompressionMode === "balanced"
                  ? "Equilibra tempo de processamento e tamanho final."
                  : "Prioriza menor tamanho. Costuma demorar mais para concluir."}
            </p>
            <p className="text-xs leading-relaxed text-muted-foreground">
              JPEG não preserva transparência. Use WebP, PNG ou AVIF para manter áreas transparentes.
            </p>
          </div>
        ) : null}

        <details className="order-5 border-t pt-4 group">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-sm font-semibold text-foreground [&::-webkit-details-marker]:hidden">
            <span>Mais opções</span>
            <ChevronDown className="h-4 w-4 text-muted-foreground transition-transform group-open:rotate-180" />
          </summary>
          <div className="grid gap-5 pt-4">
            <section className="grid gap-3">
              {isDesktop && settings.outputFormat === "jpeg" ? (
                <div className="flex items-center justify-between gap-4 rounded-lg bg-muted/55 p-3">
                  <div>
                    <Label htmlFor="metadata">Remover metadados</Label>
                    <p className="mt-1 text-xs leading-relaxed text-muted-foreground">Remove informações como data e localização da imagem.</p>
                  </div>
                  <Switch
                    id="metadata"
                    checked={settings.stripMetadata}
                    disabled={disabled}
                    onCheckedChange={(checked) => update("stripMetadata", checked)}
                  />
                </div>
              ) : (
                <p className="rounded-lg bg-muted/55 p-3 text-xs leading-relaxed text-muted-foreground">
                  Metadados são removidos automaticamente ao exportar neste formato.
                </p>
              )}
            </section>

            <section className="grid gap-4 border-t pt-4">
              <div className="flex items-center gap-2">
                <Download className="h-4 w-4 text-muted-foreground" />
                <Label>Download</Label>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="download-mode">Destino</Label>
                <select
                  id="download-mode"
                  value={downloadPreferences.mode}
                  disabled={disabled}
                  onChange={(event) => updateDownload("mode", event.target.value as DownloadPreferences["mode"])}
                  className="flex h-10 w-full rounded-md border border-input bg-white px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <option value="same-folder">{isDesktop ? "Mesma pasta" : "Pasta de downloads"}</option>
                  <option value="choose-location">{isDesktop ? "Escolher local" : "Escolher local ao salvar"}</option>
                </select>
              </div>
              {downloadPreferences.mode === "same-folder" ? (
                <>
                  <div className="flex items-center justify-between gap-3 rounded-lg bg-muted/55 p-3">
                    <Label htmlFor="auto-download" className="text-sm leading-tight">
                      {isDesktop ? "Baixar automaticamente" : "Baixar ZIP automaticamente ao concluir"}
                    </Label>
                    <Switch
                      id="auto-download"
                      checked={downloadPreferences.autoDownload}
                      disabled={disabled}
                      onCheckedChange={(checked) => updateDownload("autoDownload", checked)}
                    />
                  </div>
                  <div className="flex items-center justify-between gap-3 rounded-lg bg-muted/55 p-3">
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
                  <div className="grid gap-3 rounded-lg bg-muted/55 p-3">
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
                          {isDesktop
                            ? "A subpasta será criada ao lado de cada imagem original."
                            : "No navegador, a subpasta organiza os arquivos dentro do ZIP. Downloads individuais vão para a pasta padrão do navegador."}
                        </p>
                      </>
                    ) : null}
                  </div>
                </>
              ) : null}
              {!isDesktop ? (
                <p className="text-xs leading-relaxed text-muted-foreground">
                  O navegador salva na pasta de downloads configurada nele. A opção de escolher local usa os seletores disponíveis no navegador.
                </p>
              ) : null}
            </section>
          </div>
        </details>
      </CardContent>
    </Card>
  );
}
