/**
 * Troca de cor no mosaico de coleção (CollectionMosaicItem.astro).
 * Sem tamanho aqui — cada cor tem 1 variante representante (a 1ª em stock).
 * Nunca recria nós (CSS scoped do componente não pega em conteúdo injetado
 * via innerHTML) — só liga/desliga slots de <img> já renderizados no server.
 */
function initMosaicItem(root: HTMLElement) {
  const switcher = root.querySelector<HTMLElement>('[data-color-switch]');
  const gallery = root.querySelector<HTMLElement>('[data-gallery]');
  const addBtn = root.querySelector<HTMLButtonElement>('.mosaic-item__add');
  const priceCurrent = root.querySelector<HTMLElement>('[data-price-current]');
  const priceStriked = root.querySelector<HTMLElement>('[data-price-striked]');
  if (!switcher || !gallery) return;

  const tiles = Array.from(gallery.querySelectorAll<HTMLElement>('[data-tile]'));

  const applySwatch = (btn: HTMLElement) => {
    const slidesRaw = btn.dataset.slides;
    let slides: string[] = [];
    try {
      slides = slidesRaw ? JSON.parse(slidesRaw) : [];
    } catch {
      slides = [];
    }

    tiles.forEach((tile, i) => {
      const url = slides[i];
      const img = tile.querySelector('img');
      if (url && img instanceof HTMLImageElement) {
        tile.hidden = false;
        if (img.getAttribute('src') !== url) img.src = url;
      } else {
        tile.hidden = true;
      }
    });
    gallery.dataset.count = String(Math.max(1, slides.length));

    const priceDisplay = btn.dataset.priceDisplay ?? '';
    const priceOriginal = btn.dataset.priceOriginalDisplay ?? '';
    if (priceCurrent && priceDisplay) priceCurrent.textContent = priceDisplay;
    if (priceStriked instanceof HTMLElement) {
      if (priceOriginal) {
        priceStriked.textContent = priceOriginal;
        priceStriked.hidden = false;
      } else {
        priceStriked.hidden = true;
      }
    }

    if (addBtn) {
      addBtn.dataset.variantId = btn.dataset.variantId ?? '';
      addBtn.dataset.price = btn.dataset.price ?? '';
      addBtn.dataset.variantTitle = btn.dataset.variantTitle ?? '';
      addBtn.dataset.maxQty = btn.dataset.maxQty ?? '';
      if (slides[0]) addBtn.dataset.thumbnail = slides[0];
    }

    switcher.querySelectorAll<HTMLElement>('.mosaic-item__swatch').forEach((s) => {
      const active = s === btn;
      s.classList.toggle('is-active', active);
      s.setAttribute('aria-pressed', String(active));
    });
  };

  switcher.addEventListener('click', (ev) => {
    const btn = (ev.target as HTMLElement)?.closest<HTMLElement>('.mosaic-item__swatch');
    if (!btn || !switcher.contains(btn)) return;
    ev.preventDefault();
    applySwatch(btn);
  });
}

function init() {
  document.querySelectorAll<HTMLElement>('[data-mosaic-item]').forEach(initMosaicItem);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
