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

## Gerando executavel

O app tambem pode ser empacotado como desktop via Electron. O build web continua sendo gerado pelo Next em modo estatico e o Electron carrega os arquivos exportados.

```bash
bun install
bun run desktop:dist
```

Os artefatos ficam em `dist/`. Para gerar uma pasta empacotada sem instalador:

```bash
bun run desktop:pack
```

## Observações

- AVIF depende do suporte do navegador para codificação via canvas/OffscreenCanvas.
- Os previews usam `URL.createObjectURL` e são liberados quando imagens são removidas ou a fila é limpa.
