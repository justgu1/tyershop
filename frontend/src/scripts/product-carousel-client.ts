/**
 * Inicialização do <ProductCarousel> — mesmo padrão de `product-card-client.ts`
 * (uma vez só por elemento via dataset flag, MutationObserver pega instâncias
 * inseridas depois, ex. scroll infinito da Loja).
 */
if (document.documentElement.dataset.carouselInitDone === 'true') {
  /* já carregado */
} else {
  document.documentElement.dataset.carouselInitDone = 'true';

  function initCarousel(section: Element) {
    if (!(section instanceof HTMLElement) || section.dataset.carouselReady === '1') return;
    section.dataset.carouselReady = '1';

    const viewport = section.querySelector('[data-carousel-viewport]');
    const track = section.querySelector('[data-carousel-track]');
    const controlbar = section.querySelector('[data-carousel-controlbar]');
    const prevBtn = section.querySelector('[data-carousel-prev]');
    const nextBtn = section.querySelector('[data-carousel-next]');
    const pager = section.querySelector('[data-carousel-pager]');
    const live = section.querySelector('[data-carousel-live]');
    if (
      !(viewport instanceof HTMLElement) ||
      !(track instanceof HTMLElement) ||
      !(controlbar instanceof HTMLElement) ||
      !(prevBtn instanceof HTMLButtonElement) ||
      !(nextBtn instanceof HTMLButtonElement) ||
      !(pager instanceof HTMLElement)
    ) {
      return;
    }

    const cells = Array.from(track.querySelectorAll(':scope > .product-carousel__cell'));
    if (cells.length === 0) return;

    let currentIndex = 0;

    const renderPager = () => {
      pager.innerHTML = '';
      cells.forEach((_, i) => {
        const b = document.createElement('button');
        b.type = 'button';
        b.setAttribute('role', 'tab');
        b.setAttribute('aria-label', `Ir para produto ${i + 1}`);
        b.setAttribute('aria-selected', i === currentIndex ? 'true' : 'false');
        b.className = i === currentIndex ? 'is-active' : '';
        b.textContent = String(i + 1);
        b.addEventListener('click', () => goTo(i));
        pager.appendChild(b);
      });
    };

    const updateNav = () => {
      prevBtn.disabled = currentIndex <= 0;
      nextBtn.disabled = currentIndex >= cells.length - 1;
      Array.from(pager.children).forEach((el, i) => {
        el.classList.toggle('is-active', i === currentIndex);
        el.setAttribute('aria-selected', i === currentIndex ? 'true' : 'false');
      });
      if (live instanceof HTMLElement) live.textContent = `Produto ${currentIndex + 1} de ${cells.length}`;
    };

    function goTo(i: number) {
      const clamped = Math.max(0, Math.min(i, cells.length - 1));
      const cell = cells[clamped];
      if (!(cell instanceof HTMLElement)) return;
      viewport!.scrollTo({ left: cell.offsetLeft - track!.offsetLeft, behavior: 'smooth' });
    }

    prevBtn.addEventListener('click', () => goTo(currentIndex - 1));
    nextBtn.addEventListener('click', () => goTo(currentIndex + 1));

    /* Posição ativa por scroll real (arrasto manual, momentum, teclado no
       viewport com tabindex) — não só clique nas setas/paginação. */
    if ('IntersectionObserver' in window) {
      const io = new IntersectionObserver(
        (entries) => {
          const visible = entries.filter((e) => e.isIntersecting).sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
          if (!visible) return;
          const idx = cells.indexOf(visible.target as HTMLElement);
          if (idx === -1 || idx === currentIndex) return;
          currentIndex = idx;
          updateNav();
        },
        { root: viewport, threshold: 0.6 }
      );
      cells.forEach((c) => io.observe(c));
    }

    /* Cabe tudo sem precisar de scroll (ex.: Home com só 4 produtos numa
       tela larga) — barra de controle inteira some, não faz sentido setas
       e paginação pra nada. Recalcula no resize (breakpoints mudam a
       largura de cada card). */
    const shouldCenter = section.dataset.align === 'center';
    const syncControlbarVisibility = () => {
      // Mede sempre a partir da largura natural (width:max-content) —
      // `is-centered` troca pra width:100%, que faria o scrollWidth
      // reportar a largura do viewport em vez da do conteúdo de verdade,
      // dando um resultado errado numa recheck (resize) subsequente.
      track.classList.remove('is-centered');
      const scrollable = track.scrollWidth > viewport.clientWidth + 1;
      controlbar.hidden = !scrollable;
      // Só centraliza quando o carousel pediu align="center" (Home) — Loja
      // e PDP (align="left", padrão) ficam grudados na esquerda mesmo
      // quando cabe tudo, por pedido explícito.
      track.classList.toggle('is-centered', shouldCenter && !scrollable);
    };
    syncControlbarVisibility();
    if ('ResizeObserver' in window) {
      const ro = new ResizeObserver(() => syncControlbarVisibility());
      ro.observe(viewport);
    } else {
      window.addEventListener('resize', syncControlbarVisibility);
    }

    renderPager();
    updateNav();
  }

  document.querySelectorAll('[data-carousel]').forEach((el) => initCarousel(el));

  if ('MutationObserver' in window) {
    const mo = new MutationObserver((mutations) => {
      mutations.forEach((m) => {
        m.addedNodes.forEach((n) => {
          if (!(n instanceof HTMLElement)) return;
          if (n.matches?.('[data-carousel]')) initCarousel(n);
          n.querySelectorAll?.('[data-carousel]').forEach((c) => initCarousel(c));
        });
      });
    });
    mo.observe(document.body, { childList: true, subtree: true });
  }
}
