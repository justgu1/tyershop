# Páginas custom por drop

A página `/drop` renderiza `components/drop/DropDefault.astro`. Para uma página sob medida, crie
`components/drop-pages/<component_key>.astro` e informe a mesma chave no campo "Componente da página /drop"
do drop no admin. O componente recebe a prop `drop` (ver `PublicDrop` em `lib/drop.ts`).
