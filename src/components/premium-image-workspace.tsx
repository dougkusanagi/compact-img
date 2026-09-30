"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle, ArrowLeft, ArrowRight, CheckCircle2, ChevronDown, Download, Expand, Folder, ZoomIn, ZoomOut,
  LoaderCircle, RefreshCw, Settings2, Trash2, X, Zap
} from "lucide-react";
import { OutputSettings, type ImageWorkspaceProps } from "@/components/classic-image-workspace";
import { BeforeAfterSlider } from "@/components/before-after-slider";
import { ImageDropzone } from "@/components/image-dropzone";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { cn, formatBytes, formatPercent } from "@/lib/utils";
import type { CompressionSettings, QueueImage } from "@/lib/image-types";
import { getParentDirectory, openOutputFolder } from "@/lib/desktop";

const PRESETS = [
  { value: "store", label: "Loja", settings: { outputFormat: "webp", quality: 80, compressionMode: "quality", maxWidth: 2000, maxHeight: 2000, jpegCompressionMode: "balanced" } },
  { value: "instagram", label: "Instagram", settings: { outputFormat: "jpeg", quality: 85, compressionMode: "quality", maxWidth: 1080, maxHeight: 1350, jpegCompressionMode: "balanced" } },
  { value: "catalog", label: "Catálogo 300 KB", settings: { outputFormat: "webp", compressionMode: "target-size", maxFileSizeKB: 300, maxWidth: 2000, maxHeight: 2000, jpegCompressionMode: "balanced" } },
  { value: "small", label: "Máxima compressão", settings: { outputFormat: "jpeg", quality: 60, compressionMode: "quality", maxWidth: 1920, maxHeight: 1080, jpegCompressionMode: "max" } }
] as const;

const FORMAT_NAMES = { webp: "WebP", jpeg: "JPG", png: "PNG", avif: "AVIF" };

type SavedPreset = { value: string; label: string; settings: CompressionSettings };
function activePreset(settings: CompressionSettings, custom: SavedPreset[]) {
  const saved = custom.find((preset) => Object.entries(preset.settings).every(([key, value]) => settings[key as keyof CompressionSettings] === value));
  if (saved) return saved.value;
  if (settings.preserveOriginalDimensions || !settings.keepAspectRatio) return "custom";
  return [...PRESETS, ...custom].find((preset) => Object.entries(preset.settings).every(([key, value]) =>
    (key === "compressionMode" ? settings.compressionMode ?? "quality" : settings[key as keyof CompressionSettings]) === value
  ))?.value ?? "custom";
}

function groupImages(images: QueueImage[]) {
  const groups = new Map<string, { title: string; images: QueueImage[] }>();
  for (const image of images) {
    const relativePath = image.file.webkitRelativePath;
    const folder = image.sourcePath ? getParentDirectory(image.sourcePath)
      : relativePath.includes("/") ? relativePath.slice(0, relativePath.lastIndexOf("/")) : "";
    const key = folder || "images";
    const group = groups.get(key) ?? { title: folder.split(/[\\/]/).filter(Boolean).pop() || "Imagens", images: [] };
    group.images.push(image);
    groups.set(key, group);
  }
  return [...groups.entries()];
}

function QueueRow({ image, selected, props, onView }: {
  image: QueueImage; selected: boolean; props: ImageWorkspaceProps; onView: () => void;
}) {
  const reduction = image.compressedBlob && image.file.size > 0 ? (1 - image.compressedBlob.size / image.file.size) * 100 : undefined;
  return (
    <div className={cn("premium-row group grid items-center gap-x-3 rounded-xl px-3 py-3", selected && "bg-brand-soft/50")}
      data-status={image.status}>
      <button type="button" onClick={onView} className="row-image flex min-w-0 items-center gap-3 rounded-lg text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        aria-label={`Ver ${image.file.name}`}>
        <img src={image.originalUrl} alt="" loading="lazy" decoding="async" className="h-12 w-12 shrink-0 rounded-lg bg-muted object-cover" />
        <span className="min-w-0">
          <span className="block truncate text-sm font-medium" title={image.file.name}>{image.file.name}</span>
          <span className="mt-0.5 block truncate text-xs text-muted-foreground">
            {image.originalDimensions ? `${image.originalDimensions.width} × ${image.originalDimensions.height}` : "Lendo dimensões…"}
            {image.savedPath ? " · Salva" : ""}
          </span>
          {props.estimates?.samples[image.id] !== undefined && props.estimates.samples[image.id] >= image.file.size && image.status === "pending" ? <span className="mt-1 block text-xs text-muted-foreground">A saída ficaria maior{props.settings.keepOriginalIfLarger !== false ? " — original será mantido" : ""}</span> : null}
          {image.status === "kept" ? <span className="mt-1 block text-xs text-muted-foreground">Original mantido — a saída ficaria maior</span> : image.status === "skipped" ? <span className="mt-1 block text-xs text-muted-foreground">Ignorada — já existe no destino</span> : null}
          {image.error || image.downloadError ? <span className="mt-1 block text-xs text-destructive">{image.error || image.downloadError}</span> : null}
        </span>
      </button>
      <div className="row-result flex flex-wrap items-center justify-end gap-2 text-right text-sm tabular-nums">
        {image.status === "processing" ? <span className="flex items-center gap-2 text-brand-strong"><LoaderCircle className="loading-spinner h-4 w-4" />Compactando</span>
          : image.status === "error" ? <span className="text-destructive">Erro</span>
          : <>
            <span className={cn(image.compressedBlob && "text-xs text-muted-foreground")}>{formatBytes(image.file.size)}</span>
            {image.compressedBlob ? <>
              <span aria-hidden="true" className="text-muted-foreground">→</span>
              <span className="font-semibold">{formatBytes(image.compressedBlob.size)}</span>
              {reduction !== undefined ? <span className={cn("rounded-md px-2 py-1 text-xs font-semibold", reduction >= 0 ? "bg-success-soft text-success" : "bg-destructive/10 text-destructive")}>
                {reduction >= 0 ? "−" : "+"}{formatPercent(Math.abs(reduction))}
              </span> : null}
            </> : <span className="text-xs text-muted-foreground">{image.status === "kept" ? "Original mantido" : image.status === "skipped" ? "Ignorada" : props.estimates?.samples[image.id] !== undefined ? `~${formatBytes(props.estimates.samples[image.id])}` : "Na fila"}</span>}
          </>}
      </div>
      <div className="row-actions flex items-center justify-end gap-1">
        {image.status === "done" && image.compressedBlob ? <Button type="button" variant="ghost" size="icon" className="h-9 w-9 text-muted-foreground" aria-label={`Baixar ${image.file.name}`} onClick={() => void props.onDownload(image.id)}><Download className="h-4 w-4" /></Button> : null}
        <Button type="button" variant="ghost" size="icon" className="h-9 w-9 text-muted-foreground" aria-label={`Comparar ${image.file.name}`} onClick={onView}><Expand className="h-4 w-4" /></Button>
        <Button type="button" variant="ghost" size="icon" disabled={props.isProcessing} className="h-9 w-9 text-muted-foreground hover:text-destructive" aria-label={`Remover ${image.file.name}`} onClick={() => props.onRemove(image.id)}><X className="h-4 w-4" /></Button>
      </div>
    </div>
  );
}

function ImageViewer({ image, open, onOpenChange, onDownload, onCloseAutoFocus, images, onSelect }: {
  image?: QueueImage; open: boolean; onOpenChange: (open: boolean) => void; onDownload: ImageWorkspaceProps["onDownload"];
  onCloseAutoFocus: (event: Event) => void;
  images: QueueImage[]; onSelect: (id: string) => void;
}) {
  const [mode, setMode] = useState("compare");
  const [zoom, setZoom] = useState(false);
  const imageAreaRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      const area = imageAreaRef.current;
      if (area) { area.scrollLeft = zoom ? (area.scrollWidth - area.clientWidth) / 2 : 0; area.scrollTop = zoom ? (area.scrollHeight - area.clientHeight) / 2 : 0; }
    });
    return () => cancelAnimationFrame(frame);
  }, [zoom]);
  const index = images.findIndex((item) => item.id === image?.id);
  useEffect(() => { setZoom(false); }, [image?.id]);
  useEffect(() => {
    if (!open) return;
    const key = (event: KeyboardEvent) => {
      if (event.target instanceof HTMLElement && event.target.closest("input, textarea, [role=slider]")) return;
      if (event.key === "ArrowLeft" && index > 0) { event.preventDefault(); onSelect(images[index - 1].id); }
      if (event.key === "ArrowRight" && index < images.length - 1) { event.preventDefault(); onSelect(images[index + 1].id); }
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [images, index, onSelect, open]);
  const displayedMode = image?.compressedUrl ? mode : "original";
  return (
    <Dialog open={open && Boolean(image)} onOpenChange={onOpenChange}>
      <DialogContent aria-describedby={undefined} onCloseAutoFocus={onCloseAutoFocus} className="premium-viewer fixed inset-x-0 bottom-0 top-24 flex h-[calc(100dvh-96px)] sm:top-12 sm:h-[calc(100dvh-48px)] max-h-none w-full max-w-none translate-x-0 translate-y-0 flex-col gap-0 rounded-none border-0 bg-foreground p-4 text-primary-foreground sm:p-6">
        {image ? <>
          <div className="flex flex-wrap items-center gap-4 pr-8">
            <div className="min-w-0 flex-1"><DialogTitle className="truncate text-base" title={image.file.name}>{image.file.name}</DialogTitle><p className="mt-1 text-xs text-primary-foreground/75">{image.originalDimensions ? `${image.originalDimensions.width} × ${image.originalDimensions.height} · ` : ""}{formatBytes(image.file.size)}</p></div>
            <SegmentedControl ariaLabel="Modo de pré-visualização" className="w-full sm:w-[280px]" value={displayedMode} onChange={setMode} options={[
              { value: "compare", label: "Comparar", disabled: !image.compressedUrl },
              { value: "original", label: "Original" },
              { value: "compressed", label: "Saída", disabled: !image.compressedUrl }
            ]} />
          </div>
          <div className="mt-4 flex items-center justify-center gap-2">
            <Button variant="outline" size="icon" className="text-foreground" aria-label="Imagem anterior" disabled={index <= 0} onClick={() => onSelect(images[index - 1].id)}><ArrowLeft className="h-4 w-4" /></Button>
            <span className="px-2 text-xs tabular-nums">{index + 1} / {images.length}</span>
            <Button variant="outline" size="icon" className="text-foreground" aria-label="Próxima imagem" disabled={index >= images.length - 1} onClick={() => onSelect(images[index + 1].id)}><ArrowRight className="h-4 w-4" /></Button>
            <Button variant="outline" size="icon" className="ml-3 text-foreground" aria-label={zoom ? "Reduzir zoom" : "Ampliar imagem"} aria-pressed={zoom} onClick={() => setZoom(!zoom)}>{zoom ? <ZoomOut className="h-4 w-4" /> : <ZoomIn className="h-4 w-4" />}</Button>
          </div>
          <div ref={imageAreaRef} className="flex min-h-0 flex-1 items-start justify-start overflow-auto py-6">
            <div className={cn("flex h-full shrink-0 items-center justify-center", zoom ? "min-h-[200%] w-[200%]" : "w-full")}>

            {displayedMode === "compare" && image.compressedUrl ? <div className={cn("w-full", !zoom && "max-w-[1000px]")}><BeforeAfterSlider beforeUrl={image.originalUrl} afterUrl={image.compressedUrl} alt={image.file.name} /></div>
              : <img className="h-full max-h-full w-full object-contain" src={displayedMode === "compressed" ? image.compressedUrl : image.originalUrl} alt={image.file.name} />}
            </div>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-4 border-t border-primary-foreground/20 pt-4">
            <p className="text-sm tabular-nums">Original: {formatBytes(image.file.size)}{image.compressedBlob ? ` · Saída: ${formatBytes(image.compressedBlob.size)}` : " · Ainda não compactada"}</p>
            {image.compressedBlob ? <Button variant="outline" onClick={() => void onDownload(image.id)} className="text-foreground"><Download className="h-4 w-4" />Baixar imagem</Button> : null}
          </div>
        </> : null}
      </DialogContent>
    </Dialog>
  );
}

export function PremiumImageWorkspace(props: ImageWorkspaceProps) {
  const { settings, images, isProcessing, downloadPreferences, selectedImage, onProcess } = props;
  const [customPresets, setCustomPresets] = useState<SavedPreset[]>([]);
  const [presetName, setPresetName] = useState("");
  const [folderError, setFolderError] = useState("");
  const [clock, setClock] = useState(Date.now());
  const [presetMessage, setPresetMessage] = useState("");
  useEffect(() => {
    try { const stored = JSON.parse(localStorage.getItem("compact-img-presets") ?? "[]"); if (Array.isArray(stored)) setCustomPresets(stored.filter((p) => p?.settings && typeof p.label === "string" && typeof p.value === "string").slice(0, 2)); } catch { /* Discard invalid saved preferences. */ }
  }, []);
  const persistPresets = (next: SavedPreset[]) => { setCustomPresets(next); localStorage.setItem("compact-img-presets", JSON.stringify(next)); };
  const savePreset = () => {
    if (customPresets.length >= 2) { setPresetMessage("Limite de 6 presets. Remova um preset salvo para criar outro."); return; }
    const name = presetName.trim();
    if (!name) { setPresetMessage("Dê um nome ao preset."); return; }
    persistPresets([...customPresets, { value: crypto.randomUUID(), label: name, settings: { ...settings } }]);
    setPresetName(""); setPresetMessage(`Preset “${name}” salvo.`);
  };
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [downloadKind, setDownloadKind] = useState<"zip" | "individual">("zip");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [viewerOpen, setViewerOpen] = useState(false);
  const viewerTriggerRef = useRef<HTMLElement | null>(null);
  const [showErrors, setShowErrors] = useState(false);
  useEffect(() => { if (!isProcessing) return; const interval = window.setInterval(() => setClock(Date.now()), 1000); return () => window.clearInterval(interval); }, [isProcessing]);
  const elapsed = props.processingStartedAt ? Math.max(0.1, (clock - props.processingStartedAt) / 1000) : 0;
  const speed = elapsed > 0 ? props.processedCount / elapsed : 0;
  const groups = useMemo(() => groupImages(images), [images]);
  const ready = images.filter((image) => image.status === "done" && image.compressedBlob);
  const errors = images.filter((image) => image.status === "error" || image.downloadError || image.status === "kept" || image.status === "skipped" || Boolean(props.estimates?.samples[image.id] && props.estimates.samples[image.id] >= image.file.size));
  const complete = images.length > 0 && images.every((image) => image.status !== "pending" && image.status !== "processing");
  const originalBytes = images.reduce((total, image) => total + image.file.size, 0);
  const completedOriginalBytes = ready.reduce((total, image) => total + image.file.size, 0);
  const outputBytes = ready.reduce((total, image) => total + (image.compressedBlob?.size ?? 0), 0);
  const savedBytes = completedOriginalBytes - outputBytes;
  const reduction = completedOriginalBytes > 0 ? (1 - outputBytes / completedOriginalBytes) * 100 : undefined;
  const preset = activePreset(settings, customPresets);
  const presetOptions = [...[...PRESETS, ...customPresets].map(({ value, label }) => ({ value, label })), ...(preset === "custom" ? [{ value: "custom", label: "Personalizado" }] : [])];
  const applyPreset = (value: string) => {
    const next = [...PRESETS, ...customPresets].find((item) => item.value === value);
    if (next) props.onSettingsChange(customPresets.some((p) => p.value === value) ? { ...settings, ...next.settings } : { ...settings, ...next.settings, preserveOriginalDimensions: false, keepAspectRatio: true });
  };
  const sizeLabel = settings.preserveOriginalDimensions ? "Original" : `${settings.maxWidth} × ${settings.maxHeight} px`;
  const destinationLabel = downloadPreferences.mode === "choose-location" ? "Você escolhe"
    : downloadPreferences.saveInSubfolder ? `${downloadPreferences.subfolderName.trim() || "imagens-compactadas"}/`
    : props.isDesktop ? "Mesma pasta" : "Downloads";

  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key === "Enter" && images.length && !isProcessing && !settingsOpen && !viewerOpen) {
        event.preventDefault();
        onProcess();
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [images.length, isProcessing, settingsOpen, viewerOpen, onProcess]);

  const settingsSheet = (
    <Dialog open={settingsOpen} onOpenChange={setSettingsOpen}>
      <DialogTrigger asChild><Button type="button" variant="ghost" size="sm" disabled={isProcessing} className="text-muted-foreground"><Settings2 className="h-4 w-4" />Ajustar</Button></DialogTrigger>
      <DialogContent aria-describedby={undefined} className="premium-sheet bottom-0 left-auto right-0 top-24 flex h-[calc(100dvh-96px)] sm:top-12 sm:h-[calc(100dvh-48px)] max-h-none w-full max-w-[420px] translate-x-0 translate-y-0 flex-col gap-0 rounded-none border-0 p-0 shadow-xl">
        <div className="shrink-0 border-b border-border px-5 py-6"><DialogTitle>Ajustes de saída</DialogTitle><p className="mt-1 text-sm text-muted-foreground">Valem para toda a fila</p></div>
        <div className="min-h-0 flex-1 overflow-y-auto"><OutputSettings settings={settings} onSettingsChange={props.onSettingsChange} downloadPreferences={downloadPreferences} onDownloadPreferencesChange={props.onDownloadPreferencesChange} disabled={isProcessing} isDesktop={props.isDesktop} presentation="sheet" /></div>
        <div className="shrink-0 border-t border-border p-5">
          <label htmlFor="preset-name" className="mb-2 block text-xs font-medium">Salvar como preset</label>
          <div className="mb-3 flex gap-2"><input id="preset-name" value={presetName} maxLength={32} placeholder="Nome do preset" onChange={(event) => setPresetName(event.target.value)} className="h-10 min-w-0 flex-1 rounded-md border border-input bg-card px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" /><Button variant="outline" onClick={savePreset}>Salvar</Button></div>
          {presetMessage ? <p role="status" className="mb-3 text-xs text-muted-foreground">{presetMessage}</p> : null}
          {customPresets.length ? <div className="mb-3 flex flex-wrap gap-2">{customPresets.map((item) => <button key={item.value} type="button" aria-label={`Remover preset ${item.label}`} onClick={() => { persistPresets(customPresets.filter((p) => p.value !== item.value)); setPresetMessage(`Preset “${item.label}” removido.`); }} className="inline-flex max-w-full items-center gap-1 rounded-md border border-input px-2 py-1 text-xs hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"><span className="truncate">{item.label}</span><X className="h-3 w-3 shrink-0" /></button>)}</div> : null}
          <Button type="button" className="h-11 w-full" onClick={() => setSettingsOpen(false)}>Concluir</Button></div>
      </DialogContent>
    </Dialog>
  );

  return (
    <main className="premium-workspace mx-auto flex min-h-[calc(100dvh-64px)] max-w-[880px] flex-col px-4 pb-6 sm:px-8">
      {props.invalidFiles.length ? <div role="status" className="mt-5 flex items-start justify-between gap-3 rounded-xl bg-destructive/10 p-4 text-sm text-destructive"><span>Arquivos ignorados: {props.invalidFiles.join(", ")}</span><button type="button" onClick={() => props.onInvalidFiles([])} aria-label="Fechar aviso"><X className="h-4 w-4" /></button></div> : null}

      {images.length ? <>
        <div className="flex flex-wrap items-end justify-between gap-4 pb-5 pt-6">
          <div><h2 className="text-[28px] font-semibold leading-tight tracking-[-.025em]">{images.length} {images.length === 1 ? "imagem" : "imagens"}</h2>
            <p className="mt-1 text-sm text-muted-foreground">{isProcessing ? "Compactando · originais intactas" : complete ? `${ready.length} prontas${images.filter((image) => image.status === "kept").length ? ` · ${images.filter((image) => image.status === "kept").length} originais mantidos` : ""}${images.filter((image) => image.status === "skipped").length ? ` · ${images.filter((image) => image.status === "skipped").length} ignoradas` : ""}${images.filter((image) => image.status === "error").length ? ` · ${images.filter((image) => image.status === "error").length} com erro` : ""} · originais intactas` : `${groups.length} ${groups.length === 1 ? "grupo" : "grupos"} · ${formatBytes(originalBytes)}`}</p></div>
          <div className="flex flex-wrap items-center gap-2">
            {errors.length ? <Button variant="outline" size="sm" aria-pressed={showErrors} onClick={() => setShowErrors(!showErrors)} className="text-muted-foreground"><AlertTriangle className="h-4 w-4" />{showErrors ? "Mostrar todas" : `${errors.length} com avisos`}</Button> : null}
            <ImageDropzone mode="button" onFiles={props.onFiles} onInvalidFiles={props.onInvalidFiles} isDesktop={props.isDesktop} disabled={isProcessing} />
          </div>
        </div>

        <section className="rounded-2xl bg-card px-5 pb-5 pt-4 ring-1 ring-border sm:px-6" aria-label="Como compactar">
          <div className="flex items-center justify-between gap-3"><h3 className="text-[15px] font-semibold">Como compactar</h3>{settingsSheet}</div>
          <SegmentedControl ariaLabel="Preset de compactação" className={cn("mt-2 hidden", customPresets.length ? "" : "sm:grid")} value={preset}
            options={presetOptions} disabled={isProcessing} onChange={applyPreset} />
          <div className={cn("relative mt-2", !customPresets.length && "sm:hidden")}>
            <select aria-label="Preset de compactação" value={preset} disabled={isProcessing} onChange={(event) => applyPreset(event.target.value)}
              className="h-11 w-full appearance-none rounded-lg border border-input bg-card pl-3 pr-9 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50">
              {presetOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
            <ChevronDown aria-hidden="true" className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          </div>
          {settings.outputFormat === "jpeg" && images.some((image) => image.file.type === "image/png" || image.file.type === "image/webp") ? <p className="mt-3 text-xs text-muted-foreground">JPG usa o fundo {settings.jpegBackgroundColor ?? "#ffffff"} nas áreas transparentes. Ajuste a cor em “Ajustar”.</p> : null}
          <dl className="mt-4 grid grid-cols-2 gap-y-4 border-t border-border pt-4 sm:grid-cols-4">
            {[["Formato", FORMAT_NAMES[settings.outputFormat]], [settings.compressionMode === "target-size" ? "Peso máximo" : "Qualidade", settings.compressionMode === "target-size" ? `${settings.maxFileSizeKB ?? 300} KB` : settings.outputFormat === "png" ? "Sem perdas" : `${settings.quality}%`], ["Tamanho máximo", sizeLabel], ["Salvar em", destinationLabel]].map(([label, value], index) => <div key={label} className={cn("min-w-0 pr-3", index > 0 && "sm:border-l sm:border-border sm:pl-5")}><dt className="text-xs text-muted-foreground">{label}</dt><dd className="mt-1 truncate text-sm font-medium sm:text-base" title={value}>{value}</dd></div>)}
          </dl>
        </section>

        <div className="my-4 grid gap-4">
          {groups.map(([key, group]) => {
            const visible = showErrors && errors.length ? group.images.filter((image) => errors.some((item) => item.id === image.id)) : group.images;
            if (!visible.length) return null;
            const isCollapsed = collapsed.has(key);
            return <section key={key} className="overflow-hidden rounded-2xl bg-card p-2 ring-1 ring-border">
              <button type="button" aria-expanded={!isCollapsed} aria-controls={`group-${group.images[0].id}`} title={key === "images" ? undefined : key}
                onClick={() => setCollapsed((current) => { const next = new Set(current); if (next.has(key)) next.delete(key); else next.add(key); return next; })}
                className="flex w-full min-w-0 items-center gap-2 rounded-lg px-2 py-3 text-left hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                <ChevronDown className={cn("h-4 w-4 shrink-0 text-muted-foreground transition-transform", isCollapsed && "-rotate-90")} />
                <Folder className="h-4 w-4 shrink-0 text-muted-foreground" />
                <h3 className="min-w-0 truncate text-sm font-semibold">{group.title}</h3><span className="shrink-0 text-xs text-muted-foreground">{visible.length} {visible.length === 1 ? "foto" : "fotos"}</span>
                <span className="ml-auto hidden text-xs tabular-nums text-muted-foreground sm:block">{formatBytes(group.images.reduce((total, image) => total + image.file.size, 0))}</span>
              </button>
              <div id={`group-${group.images[0].id}`} hidden={isCollapsed} className="divide-y divide-border border-t border-border">
                {visible.map((image) => <QueueRow key={image.id} image={image} selected={selectedImage?.id === image.id} props={props} onView={() => {
                  viewerTriggerRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
                  props.onSelect(image.id);
                  setViewerOpen(true);
                }} />)}
              </div>
            </section>;
          })}
        </div>

        <div className="premium-dock sticky bottom-4 z-20 mt-auto rounded-2xl bg-card shadow-[0_18px_40px_-16px_hsl(var(--foreground)/0.3)]">
          <div className="flex flex-wrap items-center justify-between gap-4 px-5 py-4 sm:px-6">
            <div className="min-w-0" aria-live="polite">
              <p className="text-xs text-muted-foreground">{isProcessing ? `Compactando ${props.processedCount} de ${images.length}` : ready.length ? savedBytes >= 0 ? "Economia do lote" : "Aumento do lote" : complete ? "Lote concluído" : props.estimates ? "Economia estimada" : "Calculando estimativa…"}</p>
              <div className="mt-1 flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <span className="text-[26px] font-semibold leading-tight tracking-[-.02em] tabular-nums">{ready.length ? formatBytes(Math.abs(savedBytes)) : props.estimates ? `~${formatBytes(Math.max(0, originalBytes - props.estimates.outputBytes))}` : formatBytes(originalBytes)}</span>
                {ready.length && reduction !== undefined ? <span className={cn("self-center rounded-md px-2 py-1 text-xs font-semibold", reduction >= 0 ? "bg-success-soft text-success" : "bg-destructive/10 text-destructive")}>{reduction >= 0 ? "−" : "+"}{formatPercent(Math.abs(reduction))}</span> : null}
                <span className="text-xs text-muted-foreground">{ready.length ? `${formatBytes(completedOriginalBytes)} → ${formatBytes(outputBytes)}` : props.estimates ? `Amostra real de ${props.estimates.sampleCount} ${props.estimates.sampleCount === 1 ? "imagem" : "imagens"}` : "Tamanho original do lote"}</span>
              </div>
            </div>
            <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
              {!isProcessing && props.isDesktop && ready.some((image) => image.savedPath) ? <Button variant="outline" className="h-12" onClick={() => { const path = ready.find((image) => image.savedPath)?.savedPath; if (path) void openOutputFolder(path).catch(() => setFolderError("Não foi possível abrir a pasta.")); }}><Folder className="h-4 w-4" />Abrir pasta</Button> : null}
              {isProcessing ? <Button className="h-12 w-full sm:w-auto" variant="outline" disabled={props.isCancelRequested} onClick={props.onCancelProcess}>{props.isCancelRequested ? <LoaderCircle className="loading-spinner h-4 w-4" /> : <X className="h-4 w-4" />}{props.isCancelRequested ? "Finalizando…" : "Cancelar compactação"}</Button>
                : <>
                  <Button variant="ghost" size="icon" aria-label="Limpar lote" onClick={props.onClear} className="text-muted-foreground"><Trash2 className="h-4 w-4" /></Button>
                  {complete && ready.length ? <>
                    <Button variant="outline" onClick={props.onProcess} className="h-12"><RefreshCw className="h-4 w-4" /><span className="sr-only sm:not-sr-only">Recompactar</span></Button>
                    {props.isDesktop ? <Button className="premium-primary h-12 flex-1 sm:flex-none" onClick={() => void props.onDownloadAllDesktop()}><Download className="h-4 w-4" />Baixar {ready.length}</Button>
                      : <div className="flex min-w-0 flex-1 items-center gap-2 sm:flex-none">
                        <select aria-label="Tipo de download" value={downloadKind} onChange={(event) => setDownloadKind(event.target.value as "zip" | "individual")} className="h-12 w-[112px] rounded-lg border border-input bg-card px-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"><option value="zip">ZIP</option><option value="individual">Individuais</option></select>
                        <Button className="premium-primary h-12 flex-1 sm:flex-none" onClick={() => void props.onDownloadAllWeb(downloadKind)}><Download className="h-4 w-4" />Baixar</Button>
                      </div>}

                  </> : <Button className="premium-primary h-12 flex-1 sm:flex-none" onClick={props.onProcess}><Zap className="h-4 w-4" />{ready.length || complete ? "Recompactar lote" : `Compactar ${images.length} ${images.length === 1 ? "imagem" : "imagens"}`}<kbd className="ml-1 hidden rounded bg-primary-foreground/15 px-1.5 py-0.5 text-[10px] sm:inline">Ctrl ↵</kbd></Button>}
                </>}
            </div>
          </div>
          {isProcessing ? <p className="px-5 pb-3 text-xs text-muted-foreground">{props.processedCount > 1 ? `${speed.toFixed(1)} img/s · ~${Math.ceil((images.length - props.processedCount) / speed)} s restantes` : "Estimando tempo restante…"}</p> : null}
          {folderError ? <p role="status" className="px-5 pb-3 text-xs text-destructive">{folderError}</p> : null}
          {isProcessing ? <div role="progressbar" aria-label="Compactação do lote" aria-valuenow={Math.round(props.progress)} aria-valuemin={0} aria-valuemax={100} className="absolute inset-x-0 bottom-0 h-[3px] overflow-hidden rounded-b-2xl bg-muted"><div className="h-full bg-brand transition-[width] duration-300" style={{ width: `${props.progress}%` }} /></div> : null}
        </div>
      </> : <>
        <div className="flex items-center justify-between gap-4 py-4"><span className="text-sm text-muted-foreground">Tudo acontece neste computador</span>{settingsSheet}</div>
        {props.lastBatchSummary ? <div role="status" className="mb-4 flex items-center gap-3 rounded-xl bg-success-soft p-4 text-sm text-success"><CheckCircle2 className="h-5 w-5 shrink-0" />Lote concluído: {props.lastBatchSummary.completedCount} de {props.lastBatchSummary.totalCount} imagens prontas{props.lastBatchSummary.keptCount ? ` · ${props.lastBatchSummary.keptCount} originais mantidos` : ""}{props.lastBatchSummary.errorCount ? ` · ${props.lastBatchSummary.errorCount} com erro` : ""}</div> : null}
        <div className="flex flex-1 flex-col justify-center pb-6"><ImageDropzone appearance="premium" onFiles={props.onFiles} onInvalidFiles={props.onInvalidFiles} isDesktop={props.isDesktop} enableNativeDragDrop={false} enableLocalDragDrop={false} /></div>
      </>}

      {props.lifetimeStats && props.lifetimeStats.images > 0 ? <p className="mt-4 text-center text-xs text-muted-foreground">{props.lifetimeStats.images} imagens compactadas · {formatBytes(props.lifetimeStats.savedBytes)} economizados neste dispositivo</p> : null}
      <ImageViewer image={selectedImage} images={images} onSelect={props.onSelect} open={viewerOpen} onOpenChange={setViewerOpen} onDownload={props.onDownload} onCloseAutoFocus={(event) => {
        event.preventDefault();
        if (viewerTriggerRef.current?.isConnected) viewerTriggerRef.current.focus();
        else document.querySelector<HTMLElement>("header a[aria-current='page']")?.focus();
      }} />
      <ImageDropzone mode="overlay" onFiles={props.onFiles} onInvalidFiles={props.onInvalidFiles} isDesktop={props.isDesktop} disabled={isProcessing} />
      <span className="sr-only" aria-live="polite">{complete ? "Compactação concluída" : ""}</span>
    </main>
  );
}
