"use client";

import { Download, Eye } from "lucide-react";
import type { QueueImage } from "@/lib/image-types";
import { downloadBlob } from "@/lib/download";
import { formatBytes } from "@/lib/utils";
import { BeforeAfterSlider } from "@/components/before-after-slider";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle, DialogTrigger } from "@/components/ui/dialog";

type ImagePreviewProps = {
  image: QueueImage;
};

export function ImagePreview({ image }: ImagePreviewProps) {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Eye className="h-4 w-4" />
          Preview
        </Button>
      </DialogTrigger>
      <DialogContent>
        <div className="flex flex-col gap-4 pr-7 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <DialogTitle>{image.file.name}</DialogTitle>
            <p className="mt-1 text-sm text-muted-foreground">
              {formatBytes(image.file.size)}
              {image.compressedBlob ? ` -> ${formatBytes(image.compressedBlob.size)}` : ""}
            </p>
          </div>
          {image.compressedBlob && image.compressedName ? (
            <Button onClick={() => downloadBlob(image.compressedBlob as Blob, image.compressedName as string)}>
              <Download className="h-4 w-4" />
              Baixar
            </Button>
          ) : null}
        </div>
        <BeforeAfterSlider beforeUrl={image.originalUrl} afterUrl={image.compressedUrl} alt={image.file.name} />
        {image.error ? <p className="text-sm text-destructive">{image.error}</p> : null}
      </DialogContent>
    </Dialog>
  );
}
