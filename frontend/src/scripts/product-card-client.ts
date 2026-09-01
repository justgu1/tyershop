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
  slideUrls?: string[];
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
    const quickBtn = card.querySelector('.pc__quick-add');
    if (!(quickBtn instanceof HTMLButtonElement)) return;
    const stockReliable = card.dataset.stockReliable === 'true';
    const variants = decodeJson<VariantMap[]>(card.dataset.variants || '') || [];
    const optionRows = decodeJson<OptionRow[]>(card.dataset.optionRows || '') || [];
    if (!Array.isArray(variants) || variants.length === 0 || !Array.isArray(optionRows)) return;

    const primaryImage = card.querySelector('.pc__img--primary');
    const imgWrap = card.querySelector('.pc__img-wrap');
    const priceCurrent = card.querySelector('.pc__price-current');
    const priceStriked = card.querySelector('.pc__price-striked');
    const priceBox = card.querySelector('.pc__price-box');
    const discountTag = card.querySelector('.pc__tag--discount');
    const soldoutTag = card.querySelector('[data-pc-soldout-tag]');
    const categoryTags = card.querySelector('[data-pc-category-tags]');
    const bottomRow = card.querySelector('.pc__bottom');
    const stockNotifyWrap = card.querySelector('.pc__stock-notify');
    const stockNotifyEmail = card.querySelector('.pc__stock-notify__input') as HTMLInputElement | null;
    const stockNotifyBtn = card.querySelector('.pc__stock-notify__btn') as HTMLButtonElement | null;
    const stockNotifyFeedback = card.querySelector('.pc__stock-notify__feedback');
    const galleryPrevBtn = card.querySelector('[data-gallery-prev]');
    const galleryNextBtn = card.querySelector('[data-gallery-next]');
    const galleryDots = card.querySelector('[data-gallery-dots]');
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

    let galleryUrls: string[] = [];
    let galleryIndex = 0;
    /* true = o slide atual veio só do preview de hover, não de clique na seta
       — aí sim volta pro slide 1 quando o mouse sai. Depois de uma navegação
       manual (seta), o hover pra de mexer no slide. */
    let hoverPreviewActive = false;
    let manualNavUsed = false;
    let fadeRaf: number | null = null;

    /* O `src` troca na hora, sempre — nada de delay/cancelamento aqui, senão
       hover muito rapido (varios enter/leave antes do fade acabar) cancela a
       troca pra sempre e a imagem fica em branco. O fade e' so cosmetico: um
       toggle de opacidade que roda em paralelo, nunca segura a troca real. */
    const renderGallerySlide = () => {
      const url = galleryUrls[galleryIndex] || fallbackGallery[0] || PLACEHOLDER;
      if (primaryImage instanceof HTMLImageElement) {
        const img = primaryImage;
        if (img.getAttribute('src') !== url) {
          img.src = url;
          if (fadeRaf != null) cancelAnimationFrame(fadeRaf);
          img.classList.add('is-swapping');
          fadeRaf = requestAnimationFrame(() => {
            fadeRaf = requestAnimationFrame(() => {
              img.classList.remove('is-swapping');
              fadeRaf = null;
            });
          });
        }
      }
      quickBtn.dataset.thumbnail = url;
      if (galleryDots instanceof HTMLElement) {
        galleryDots.querySelectorAll('span').forEach((dot, i) => {
          dot.classList.toggle('is-active', i === galleryIndex);
        });
      }
    };

    /* Galeria completa só entra no card (data-variants) como texto — nenhuma
       imagem extra é baixada até a seta (ou o hover) trocar o `src`. */
    const setupGallery = (urls: string[]) => {
      galleryUrls = urls.length ? urls : fallbackGallery;
      galleryIndex = 0;
      manualNavUsed = false;
      hoverPreviewActive = false;
      const multi = galleryUrls.length > 1;
      if (galleryPrevBtn instanceof HTMLElement) galleryPrevBtn.hidden = !multi;
      if (galleryNextBtn instanceof HTMLElement) galleryNextBtn.hidden = !multi;
      if (galleryDots instanceof HTMLElement) {
        galleryDots.hidden = !multi;
        galleryDots.innerHTML = multi
          ? galleryUrls.map((_, i) => `<span class="${i === 0 ? 'is-active' : ''}"></span>`).join('')
          : '';
      }
      renderGallerySlide();
    };

    galleryPrevBtn?.addEventListener('click', (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      if (galleryUrls.length < 2) return;
      manualNavUsed = true;
      hoverPreviewActive = false;
      galleryIndex = (galleryIndex - 1 + galleryUrls.length) % galleryUrls.length;
      renderGallerySlide();
    });
    galleryNextBtn?.addEventListener('click', (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      if (galleryUrls.length < 2) return;
      manualNavUsed = true;
      hoverPreviewActive = false;
      galleryIndex = (galleryIndex + 1) % galleryUrls.length;
      renderGallerySlide();
    });

    /* Preview no hover: mostra a 2ª foto (não empilha por cima — troca o
       mesmo <img> que as setas usam), some quando o mouse sai. Some só se a
       pessoa não tiver navegado manualmente pelas setas nesse meio tempo. */
    if (imgWrap instanceof HTMLElement) {
      imgWrap.addEventListener('mouseenter', () => {
        if (galleryUrls.length < 2 || manualNavUsed) return;
        galleryIndex = 1;
        hoverPreviewActive = true;
        renderGallerySlide();
      });
      imgWrap.addEventListener('mouseleave', () => {
        if (!hoverPreviewActive) return;
        hoverPreviewActive = false;
        galleryIndex = 0;
        renderGallerySlide();
      });
    }

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
      if (soldoutTag instanceof HTMLElement) soldoutTag.hidden = !oos;
      if (categoryTags instanceof HTMLElement) categoryTags.hidden = oos;
      if (stockNotifyWrap instanceof HTMLElement) {
        const showNotify = oos && (!!productId.trim() || !!productHandle.trim());
        stockNotifyWrap.hidden = !showNotify;
        if (stockNotifyFeedback instanceof HTMLElement) {
          stockNotifyFeedback.hidden = true;
          stockNotifyFeedback.textContent = '';
          stockNotifyFeedback.classList.remove('is-ok', 'is-err');
        }
      }
      setupGallery(variant.slideUrls?.length ? variant.slideUrls : variant.images || []);
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
        if (p > 0 && !oos) {
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
          /* Combo esgotado continua selecionável (mostra o aviso "avisar-me"); só
             bloqueia quando a combinação nem existe. */
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
