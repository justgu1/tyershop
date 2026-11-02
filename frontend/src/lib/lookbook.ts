export type LookbookDrop = {
  slug: string;
  title: string;
  /** Quantidade de fotos em /public/lookbook/<slug>/1..N.webp */
  count: number;
  /** Fotos horizontais (ocupam 2 colunas na galeria). */
  wide?: number[];
  /** Existem video.mp4, video.webm e video-poster.webp na pasta do drop. */
  video?: boolean;
};

/* Lista estática: vários drops saíram do catálogo da Medusa (ver isHiddenCollection),
   mas o lookbook continua mostrando as fotos deles. Ordem = do mais recente ao mais antigo. */
export const LOOKBOOK_DROPS: LookbookDrop[] = [
  { slug: 'tyer-starter', title: 'Tyer Starter', count: 4, wide: [4], video: true },
  { slug: 'red-rose', title: 'Red Rose', count: 6 },
  { slug: 'tyer-in-paris', title: 'Tyer in Paris', count: 5 },
  { slug: 'five-stars', title: 'Five Stars', count: 8, wide: [6, 7] },
];

export const getLookbookDrop = (slug: string) => LOOKBOOK_DROPS.find((d) => d.slug === slug);

export const lookbookPhotos = (d: LookbookDrop) =>
  Array.from({ length: d.count }, (_, i) => ({
    src: `/lookbook/${d.slug}/${i + 1}.webp`,
    wide: d.wide?.includes(i + 1) ?? false,
  }));
