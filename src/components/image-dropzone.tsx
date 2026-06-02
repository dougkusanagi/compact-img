"use client";

import { useCallback } from "react";
import { useDropzone } from "react-dropzone";
import { ImagePlus, UploadCloud } from "lucide-react";
import { cn } from "@/lib/utils";
import { ACCEPTED_IMAGE_TYPES } from "@/lib/image-utils";

type ImageDropzoneProps = {
  onFiles: (files: File[]) => void;
  onInvalidFiles: (names: string[]) => void;
};

export function ImageDropzone({ onFiles, onInvalidFiles }: ImageDropzoneProps) {
  const onDrop = useCallback(
    (acceptedFiles: File[], rejectedFiles: { file: File }[]) => {
      if (acceptedFiles.length) {
        onFiles(acceptedFiles);
      }

      if (rejectedFiles.length) {
        onInvalidFiles(rejectedFiles.map(({ file }) => file.name));
      }
    },
    [onFiles, onInvalidFiles]
  );

  const { getRootProps, getInputProps, isDragActive, open } = useDropzone({
    accept: ACCEPTED_IMAGE_TYPES,
    multiple: true,
    noClick: true,
    onDrop
  });

  return (
    <section
      {...getRootProps()}
      className={cn(
        "flex min-h-56 flex-col items-center justify-center rounded-lg border border-dashed bg-card px-6 py-8 text-center transition-colors",
        isDragActive ? "border-primary bg-primary/5" : "border-border"
      )}
    >
      <input {...getInputProps()} />
      <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-primary/10 text-primary">
        {isDragActive ? <ImagePlus className="h-7 w-7" /> : <UploadCloud className="h-7 w-7" />}
      </div>
      <h2 className="text-lg font-semibold">Solte suas imagens aqui</h2>
      <p className="mt-2 max-w-xl text-sm text-muted-foreground">
        Selecione JPG, JPEG, PNG, WEBP ou AVIF. Tudo sera processado localmente no seu navegador.
      </p>
      <button
        type="button"
        onClick={open}
        className="mt-5 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
      >
        Escolher arquivos
      </button>
    </section>
  );
}
