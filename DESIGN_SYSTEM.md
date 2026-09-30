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
- `.inspector-panel` reúne ajustes e ações do lote. Em telas estreitas, a ação aparece antes dos campos para continuar acessível sem longa rolagem.
- O layout beta (`/beta/`) segue `prototype/premium-ui-v2.html`: coluna central de 880px, receita com presets, fila agrupada por pasta, painel lateral de ajustes e ação principal no rodapé. Os painéis principais usam superfícies creme e raios de 16px, com os mesmos tokens e fontes do layout atual.
- Na receita beta, os presets usam `SegmentedControl` a partir de 640px e um `select` nativo abaixo desse limite, com rótulo acessível e altura de 44px. Ambos aplicam as mesmas configurações e ficam desabilitados durante o processamento.
- `LayoutSwitcher` é compartilhado pelos dois cabeçalhos; apenas a opção nova recebe o selo Beta. A instância de `ImageCompressorApp` no layout raiz mantém o estado durante a troca de rotas.
- `.premium-row` acomoda resultado e ações em colunas no desktop e em duas linhas no mobile. A comparação ocupa um diálogo em tela cheia; ajustes usam um diálogo lateral com foco e Escape gerenciados pelo Radix.
- `.queue-row` dá feedback para itens de lista sem deslocar o conteúdo; a seleção usa um traço fino da cor da marca.

## Movimento

Use transições de 180 a 300 ms nos controles, e até 500 ms em entradas ou mudanças de superfície. Prefira `transform` e `opacity` para não mover o layout. Animações contínuas ficam restritas a processamento e estado de arraste. Adicione novos efeitos ao bloco `prefers-reduced-motion` em `globals.css`.

## Diretrizes de uso

- Use a ação preta para apenas uma ação dominante por região. O vermelhão é acento: use-o em pequenas doses (hover da ação, progresso, item selecionado, ícone de destaque) e nunca em blocos grandes de texto; para texto em vermelhão use `--brand-strong`.
- Rótulos de campo usam caixa de frase, com inicial maiúscula e siglas preservadas (como “Tamanho máximo” e “Modo JPG”), em 13px e sem espaçamento adicional entre letras.
- Mantenha texto funcional com contraste alto; use tons suaves em bordas, fundos e ornamentos.
- Em layouts pequenos, empilhe painéis e preserve alvos de toque confortáveis.
- Novos controles devem usar os componentes base antes de receber estilos locais.
