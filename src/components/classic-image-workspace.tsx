"use client";

import { useMemo, useState } from "react";
import type { ReactNode } from "react";
import {
  ArrowDownToLine,
  Check,
  CheckCircle2,
  ChevronDown,
  Clock3,
  Download,
  FileImage,
  LockKeyhole,
  LockKeyholeOpen,
  LoaderCircle,
  Maximize2,
  RefreshCw,
  Settings2,
  Trash2,
  X,
  Zap
} from "lucide-react";
import type {
  CompressionSettings,
  DownloadPreferences,
  QueueImage,
  QueueSummary,
  SelectedImage
} from "@/lib/image-types";
import type { OutputFormat } from "@/lib/utils";
import { cn, formatBytes, formatPercent, getReduction } from "@/lib/utils";
import { ImageDropzone } from "@/components/image-dropzone";
import { BeforeAfterSlider } from "@/components/before-after-slider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { SegmentedControl } from "@/components/ui/segmented-control";

export type ImageWorkspaceProps = {
  settings: CompressionSettings;
  onSettingsChange: (settings: CompressionSettings) => void;
  downloadPreferences: DownloadPreferences;
  onDownloadPreferencesChange: (preferences: DownloadPreferences) => void;
  images: QueueImage[];
  selectedImage?: QueueImage;
  lastBatchSummary?: QueueSummary;
  isProcessing: boolean;
  isCancelRequested: boolean;
  isDesktop: boolean;
  processedCount: number;
  progress: number;
  processingStartedAt?: number;
  lifetimeStats?: { images: number; savedBytes: number };
  estimates?: { outputBytes: number; sampleCount: number; samples: Record<string, number> };
  invalidFiles: string[];
  onInvalidFiles: (names: string[]) => void;
  onFiles: (files: SelectedImage[]) => void;
  onSelect: (id: string) => void;
  onClosePreview: () => void;
  onRemove: (id: string) => void;
  onProcess: () => void;
  onCancelProcess: () => void;
  onClear: () => void;
  onDownload: (id: string) => void | Promise<void>;
  onDownloadAllDesktop: () => void | Promise<void>;
  onDownloadAllWeb: (format: "individual" | "zip") => void | Promise<void>;
};

const FORMAT_OPTIONS: { value: OutputFormat; label: string }[] = [
  { value: "webp", label: "WebP" },
  { value: "jpeg", label: "JPG" },
  { value: "png", label: "PNG" },
  { value: "avif", label: "AVIF" }
];

const SIZE_PRESET_OPTIONS = [
  { value: "original", label: "Original" },
  { value: "hd", label: "Full HD" },
  { value: "4k", label: "4K" },
  { value: "custom", label: "Personalizado" }
] as const;

const JPEG_MODE_OPTIONS = [
  { value: "fast", label: "Rápida" },
  { value: "balanced", label: "Balanceada" },
  { value: "max", label: "Máxima" }
] as const;

function SettingField({
  label,
  children,
  htmlFor,
  labelId,
  trailing,
  className
}: {
  label: string;
  children: ReactNode;
  htmlFor?: string;
  labelId?: string;
  trailing?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("grid gap-2", className)}>
      <div className="flex min-h-5 items-center justify-between gap-2">
        {htmlFor ? (
          <Label htmlFor={htmlFor} className="text-[13px] font-semibold text-muted-foreground">
            {label}
          </Label>
        ) : (
          <span id={labelId} className="text-[13px] font-semibold text-muted-foreground">
            {label}
          </span>
        )}
        {trailing}
      </div>
      {children}
    </div>
  );
}

export function OutputSettings({
  settings,
  onSettingsChange,
  downloadPreferences,
  onDownloadPreferencesChange,
  disabled,
  isDesktop,
  actions,
  presentation = "panel"
}: {
  settings: CompressionSettings;
  onSettingsChange: (settings: CompressionSettings) => void;
  downloadPreferences: DownloadPreferences;
  onDownloadPreferencesChange: (preferences: DownloadPreferences) => void;
  disabled: boolean;
  isDesktop: boolean;
  actions?: ReactNode;
  presentation?: "panel" | "sheet";
}) {
  const update = <K extends keyof CompressionSettings>(key: K, value: CompressionSettings[K]) => {
    onSettingsChange({ ...settings, [key]: value });
  };
  const updateDownload = <K extends keyof DownloadPreferences>(
    key: K,
    value: DownloadPreferences[K]
  ) => onDownloadPreferencesChange({ ...downloadPreferences, [key]: value });

  const activeSizePreset = settings.preserveOriginalDimensions
    ? "original"
    : settings.sizePreset ?? (settings.maxWidth === 1920 && settings.maxHeight === 1080
      ? "hd"
      : settings.maxWidth === 3840 && settings.maxHeight === 2160
        ? "4k"
        : "custom");

  const setSizePreset = (preset: "original" | "custom" | "hd" | "4k") => {
    if (preset === "original") {
      onSettingsChange({ ...settings, preserveOriginalDimensions: true });
      return;
    }
    if (preset === "custom") {
      onSettingsChange({ ...settings, sizePreset: "custom", preserveOriginalDimensions: false });
      return;
    }
    const dimensions = preset === "hd"
        ? { maxWidth: 1920, maxHeight: 1080 }
        : { maxWidth: 3840, maxHeight: 2160 };
    onSettingsChange({
      ...settings,
      ...dimensions,
      sizePreset: preset,
      keepAspectRatio: true,
      preserveOriginalDimensions: false
    });
  };
  const updateDimension = (key: "maxWidth" | "maxHeight", value: string) => {
    onSettingsChange({ ...settings, [key]: Math.max(1, Math.min(10000, Number(value) || 1)), sizePreset: "custom", preserveOriginalDimensions: false });
  };

  return (
    <section className={cn("flex flex-col overflow-hidden bg-card", presentation === "panel" && "inspector-panel rounded-xl border border-border")}>
      <div className={cn("flex items-center gap-3 border-b border-border/70 px-5 py-4", presentation === "sheet" && "hidden")}>
        <div className="classic-icon-tile flex h-9 w-9 items-center justify-center rounded-md">
          <Settings2 className="h-4 w-4" />
        </div>
        <div className="min-w-0">
          <h2 className="text-[15px] font-semibold tracking-tight text-foreground">Saída</h2>
          <p className="text-xs text-muted-foreground">Ajustes do lote</p>
        </div>
      </div>

      <div className="order-2 grid gap-5 px-5 py-5 lg:order-1">
        <fieldset className="m-0 min-w-0 border-0 p-0" aria-labelledby="classic-format-label" disabled={disabled}>
          <SettingField label="Formato" labelId="classic-format-label">
            <SegmentedControl
              options={FORMAT_OPTIONS}
              value={settings.outputFormat}
              onChange={(value) => update("outputFormat", value)}
              disabled={disabled}
              ariaLabelledBy="classic-format-label"
            />
          </SettingField>
        </fieldset>

        <SettingField label="Compressão" labelId="compression-mode-label">
          <SegmentedControl ariaLabelledBy="compression-mode-label" disabled={disabled} value={settings.compressionMode ?? "quality"}
            options={[{ value: "quality", label: "Qualidade" }, { value: "target-size", label: "Peso máximo" }]}
            onChange={(value) => update("compressionMode", value)} />
        </SettingField>
        {settings.compressionMode === "target-size" ? <SettingField label="Peso máximo por imagem (KB)" htmlFor="max-file-size">
          <Input id="max-file-size" type="number" min={1} max={102400} value={settings.maxFileSizeKB ?? 300} disabled={disabled}
            onChange={(event) => update("maxFileSizeKB", Math.min(102400, Math.max(1, Number(event.target.value) || 1)))} />
          <div className="mt-2 flex flex-wrap gap-2">{[100, 200, 300, 500, 1000].map((size) => <button key={size} type="button" disabled={disabled}
            aria-pressed={settings.maxFileSizeKB === size} onClick={() => update("maxFileSizeKB", size)} className="rounded-md border border-input px-2 py-1 text-xs hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50">{size} KB</button>)}</div>
          <p className="mt-2 text-xs leading-relaxed text-muted-foreground">Ajusta a qualidade para respeitar o limite. Se necessário, reduz as dimensões; com tamanho Original, avisa se o limite não puder ser atingido.{settings.outputFormat === "png" ? " PNG mantém a qualidade e reduz somente as dimensões." : ""}</p>
        </SettingField> : <>
        <SettingField
          label="Qualidade"
          htmlFor="classic-quality"
          trailing={(
            <span className="text-sm font-semibold tabular-nums text-foreground">
              {settings.outputFormat === "png" ? "Sem perdas" : `${settings.quality}%`}
            </span>
          )}
        >
          <Slider
            id="classic-quality"
            min={1}
            max={100}
            step={1}
            value={[settings.quality]}
            disabled={disabled || settings.outputFormat === "png"}
            onValueChange={([value]) => update("quality", value)}
            aria-label="Qualidade de saída"
            className="py-1"
          />
        </SettingField>
        </>}

        <SettingField
          label="Tamanho máximo"
          labelId="classic-size-label"
          trailing={<Maximize2 className="h-3.5 w-3.5 text-muted-foreground/70" />}
          className="border-t border-border/70 pt-4"
        >
          <SegmentedControl
            options={SIZE_PRESET_OPTIONS}
            value={activeSizePreset}
            onChange={setSizePreset}
            disabled={disabled}
            ariaLabelledBy="classic-size-label"
          />
          {!settings.preserveOriginalDimensions ? (
            <div className="mt-2 grid grid-cols-[minmax(0,1fr)_2rem_minmax(0,1fr)] items-end gap-1.5">
              <SettingField label="Largura" htmlFor="classic-width">
                <div className="relative">
                  <Input
                    id="classic-width"
                    type="number"
                    min={1}
                    max={10000}
                    value={settings.maxWidth}
                    disabled={disabled}
                    onChange={(event) => updateDimension("maxWidth", event.target.value)}
                    className="h-9 pr-9 text-sm tabular-nums"
                  />
                  <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-[10px] text-muted-foreground/70">px</span>
                </div>
              </SettingField>
              <button
                type="button"
                aria-pressed={settings.keepAspectRatio}
                aria-label={settings.keepAspectRatio ? "Desbloquear proporção" : "Manter proporção"}
                title={settings.keepAspectRatio ? "Proporção bloqueada" : "Proporção livre"}
                disabled={disabled}
                onClick={() => update("keepAspectRatio", !settings.keepAspectRatio)}
                className={cn(
                  "mb-0.5 flex h-9 w-8 items-center justify-center rounded-lg transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50",
                  settings.keepAspectRatio
                    ? "bg-brand-soft text-brand-strong"
                    : "text-muted-foreground/70 hover:bg-muted hover:text-foreground/80"
                )}
              >
                {settings.keepAspectRatio
                  ? <LockKeyhole className="h-4 w-4" />
                  : <LockKeyholeOpen className="h-4 w-4" />}
              </button>
              <SettingField label="Altura" htmlFor="classic-height">
                <div className="relative">
                  <Input
                    id="classic-height"
                    type="number"
                    min={1}
                    max={10000}
                    value={settings.maxHeight}
                    disabled={disabled}
                    onChange={(event) => updateDimension("maxHeight", event.target.value)}
                    className="h-9 pr-9 text-sm tabular-nums"
                  />
                  <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-[10px] text-muted-foreground/70">px</span>
                </div>
              </SettingField>
            </div>
          ) : (
            <p className="text-xs leading-relaxed text-muted-foreground">Mantém as dimensões de cada arquivo original.</p>
          )}
        </SettingField>

        {settings.outputFormat === "jpeg" && isDesktop ? (
          <SettingField label="Modo JPG" labelId="classic-jpeg-mode-label" className="border-t border-border/70 pt-4">
            <SegmentedControl
              options={JPEG_MODE_OPTIONS}
              value={settings.jpegCompressionMode}
              onChange={(value) => update("jpegCompressionMode", value)}
              disabled={disabled}
              ariaLabelledBy="classic-jpeg-mode-label"
            />
          </SettingField>
        ) : null}

        <details open={presentation === "sheet" ? true : undefined} className="group border-t border-border/70 pt-4">
          <summary className="flex cursor-pointer list-none items-center justify-between rounded-lg text-xs font-semibold text-foreground/80 transition-colors hover:text-brand-strong [&::-webkit-details-marker]:hidden">
            Mais opções
            <ChevronDown className="h-4 w-4 text-muted-foreground/70 transition-transform group-open:rotate-180" />
          </summary>
          <div className="grid gap-2.5 pt-4">
            <SettingField label="Se o arquivo já existir" htmlFor="file-conflict-policy">
              <select id="file-conflict-policy" value={downloadPreferences.conflictPolicy ?? "ask"} disabled={disabled}
                onChange={(event) => updateDownload("conflictPolicy", event.target.value as DownloadPreferences["conflictPolicy"])}
                className="h-10 w-full rounded-md border border-input bg-card px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50">
                <option value="ask">Perguntar</option><option value="rename">Manter os dois</option><option value="overwrite">Substituir</option><option value="skip">Pular</option>
              </select>
              {!isDesktop ? <p className="mt-2 text-xs leading-relaxed text-muted-foreground">Estas regras se aplicam ao baixar arquivos individuais em uma pasta escolhida. No download comum e no ZIP, o navegador gerencia arquivos existentes.</p> : null}
            </SettingField>
            <PreferenceToggle id="keep-original" label="Manter original se a saída ficar maior" checked={settings.keepOriginalIfLarger !== false} disabled={disabled} onCheckedChange={(checked) => update("keepOriginalIfLarger", checked)} />
            {settings.outputFormat === "jpeg" ? <SettingField label="Fundo para transparência" htmlFor="jpeg-background">
              <div className="flex items-center gap-3"><input id="jpeg-background" type="color" value={settings.jpegBackgroundColor ?? "#ffffff"} disabled={disabled} onChange={(event) => update("jpegBackgroundColor", event.target.value)} className="h-10 w-12 rounded border border-input bg-card" /><span className="text-sm">{settings.jpegBackgroundColor ?? "#ffffff"}</span></div>
              <p className="mt-2 text-xs text-muted-foreground">JPG não mantém transparência. As áreas transparentes recebem esta cor.</p>
            </SettingField> : null}

            <div role="group" aria-label="Local de salvamento" className="grid gap-2.5 rounded-md bg-muted/50 px-3 py-2.5">
              <SettingField label="Destino do download" htmlFor="classic-download-mode">
                <div className="relative">
                  <select
                    id="classic-download-mode"
                    value={downloadPreferences.mode}
                    disabled={disabled}
                    onChange={(event) => updateDownload("mode", event.target.value as DownloadPreferences["mode"])}
                    className="h-9 w-full appearance-none rounded-md border border-input bg-card pl-3 pr-9 text-sm outline-none transition-[border-color,box-shadow] duration-200 hover:border-foreground/40 focus:border-foreground focus:ring-2 focus:ring-ring/25 disabled:opacity-50"
                  >
                    <option value="same-folder">{isDesktop ? "Mesma pasta" : "Pasta de downloads"}</option>
                    <option value="choose-location">Escolher local ao salvar</option>
                  </select>
                  <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
                </div>
              </SettingField>
              {downloadPreferences.mode === "same-folder" ? (
                <div className="grid gap-2 border-t border-border/70 pt-2.5">
                  <div className="flex items-center justify-between gap-3">
                    <Label htmlFor="classic-subfolder" className="text-[13px] font-medium leading-snug text-foreground/80">
                      Salvar em subpasta
                    </Label>
                    <Switch
                      id="classic-subfolder"
                      checked={downloadPreferences.saveInSubfolder}
                      disabled={disabled}
                      onCheckedChange={(checked) => updateDownload("saveInSubfolder", checked)}
                    />
                  </div>
                  {downloadPreferences.saveInSubfolder ? (
                    <Input
                      id="classic-subfolder-name"
                      value={downloadPreferences.subfolderName}
                      placeholder="imagens-compactadas"
                      disabled={disabled}
                      onChange={(event) => updateDownload("subfolderName", event.target.value)}
                      aria-label="Nome da subpasta"
                      className="h-9 bg-card"
                    />
                  ) : null}
                </div>
              ) : null}
            </div>
            {isDesktop && settings.outputFormat === "jpeg" ? (
              <PreferenceToggle
                id="classic-metadata"
                label="Remover metadados"
                checked={settings.stripMetadata}
                disabled={disabled}
                onCheckedChange={(checked) => update("stripMetadata", checked)}
              />
            ) : null}
            {downloadPreferences.mode === "same-folder" ? (
              <>
                <PreferenceToggle
                  id="classic-auto-download"
                  label={isDesktop ? "Baixar ao concluir" : "Baixar ZIP ao concluir"}
                  checked={downloadPreferences.autoDownload}
                  disabled={disabled}
                  onCheckedChange={(checked) => updateDownload("autoDownload", checked)}
                />
                <PreferenceToggle
                  id="classic-remove-downloaded"
                  label="Remover da fila após baixar"
                  checked={downloadPreferences.removeAfterDownload}
                  disabled={disabled}
                  onCheckedChange={(checked) => updateDownload("removeAfterDownload", checked)}
                />
              </>
            ) : null}
          </div>
        </details>
      </div>
      {actions ? <div className="order-1 border-b border-border/70 bg-background/45 px-5 py-4 lg:order-2 lg:border-b-0 lg:border-t">
        {actions}
      </div> : null}
    </section>
  );
}

function PreferenceToggle({
  id,
  label,
  checked,
  disabled,
  onCheckedChange
}: {
  id: string;
  label: string;
  checked: boolean;
  disabled: boolean;
  onCheckedChange: (checked: boolean) => void;
}) {
  return (
    <div className="preference-toggle flex items-center justify-between gap-3 rounded-md bg-muted/50 px-3 py-2.5">
      <Label htmlFor={id} className="text-[13px] font-medium leading-snug text-foreground/80">{label}</Label>
      <Switch id={id} checked={checked} disabled={disabled} onCheckedChange={onCheckedChange} />
    </div>
  );
}

function StatusPill({ status }: { status: QueueImage["status"] }) {
  const config = {
    pending: { label: "Na fila", icon: Clock3, className: "bg-muted text-muted-foreground" },
    processing: { label: "Compactando", icon: LoaderCircle, className: "bg-brand-soft text-brand-strong" },
    kept: { label: "Original mantido", icon: CheckCircle2, className: "bg-muted text-muted-foreground" },
    skipped: { label: "Ignorada", icon: X, className: "bg-muted text-muted-foreground" },
    done: { label: "Pronta", icon: CheckCircle2, className: "bg-success-soft text-success" },
    error: { label: "Erro", icon: X, className: "bg-destructive/10 text-destructive" }
  }[status];
  const Icon = config.icon;
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-sm px-2 py-1 text-[10px] font-semibold uppercase tracking-wide", config.className, status === "processing" && "animate-soft-pulse")}>
      <Icon className={cn("h-3 w-3", status === "processing" && "loading-spinner")} />
      {config.label}
    </span>
  );
}

function ImagePreview({ image, onClose }: { image: QueueImage; onClose: () => void }) {
  const [mode, setMode] = useState<"compare" | "original" | "compressed">("compare");
  const hasCompressed = Boolean(image.compressedUrl);
  const displayedMode = hasCompressed ? mode : "original";

  return (
    <section className="classic-card overflow-hidden rounded-xl border border-border bg-card">
      <div className="flex flex-col gap-3 border-b border-border/70 px-4 py-3.5 sm:flex-row sm:items-center sm:justify-between sm:px-5">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-background text-foreground/70">
            <FileImage className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <h2 className="truncate text-sm font-semibold text-foreground" title={image.file.name}>{image.file.name}</h2>
            <p className="text-xs text-muted-foreground">
              {image.originalDimensions ? `${image.originalDimensions.width} × ${image.originalDimensions.height} · ` : ""}
              {formatBytes(image.file.size)}
            </p>
          </div>
        </div>
        <div className="flex w-full items-center gap-2 sm:w-auto">
          <SegmentedControl
            options={[
              { value: "compare", label: "Comparar", disabled: !hasCompressed },
              { value: "original", label: "Original" },
              { value: "compressed", label: "Saída", disabled: !hasCompressed }
            ]}
            value={displayedMode}
            onChange={setMode}
            ariaLabel="Modo de pré-visualização"
            className="min-w-0 flex-1 sm:w-[242px] sm:flex-none"
          />
          <Button type="button" variant="ghost" size="icon" aria-label="Fechar prévia" title="Fechar prévia" onClick={onClose} className="h-10 w-10 shrink-0 text-muted-foreground hover:text-foreground">
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div className="preview-stage flex min-h-[320px] items-center justify-center p-4 sm:min-h-[380px] sm:p-7">
        <div className={cn("mx-auto w-full overflow-hidden", displayedMode === "compare" ? "max-w-[600px]" : "max-w-[760px]")}>
          {displayedMode === "compare" && image.compressedUrl ? (
            <BeforeAfterSlider beforeUrl={image.originalUrl} afterUrl={image.compressedUrl} alt={image.file.name} />
          ) : (
            <img
              src={displayedMode === "compressed" ? image.compressedUrl ?? image.originalUrl : image.originalUrl}
              alt={image.file.name}
              decoding="async"
              className="mx-auto h-[min(42vh,380px)] min-h-[280px] w-full object-contain"
            />
          )}
        </div>
      </div>

      <div className="grid grid-cols-3 divide-x divide-border/70 border-t border-border/70">
        <PreviewMetric label="Original" value={formatBytes(image.file.size)} />
        <PreviewMetric label="Compactada" value={image.compressedBlob ? formatBytes(image.compressedBlob.size) : "—"} />
        <PreviewMetric
          label="Redução"
          value={image.compressedBlob ? formatPercent(getReduction(image.file.size, image.compressedBlob.size) ?? 0) : "—"}
          positive={Boolean(image.compressedBlob)}
        />
      </div>
    </section>
  );
}

function PreviewMetric({ label, value, positive = false }: { label: string; value: string; positive?: boolean }) {
  return (
    <div className="px-3 py-3 text-center sm:px-5 sm:text-left">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground/70">{label}</p>
      <p className={cn("mt-1 text-sm font-semibold tabular-nums", positive ? "text-success" : "text-foreground")}>{value}</p>
    </div>
  );
}

function QueuePanel({
  images,
  selectedId,
  isProcessing,
  isDesktop,
  processedCount,
  progress,
  onSelect,
  onRemove,
  onDownload,
  onFiles,
  onInvalidFiles,
  onClear
}: Pick<ImageWorkspaceProps,
  "images" | "selectedImage" | "isProcessing" | "isDesktop" | "processedCount" | "progress" | "onSelect" | "onRemove" | "onDownload" | "onFiles" | "onInvalidFiles" | "onClear"
> & { selectedId?: string }) {
  const readyCount = images.filter((image) => image.status === "done").length;
  const errorCount = images.filter((image) => image.status === "error").length;

  return (
    <section className="classic-card overflow-hidden rounded-lg border border-border bg-card">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/70 px-4 py-3.5 sm:px-5">
        <div className="flex items-center gap-3">
          <h2 className="text-sm font-semibold text-foreground">Fila de imagens</h2>
          <span className="rounded-sm bg-muted px-2 py-0.5 text-xs font-medium tabular-nums text-muted-foreground">{images.length}</span>
          {readyCount > 0 ? <span className="text-xs font-medium text-success">{readyCount} prontas</span> : null}
          {errorCount > 0 ? <span className="text-xs font-medium text-destructive">{errorCount} com erro</span> : null}
        </div>
        <div className="flex items-center gap-2">
          <ImageDropzone onFiles={onFiles} onInvalidFiles={onInvalidFiles} isDesktop={isDesktop} mode="button" disabled={isProcessing} />
          <Button type="button" variant="ghost" size="sm" disabled={isProcessing} onClick={onClear} className="h-9 px-2.5 text-muted-foreground">
            <Trash2 className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Limpar</span>
          </Button>
        </div>
      </div>

      {isProcessing ? (
        <div className="border-b border-border/70 px-4 py-3 sm:px-5">
          <div className="mb-2 flex items-center justify-between gap-3 text-xs">
            <span className="font-medium text-brand-strong">Compactando imagens</span>
            <span className="tabular-nums text-muted-foreground">{processedCount} de {images.length}</span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-muted">
            <div className="h-full rounded-full bg-brand transition-[width]" style={{ width: `${progress}%` }} />
          </div>
        </div>
      ) : null}

      <div className="max-h-[440px] overflow-y-auto divide-y divide-border/70">
        {images.map((image) => {
          const reduction = image.compressedBlob ? getReduction(image.file.size, image.compressedBlob.size) : undefined;
          return (
            <div key={image.id} className={cn("queue-row group/queue-row flex items-center gap-2 px-3 py-2.5 transition-colors duration-200 hover:bg-muted/35 sm:gap-3 sm:px-5", selectedId === image.id && "bg-background/80 hover:bg-background")} data-selected={selectedId === image.id}>
              <button
                type="button"
                aria-pressed={selectedId === image.id}
                onClick={() => onSelect(image.id)}
                className="flex min-w-0 flex-1 items-center gap-3 rounded-lg text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <img src={image.originalUrl} alt="" loading="lazy" decoding="async" className="h-11 w-14 shrink-0 rounded-lg border border-border bg-muted/50 object-cover transition-transform duration-200 group-hover/queue-row:scale-[1.03]" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-xs font-semibold text-foreground" title={image.file.name}>{image.file.name}</span>
                  <span className="mt-1 block truncate text-[11px] text-muted-foreground">
                    {image.originalDimensions ? `${image.originalDimensions.width} × ${image.originalDimensions.height} · ` : ""}
                    {formatBytes(image.file.size)}
                    {image.compressedBlob ? ` → ${formatBytes(image.compressedBlob.size)}` : ""}
                  </span>
                  {image.error ? <span className="mt-1 block truncate text-[10px] text-destructive" title={image.error}>{image.error}</span> : null}
                  {image.downloadError ? <span className="mt-1 block truncate text-[10px] text-destructive" title={image.downloadError}>{image.downloadError}</span> : null}
                </span>
                <span className="hidden shrink-0 sm:inline-flex"><StatusPill status={image.status} /></span>
                {reduction !== undefined ? <span className="hidden w-14 shrink-0 text-right text-xs font-semibold tabular-nums text-success md:block">−{formatPercent(reduction)}</span> : null}
              </button>
              <span className="sm:hidden"><StatusPill status={image.status} /></span>
              {image.status === "done" ? (
                <Button type="button" variant="ghost" size="icon" aria-label={`Baixar ${image.file.name}`} onClick={() => void onDownload(image.id)} className="h-8 w-8 shrink-0 text-muted-foreground hover:text-brand-strong">
                  <Download className="h-4 w-4" />
                </Button>
              ) : null}
              {!isProcessing ? (
                <Button type="button" variant="ghost" size="icon" aria-label={`Remover ${image.file.name}`} onClick={() => onRemove(image.id)} className="h-8 w-8 shrink-0 text-muted-foreground/70 hover:text-destructive">
                  <X className="h-4 w-4" />
                </Button>
              ) : null}
            </div>
          );
        })}
      </div>
    </section>
  );
}

function CompletedBatch({ summary, onFiles, onInvalidFiles, onClear, isDesktop }: {
  summary: QueueSummary;
  onFiles: (files: SelectedImage[]) => void;
  onInvalidFiles: (names: string[]) => void;
  onClear: () => void;
  isDesktop: boolean;
}) {
  return (
    <section className="classic-card animate-enter flex min-h-[240px] flex-col justify-between rounded-lg border border-success/30 bg-card p-5 sm:p-7">
      <div>
        <span className="flex h-10 w-10 items-center justify-center rounded-md bg-success-soft text-success"><Check className="h-5 w-5" /></span>
        <h2 className="mt-4 text-lg font-semibold text-foreground">Lote concluído</h2>
        <p className="mt-1 text-sm text-muted-foreground">{summary.completedCount} de {summary.totalCount} imagens prontas{summary.keptCount ? ` · ${summary.keptCount} originais mantidos` : ""}{summary.errorCount ? ` · ${summary.errorCount} com erro` : ""}</p>
      </div>
      <div className="mt-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wide text-success">Redução média</p>
          <p className="mt-1 text-2xl font-bold tabular-nums text-success">{summary.averageReduction !== undefined ? formatPercent(summary.averageReduction) : "—"}</p>
        </div>
        <div className="flex gap-2">
          <Button type="button" variant="outline" onClick={onClear}>Novo lote</Button>
          <ImageDropzone onFiles={onFiles} onInvalidFiles={onInvalidFiles} isDesktop={isDesktop} mode="button" />
        </div>
      </div>
    </section>
  );
}

export function ClassicImageWorkspace(props: ImageWorkspaceProps) {
  const {
    settings,
    onSettingsChange,
    downloadPreferences,
    onDownloadPreferencesChange,
    images,
    selectedImage,
    lastBatchSummary,
    isProcessing,
    isCancelRequested,
    isDesktop,
    processedCount,
    progress,
    invalidFiles,
    onInvalidFiles,
    onFiles,
    onSelect,
    onClosePreview,
    onRemove,
    onProcess,
    onCancelProcess,
    onClear,
    onDownload,
    onDownloadAllDesktop,
    onDownloadAllWeb
  } = props;
  const isComplete = useMemo(() => images.length > 0 && images.every((image) => image.status !== "pending" && image.status !== "processing"), [images]);
  const hasCompressed = images.some((image) => image.status === "done" && image.compressedBlob);
  const hasProcessed = images.some((image) => image.status !== "pending" && image.status !== "processing");
  const readyCount = images.filter((image) => image.status === "done" && image.compressedBlob).length;

  return (
    <main className="min-h-[calc(100vh-64px)] bg-transparent">
      <div className="mx-auto max-w-[1440px] px-3 pb-8 pt-5 sm:px-5 sm:pt-7 xl:px-8">
        {invalidFiles.length ? (
          <div role="status" className="animate-enter mb-4 rounded-md border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            <strong>Arquivos ignorados:</strong> {invalidFiles.join(", ")}
            <button type="button" aria-label="Fechar aviso" onClick={() => onInvalidFiles([])} className="float-right font-semibold">×</button>
          </div>
        ) : null}

        <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_320px] lg:gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
          <div className="min-w-0">
            {selectedImage || lastBatchSummary || !images.length ? (
              <section className="min-w-0">
                {selectedImage ? (
                  <ImagePreview key={selectedImage.id} image={selectedImage} onClose={onClosePreview} />
                ) : lastBatchSummary ? (
                  <CompletedBatch summary={lastBatchSummary} onFiles={onFiles} onInvalidFiles={onInvalidFiles} onClear={onClear} isDesktop={isDesktop} />
                ) : (
                  <ImageDropzone
                    onFiles={onFiles}
                    onInvalidFiles={onInvalidFiles}
                    isDesktop={isDesktop}
                    compact
                    enableNativeDragDrop={false}
                    enableLocalDragDrop={false}
                  />
                )}
              </section>
            ) : null}

            {images.length ? (
              <div className={cn((selectedImage || lastBatchSummary) && "mt-4")}>
                <QueuePanel
                  images={images}
                  selectedId={selectedImage?.id}
                  isProcessing={isProcessing}
                  isDesktop={isDesktop}
                  processedCount={processedCount}
                  progress={progress}
                  onSelect={onSelect}
                  onRemove={onRemove}
                  onDownload={onDownload}
                  onFiles={onFiles}
                  onInvalidFiles={onInvalidFiles}
                  onClear={onClear}
                />
              </div>
            ) : null}
          </div>

          <aside className="lg:sticky lg:top-4">
            <OutputSettings
              settings={settings}
              onSettingsChange={onSettingsChange}
              downloadPreferences={downloadPreferences}
              onDownloadPreferencesChange={onDownloadPreferencesChange}
              disabled={isProcessing}
              isDesktop={isDesktop}
              actions={(
                <div className="grid gap-2">
                  {isProcessing ? (
                    <Button type="button" variant="destructive" className="h-11 w-full" disabled={isCancelRequested} onClick={onCancelProcess}>
                      {isCancelRequested ? <LoaderCircle className="h-4 w-4 loading-spinner" /> : <X className="h-4 w-4" />}
                      {isCancelRequested ? "Cancelando…" : "Cancelar compactação"}
                    </Button>
                  ) : isComplete && hasCompressed ? (
                    isDesktop ? (
                      <Button type="button" className="classic-primary-action h-11 w-full" onClick={() => void onDownloadAllDesktop()}>
                        <ArrowDownToLine className="h-4 w-4" />Baixar {readyCount} {readyCount === 1 ? "imagem" : "imagens"}
                      </Button>
                    ) : (
                      <Button type="button" className="classic-primary-action h-11 w-full" onClick={() => void onDownloadAllWeb("zip")}>
                        <ArrowDownToLine className="h-4 w-4" />Baixar ZIP
                      </Button>
                    )
                  ) : (
                    <Button type="button" className="classic-primary-action h-11 w-full" disabled={!images.length} onClick={onProcess}>
                      {hasProcessed ? <RefreshCw className="h-4 w-4" /> : <Zap className="h-4 w-4" />}
                      {hasProcessed ? "Recompactar lote" : `Compactar ${images.length || "imagens"}`}
                    </Button>
                  )}
                  {isComplete && hasCompressed ? (
                    <div className={cn("grid gap-2", !isDesktop && "grid-cols-2")}>
                      <Button type="button" variant="outline" className="h-9 px-2 text-xs" onClick={onProcess}>
                        <RefreshCw className="h-3.5 w-3.5" />Recompactar
                      </Button>
                      {!isDesktop ? (
                        <Button type="button" variant="outline" className="h-9 px-2 text-xs" onClick={() => void onDownloadAllWeb("individual")}>
                          <Download className="h-3.5 w-3.5" />Individuais
                        </Button>
                      ) : null}
                    </div>
                  ) : !images.length ? (
                    <p className="text-center text-xs text-muted-foreground">Adicione imagens para ativar a compactação.</p>
                  ) : null}
                </div>
              )}
            />
          </aside>

        </div>
        <ImageDropzone
          onFiles={onFiles}
          onInvalidFiles={onInvalidFiles}
          isDesktop={isDesktop}
          mode="overlay"
          disabled={isProcessing}
        />
        <div className="sr-only" aria-live="polite">{isComplete ? "Compactação concluída" : isProcessing ? `Processando ${processedCount} de ${images.length}` : ""}</div>
      </div>
    </main>
  );
}
