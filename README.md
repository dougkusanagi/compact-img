# Compact Img

Webapp frontend-only para compactar imagens em lote. O processamento acontece localmente no navegador, sem backend, banco de dados ou upload para servidor.

## Stack

- Next.js
- React
- TypeScript
- Tailwind CSS
- shadcn/ui
- react-dropzone
- Web Worker com APIs client-side de imagem
- JSZip

## Rodando localmente

```bash
bun install
bun run dev
```

Abra `http://localhost:3000`.

## Observações

- AVIF depende do suporte do navegador para codificação via canvas/OffscreenCanvas.
- Os previews usam `URL.createObjectURL` e são liberados quando imagens são removidas ou a fila é limpa.
