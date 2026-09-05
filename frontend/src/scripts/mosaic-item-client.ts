/**
 * Mosaico de coleção (CollectionMosaicItem.astro) — troca de cor (galeria +
 * variante) e agora também tamanho/outras opções (antes só cor existia
 * aqui; tamanho ficava de fora e o "adicionar à bag" sempre resolvia pra
 * qualquer variante da cor escolhida, ignorando tamanho).
 *
 * Cor continua decidindo a galeria (fotos são por cor, não por tamanho —
 * decisão de produto já existente). Tamanho/outros só afetam preço/estoque/
 * id da variante, via o mesmo algoritmo de resolução do ProductCard
 * (`lib/variant-selection.ts`), não recriam nó (CSS scoped não pega em
 * conteúdo injetado via innerHTML).
 */
import { resolveVariant, variantIsOutOfStock, type VariantMap, type OptionRow, type SelectedMap } from '../lib/variant-selection';

function decodeJson<T>(value: string): T | null {
  try {
    return JSON.parse(decodeURIComponent(value)) as T;
  } catch {
    return null;
  }
}

function initMosaicItem(root: HTMLElement) {
  if (root.dataset.mosaicInit === '1') return;
  root.dataset.mosaicInit = '1';

  const switcher = root.querySelector<HTMLElement>('[data-color-switch]');
  const gallery = root.querySelector<HTMLElement>('[data-gallery]');
  const addBtn = root.querySelector<HTMLButtonElement>('.mosaic-item__add');
  const priceCurrent = root.querySelector<HTMLElement>('[data-price-current]');
  const priceStriked = root.querySelector<HTMLElement>('[data-price-striked]');
  if (!gallery || !addBtn) return;

  const stockReliable = root.dataset.stockReliable === 'true';
  const variants = decodeJson<VariantMap[]>(root.dataset.variants || '') || [];
  const optionRows = decodeJson<OptionRow[]>(root.dataset.optionRows || '') || [];
  const colorOptionId = switcher?.dataset.colorOptionId || '';
  const tiles = Array.from(gallery.querySelectorAll<HTMLElement>('[data-tile]'));

  const selected: SelectedMap = {};
  // Estado inicial: cor do swatch já marcado ativo + tamanho/outros já
  // marcados `is-selected` no VariantOptionRows (default do server).
  const activeSwatch = switcher?.querySelector<HTMLElement>('.mosaic-item__swatch.is-active');
  if (colorOptionId && activeSwatch?.dataset.color) selected[colorOptionId] = activeSwatch.dataset.color;
  optionRows.forEach((row) => {
    if (row.id === colorOptionId) return;
    const sel = root.querySelector<HTMLElement>(`.pc__variant-hit[data-option-id="${row.id}"].is-selected`);
    if (sel?.dataset.optionValue) selected[row.id] = sel.dataset.optionValue;
  });

  const applyColorGallery = (btn: HTMLElement) => {
    let slides: string[] = [];
    try {
      slides = btn.dataset.slides ? JSON.parse(btn.dataset.slides) : [];
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
    gallery!.dataset.count = String(Math.max(1, slides.length));
    if (slides[0]) addBtn!.dataset.thumbnail = slides[0];
  };

  const syncOptionButtons = () => {
    optionRows.forEach((row) => {
      if (row.id === colorOptionId) return; // cor tem seu próprio botão/estilo (swatch)
      root.querySelectorAll<HTMLButtonElement>(`.pc__variant-hit[data-option-id="${row.id}"]`).forEach((btn) => {
        const value = btn.dataset.optionValue || '';
        const selectedForCheck = { ...selected, [row.id]: value };
        const hasAnyVariant = variants.some((v) => Object.entries(selectedForCheck).every(([k, val]) => !val || v.options?.[k] === val));
        btn.classList.toggle('is-selected', selected[row.id] === value);
        btn.classList.toggle('is-unavailable', !hasAnyVariant);
        btn.setAttribute('aria-checked', selected[row.id] === value ? 'true' : 'false');
      });
      const headingEl = root.querySelector(`[data-heading-for="${row.id}"]`);
      if (headingEl) headingEl.textContent = selected[row.id]?.trim() || '—';
    });
  };

  const applyResolvedVariant = () => {
    const chosen = resolveVariant(variants, optionRows, selected, stockReliable) || variants[0];
    if (!chosen) return;
    const oos = variantIsOutOfStock(chosen, stockReliable);
    addBtn!.disabled = oos;
    addBtn!.dataset.variantId = chosen.id || '';
    addBtn!.dataset.price = String(chosen.price || 0);
    addBtn!.dataset.variantTitle =
      optionRows
        .map((row) => {
          const val = String(selected[row.id] ?? chosen.options?.[row.id] ?? '').trim();
          return val ? `${row.title}: ${val}` : '';
        })
        .filter(Boolean)
        .join(' | ') || chosen.title || '';
    addBtn!.dataset.maxQty = Number.isFinite(Number(chosen.maxQty))
      ? String(Math.max(0, Math.floor(Number(chosen.maxQty))))
      : '';
    if (priceCurrent instanceof HTMLElement) priceCurrent.textContent = chosen.priceDisplay ?? '';
    if (priceStriked instanceof HTMLElement) {
      if (chosen.originalDisplay) {
        priceStriked.textContent = chosen.originalDisplay;
        priceStriked.hidden = false;
      } else {
        priceStriked.hidden = true;
      }
    }
  };

  switcher?.addEventListener('click', (ev) => {
    const btn = (ev.target as HTMLElement)?.closest<HTMLElement>('.mosaic-item__swatch');
    if (!btn || !switcher.contains(btn)) return;
    ev.preventDefault();
    if (!colorOptionId || !btn.dataset.color) return;
    selected[colorOptionId] = btn.dataset.color;
    switcher.querySelectorAll<HTMLElement>('.mosaic-item__swatch').forEach((s) => {
      const active = s === btn;
      s.classList.toggle('is-active', active);
      s.setAttribute('aria-pressed', String(active));
    });
    applyColorGallery(btn);
    syncOptionButtons();
    applyResolvedVariant();
  });

  root.addEventListener('click', (ev) => {
    const btn = (ev.target as HTMLElement)?.closest<HTMLButtonElement>('.pc__variant-hit');
    if (!btn || !root.contains(btn)) return;
    if (btn.classList.contains('is-unavailable')) return;
    const optionId = btn.dataset.optionId || '';
    const optionValue = btn.dataset.optionValue || '';
    if (!optionId || !optionValue || optionId === colorOptionId) return;
    selected[optionId] = optionValue;
    syncOptionButtons();
    applyResolvedVariant();
  });

  syncOptionButtons();
  applyResolvedVariant();
}

function init() {
  document.querySelectorAll<HTMLElement>('[data-mosaic-item]').forEach(initMosaicItem);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
