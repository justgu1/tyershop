/**
 * Inicialização global dos ProductCard (`.pc`).
 * Vive num único módulo importado pelo Layout para não repetir `<script>` por cartão
 * (o que quebrava o browser com TS/`import` em linha).
 */
import { addItem } from '../lib/cart';

type VariantMap = {
  id: string;
  title: string;
  price: number;
  soldOut: boolean;
  allowBackorder?: boolean;
  maxQty?: number | null;
  options: Record<string, string>;
  images?: string[];
  priceDisplay?: string;
  originalDisplay?: string | null;
  discountPercent?: number;
};
type OptionRow = { id: string; title: string; values: string[] };
type SelectedMap = Record<string, string>;

if (document.documentElement.dataset.pcInitDone === 'true') {
  /* já carregado (HMR / navegação) */
} else {
  document.documentElement.dataset.pcInitDone = 'true';

  const PLACEHOLDER = '/no-data.webp';

  const prefetchedImages = new Set<string>();
  const prefetchHoverImage = (url: string) => {
    if (!url || prefetchedImages.has(url)) return;
    prefetchedImages.add(url);
    const img = new Image();
    img.src = url;
  };

  const hoverImages = document.querySelectorAll('.pc__img--secondary');
  if ('IntersectionObserver' in window) {
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          const el = entry.target;
          if (el instanceof HTMLImageElement && el.currentSrc) {
            prefetchHoverImage(el.currentSrc);
          } else if (el instanceof HTMLImageElement && el.src) {
            prefetchHoverImage(el.src);
          }
          io.unobserve(el);
        });
      },
      { rootMargin: '300px' }
    );
    hoverImages.forEach((img) => io.observe(img));
  } else {
    hoverImages.forEach((img) => {
      if (img instanceof HTMLImageElement) prefetchHoverImage(img.src);
    });
  }

  const bindHoverReady = (img: HTMLImageElement) => {
    const parent = img.closest('.pc__img-wrap');
    if (!(parent instanceof HTMLElement)) return;
    if (img.dataset.hasSecondary !== 'true') {
      parent.classList.remove('is-hover-ready');
      return;
    }
    if (img.complete && img.naturalWidth > 0) {
      parent.classList.add('is-hover-ready');
    } else {
      img.addEventListener('load', () => parent.classList.add('is-hover-ready'), { once: true });
    }
    img.addEventListener('error', () => parent.classList.remove('is-hover-ready'), { once: true });
  };

  hoverImages.forEach((img) => {
    if (!(img instanceof HTMLImageElement)) return;
    bindHoverReady(img);
  });

  function decodeJson<T>(value: string): T | null {
    try {
      return JSON.parse(decodeURIComponent(value)) as T;
    } catch {
      return null;
    }
  }

  function variantMatches(variant: VariantMap, selected: SelectedMap): boolean {
    return Object.entries(selected).every(([k, v]) => !v || variant.options?.[k] === v);
  }

  function initCard(card: Element) {
    if (!(card instanceof HTMLElement) || card.dataset.quickInit === '1') return;
    card.dataset.quickInit = '1';
    const secondary = card.querySelector('.pc__img--secondary');
    if (secondary instanceof HTMLImageElement) bindHoverReady(secondary);
    const quickBtn = card.querySelector('.pc__quick-add');
    if (!(quickBtn instanceof HTMLButtonElement)) return;
    const stockReliable = card.dataset.stockReliable === 'true';
    const variants = decodeJson<VariantMap[]>(card.dataset.variants || '') || [];
    const optionRows = decodeJson<OptionRow[]>(card.dataset.optionRows || '') || [];
    if (!Array.isArray(variants) || variants.length === 0 || !Array.isArray(optionRows)) return;

    const primaryImage = card.querySelector('.pc__img--primary');
    const secondaryImage = card.querySelector('.pc__img--secondary');
    const imgWrap = card.querySelector('.pc__img-wrap');
    const priceCurrent = card.querySelector('.pc__price-current');
    const priceStriked = card.querySelector('.pc__price-striked');
    const priceBox = card.querySelector('.pc__price-box');
    const discountTag = card.querySelector('.pc__tag--discount');
    const bottomRow = card.querySelector('.pc__bottom');
    const stockNotifyWrap = card.querySelector('.pc__stock-notify');
    const stockNotifyEmail = card.querySelector('.pc__stock-notify__input') as HTMLInputElement | null;
    const stockNotifyBtn = card.querySelector('.pc__stock-notify__btn') as HTMLButtonElement | null;
    const stockNotifyFeedback = card.querySelector('.pc__stock-notify__feedback');
    let stockNotifyMsgs = { ok: '', err: '' };
    try {
      stockNotifyMsgs = {
        ...stockNotifyMsgs,
        ...JSON.parse(decodeURIComponent(card.dataset.stockNotifyMsgs || '')),
      };
    } catch {
      /* ignore */
    }
    const productId = card.dataset.productId || '';
    const productHandle = card.dataset.productHandle || '';
    const productTitle = card.dataset.productTitle || '';
    const fallbackGallery = [quickBtn.dataset.thumbnail || PLACEHOLDER].filter(Boolean);
    if (secondaryImage instanceof HTMLImageElement) {
      const secondarySrc = secondaryImage.getAttribute('src') || '';
      if (secondarySrc && secondarySrc !== fallbackGallery[0]) fallbackGallery.push(secondarySrc);
    }
    const allowedOptionIds = new Set(optionRows.map((row) => row.id));

    function variantIsOutOfStock(v: VariantMap) {
      if (v.allowBackorder) return false;
      if (v.soldOut) return true;
      if (stockReliable) {
        const mq = v.maxQty;
        return mq != null && Number.isFinite(Number(mq)) && Number(mq) <= 0;
      }
      return false;
    }

    function getFirstAvailable(variants: VariantMap[], selected: SelectedMap): VariantMap | null {
      return variants.find((v) => variantMatches(v, selected) && !variantIsOutOfStock(v)) || null;
    }

    const selectionComplete = (sel: SelectedMap) =>
      optionRows.length > 0 && optionRows.every((row) => String(sel[row.id] ?? '').trim().length > 0);

    const findExactVariantForSelection = (sel: SelectedMap): VariantMap | null => {
      if (!selectionComplete(sel)) return null;
      return (
        variants.find((v) =>
          optionRows.every(
            (row) => String(v.options?.[row.id] ?? '').trim() === String(sel[row.id] ?? '').trim()
          )
        ) || null
      );
    };

    const selected: SelectedMap = {};
    const currentId = quickBtn.dataset.variantId || '';
    const current = variants.find((v) => v.id === currentId) || getFirstAvailable(variants, {}) || variants[0];
    if (current?.options) {
      Object.entries(current.options).forEach(([k, v]) => {
        if (!allowedOptionIds.has(k)) return;
        selected[k] = String(v || '');
      });
    }

    const applyGallery = (urls: string[]) => {
      const source = (Array.isArray(urls) && urls.length ? urls : fallbackGallery).slice(0, 2);
      const main = source[0] || PLACEHOLDER;
      const second = source[1] || '';
      if (primaryImage instanceof HTMLImageElement) {
        primaryImage.src = main;
      }
      if (secondaryImage instanceof HTMLImageElement) {
        secondaryImage.dataset.hasSecondary = second ? 'true' : 'false';
        secondaryImage.src = second || main;
        if (second) bindHoverReady(secondaryImage);
        else imgWrap?.classList.remove('is-hover-ready');
      }
      quickBtn.dataset.thumbnail = main;
    };

    const setFromVariant = (variant: VariantMap | null) => {
      if (!variant) return;
      quickBtn.dataset.variantId = variant.id || '';
      quickBtn.dataset.price = String(variant.price || 0);
      quickBtn.dataset.maxQty = Number.isFinite(Number(variant.maxQty))
        ? String(Math.max(0, Math.floor(Number(variant.maxQty))))
        : '';
      const optionTitle = optionRows
        .map((row) => {
          const val = String(selected[row.id] ?? variant.options?.[row.id] ?? '').trim();
          if (!val) return '';
          return `${row.title}: ${val}`;
        })
        .filter((s) => s.length > 0)
        .join(' | ');
      quickBtn.dataset.variantTitle = optionTitle || variant.title || '';
      const oos = variantIsOutOfStock(variant);
      quickBtn.disabled = oos;
      if (bottomRow instanceof HTMLElement) bottomRow.classList.toggle('pc__bottom--oos', oos);
      if (stockNotifyWrap instanceof HTMLElement) {
        const showNotify = oos && (!!productId.trim() || !!productHandle.trim());
        stockNotifyWrap.hidden = !showNotify;
        if (stockNotifyFeedback instanceof HTMLElement) {
          stockNotifyFeedback.hidden = true;
          stockNotifyFeedback.textContent = '';
          stockNotifyFeedback.classList.remove('is-ok', 'is-err');
        }
      }
      applyGallery(variant.images || []);
      if (priceCurrent instanceof HTMLElement) {
        priceCurrent.textContent = variant.priceDisplay ?? '';
      }
      if (priceStriked instanceof HTMLElement) {
        if (variant.originalDisplay) {
          priceStriked.textContent = variant.originalDisplay;
          priceStriked.hidden = false;
        } else {
          priceStriked.textContent = '';
          priceStriked.hidden = true;
        }
      }
      if (priceBox instanceof HTMLElement) {
        priceBox.classList.toggle('pc__price-box--discount', (variant.discountPercent ?? 0) > 0);
      }
      if (discountTag instanceof HTMLElement) {
        const p = variant.discountPercent ?? 0;
        if (p > 0) {
          discountTag.textContent = `${p}% off`;
          discountTag.style.display = '';
        } else {
          discountTag.style.display = 'none';
        }
      }
    };

    const syncHeadings = () => {
      optionRows.forEach((row) => {
        const el = card.querySelector(`[data-heading-for="${row.id}"]`);
        if (el) el.textContent = selected[row.id]?.trim() || '—';
      });
    };

    const update = () => {
      optionRows.forEach((row: OptionRow) => {
        const rowBtns = card.querySelectorAll(`.pc__variant-hit[data-option-id="${row.id}"]`);
        rowBtns.forEach((btn) => {
          if (!(btn instanceof HTMLButtonElement)) return;
          const value = btn.getAttribute('data-option-value') || '';
          const selectedForCheck = { ...selected, [row.id]: value };
          const hasAnyVariant = variants.some((v) => variantMatches(v, selectedForCheck));
          btn.classList.toggle('is-selected', selected[row.id] === value);
          btn.classList.toggle('is-unavailable', !hasAnyVariant);
          btn.setAttribute('aria-checked', selected[row.id] === value ? 'true' : 'false');
        });
      });
      const exactForSelection = findExactVariantForSelection(selected);
      const chosen =
        exactForSelection ||
        getFirstAvailable(variants, selected) ||
        variants.find((v) => variantMatches(v, selected)) ||
        variants.find((v) => !variantIsOutOfStock(v)) ||
        variants[0];
      syncHeadings();
      if (chosen) setFromVariant(chosen);
    };

    stockNotifyBtn?.addEventListener('click', async () => {
      const email = stockNotifyEmail?.value.trim() || '';
      if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        if (stockNotifyFeedback) {
          stockNotifyFeedback.hidden = false;
          stockNotifyFeedback.textContent = 'E-mail inválido.';
          stockNotifyFeedback.classList.add('is-err');
          stockNotifyFeedback.classList.remove('is-ok');
        }
        return;
      }
      const variantId = quickBtn.dataset.variantId || '';
      if (!variantId) return;
      const apiUrl = (window as unknown as { __API_URL__?: string }).__API_URL__ || '/api/stock-notify';
      stockNotifyBtn.disabled = true;
      try {
        const res = await fetch(apiUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email,
            variant_id: variantId,
            variant_title: quickBtn.dataset.variantTitle || undefined,
            product_id: productId || undefined,
            product_handle: productHandle || undefined,
            product_title: productTitle || undefined,
          }),
        });
        if (!res.ok) throw new Error('fail');
        if (stockNotifyFeedback) {
          stockNotifyFeedback.hidden = false;
          stockNotifyFeedback.textContent = stockNotifyMsgs.ok || 'OK';
          stockNotifyFeedback.classList.add('is-ok');
          stockNotifyFeedback.classList.remove('is-err');
        }
      } catch {
        if (stockNotifyFeedback) {
          stockNotifyFeedback.hidden = false;
          stockNotifyFeedback.textContent = stockNotifyMsgs.err || 'Erro';
          stockNotifyFeedback.classList.add('is-err');
          stockNotifyFeedback.classList.remove('is-ok');
        }
      } finally {
        stockNotifyBtn.disabled = false;
      }
    });

    card.addEventListener('click', (ev) => {
      const t = ev.target;
      if (!(t instanceof Element)) return;
      const btn = t.closest('.pc__variant-hit');
      if (!(btn instanceof HTMLButtonElement)) return;
      if (btn.classList.contains('is-unavailable')) return;
      const optionId = btn.dataset.optionId || '';
      const optionValue = btn.dataset.optionValue || '';
      if (!optionId || !optionValue) return;
      selected[optionId] = optionValue;
      update();
    });
    update();
  }

  const allCards = document.querySelectorAll('.pc');
  allCards.forEach((card) => initCard(card));

  if ('MutationObserver' in window) {
    const mo = new MutationObserver((mutations) => {
      mutations.forEach((m) => {
        m.addedNodes.forEach((n) => {
          if (!(n instanceof HTMLElement)) return;
          if (n.matches?.('.pc')) initCard(n);
          n.querySelectorAll?.('.pc').forEach((c) => initCard(c));
        });
      });
    });
    mo.observe(document.body, { childList: true, subtree: true });
  }

  document.addEventListener('click', (e) => {
    const target = e.target;
    if (!(target instanceof Element)) return;
    const btn = target.closest('.pc__quick-add');
    if (!btn) return;
    e.preventDefault();
    if (btn instanceof HTMLButtonElement && btn.disabled) return;
    const variantId = btn.getAttribute('data-variant-id');
    const title = btn.getAttribute('data-title') || '';
    const price = btn.getAttribute('data-price') || '0';
    const thumbnail = btn.getAttribute('data-thumbnail') || '';
    const variantTitle = btn.getAttribute('data-variant-title') || '';
    const maxQtyRaw = Number(btn.getAttribute('data-max-qty') || '');
    const maxQuantity = Number.isFinite(maxQtyRaw) && maxQtyRaw > 0 ? Math.floor(maxQtyRaw) : undefined;
    if (!variantId) return;
    addItem({
      variantId,
      title,
      variantTitle,
      price: Number(price),
      thumbnail,
      quantity: 1,
      maxQuantity,
    });
    document.getElementById('side-cart')?.classList.add('is-open');
    document.getElementById('side-cart-backdrop')?.classList.add('is-active');
    document.body.style.overflow = 'hidden';
  });
}
