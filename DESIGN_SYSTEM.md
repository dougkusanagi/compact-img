# Compact Img — design system

## Princípios

- **Claro e focado:** a tela usa uma ação principal por etapa. A área de envio ocupa o foco antes de um lote; a fila e a comparação assumem o foco depois.
- **Precisão leve:** fundos claros, bordas discretas e sombras em camadas criam profundidade sem competir com as imagens do usuário.
- **Movimento como feedback:** hover, foco, seleção, processamento e conclusão têm respostas curtas e previsíveis. A preferência por movimento reduzido é respeitada.

## Tokens

Os tokens estão em `src/app/globals.css`. Cores semânticas usam HSL para funcionar com as classes Tailwind e os componentes existentes.

| Papel | Token | Uso |
| --- | --- | --- |
| Base | `--background`, `--foreground` | Página e texto principal |
| Ação | `--primary`, `--primary-foreground`, `--ring` | Ação principal, seleção e foco |
| Sucesso | `--secondary` | Resultado e confirmação |
| Superfícies | `--card`, `--surface-raised`, `--surface-tint` | Painéis e estados sutis |
| Estrutura | `--border`, `--input`, `--radius` | Divisões, campos e arredondamento |
| Profundidade | `--shadow-soft`, `--shadow-hover` | Painel normal e hover |
| Movimento | `--ease-spring` | Entrada e deslocamentos pequenos |

## Componentes

- `Button`, `Input`, `Select`, `Slider`, `Switch` e `Card` em `src/components/ui` são a base comum. Os estados de foco precisam permanecer visíveis em todos os controles.
- `.surface-card` é a superfície interativa padrão; `.beta-card` conserva a mesma linguagem na interface beta.
- `SegmentedControl` em `src/components/ui` representa escolhas exclusivas. O indicador desliza entre as opções, preservando `aria-pressed`, foco por teclado e a preferência por movimento reduzido. Use um rótulo no grupo.
- `.dropzone-surface` é a área de entrada de arquivos; seu brilho e deslocamento sinalizam hover e drag. A ação interna deve continuar disponível pelo teclado.
- `.queue-row` dá feedback para itens de lista sem deslocar o conteúdo.

## Movimento

Use transições de 180 a 300 ms nos controles, e até 500 ms em entradas ou mudanças de superfície. Prefira `transform` e `opacity` para não mover o layout. Animações contínuas ficam restritas a processamento, estado de arraste e brilho suave da ação. Adicione novos efeitos ao bloco `prefers-reduced-motion` em `globals.css`.

## Diretrizes de uso

- Use o azul primário para apenas uma ação dominante por região.
- Mantenha texto funcional com contraste alto; use tons suaves em bordas, fundos e ornamentos.
- Em layouts pequenos, empilhe painéis e preserve alvos de toque confortáveis.
- Novos controles devem usar os componentes base antes de receber estilos locais.
