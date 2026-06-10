# Compact Img

Aplicativo desktop para compactar imagens em lote. O processamento acontece localmente, sem backend, banco de dados ou upload para servidor. Cada resultado e salvo automaticamente na pasta da imagem original.

## Stack

- Next.js
- React
- TypeScript
- Tailwind CSS
- shadcn/ui
- react-dropzone
- Web Worker com APIs client-side de imagem
- Tauri 2
- Rust

## Rodando localmente

```bash
bun install
bun run dev
```

Abra `http://localhost:3000`.

## Rodando a versao desktop

O Tauri inicia o servidor de desenvolvimento do Next e abre a janela nativa:

```bash
bun install
bun run desktop:dev
```

## Gerando o instalador

```bash
bun run desktop:build
```

Os artefatos ficam em `src-tauri/target/release/bundle/`.

## Observações

- AVIF depende do suporte do navegador para codificação via canvas/OffscreenCanvas.
- Os arquivos compactados usam o sufixo `-compactado` e ficam ao lado da imagem original.
- Os previews usam `URL.createObjectURL` e são liberados quando imagens são removidas ou a fila é limpa.
