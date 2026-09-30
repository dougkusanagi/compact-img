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

Este projeto usa Next.js, não Vite. Não execute `vp dev`: esse comando inicia
o servidor Vite+ genérico e pode abrir outra porta sem servir esta aplicação.
Se estiver usando VITE+, `vpr dev` também pode executar o script do projeto;
`bun run dev` é o comando recomendado.

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

O alvo do instalador acompanha o sistema operacional: no Windows, o build gera
o MSI em `src-tauri/target/release/bundle/msi/`; no Linux, gera o AppImage em
`src-tauri/target/release/bundle/appimage/`.

O Tauri nao gera MSI nativamente no Linux. Para uma release Windows, execute o
mesmo comando em uma maquina Windows ou no ambiente Windows da CI.

Para gerar uma release e verificar assinatura, Microsoft Defender e SHA-256:

```powershell
bun run desktop:dist
```

O comando tambem cria um arquivo `.sha256` ao lado do instalador.

## Distribuicao no Windows

Um executavel novo e sem assinatura pode ser bloqueado pelo Microsoft Defender
ou pelo SmartScreen por falta de reputacao, mesmo quando nao contem malware.
O projeto antigo em Electron gerava `dist/Compact Img Setup 0.1.0.exe`; esse
arquivo nao e mais o instalador atual e nao deve ser distribuido. Use apenas o
MSI gerado pelo Tauri.

Para distribuicao publica:

1. Obtenha um certificado de assinatura de codigo emitido por uma autoridade
   confiavel ou configure o Azure Artifact Signing.
2. Configure a assinatura do Tauri e mantenha o mesmo certificado nas releases.
3. Execute `bun run desktop:dist` e confirme que a saida mostra
   `Assinatura: valida`.
4. Publique o MSI junto com o arquivo `.sha256`.
5. Se uma versao assinada ainda for detectada, envie exatamente esse MSI para
   analise no portal Microsoft Security Intelligence como desenvolvedor.

Um certificado autoassinado serve para testes internos, mas nao cria confianca
nos computadores dos usuarios e nao resolve a reputacao do SmartScreen.

## Observações

- AVIF depende do suporte do navegador para codificação via canvas/OffscreenCanvas.
- Os arquivos compactados usam o sufixo `-compactado` e ficam ao lado da imagem original.
- Os previews usam `URL.createObjectURL` e são liberados quando imagens são removidas ou a fila é limpa.
