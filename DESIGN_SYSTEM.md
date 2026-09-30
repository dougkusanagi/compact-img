# Compact Img — design system

## Princípios

- **Claro e focado:** a tela usa uma ação principal por etapa. A área de envio ocupa o foco antes de um lote; a fila e a comparação assumem o foco depois.
- **Editorial e preciso:** a identidade segue o logo, com papel creme, tinta preta e um único acento vermelhão. As superfícies são planas, as bordas são nítidas e os cantos são curtos, para não competir com as imagens do usuário.
- **Tipografia consistente:** IBM Plex Sans Variable é carregada localmente para títulos, controles e dados. O peso e o alinhamento dão hierarquia sem depender de ornamentos.
- **Movimento como feedback:** hover, foco, seleção, processamento e conclusão têm respostas curtas e previsíveis. A preferência por movimento reduzido é respeitada.

## Tokens

Os tokens estão em `src/app/globals.css`. Cores semânticas usam HSL para funcionar com as classes Tailwind e os componentes existentes. Não use escalas fixas do Tailwind (`slate`, `blue` etc.) nos componentes; use os tokens.

| Papel | Token | Uso |
| --- | --- | --- |
| Base | `--background`, `--foreground` | Página e texto principal |
| Ação | `--primary`, `--primary-foreground` | Ação principal em tinta preta |
| Marca | `--brand`, `--brand-strong`, `--brand-soft`, `--ring` | Acento vermelhão: hover da ação principal, progresso, seleção e foco |
| Sucesso | `--success`, `--success-soft` (`--secondary`) | Resultado e confirmação |
| Erro | `--destructive` | Falhas e cancelamento; carmim, distinto do vermelhão |
| Superfícies | `--card`, `--surface-raised`, `--surface-tint` | Painéis e estados sutis |
| Estrutura | `--border`, `--input`, `--radius` | Divisões, campos e arredondamento |
| Profundidade | `--shadow-soft`, `--shadow-hover` | Painel normal e hover |
| Movimento | `--ease-spring` | Entrada e deslocamentos pequenos |

## Componentes

- `Button`, `Input`, `Select`, `Slider`, `Switch` e `Card` em `src/components/ui` são a base comum. Os estados de foco precisam permanecer visíveis em todos os controles.
- `.surface-card` é a superfície interativa padrão; `.classic-card` conserva a mesma linguagem na interface atual.
- `SegmentedControl` em `src/components/ui` representa escolhas exclusivas. O indicador desliza entre as opções, preservando `aria-pressed`, foco por teclado e a preferência por movimento reduzido. Use um rótulo no grupo.
- `.dropzone-surface` é o canvas de entrada, com superfície clara e borda tracejada discreta. O quadriculado fica reservado à prévia, onde ajuda a ler transparência. A ação interna deve continuar disponível pelo teclado.
- A entrada também oferece “Escolher pasta”: usa o seletor nativo no Tauri e `webkitdirectory` no navegador, mantendo a organização por pasta quando disponível. Colar imagens da área de transferência adiciona arquivos à fila fora de campos de texto; a importação fica indisponível durante o processamento.
- `.inspector-panel` reúne ajustes e ações do lote. Em telas estreitas, a ação aparece antes dos campos para continuar acessível sem longa rolagem.
- O layout beta (`/beta/`) segue `prototype/premium-ui-v2.html`: coluna central de 880px, receita com presets, fila agrupada por pasta, painel lateral de ajustes e ação principal no rodapé. Os painéis principais usam superfícies creme e raios de 16px, com os mesmos tokens e fontes do layout atual.
- Na receita beta, os quatro presets de fábrica são Loja, Instagram, Catálogo 300 KB e Máxima compressão. O painel de ajustes permite salvar e remover até dois presets adicionais, persistidos localmente. Sem presets salvos, as opções usam `SegmentedControl` a partir de 640px e `select` nativo abaixo desse limite; com presets salvos, usam `select` em todas as larguras. O campo tem rótulo acessível e altura de 44px; a escolha fica desabilitada durante o processamento.
- `OutputSettings` alterna “Qualidade” e “Peso máximo”. O limite em KB é por imagem e oferece atalhos de 100, 200, 300, 500 e 1000 KB. A codificação ajusta qualidade e, quando permitido, dimensões; PNG reduz somente dimensões. Quando o limite não pode ser atingido, o resultado apresenta erro. O preset Catálogo 300 KB usa WebP e tamanho máximo de 2000 × 2000px.
- `LayoutSwitcher` é compartilhado pelos dois cabeçalhos; apenas a opção nova recebe o selo Beta. A instância de `ImageCompressorApp` no layout raiz mantém o estado durante a troca de rotas.
- `WindowTitlebar` integra marca, alternância de layout e controles de janela em uma barra fixa ao rolar: 48px a partir de 640px e 96px abaixo desse limite, com a alternância na segunda linha. No Tauri, permite arrastar, minimizar, maximizar/restaurar e fechar; ao voltar para Atual, restaura a decoração nativa. No navegador, os controles de janela permanecem desabilitados. O foco é visível e o hover de fechar usa carmim.
- `.premium-row` acomoda resultado e ações em colunas no desktop e em duas linhas no mobile. A comparação ocupa o espaço abaixo da barra personalizada, com fundo de tinta preta; ajustes usam um diálogo lateral de até 420px na mesma área, com foco e Escape gerenciados pelo Radix. O visualizador oferece anterior/próximo por botões e setas do teclado, contador e zoom com rolagem; a ampliação é reiniciada ao trocar a imagem.
- Avisos “Original mantido” e “Ignorada” usam texto neutro na fila e entram no filtro de avisos, junto de erros e amostras cuja saída seria maior. O original é mantido quando a saída não é menor e a preferência está ativa, desde que também respeite o limite no modo Peso máximo. Falhas usam carmim; esses estados devem permanecer distinguíveis por texto.
- A política “Se o arquivo já existir” oferece Perguntar, Manter os dois (renomear), Substituir e Pular. Perguntar abre um diálogo com o arquivo e essas decisões, além de cancelar o salvamento. No Tauri, a política verifica o destino de salvamento; no navegador, aplica-se apenas ao download em lote de arquivos individuais para um diretório escolhido, quando `showDirectoryPicker` está disponível. Downloads comuns e seletores de arquivo são geridos pelo navegador; não prometa detectar conflitos na pasta de downloads.
- Antes de processar, o rodapé beta pode apresentar economia aproximada, sinalizada por `~` e pelo número de imagens da amostra. A estimativa codifica até três imagens pendentes com os ajustes atuais e extrapola a proporção de bytes para o lote pendente; não inventa valores quando a amostragem falha. Após processar, apresenta os bytes reais dos resultados. Estatísticas abaixo da área de trabalho acumulam processamentos concluídos e economia positiva no armazenamento local deste dispositivo; recompactações também contam, sem sincronização entre dispositivos.
- `.queue-row` dá feedback para itens de lista sem deslocar o conteúdo; a seleção usa um traço fino da cor da marca.

## Movimento

Use transições de 180 a 300 ms nos controles, e até 500 ms em entradas ou mudanças de superfície. Prefira `transform` e `opacity` para não mover o layout. Animações contínuas ficam restritas a processamento e estado de arraste. Adicione novos efeitos ao bloco `prefers-reduced-motion` em `globals.css`.

## Diretrizes de uso

- Use a ação preta para apenas uma ação dominante por região. O vermelhão é acento: use-o em pequenas doses (hover da ação, progresso, item selecionado, ícone de destaque) e nunca em blocos grandes de texto; para texto em vermelhão use `--brand-strong`.
- Rótulos de campo usam caixa de frase, com inicial maiúscula e siglas preservadas (como “Tamanho máximo” e “Modo JPG”), em 13px e sem espaçamento adicional entre letras.
- Mantenha texto funcional com contraste alto; use tons suaves em bordas, fundos e ornamentos.
- Em layouts pequenos, empilhe painéis e preserve alvos de toque confortáveis.
- Novos controles devem usar os componentes base antes de receber estilos locais.
