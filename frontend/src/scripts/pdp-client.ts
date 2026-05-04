/**
 * Cliente PDP: variantes, galeria, carrinho, sticky. Módulo único (evita TS/`OptionRow` no HTML).
 */
import { addItem, getCart, hasOutOfStockItems, CART_MAX_WHEN_UNKNOWN } from '../lib/cart';
import { createMedusaCartFromLocalCart } from '../lib/medusa-checkout-cart';

type OptionRow = { id: string; title: string; values: string[] };

type VariantMap = {
  id: string;
  title: string;
  price: number;
  soldOut: boolean;
  maxQty?: number | null;
  options: Record<string, string>;
  images?: string[];
  slideUrls?: string[];
  priceDisplay?: string;
  originalDisplay?: string | null;
  discountPercent?: number;
  allowBackorder?: boolean;
};

type StockMsgs = {
  out: string;
  backorder: string;
  unverified: string;
  available: string;
  units: string;
};

const root = document.querySelector('[data-pdp-root]') as HTMLElement | null;
if (root) {
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function decodeJson<T>(value: string): T | null {
    try {
      return JSON.parse(decodeURIComponent(value)) as T;
    } catch {
      return null;
    }
  }

  const variants = decodeJson<VariantMap[]>(root.dataset.variants || '') || [];
  const optionRows = decodeJson<OptionRow[]>(root.dataset.optionRows || '') || [];
  let stockMsgs: StockMsgs = {
    out: '',
    backorder: '',
    unverified: '',
    available: '',
    units: '',
  };
  try {
    stockMsgs = { ...stockMsgs, ...JSON.parse(root.dataset.stockMsgs || '{}') };
  } catch {
    /* ignore */
  }
  let stockNotifyMsgs = { ok: '', err: '' };
  try {
    stockNotifyMsgs = { ...stockNotifyMsgs, ...JSON.parse(root.dataset.stockNotifyMsgs || '{}') };
  } catch {
    /* ignore */
  }
  const stockReliableFlag = root.dataset.stockReliable === 'true';

  const rail = document.getElementById('pdp-thumbs-rail');
  const mainImg = document.getElementById('pdp-main-img') as HTMLImageElement | null;
  const mainImgWrap = document.getElementById('pdp-main-img-wrap');
  const lightbox = document.getElementById('pdp-lightbox') as HTMLDialogElement | null;
  const lightboxImg = document.getElementById('pdp-lightbox-img') as HTMLImageElement | null;
  const lightboxCounter = document.getElementById('pdp-lightbox-counter');
  const lightboxThumbs = document.getElementById('pdp-lightbox-thumbs');
  const lbPrev = document.getElementById('pdp-lightbox-prev');
  const lbNext = document.getElementById('pdp-lightbox-next');
  const prevBtn = document.getElementById('pdp-carousel-prev');
  const nextBtn = document.getElementById('pdp-carousel-next');
  const atcBtn = document.getElementById('pdp-atc') as HTMLButtonElement | null;
  const buyNowBtn = document.getElementById('pdp-buy-now') as HTMLButtonElement | null;
  const qtyInput = document.getElementById('pdp-qty-input') as HTMLInputElement | null;
  const qtyDec = document.getElementById('pdp-qty-dec');
  const qtyInc = document.getElementById('pdp-qty-inc');
  const priceCurrent = document.getElementById('pdp-price-current');
  const priceOriginal = document.getElementById('pdp-price-original');
  const mainDiscount = document.getElementById('pdp-main-discount');
  const variationValueEl = document.getElementById('pdp-variation-value');
  const stockLine = document.getElementById('pdp-stock-line');
  const stockNotifyWrap = document.getElementById('pdp-stock-notify');
  const stockNotifyEmail = document.getElementById('pdp-stock-notify-email') as HTMLInputElement | null;
  const stockNotifyBtn = document.getElementById('pdp-stock-notify-submit') as HTMLButtonElement | null;
  const stockNotifyFeedback = document.getElementById('pdp-stock-notify-feedback');
  const cepInput = document.getElementById('pdp-cep-input') as HTMLInputElement | null;
  const cepSticky = document.getElementById('pdp-cep-input-sticky') as HTMLInputElement | null;
  const cepHint = document.getElementById('pdp-cep-hint');
  const stickyBar = document.getElementById('pdp-sticky-bar') as HTMLElement | null;
  const stickyPriceCurrent = document.getElementById('pdp-sticky-price-current');
  const stickyPriceOriginal = document.getElementById('pdp-sticky-price-original') as HTMLElement | null;
  const stickyBuy = document.getElementById('pdp-sticky-buy-now') as HTMLButtonElement | null;
  const stickyAtc = document.getElementById('pdp-sticky-atc') as HTMLButtonElement | null;
  const stickyBackTop = document.getElementById('pdp-sticky-back-top');
  const stickyMenu = document.getElementById('pdp-sticky-menu') as HTMLButtonElement | null;
  const stickyDrawer = document.getElementById('pdp-sticky-drawer') as HTMLElement | null;

  let slides: string[] = [];
  let slideIndex = 0;
  let autoplayTimer: ReturnType<typeof setInterval> | null = null;
  let autoplayPaused = false;
  let pdpSlidesReady = false;

  const variantMatches = (variant: VariantMap, selected: Record<string, string>) =>
    Object.entries(selected).every(([k, v]) => !v || variant.options?.[k] === v);

  const selectionComplete = (sel: Record<string, string>) =>
    optionRows.length > 0 && optionRows.every((row) => String(sel[row.id] ?? '').trim().length > 0);

  const findExactVariantForSelection = (sel: Record<string, string>): VariantMap | null => {
    if (!selectionComplete(sel)) return null;
    return (
      variants.find((v) =>
        optionRows.every((row) => String(v.options?.[row.id] ?? '').trim() === String(sel[row.id] ?? '').trim())
      ) || null
    );
  };

  function variantIsOutOfStock(v: VariantMap) {
    if (v.allowBackorder) return false;
    if (v.soldOut) return true;
    if (stockReliableFlag) {
      const mq = v.maxQty;
      return mq != null && Number.isFinite(Number(mq)) && Number(mq) <= 0;
    }
    return false;
  }

  const getFirstAvailable = (selected: Record<string, string>) =>
    variants.find((v) => variantMatches(v, selected) && !variantIsOutOfStock(v)) || null;

  const allowedOptionIds = new Set(optionRows.map((r) => r.id));
  const selected: Record<string, string> = {};
  const currentId = atcBtn?.dataset.variantId || '';
  const current = variants.find((v) => v.id === currentId) || getFirstAvailable({}) || variants[0];
  if (current?.options) {
    Object.entries(current.options).forEach(([k, v]) => {
      if (allowedOptionIds.has(k)) selected[k] = String(v || '');
    });
  }

  function scrollThumbToTop(idx: number) {
    if (!rail) return;
    const btn = rail.children[idx] as HTMLElement | undefined;
    if (!btn) return;
    const isMobile = window.matchMedia('(max-width: 1024px)').matches;
    const behavior = reducedMotion ? 'auto' : 'smooth';
    if (isMobile) {
      /* Não usar scrollIntoView: o browser rola o documento inteiro e “puxa” a vista para a galeria / “Neste drop”. */
      const maxL = Math.max(0, rail.scrollWidth - rail.clientWidth);
      const targetL = btn.offsetLeft - (rail.clientWidth - btn.offsetWidth) / 2;
      rail.scrollTo({ left: Math.max(0, Math.min(targetL, maxL)), top: 0, behavior });
    } else {
      const maxT = Math.max(0, rail.scrollHeight - rail.clientHeight);
      const targetT = btn.offsetTop - (rail.clientHeight - btn.offsetHeight) / 2;
      rail.scrollTo({ top: Math.max(0, Math.min(targetT, maxT)), left: 0, behavior });
    }
  }

  function renderThumbs(urls: string[]) {
    if (!rail) return;
    rail.innerHTML = '';
    urls.forEach((url, i) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'pdp-hero__thumb' + (i === slideIndex ? ' is-active' : '');
      b.dataset.slideIdx = String(i);
      b.setAttribute('role', 'tab');
      b.setAttribute('aria-selected', i === slideIndex ? 'true' : 'false');
      b.setAttribute('aria-label', `Slide ${i + 1}`);
      const im = document.createElement('img');
      im.src = url;
      im.alt = '';
      im.width = 64;
      im.height = 80;
      im.loading = i === 0 ? 'eager' : 'lazy';
      b.appendChild(im);
      b.addEventListener('click', () => goToSlide(i));
      rail.appendChild(b);
    });
  }

  function updateMainImage(animate = true) {
    if (!mainImg || !slides.length) return;
    const u = slides[Math.min(slideIndex, slides.length - 1)] || '/logo.webp';
    if (reducedMotion || !animate) {
      mainImg.src = u;
      mainImg.style.opacity = '1';
      return;
    }
    mainImg.style.opacity = '0';
    window.setTimeout(() => {
      mainImg.src = u;
      const show = () => {
        mainImg.style.opacity = '1';
      };
      const dec = (mainImg as HTMLImageElement & { decode?: () => Promise<void> }).decode;
      if (typeof dec === 'function') dec.call(mainImg).then(show).catch(show);
      else if (mainImg.complete) requestAnimationFrame(show);
      else mainImg.addEventListener('load', show, { once: true });
    }, 140);
  }

  function syncThumbActive() {
    if (!rail) return;
    Array.from(rail.querySelectorAll('.pdp-hero__thumb')).forEach((el, i) => {
      el.classList.toggle('is-active', i === slideIndex);
      el.setAttribute('aria-selected', i === slideIndex ? 'true' : 'false');
    });
    scrollThumbToTop(slideIndex);
  }

  function renderLightboxThumbs(urls: string[]) {
    if (!lightboxThumbs) return;
    lightboxThumbs.innerHTML = '';
    urls.forEach((url, i) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'pdp-hero__thumb' + (i === slideIndex ? ' is-active' : '');
      b.dataset.slideIdx = String(i);
      b.setAttribute('role', 'tab');
      b.setAttribute('aria-selected', i === slideIndex ? 'true' : 'false');
      b.setAttribute('aria-label', `Slide ${i + 1}`);
      const im = document.createElement('img');
      im.src = url;
      im.alt = '';
      im.width = 56;
      im.height = 70;
      im.loading = i === 0 ? 'eager' : 'lazy';
      im.decoding = 'async';
      im.style.objectFit = 'cover';
      b.appendChild(im);
      b.addEventListener('click', () => {
        autoplayPaused = true;
        goToSlide(i);
      });
      lightboxThumbs.appendChild(b);
    });
  }

  function syncLightboxThumbsActive() {
    if (!lightboxThumbs) return;
    Array.from(lightboxThumbs.querySelectorAll('.pdp-hero__thumb')).forEach((el, i) => {
      el.classList.toggle('is-active', i === slideIndex);
      el.setAttribute('aria-selected', i === slideIndex ? 'true' : 'false');
    });
  }

  function fillLightboxImage() {
    if (!lightboxImg) return;
    const u = slides[Math.min(slideIndex, slides.length - 1)] || '/logo.webp';
    lightboxImg.src = u;
    lightboxImg.alt = mainImg?.alt || '';
    if (lightboxCounter) lightboxCounter.textContent = `${slideIndex + 1} / ${slides.length}`;
    renderLightboxThumbs(slides);
    syncLightboxThumbsActive();
  }

  function syncLightboxIfOpen() {
    if (!lightbox?.open) return;
    fillLightboxImage();
  }

  function refreshLightboxNavVisibility() {
    const hide = slides.length <= 1;
    lbPrev?.classList.toggle('is-hidden', hide);
    lbNext?.classList.toggle('is-hidden', hide);
  }

  function goToSlide(idx: number) {
    if (!slides.length) return;
    slideIndex = ((idx % slides.length) + slides.length) % slides.length;
    updateMainImage();
    syncThumbActive();
    syncLightboxIfOpen();
    if (lightbox?.open) syncLightboxThumbsActive();
  }

  function nextSlide() {
    goToSlide(slideIndex + 1);
  }

  function prevSlide() {
    goToSlide(slideIndex - 1);
  }

  function startAutoplay() {
    if (reducedMotion || slides.length <= 1) return;
    stopAutoplay();
    autoplayTimer = setInterval(() => {
      if (!autoplayPaused) nextSlide();
    }, 3000);
  }

  function stopAutoplay() {
    if (autoplayTimer) {
      clearInterval(autoplayTimer);
      autoplayTimer = null;
    }
  }

  function applySlides(urls: string[]) {
    const list = urls.length ? urls : ['/logo.webp'];
    slides = list;
    slideIndex = 0;
    renderThumbs(slides);
    updateMainImage(pdpSlidesReady);
    pdpSlidesReady = true;
    syncThumbActive();
    stopAutoplay();
    startAutoplay();
    refreshLightboxNavVisibility();
  }

  function updatePrice(variant: VariantMap) {
    if (priceCurrent) priceCurrent.textContent = variant.priceDisplay || '';
    if (stickyPriceCurrent) stickyPriceCurrent.textContent = variant.priceDisplay || '';
    if (priceOriginal) {
      if (variant.originalDisplay) {
        priceOriginal.textContent = variant.originalDisplay;
        priceOriginal.hidden = false;
      } else {
        priceOriginal.textContent = '';
        priceOriginal.hidden = true;
      }
    }
    if (stickyPriceOriginal) {
      if (variant.originalDisplay) {
        stickyPriceOriginal.textContent = variant.originalDisplay;
        stickyPriceOriginal.hidden = false;
      } else {
        stickyPriceOriginal.textContent = '';
        stickyPriceOriginal.hidden = true;
      }
    }
    if (mainDiscount) {
      const p = variant.discountPercent ?? 0;
      if (p > 0) {
        mainDiscount.textContent = `−${p}%`;
        mainDiscount.hidden = false;
      } else {
        mainDiscount.hidden = true;
      }
    }
  }

  function updateVariationLabel(variant: VariantMap) {
    if (!variationValueEl) return;
    const parts = optionRows
      .map((row) => String(selected[row.id] ?? variant.options?.[row.id] ?? '').trim())
      .filter(Boolean);
    variationValueEl.textContent = parts.join(' · ') || variant.title || '';
  }

  function updateStockLine(variant: VariantMap) {
    if (!stockLine) return;
    if (variantIsOutOfStock(variant)) {
      stockLine.textContent = stockMsgs.out;
      return;
    }
    if (variant.allowBackorder) {
      stockLine.textContent = stockMsgs.backorder;
      return;
    }
    if (!stockReliableFlag) {
      stockLine.textContent = stockMsgs.unverified;
      return;
    }
    const n = variant.maxQty;
    if (n != null && Number(n) > 0) {
      stockLine.textContent = stockMsgs.units.replace('{count}', String(Math.floor(Number(n))));
      return;
    }
    stockLine.textContent = stockMsgs.available;
  }

  function updateStockNotify(variant: VariantMap) {
    if (!stockNotifyWrap) return;
    const pid = root.dataset.productId || '';
    const ph = root.dataset.productHandle || '';
    const show = variantIsOutOfStock(variant) && (!!pid || !!ph);
    stockNotifyWrap.hidden = !show;
    if (stockNotifyFeedback) {
      stockNotifyFeedback.hidden = true;
      stockNotifyFeedback.textContent = '';
      stockNotifyFeedback.classList.remove('is-ok', 'is-err');
    }
  }

  stockNotifyBtn?.addEventListener('click', async () => {
    const email = stockNotifyEmail?.value.trim() || '';
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      if (stockNotifyFeedback) {
        stockNotifyFeedback.hidden = false;
        stockNotifyFeedback.textContent = stockNotifyMsgs.err || 'E-mail inválido.';
        stockNotifyFeedback.classList.add('is-err');
        stockNotifyFeedback.classList.remove('is-ok');
      }
      return;
    }
    const variantId = atcBtn?.dataset.variantId || '';
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
          variant_title: atcBtn?.dataset.variantTitle || undefined,
          product_id: root.dataset.productId || undefined,
          product_handle: root.dataset.productHandle || undefined,
          product_title: root.dataset.productTitle || undefined,
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

  function setFromVariant(variant: VariantMap | null) {
    if (!variant || !atcBtn) return;
    atcBtn.dataset.variantId = variant.id || '';
    atcBtn.dataset.price = String(variant.price || 0);
    atcBtn.dataset.maxQty =
      variant.maxQty != null && Number.isFinite(Number(variant.maxQty)) && Number(variant.maxQty) >= 0
        ? String(Math.floor(Number(variant.maxQty)))
        : '';
    const optionTitle = optionRows
      .map((row) => {
        const val = String(selected[row.id] ?? variant.options?.[row.id] ?? '').trim();
        if (!val) return '';
        return `${row.title}: ${val}`;
      })
      .filter((s) => s.length > 0)
      .join(' | ');
    atcBtn.dataset.variantTitle = optionTitle || variant.title || '';
    const urls = variant.slideUrls?.length ? variant.slideUrls : variant.images || [];
    applySlides(urls);
    atcBtn.dataset.thumbnail = urls[0] || '';
    updatePrice(variant);
    updateVariationLabel(variant);
    updateStockLine(variant);
    updateStockNotify(variant);
    const oos = variantIsOutOfStock(variant);
    root.classList.toggle('pdp-root--oos-variant', oos);
    stickyBar?.classList.toggle('pdp-sticky-bar--oos', oos);
    atcBtn.disabled = oos;
    if (buyNowBtn) buyNowBtn.disabled = oos;
    if (stickyBuy) stickyBuy.disabled = oos;
    if (stickyAtc) stickyAtc.disabled = oos;
    if (qtyInput) qtyInput.disabled = oos;
    if (qtyDec instanceof HTMLButtonElement) qtyDec.disabled = oos;
    if (qtyInc instanceof HTMLButtonElement) qtyInc.disabled = oos;
    if (cepInput) cepInput.disabled = oos;
    if (cepSticky) cepSticky.disabled = oos;
  }

  function update() {
    optionRows.forEach((row) => {
      const rowBtns = root!.querySelectorAll(`.pdp-variant-btn[data-option-id="${row.id}"]`);
      rowBtns.forEach((btn) => {
        const el = btn as HTMLButtonElement;
        const value = el.getAttribute('data-option-value') || '';
        const selectedForCheck = { ...selected, [row.id]: value };
        const hasAnyVariant = variants.some((v) => variantMatches(v, selectedForCheck));
        el.classList.toggle('is-selected', selected[row.id] === value);
        el.classList.toggle('is-unavailable', !hasAnyVariant);
        el.setAttribute('aria-checked', selected[row.id] === value ? 'true' : 'false');
      });
    });
    const exactForSelection = findExactVariantForSelection(selected);
    const chosen =
      exactForSelection ||
      getFirstAvailable(selected) ||
      variants.find((v) => variantMatches(v, selected)) ||
      variants.find((v) => !variantIsOutOfStock(v)) ||
      variants[0];
    if (chosen) setFromVariant(chosen);
  }

  root.addEventListener('click', (ev) => {
    const t = ev.target;
    if (!(t instanceof Element)) return;
    const btn = t.closest('.pdp-variant-btn') as HTMLButtonElement | null;
    if (btn && root.contains(btn)) {
      if (btn.classList.contains('is-unavailable')) return;
      const optionId = btn.dataset.optionId || '';
      const optionValue = btn.dataset.optionValue || '';
      if (!optionId || !optionValue) return;
      selected[optionId] = optionValue;
      update();
      return;
    }
  });

  prevBtn?.addEventListener('click', () => {
    autoplayPaused = true;
    prevSlide();
  });
  nextBtn?.addEventListener('click', () => {
    autoplayPaused = true;
    nextSlide();
  });

  root.addEventListener('mouseenter', () => {
    autoplayPaused = true;
  });
  root.addEventListener('mouseleave', () => {
    autoplayPaused = false;
  });
  root.addEventListener('focusin', () => {
    autoplayPaused = true;
  });
  root.addEventListener('focusout', (e) => {
    if (!root.contains(e.relatedTarget as Node)) autoplayPaused = false;
  });

  function resolveMaxQty(): number | null {
    const raw = Number(atcBtn?.dataset.maxQty || '');
    return Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : null;
  }
  function clampQty(v: number) {
    const max = resolveMaxQty() ?? CART_MAX_WHEN_UNKNOWN;
    if (!Number.isFinite(v) || v < 1) return 1;
    if (v > max) return max;
    return Math.floor(v);
  }
  function syncQty(next: number) {
    const safe = clampQty(next);
    if (qtyInput) qtyInput.value = String(safe);
    if (atcBtn) atcBtn.dataset.qty = String(safe);
  }
  syncQty(Number(qtyInput?.value || 1));
  qtyDec?.addEventListener('click', () => syncQty(Number(qtyInput?.value || 1) - 1));
  qtyInc?.addEventListener('click', () => syncQty(Number(qtyInput?.value || 1) + 1));
  qtyInput?.addEventListener('input', () => syncQty(Number(qtyInput.value || 1)));

  function addCurrentToCart(options?: { openSideCart?: boolean }) {
    const openSide = options?.openSideCart !== false;
    if (!atcBtn) return Promise.resolve();
    const { variantId, title, price, thumbnail, variantTitle, maxQty, qty } = atcBtn.dataset;
    if (!variantId || atcBtn.disabled) return Promise.resolve();
    const parsedMax = Number(maxQty || '');
    const maxQuantity = Number.isFinite(parsedMax) && parsedMax > 0 ? Math.floor(parsedMax) : undefined;
    const selectedQty = Math.max(1, Number(qty || qtyInput?.value || 1));
    return Promise.resolve().then(() => {
      addItem({
        variantId,
        title: title ?? '',
        variantTitle: variantTitle ?? '',
        price: Number(price ?? 0),
        thumbnail: thumbnail ?? '',
        quantity: selectedQty,
        maxQuantity,
      });
      if (openSide) {
        document.getElementById('side-cart')?.classList.add('is-open');
        document.getElementById('side-cart-backdrop')?.classList.add('is-active');
        document.body.style.overflow = 'hidden';
      }
    });
  }

  atcBtn?.addEventListener('click', () => {
    void addCurrentToCart({ openSideCart: true });
  });

  buyNowBtn?.addEventListener('click', async () => {
    if (!atcBtn || atcBtn.disabled) return;
    await addCurrentToCart({ openSideCart: false });
    const items = getCart();
    if (!items.length) return;
    if (hasOutOfStockItems(items)) return;
    if (import.meta.env.PUBLIC_MERCADOPAGO_PUBLIC_KEY) {
      window.location.href = '/checkout';
      return;
    }
    const apiUrl = (window as unknown as { __API_URL__?: string }).__API_URL__ || '/api/create-checkout';
    const btn = buyNowBtn;
    const orig = btn.textContent;
    btn.disabled = true;
    btn.textContent = '…';
    try {
      const cartId = await createMedusaCartFromLocalCart();
      const res = await fetch(apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cart_id: cartId }),
      });
      const data = await res.json();
      if (data.init_point) window.location.href = data.init_point;
      else throw new Error('No init_point');
    } catch {
      btn.disabled = false;
      btn.textContent = orig ?? '';
    }
  });

  function formatCep(v: string) {
    const d = v.replace(/\D/g, '').slice(0, 8);
    if (d.length <= 5) return d;
    return `${d.slice(0, 5)}-${d.slice(5)}`;
  }
  function applyCepToInputs(next: string) {
    if (cepInput && cepInput.value !== next) cepInput.value = next;
    if (cepSticky && cepSticky.value !== next) cepSticky.value = next;
    if (cepHint) {
      const ok = next.replace(/\D/g, '').length === 8;
      cepHint.textContent = ok || next.length === 0 ? '' : 'CEP inválido';
    }
  }
  cepInput?.addEventListener('input', () => {
    const cur = cepInput.value;
    const next = formatCep(cur);
    applyCepToInputs(next);
  });
  cepSticky?.addEventListener('input', () => {
    const cur = cepSticky.value;
    const next = formatCep(cur);
    applyCepToInputs(next);
  });

  document.querySelectorAll('[data-modal-target]').forEach((el) => {
    el.addEventListener('click', () => {
      const id = el.getAttribute('data-modal-target');
      const dlg = id ? (document.getElementById(id) as HTMLDialogElement | null) : null;
      autoplayPaused = true;
      dlg?.showModal();
    });
  });
  document.querySelectorAll('[data-close-modal]').forEach((el) => {
    el.addEventListener('click', () => {
      const dlg = el.closest('dialog');
      dlg?.close();
      autoplayPaused = false;
    });
  });
  document.querySelectorAll('.pdp-dialog, .pdp-lightbox').forEach((dlg) => {
    dlg.addEventListener('close', () => {
      autoplayPaused = false;
    });
  });

  mainImgWrap?.addEventListener('click', () => {
    if (!lightbox || !slides.length) return;
    refreshLightboxNavVisibility();
    fillLightboxImage();
    autoplayPaused = true;
    lightbox.showModal();
  });

  lbPrev?.addEventListener('click', (e) => {
    e.stopPropagation();
    autoplayPaused = true;
    prevSlide();
  });
  lbNext?.addEventListener('click', (e) => {
    e.stopPropagation();
    autoplayPaused = true;
    nextSlide();
  });

  lightbox?.addEventListener('keydown', (e) => {
    if (!lightbox.open) return;
    if (e.key === 'ArrowLeft') {
      e.preventDefault();
      autoplayPaused = true;
      prevSlide();
    } else if (e.key === 'ArrowRight') {
      e.preventDefault();
      autoplayPaused = true;
      nextSlide();
    }
  });

  function ensureStickyVariantClone() {
    const mount = document.getElementById('pdp-sticky-variants-mount');
    const source = root!.querySelector('.pdp-variants');
    if (!mount || !source || mount.dataset.ready === '1') return;
    mount.innerHTML = '';
    mount.appendChild(source.cloneNode(true));
    mount.dataset.ready = '1';
  }

  const buyCardEl = root.querySelector('[data-pdp-buy-card]');
  if (buyCardEl instanceof HTMLElement && stickyBar) {
    const stickyIo = new IntersectionObserver(
      ([e]) => {
        const dock = !e.isIntersecting;
        stickyBar.classList.toggle('pdp-sticky-bar--docked', dock);
        stickyBar.classList.toggle('pdp-sticky-bar--offscreen', !dock);
        stickyBar.setAttribute('aria-hidden', dock ? 'false' : 'true');
        document.body.classList.toggle('pdp-sticky-bar-visible', dock);
        if (!dock) {
          document.body.classList.remove('pdp-sticky-bar-expanded');
          if (stickyDrawer) stickyDrawer.setAttribute('hidden', '');
          if (stickyMenu) {
            stickyMenu.setAttribute('aria-expanded', 'false');
            const lo = stickyMenu.dataset.labelOpen;
            if (lo) stickyMenu.setAttribute('aria-label', lo);
          }
        }
      },
      { threshold: 0, rootMargin: '0px 0px -32px 0px' }
    );
    stickyIo.observe(buyCardEl);
  }

  stickyMenu?.addEventListener('click', () => {
    if (!stickyDrawer || !stickyMenu) return;
    const willOpen = stickyDrawer.hasAttribute('hidden');
    if (willOpen) {
      stickyDrawer.removeAttribute('hidden');
      stickyMenu.setAttribute('aria-expanded', 'true');
      document.body.classList.add('pdp-sticky-bar-expanded');
    } else {
      stickyDrawer.setAttribute('hidden', '');
      stickyMenu.setAttribute('aria-expanded', 'false');
      document.body.classList.remove('pdp-sticky-bar-expanded');
    }
    const lo = stickyMenu.dataset.labelOpen;
    const lc = stickyMenu.dataset.labelClose;
    if (lo && lc) stickyMenu.setAttribute('aria-label', willOpen ? lc : lo);
  });

  document.querySelectorAll('[data-col-nav][data-target]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const id = btn.getAttribute('data-target');
      const dir = btn.getAttribute('data-col-nav') === 'prev' ? -1 : 1;
      const el = id ? document.getElementById(id) : null;
      if (!el) return;
      const step = Math.max(220, Math.floor(el.clientWidth * 0.75));
      el.scrollBy({ left: dir * step, behavior: 'smooth' });
    });
  });

  const newestVp = document.getElementById('pdp-newest-viewport');
  const newestPrev = document.getElementById('pdp-newest-nav-prev');
  const newestNext = document.getElementById('pdp-newest-nav-next');
  if (newestVp && newestPrev && newestNext) {
    const newestStep = () => {
      const track = newestVp.querySelector('.products-showcase');
      const first = track?.firstElementChild;
      if (first instanceof HTMLElement) {
        const gap = 16;
        return Math.round(first.getBoundingClientRect().width + gap);
      }
      return Math.round(newestVp.clientWidth * 0.92);
    };
    newestPrev.addEventListener('click', () => {
      newestVp.scrollBy({ left: -newestStep(), behavior: 'smooth' });
    });
    newestNext.addEventListener('click', () => {
      newestVp.scrollBy({ left: newestStep(), behavior: 'smooth' });
    });
  }

  stickyBuy?.addEventListener('click', () => buyNowBtn?.click());
  stickyAtc?.addEventListener('click', () => atcBtn?.click());
  stickyBackTop?.addEventListener('click', () => {
    window.scrollTo({ top: 0, behavior: reducedMotion ? 'auto' : 'smooth' });
  });

  update();
  ensureStickyVariantClone();
  update();
}
