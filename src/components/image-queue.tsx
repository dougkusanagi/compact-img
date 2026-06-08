"use client";

import { useState, Fragment } from "react";
import { Download, Trash2, Eye } from "lucide-react";
import type { QueueImage } from "@/lib/image-types";
import { downloadBlob } from "@/lib/download";
import { formatBytes, formatPercent, getReduction } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BeforeAfterSlider } from "@/components/before-after-slider";

type ImageQueueProps = {
  images: QueueImage[];
  selectedId?: string;
  isProcessing?: boolean;
  onSelect: (id: string) => void;
  onRemove: (id: string) => void;
};

const STATUS_LABELS: Record<QueueImage["status"], string> = {
  pending: "Pendente",
  processing: "Processando",
  done: "Concluida",
  error: "Erro"
};

export function ImageQueue({ images, selectedId, isProcessing, onSelect, onRemove }: ImageQueueProps) {
  const [previewId, setPreviewId] = useState<string | null>(null);

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <CardTitle>Fila de imagens</CardTitle>
        <span className="text-sm text-muted-foreground">{images.length} arquivo(s)</span>
      </CardHeader>
      <CardContent>
        {images.length === 0 ? (
          <div className="rounded-md border bg-muted/40 p-6 text-center text-sm text-muted-foreground">
            Nenhuma imagem carregada.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[980px] text-left text-sm">
              <thead className="border-b text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="py-3 pr-3">Imagem</th>
                  <th className="px-3 py-3">Arquivo</th>
                  <th className="px-3 py-3">Original</th>
                  <th className="px-3 py-3">Compactado</th>
                  <th className="px-3 py-3">Reducao</th>
                  <th className="px-3 py-3">Dimensoes</th>
                  <th className="px-3 py-3">Finais</th>
                  <th className="px-3 py-3">Status</th>
                  <th className="py-3 pl-3 text-right">Acoes</th>
                </tr>
              </thead>
              <tbody>
                {images.map((image) => {
                  const reduction = getReduction(image.file.size, image.compressedBlob?.size);
                  const isPreviewOpen = previewId === image.id;
                  return (
                    <Fragment key={image.id}>
                      <tr
                        className={selectedId === image.id ? "border-b bg-primary/5 cursor-pointer" : "border-b cursor-pointer"}
                        onClick={() => onSelect(image.id)}
                      >
                        <td className="py-3 pr-3">
                          <img
                            src={image.originalUrl}
                            alt={image.file.name}
                            className="h-14 w-20 rounded object-cover"
                          />
                        </td>
                        <td className="max-w-56 truncate px-3 py-3 font-medium">{image.file.name}</td>
                        <td className="px-3 py-3">{formatBytes(image.file.size)}</td>
                        <td className="px-3 py-3">
                          {image.compressedBlob ? formatBytes(image.compressedBlob.size) : "-"}
                        </td>
                        <td className="px-3 py-3">{reduction === undefined ? "-" : formatPercent(reduction)}</td>
                        <td className="px-3 py-3">
                          {image.originalDimensions
                            ? `${image.originalDimensions.width}x${image.originalDimensions.height}`
                            : "-"}
                        </td>
                        <td className="px-3 py-3">
                          {image.finalDimensions ? `${image.finalDimensions.width}x${image.finalDimensions.height}` : "-"}
                        </td>
                        <td className="px-3 py-3">
                          <span className="rounded bg-muted px-2 py-1 text-xs font-medium">
                            {STATUS_LABELS[image.status]}
                          </span>
                          {image.error ? <p className="mt-1 max-w-52 text-xs text-destructive">{image.error}</p> : null}
                        </td>
                        <td className="py-3 pl-3">
                          <div className="flex justify-end gap-2">
                            <Button
                              variant={isPreviewOpen ? "secondary" : "outline"}
                              size="sm"
                              onClick={(event) => {
                                event.stopPropagation();
                                setPreviewId(isPreviewOpen ? null : image.id);
                              }}
                              aria-label="Visualizar preview"
                            >
                              <Eye className="h-4 w-4 mr-1" />
                              Preview
                            </Button>
                            <Button
                              variant="outline"
                              size="icon"
                              disabled={!image.compressedBlob || !image.compressedName}
                              onClick={(event) => {
                                event.stopPropagation();
                                if (image.compressedBlob && image.compressedName) {
                                  downloadBlob(image.compressedBlob, image.compressedName);
                                }
                              }}
                              aria-label="Baixar imagem"
                            >
                              <Download className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              disabled={isProcessing}
                              onClick={(event) => {
                                event.stopPropagation();
                                onRemove(image.id);
                                if (isPreviewOpen) {
                                  setPreviewId(null);
                                }
                              }}
                              aria-label="Remover imagem"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </td>
                      </tr>
                      {isPreviewOpen && (
                        <tr className="bg-muted/10 border-b">
                          <td colSpan={9} className="px-6 py-4">
                            <div className="mx-auto max-w-3xl w-full rounded-lg border bg-card p-4 shadow-sm my-2">
                              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between mb-4 border-b pb-2">
                                <div>
                                  <h4 className="font-semibold text-foreground text-sm truncate max-w-md">
                                    Comparando: {image.file.name}
                                  </h4>
                                  <p className="text-xs text-muted-foreground mt-0.5">
                                    {formatBytes(image.file.size)}
                                    {image.compressedBlob ? ` -> ${formatBytes(image.compressedBlob.size)}` : ""}
                                    {reduction !== undefined ? ` (${formatPercent(reduction)} menor)` : ""}
                                  </p>
                                </div>
                                {image.compressedBlob && image.compressedName && (
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={(event) => {
                                      event.stopPropagation();
                                      downloadBlob(image.compressedBlob as Blob, image.compressedName as string);
                                    }}
                                  >
                                    <Download className="h-4 w-4 mr-1" />
                                    Baixar esta imagem
                                  </Button>
                                )}
                              </div>
                              <div className="rounded-md overflow-hidden border bg-background p-2">
                                <BeforeAfterSlider
                                  beforeUrl={image.originalUrl}
                                  afterUrl={image.compressedUrl}
                                  alt={image.file.name}
                                />
                              </div>
                              <div className="mt-3 text-xs text-center text-muted-foreground">
                                {image.status === "done"
                                  ? "Arraste o controle para comparar antes e depois."
                                  : "Compacte a imagem para ver a comparacao."}
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
