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

type BetaImageWorkspaceProps = {
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
  invalidFiles: string[];
  onInvalidFiles: (names: string[]) => void;
  onFiles: (files: SelectedImage[]) => void;
  onSelect: (id: string) => void;
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
  { value: "web", label: "Web" },
  { value: "hd", label: "Full HD" },
  { value: "4k", label: "4K" }
] as const;

const JPEG_MODE_OPTIONS = [
  { value: "fast", label: "Rápida" },
  { value: "balanced", label: "Balanceada" },
  { value: "max", label: "Compressão máxima" }
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
          <Label htmlFor={htmlFor} className="text-xs font-semibold text-slate-500">
            {label}
          </Label>
        ) : (
          <span id={labelId} className="text-xs font-semibold text-slate-500">
            {label}
          </span>
        )}
        {trailing}
      </div>
      {children}
    </div>
  );
}

function OutputSettings({
  settings,
  onSettingsChange,
  downloadPreferences,
  onDownloadPreferencesChange,
  disabled,
  isDesktop
}: {
  settings: CompressionSettings;
  onSettingsChange: (settings: CompressionSettings) => void;
  downloadPreferences: DownloadPreferences;
  onDownloadPreferencesChange: (preferences: DownloadPreferences) => void;
  disabled: boolean;
  isDesktop: boolean;
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
    : !settings.keepAspectRatio
      ? "custom"
      : settings.maxWidth === 1920 && settings.maxHeight === 1080
      ? "hd"
      : settings.maxWidth === 3840 && settings.maxHeight === 2160
        ? "4k"
        : settings.maxWidth === 2000 && settings.maxHeight === 2000
          ? "web"
          : "custom";

  const setSizePreset = (preset: "original" | "web" | "hd" | "4k") => {
    if (preset === "original") {
      onSettingsChange({ ...settings, preserveOriginalDimensions: true });
      return;
    }
    const dimensions = preset === "web"
      ? { maxWidth: 2000, maxHeight: 2000 }
      : preset === "hd"
        ? { maxWidth: 1920, maxHeight: 1080 }
        : { maxWidth: 3840, maxHeight: 2160 };
    onSettingsChange({
      ...settings,
      ...dimensions,
      keepAspectRatio: true,
      preserveOriginalDimensions: false
    });
  };

  return (
    <section className="beta-card overflow-hidden rounded-2xl border border-slate-200 bg-white">
      <div className="flex items-center gap-3 border-b border-slate-100 px-5 py-4">
        <div className="beta-icon-tile flex h-9 w-9 items-center justify-center rounded-xl text-blue-600">
          <Settings2 className="h-4 w-4" />
        </div>
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-slate-900">Saída</h2>
          <p className="text-xs text-slate-500">Formato e dimensões</p>
        </div>
      </div>

      <div className="grid gap-5 p-5">
        <fieldset className="m-0 min-w-0 border-0 p-0" aria-labelledby="beta-format-label" disabled={disabled}>
          <SettingField label="Formato" labelId="beta-format-label">
            <SegmentedControl
              options={FORMAT_OPTIONS}
              value={settings.outputFormat}
              onChange={(value) => update("outputFormat", value)}
              disabled={disabled}
              ariaLabelledBy="beta-format-label"
            />
          </SettingField>
        </fieldset>

        <SettingField
          label="Qualidade"
          htmlFor="beta-quality"
          trailing={(
            <span className="text-sm font-semibold tabular-nums text-slate-900">
              {settings.outputFormat === "png" ? "Sem perdas" : `${settings.quality}%`}
            </span>
          )}
        >
          <Slider
            id="beta-quality"
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

        <SettingField
          label="Tamanho máximo"
          labelId="beta-size-label"
          trailing={<Maximize2 className="h-3.5 w-3.5 text-slate-400" />}
          className="border-t border-slate-100 pt-4"
        >
          <SegmentedControl
            options={SIZE_PRESET_OPTIONS}
            value={activeSizePreset}
            onChange={setSizePreset}
            disabled={disabled}
            ariaLabelledBy="beta-size-label"
          />
          {!settings.preserveOriginalDimensions ? (
            <div className="mt-2 grid grid-cols-[minmax(0,1fr)_2rem_minmax(0,1fr)] items-end gap-1.5">
              <SettingField label="Largura" htmlFor="beta-width">
                <div className="relative">
                  <Input
                    id="beta-width"
                    type="number"
                    min={1}
                    max={10000}
                    value={settings.maxWidth}
                    disabled={disabled}
                    onChange={(event) => update("maxWidth", Math.max(1, Number(event.target.value) || 1))}
                    className="h-9 pr-9 text-sm tabular-nums"
                  />
                  <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-[10px] text-slate-400">px</span>
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
                  "mb-0.5 flex h-9 w-8 items-center justify-center rounded-lg transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 disabled:opacity-50",
                  settings.keepAspectRatio
                    ? "bg-blue-50 text-blue-700"
                    : "text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                )}
              >
                {settings.keepAspectRatio
                  ? <LockKeyhole className="h-4 w-4" />
                  : <LockKeyholeOpen className="h-4 w-4" />}
              </button>
              <SettingField label="Altura" htmlFor="beta-height">
                <div className="relative">
                  <Input
                    id="beta-height"
                    type="number"
                    min={1}
                    max={10000}
                    value={settings.maxHeight}
                    disabled={disabled}
                    onChange={(event) => update("maxHeight", Math.max(1, Number(event.target.value) || 1))}
                    className="h-9 pr-9 text-sm tabular-nums"
                  />
                  <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-[10px] text-slate-400">px</span>
                </div>
              </SettingField>
            </div>
          ) : (
            <p className="text-xs leading-relaxed text-slate-500">Mantém as dimensões de cada arquivo original.</p>
          )}
        </SettingField>

        {settings.outputFormat === "jpeg" && isDesktop ? (
          <SettingField label="Modo JPG" labelId="beta-jpeg-mode-label" className="border-t border-slate-100 pt-4">
            <SegmentedControl
              options={JPEG_MODE_OPTIONS}
              value={settings.jpegCompressionMode}
              onChange={(value) => update("jpegCompressionMode", value)}
              disabled={disabled}
              ariaLabelledBy="beta-jpeg-mode-label"
            />
          </SettingField>
        ) : null}

        <details className="group border-t border-slate-100 pt-4">
          <summary className="flex cursor-pointer list-none items-center justify-between rounded-lg text-xs font-semibold text-slate-700 transition-colors hover:text-blue-700 [&::-webkit-details-marker]:hidden">
            Mais opções
            <ChevronDown className="h-4 w-4 text-slate-400 transition-transform group-open:rotate-180" />
          </summary>
          <div className="grid gap-4 pt-4">
            {isDesktop && settings.outputFormat === "jpeg" ? (
              <PreferenceToggle
                id="beta-metadata"
                label="Remover metadados"
                checked={settings.stripMetadata}
                disabled={disabled}
                onCheckedChange={(checked) => update("stripMetadata", checked)}
              />
            ) : null}
            <SettingField label="Destino do download" htmlFor="beta-download-mode">
              <select
                id="beta-download-mode"
                value={downloadPreferences.mode}
                disabled={disabled}
                onChange={(event) => updateDownload("mode", event.target.value as DownloadPreferences["mode"])}
              className="h-9 rounded-lg border border-slate-200 bg-white px-3 text-sm outline-none transition-[border-color,box-shadow] duration-200 focus:border-blue-400 focus:ring-2 focus:ring-blue-500/20 disabled:opacity-50"
              >
                <option value="same-folder">{isDesktop ? "Mesma pasta" : "Pasta de downloads"}</option>
                <option value="choose-location">Escolher local ao salvar</option>
              </select>
            </SettingField>
            {downloadPreferences.mode === "same-folder" ? (
              <>
                <PreferenceToggle
                  id="beta-auto-download"
                  label={isDesktop ? "Baixar ao concluir" : "Baixar ZIP ao concluir"}
                  checked={downloadPreferences.autoDownload}
                  disabled={disabled}
                  onCheckedChange={(checked) => updateDownload("autoDownload", checked)}
                />
                <PreferenceToggle
                  id="beta-remove-downloaded"
                  label="Remover da fila após baixar"
                  checked={downloadPreferences.removeAfterDownload}
                  disabled={disabled}
                  onCheckedChange={(checked) => updateDownload("removeAfterDownload", checked)}
                />
                <div className="grid gap-2 rounded-lg bg-slate-50 p-3">
                  <div className="flex items-center justify-between gap-3">
                    <Label htmlFor="beta-subfolder" className="text-xs font-medium leading-snug text-slate-600">
                      Salvar em subpasta
                    </Label>
                    <Switch
                      id="beta-subfolder"
                      checked={downloadPreferences.saveInSubfolder}
                      disabled={disabled}
                      onCheckedChange={(checked) => updateDownload("saveInSubfolder", checked)}
                    />
                  </div>
                  {downloadPreferences.saveInSubfolder ? (
                    <Input
                      id="beta-subfolder-name"
                      value={downloadPreferences.subfolderName}
                      placeholder="imagens-compactadas"
                      disabled={disabled}
                      onChange={(event) => updateDownload("subfolderName", event.target.value)}
                      aria-label="Nome da subpasta"
                      className="h-9 bg-white"
                    />
                  ) : null}
                </div>
              </>
            ) : null}
          </div>
        </details>
      </div>
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
    <div className="preference-toggle flex items-center justify-between gap-3 rounded-lg bg-slate-50 px-3 py-2.5">
      <Label htmlFor={id} className="text-xs font-medium leading-snug text-slate-600">{label}</Label>
      <Switch id={id} checked={checked} disabled={disabled} onCheckedChange={onCheckedChange} />
    </div>
  );
}

function StatusPill({ status }: { status: QueueImage["status"] }) {
  const config = {
    pending: { label: "Na fila", icon: Clock3, className: "bg-slate-100 text-slate-500" },
    processing: { label: "Compactando", icon: LoaderCircle, className: "bg-blue-50 text-blue-700" },
    done: { label: "Pronta", icon: CheckCircle2, className: "bg-emerald-50 text-emerald-700" },
    error: { label: "Erro", icon: X, className: "bg-rose-50 text-rose-700" }
  }[status];
  const Icon = config.icon;
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-full px-2 py-1 text-[10px] font-semibold", config.className, status === "processing" && "animate-soft-pulse")}>
      <Icon className={cn("h-3 w-3", status === "processing" && "loading-spinner")} />
      {config.label}
    </span>
  );
}

function ImagePreview({ image }: { image: QueueImage }) {
  const [mode, setMode] = useState<"compare" | "original" | "compressed">("compare");
  const hasCompressed = Boolean(image.compressedUrl);
  const displayedMode = hasCompressed ? mode : "original";

  return (
    <section className="beta-card overflow-hidden rounded-2xl border border-slate-200 bg-white">
      <div className="flex flex-col gap-3 border-b border-slate-100 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-5">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-600">
            <FileImage className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <h2 className="truncate text-sm font-semibold text-slate-900" title={image.file.name}>{image.file.name}</h2>
            <p className="text-xs text-slate-500">
              {image.originalDimensions ? `${image.originalDimensions.width} × ${image.originalDimensions.height} · ` : ""}
              {formatBytes(image.file.size)}
            </p>
          </div>
        </div>
        <SegmentedControl
          options={[
            { value: "compare", label: "Comparar", disabled: !hasCompressed },
            { value: "original", label: "Original" },
            { value: "compressed", label: "Saída", disabled: !hasCompressed }
          ]}
          value={displayedMode}
          onChange={setMode}
          ariaLabel="Modo de pré-visualização"
          className="w-full sm:w-[242px]"
        />
      </div>

      <div className="bg-[linear-gradient(45deg,#f1f5f9_25%,transparent_25%,transparent_75%,#f1f5f9_75%),linear-gradient(45deg,#f1f5f9_25%,transparent_25%,transparent_75%,#f1f5f9_75%)] bg-[length:24px_24px] bg-[position:0_0,12px_12px] p-3 sm:p-5">
        <div className="mx-auto max-w-4xl overflow-hidden rounded-xl border border-slate-200/80 bg-white/70 shadow-inner">
          {displayedMode === "compare" && image.compressedUrl ? (
            <BeforeAfterSlider beforeUrl={image.originalUrl} afterUrl={image.compressedUrl} alt={image.file.name} />
          ) : (
            <img
              src={displayedMode === "compressed" ? image.compressedUrl ?? image.originalUrl : image.originalUrl}
              alt={image.file.name}
              decoding="async"
              className="mx-auto aspect-video max-h-[420px] w-full object-contain"
            />
          )}
        </div>
      </div>

      <div className="grid grid-cols-3 divide-x border-t border-slate-100">
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
      <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">{label}</p>
      <p className={cn("mt-1 text-sm font-semibold tabular-nums", positive ? "text-emerald-700" : "text-slate-800")}>{value}</p>
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
}: Pick<BetaImageWorkspaceProps,
  "images" | "selectedImage" | "isProcessing" | "isDesktop" | "processedCount" | "progress" | "onSelect" | "onRemove" | "onDownload" | "onFiles" | "onInvalidFiles" | "onClear"
> & { selectedId?: string }) {
  const readyCount = images.filter((image) => image.status === "done").length;
  const errorCount = images.filter((image) => image.status === "error").length;

  return (
    <section className="beta-card overflow-hidden rounded-2xl border border-slate-200 bg-white">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-4 py-3.5 sm:px-5">
        <div className="flex items-center gap-3">
          <h2 className="text-sm font-semibold text-slate-900">Imagens</h2>
          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium tabular-nums text-slate-600">{images.length}</span>
          {readyCount > 0 ? <span className="text-xs font-medium text-emerald-700">{readyCount} prontas</span> : null}
          {errorCount > 0 ? <span className="text-xs font-medium text-rose-700">{errorCount} com erro</span> : null}
        </div>
        <div className="flex items-center gap-2">
          <ImageDropzone onFiles={onFiles} onInvalidFiles={onInvalidFiles} isDesktop={isDesktop} mode="button" disabled={isProcessing} />
          <Button type="button" variant="ghost" size="sm" disabled={isProcessing} onClick={onClear} className="h-9 px-2.5 text-slate-500">
            <Trash2 className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Limpar</span>
          </Button>
        </div>
      </div>

      {isProcessing ? (
        <div className="border-b border-slate-100 px-4 py-3 sm:px-5">
          <div className="mb-2 flex items-center justify-between gap-3 text-xs">
            <span className="font-medium text-blue-700">Compactando imagens</span>
            <span className="tabular-nums text-slate-500">{processedCount} de {images.length}</span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-slate-100">
            <div className="h-full rounded-full bg-blue-600 transition-[width]" style={{ width: `${progress}%` }} />
          </div>
        </div>
      ) : null}

      <div className="max-h-[440px] overflow-y-auto divide-y divide-slate-100">
        {images.map((image) => {
          const reduction = image.compressedBlob ? getReduction(image.file.size, image.compressedBlob.size) : undefined;
          return (
            <div key={image.id} className={cn("queue-row group/queue-row flex items-center gap-2 px-3 py-2.5 transition-[background-color,transform] duration-200 hover:bg-slate-50 sm:gap-3 sm:px-5", selectedId === image.id && "bg-blue-50/55 hover:bg-blue-50/75")}>
              <button
                type="button"
                aria-pressed={selectedId === image.id}
                onClick={() => onSelect(image.id)}
                className="flex min-w-0 flex-1 items-center gap-3 rounded-lg text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
              >
                <img src={image.originalUrl} alt="" loading="lazy" decoding="async" className="h-11 w-14 shrink-0 rounded-lg border border-slate-200 bg-slate-50 object-cover transition-transform duration-200 group-hover/queue-row:scale-[1.03]" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-xs font-semibold text-slate-800" title={image.file.name}>{image.file.name}</span>
                  <span className="mt-1 block truncate text-[11px] text-slate-500">
                    {image.originalDimensions ? `${image.originalDimensions.width} × ${image.originalDimensions.height} · ` : ""}
                    {formatBytes(image.file.size)}
                    {image.compressedBlob ? ` → ${formatBytes(image.compressedBlob.size)}` : ""}
                  </span>
                  {image.error ? <span className="mt-1 block truncate text-[10px] text-rose-700" title={image.error}>{image.error}</span> : null}
                </span>
                <span className="hidden shrink-0 sm:inline-flex"><StatusPill status={image.status} /></span>
                {reduction !== undefined ? <span className="hidden w-14 shrink-0 text-right text-xs font-semibold tabular-nums text-emerald-700 md:block">−{formatPercent(reduction)}</span> : null}
              </button>
              <span className="sm:hidden"><StatusPill status={image.status} /></span>
              {image.status === "done" ? (
                <Button type="button" variant="ghost" size="icon" aria-label={`Baixar ${image.file.name}`} onClick={() => void onDownload(image.id)} className="h-8 w-8 shrink-0 text-slate-500 hover:text-blue-700">
                  <Download className="h-4 w-4" />
                </Button>
              ) : null}
              {!isProcessing ? (
                <Button type="button" variant="ghost" size="icon" aria-label={`Remover ${image.file.name}`} onClick={() => onRemove(image.id)} className="h-8 w-8 shrink-0 text-slate-400 hover:text-rose-700">
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
    <section className="beta-card animate-enter flex min-h-[240px] flex-col justify-between rounded-2xl border border-emerald-200 bg-gradient-to-br from-emerald-50 via-white to-white p-5 sm:p-7">
      <div>
        <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-100 text-emerald-700"><Check className="h-5 w-5" /></span>
        <h2 className="mt-4 text-lg font-semibold text-slate-900">Lote concluído</h2>
        <p className="mt-1 text-sm text-slate-600">{summary.completedCount} de {summary.totalCount} imagens prontas{summary.errorCount ? ` · ${summary.errorCount} com erro` : ""}</p>
      </div>
      <div className="mt-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wide text-emerald-700">Redução média</p>
          <p className="mt-1 text-2xl font-bold tabular-nums text-emerald-800">{summary.averageReduction !== undefined ? formatPercent(summary.averageReduction) : "—"}</p>
        </div>
        <div className="flex gap-2">
          <Button type="button" variant="outline" onClick={onClear}>Novo lote</Button>
          <ImageDropzone onFiles={onFiles} onInvalidFiles={onInvalidFiles} isDesktop={isDesktop} mode="button" />
        </div>
      </div>
    </section>
  );
}

export function BetaImageWorkspace(props: BetaImageWorkspaceProps) {
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
    onRemove,
    onProcess,
    onCancelProcess,
    onClear,
    onDownload,
    onDownloadAllDesktop,
    onDownloadAllWeb
  } = props;
  const isComplete = useMemo(() => images.length > 0 && images.every((image) => image.status === "done" || image.status === "error"), [images]);
  const hasCompressed = images.some((image) => image.status === "done" && image.compressedBlob);
  const hasProcessed = images.some((image) => image.status === "done" || image.status === "error");
  const readyCount = images.filter((image) => image.status === "done" && image.compressedBlob).length;

  return (
    <main className="min-h-[calc(100vh-64px)] bg-transparent">
      <div className={cn(
        "mx-auto max-w-[1440px] animate-enter px-3 py-4 sm:px-5 sm:py-6 xl:px-8"
      )}>
        {invalidFiles.length ? (
          <div role="status" className="animate-enter mb-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800 shadow-sm shadow-rose-900/5">
            <strong>Arquivos ignorados:</strong> {invalidFiles.join(", ")}
            <button type="button" aria-label="Fechar aviso" onClick={() => onInvalidFiles([])} className="float-right font-semibold">×</button>
          </div>
        ) : null}

        <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_340px] xl:gap-5">
          <div className="animate-enter min-w-0">
            {selectedImage || lastBatchSummary || !images.length ? (
              <section className="min-w-0">
                {selectedImage ? (
                  <ImagePreview key={selectedImage.id} image={selectedImage} />
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

          <aside className="animate-enter-delayed xl:sticky xl:top-4">
            <div className="mb-4 grid gap-2">
              {isProcessing ? (
                <Button type="button" variant="destructive" className="h-11 w-full" disabled={isCancelRequested} onClick={onCancelProcess}>
                  {isCancelRequested ? <LoaderCircle className="h-4 w-4 loading-spinner" /> : <X className="h-4 w-4" />}
                  {isCancelRequested ? "Cancelando…" : "Cancelar compactação"}
                </Button>
              ) : (
                <Button type="button" className="beta-primary-action h-11 w-full" disabled={!images.length} onClick={onProcess}>
                  {hasProcessed ? <RefreshCw className="h-4 w-4" /> : <Zap className="h-4 w-4" />}
                  {hasProcessed ? "Recompactar lote" : `Compactar ${images.length || "imagens"}`}
                </Button>
              )}
              {isComplete && hasCompressed ? (
                isDesktop ? (
                  <Button type="button" variant="outline" className="h-10 w-full" onClick={() => void onDownloadAllDesktop()}>
                    <ArrowDownToLine className="h-4 w-4" />Baixar {readyCount} imagens
                  </Button>
                ) : (
                  <div className="grid grid-cols-2 gap-2">
                    <Button type="button" variant="outline" className="h-10 px-2 text-xs" onClick={() => void onDownloadAllWeb("individual")}>
                      <Download className="h-4 w-4" />Individuais
                    </Button>
                    <Button type="button" variant="outline" className="h-10 px-2 text-xs" onClick={() => void onDownloadAllWeb("zip")}>
                      <ArrowDownToLine className="h-4 w-4" />Baixar ZIP
                    </Button>
                  </div>
                )
              ) : null}
            </div>
            <OutputSettings
              settings={settings}
              onSettingsChange={onSettingsChange}
              downloadPreferences={downloadPreferences}
              onDownloadPreferencesChange={onDownloadPreferencesChange}
              disabled={isProcessing}
              isDesktop={isDesktop}
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
