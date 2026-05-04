/**
 * Monta até 2 URLs distintas para o card: principal (thumbnail/1ª) + secundária (hover).
 * A thumbnail do produto não substitui uma 2.ª imagem: se a variante repete a mesma URL
 * no thumb e no 1.º `images[]`, ainda procuramos a próxima distinta na galeria.
 */

function toImageUrlList(input: unknown): string[] {
  if (!Array.isArray(input)) return [];
  return input
    .map((entry: any) => {
      if (typeof entry === 'string') return entry.trim();
      if (entry && typeof entry.url === 'string') return entry.url.trim();
      if (entry && typeof entry.src === 'string') return entry.src.trim();
      return '';
    })
    .filter((url) => url.length > 0);
}

function imageBelongsToVariant(image: any, variantId: string): boolean {
  if (!image || !variantId) return false;
  const id = String(variantId);
  if (image.variant_id && String(image.variant_id) === id) return true;
  const vids = image.variant_ids;
  if (Array.isArray(vids) && vids.some((x: any) => String(x) === id)) return true;
  const vars = image.variants;
  if (Array.isArray(vars)) {
    return vars.some((v: any) => String(v?.id ?? v) === id);
  }
  return false;
}

function collectProductImageUrlsForVariant(product: any, variantId: string): string[] {
  const list = product?.images;
  if (!Array.isArray(list) || !variantId) return [];
  const out: string[] = [];
  for (const img of list) {
    if (!imageBelongsToVariant(img, variantId)) continue;
    const u = typeof img?.url === 'string' ? img.url.trim() : '';
    if (u) out.push(u);
  }
  return out;
}

function getMetadataUrls(variant: any): string[] {
  const md = variant?.metadata ?? {};
  const candidates = [md.variant_gallery, md.gallery, md.images, md.image_gallery, md.variant_images];
  for (const candidate of candidates) {
    const urls = toImageUrlList(candidate);
    if (urls.length) return urls;
  }
  return [];
}

function pushDistinct(order: string[], u: string | undefined | null) {
  const t = String(u ?? '').trim();
  if (!t || order.includes(t)) return;
  order.push(t);
}

/** Só imagens ligadas à variante (metadata, thumb da variante, imagens da variante, fotos do produto com variant_id). */
export function buildVariantSpecificGallery(variant: any, product: any): string[] {
  const order: string[] = [];
  for (const u of getMetadataUrls(variant)) pushDistinct(order, u);
  if (variant) {
    pushDistinct(order, variant.thumbnail);
    if (Array.isArray(variant.images)) {
      for (const img of variant.images) {
        const u = typeof img === 'string' ? img : String(img?.url ?? '').trim();
        pushDistinct(order, u);
      }
    }
  }
  for (const u of collectProductImageUrlsForVariant(product, String(variant?.id ?? ''))) {
    pushDistinct(order, u);
  }
  return order;
}

/** Galeria completa do produto (thumbnail + todas as imagens), ordem estável. */
export function buildFullProductGallery(product: any): string[] {
  const order: string[] = [];
  if (product?.thumbnail) pushDistinct(order, product.thumbnail);
  if (Array.isArray(product?.images)) {
    for (const img of product.images) {
      pushDistinct(order, img?.url);
    }
  }
  return order;
}

/** Ordem de candidatos: só variante; se vazio, cai na galeria inteira do produto. */
export function buildOrderedCandidates(variant: any, product: any): string[] {
  const variantOnly = buildVariantSpecificGallery(variant, product);
  if (variantOnly.length) return variantOnly;
  const full = buildFullProductGallery(product);
  return full.length ? full : [];
}

export function getProductGallerySlice(product: any, max = 2): string[] {
  const order: string[] = [];
  if (product?.thumbnail) pushDistinct(order, product.thumbnail);
  if (Array.isArray(product?.images)) {
    for (const img of product.images) {
      pushDistinct(order, img?.url);
    }
  }
  return order.slice(0, max);
}

/**
 * [principal, secundária] — secundária vazia se não houver 2ª URL distinta.
 */
const PLACEHOLDER_IMG = '/no-data.webp';

export function getVariantGalleryUrls(variant: any, product: any): [string, string] {
  const order = buildOrderedCandidates(variant, product);
  const primary = order[0] ?? PLACEHOLDER_IMG;
  const secondary = order.find((u) => u !== primary) ?? '';
  return [primary, secondary || ''];
}

/** Todas as URLs distintas da galeria para o carrossel da PDP (mínimo 1). */
export function getVariantSlideUrls(variant: any, product: any): string[] {
  const order = buildOrderedCandidates(variant, product);
  if (order.length) return order;
  const t = String(product?.thumbnail ?? '').trim();
  return [t || PLACEHOLDER_IMG];
}
