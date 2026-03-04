document.addEventListener('DOMContentLoaded', async () => {
  const pathname = window.location.pathname;
  const isBook = pathname.startsWith('/book/');
  const slug = isBook
    ? pathname.split('/book/')[1]
    : pathname.split('/read/')[1];

  if (!slug) {
    window.location.href = '/';
    return;
  }

  const titleEl = document.getElementById('edition-title');
  const flipbookEl = document.getElementById('flipbook');
  const loadingOverlay = document.getElementById('loading-overlay');
  const loadingText = document.getElementById('loading-text');
  const progressFill = document.getElementById('progress-fill');
  const pageInfo = document.getElementById('page-info');
  const prevBtn = document.getElementById('prev-btn');
  const nextBtn = document.getElementById('next-btn');
  const fullscreenBtn = document.getElementById('fullscreen-btn');
  const zoomInBtn = document.getElementById('zoom-in-btn');
  const zoomOutBtn = document.getElementById('zoom-out-btn');
  const zoomResetBtn = document.getElementById('zoom-reset-btn');
  const zoomLevelEl = document.getElementById('zoom-level');
  const flipbookContainer = document.querySelector('.flipbook-container');

  // Fetch metadata from appropriate API
  const apiUrl = isBook ? `/api/books/${slug}` : `/api/editions/${slug}`;
  let edition;
  try {
    const res = await fetch(apiUrl);
    if (!res.ok) throw new Error('Not found');
    edition = await res.json();
    if (isBook) {
      titleEl.textContent = `${edition.title} - by ${edition.author}`;
      document.title = `${edition.title} - ICAN Original Books`;
    } else {
      titleEl.textContent = `${edition.title} - ${edition.season} ${edition.year}`;
      document.title = `${edition.title} - ICAN Herald`;
    }
  } catch (err) {
    loadingText.textContent = isBook ? 'Book not found.' : 'Edition not found.';
    progressFill.style.display = 'none';
    return;
  }

  // Back link: on localhost with book path, go to /?tab=books
  const mode = document.documentElement.getAttribute('data-site') || 'both';
  if (isBook && mode === 'both') {
    const backLink = document.querySelector('.back-link');
    if (backLink) backLink.href = '/?tab=books';
  }

  // Configure PDF.js worker
  pdfjsLib.GlobalWorkerOptions.workerSrc = '/lib/pdf.worker.min.js';

  // Load PDF
  loadingText.textContent = 'Loading PDF...';
  let pdf;
  try {
    pdf = await pdfjsLib.getDocument(`/uploads/${edition.filename}`).promise;
  } catch (err) {
    loadingText.textContent = 'Failed to load PDF.';
    console.error(err);
    return;
  }

  const totalPages = pdf.numPages;
  loadingText.textContent = `Rendering pages (0/${totalPages})...`;

  // Get first page to determine aspect ratio
  const firstPage = await pdf.getPage(1);
  const viewport = firstPage.getViewport({ scale: 1 });
  const pageAspect = viewport.width / viewport.height;

  // Calculate base page dimensions
  function isMobile() {
    return window.innerWidth < 768;
  }

  function getDisplayMode() {
    return (totalPages <= 2 || isMobile()) ? 'single' : 'double';
  }

  function calcPageSize() {
    const isFS = !!document.fullscreenElement;
    const mobile = isMobile();
    const widthPad = mobile ? 20 : 120;
    const heightPad = isFS ? 80 : (mobile ? 120 : 180);
    const containerWidth = (isFS ? window.innerWidth : flipbookEl.parentElement.clientWidth) - widthPad;
    const containerHeight = (isFS ? window.innerHeight : window.innerHeight) - heightPad;
    const mode = getDisplayMode();

    let h = (mobile || isFS) ? containerHeight : Math.min(containerHeight, 700);
    let w = h * pageAspect;

    if (mode === 'double') {
      if (w * 2 > containerWidth) {
        w = containerWidth / 2;
        h = w / pageAspect;
      }
    } else {
      if (w > containerWidth) {
        w = containerWidth;
        h = w / pageAspect;
      }
    }
    return { pageWidth: w, pageHeight: h };
  }

  let { pageWidth, pageHeight } = calcPageSize();

  // Render all pages to images
  const pageImages = [];
  for (let i = 1; i <= totalPages; i++) {
    const page = await pdf.getPage(i);
    const scale = (pageWidth * 2) / viewport.width; // Higher res for quality
    const scaledViewport = page.getViewport({ scale });

    const canvas = document.createElement('canvas');
    canvas.width = scaledViewport.width;
    canvas.height = scaledViewport.height;
    const ctx = canvas.getContext('2d');

    await page.render({ canvasContext: ctx, viewport: scaledViewport }).promise;
    pageImages.push(canvas.toDataURL('image/jpeg', 0.92));

    const pct = Math.round((i / totalPages) * 100);
    progressFill.style.width = pct + '%';
    loadingText.textContent = `Rendering pages (${i}/${totalPages})...`;
  }

  // Build flipbook pages
  pageImages.forEach((imgSrc, idx) => {
    const pageDiv = document.createElement('div');
    pageDiv.className = 'flipbook-page';
    const img = document.createElement('img');
    img.src = imgSrc;
    img.alt = `Page ${idx + 1}`;
    img.draggable = false;
    pageDiv.appendChild(img);
    flipbookEl.appendChild(pageDiv);
  });

  // === ZOOM STATE (declared early, used by initTurnJs) ===
  let zoomLevel = 1.0;
  const ZOOM_MIN = 0.5;
  const ZOOM_MAX = 3.0;
  const ZOOM_STEP = 0.25;
  let baseWidth = 0;
  let baseHeight = 0;

  // Initialize turn.js
  const $flipbook = $('#flipbook');
  let currentDisplayMode = getDisplayMode();

  function initTurnJs() {
    const mode = getDisplayMode();
    currentDisplayMode = mode;
    const { pageWidth: pw, pageHeight: ph } = calcPageSize();
    const turnWidth = mode === 'double' ? pw * 2 : pw;
    $flipbook.turn({
      width: turnWidth,
      height: ph,
      autoCenter: true,
      display: mode,
      acceleration: true,
      gradients: true,
      elevation: 50,
      cornerSize: isMobile() ? Math.max(pw, ph) : 100,
      when: {
        turned: function (event, page, view) {
          updatePageInfo(page);
        }
      }
    });
    // Update base dimensions for zoom
    baseWidth = turnWidth;
    baseHeight = ph;
    zoomLevel = 1.0;
  }

  initTurnJs();

  function updatePageInfo(page) {
    const total = $flipbook.turn('pages');
    pageInfo.textContent = `Page ${page} of ${total}`;
  }

  // Hide loading overlay
  loadingOverlay.style.display = 'none';
  updatePageInfo(1);

  // Navigation controls
  prevBtn.addEventListener('click', () => {
    $flipbook.turn('previous');
  });

  nextBtn.addEventListener('click', () => {
    $flipbook.turn('next');
  });

  // Mobile nav buttons (in controls bar)
  const mobilePrev = document.getElementById('mobile-prev-btn');
  const mobileNext = document.getElementById('mobile-next-btn');
  mobilePrev.addEventListener('click', () => {
    $flipbook.turn('previous');
  });
  mobileNext.addEventListener('click', () => {
    $flipbook.turn('next');
  });

  // Keyboard navigation
  document.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowLeft') {
      $flipbook.turn('previous');
    } else if (e.key === 'ArrowRight') {
      $flipbook.turn('next');
    }
  });

  // === ZOOM ===
  // Zoom works by resizing the turn.js flipbook directly (CSS transform breaks turn.js)
  function applyZoom() {
    const newW = Math.round(baseWidth * zoomLevel);
    const newH = Math.round(baseHeight * zoomLevel);
    $flipbook.turn('size', newW, newH);
    zoomLevelEl.textContent = Math.round(zoomLevel * 100) + '%';

    // Enable scroll when zoomed in past the viewport
    const readerMain = document.querySelector('.reader-main');
    if (zoomLevel > 1.05) {
      readerMain.classList.add('zoomed');
    } else {
      readerMain.classList.remove('zoomed');
    }
  }

  function zoomIn() {
    zoomLevel = Math.min(ZOOM_MAX, +(zoomLevel + ZOOM_STEP).toFixed(2));
    applyZoom();
  }

  function zoomOut() {
    zoomLevel = Math.max(ZOOM_MIN, +(zoomLevel - ZOOM_STEP).toFixed(2));
    applyZoom();
  }

  function zoomReset() {
    zoomLevel = 1.0;
    applyZoom();
  }

  zoomInBtn.addEventListener('click', zoomIn);
  zoomOutBtn.addEventListener('click', zoomOut);
  zoomResetBtn.addEventListener('click', zoomReset);

  // Ctrl+scroll to zoom
  document.querySelector('.reader-main').addEventListener('wheel', (e) => {
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      if (e.deltaY < 0) {
        zoomIn();
      } else {
        zoomOut();
      }
    }
  }, { passive: false });

  // Ctrl + / Ctrl - keyboard zoom
  document.addEventListener('keydown', (e) => {
    if (e.ctrlKey || e.metaKey) {
      if (e.key === '=' || e.key === '+') {
        e.preventDefault();
        zoomIn();
      } else if (e.key === '-') {
        e.preventDefault();
        zoomOut();
      } else if (e.key === '0') {
        e.preventDefault();
        zoomReset();
      }
    }
  });

  // === FULLSCREEN ===
  fullscreenBtn.addEventListener('click', () => {
    const main = document.querySelector('.reader-main');
    if (!document.fullscreenElement) {
      (main.requestFullscreen || main.webkitRequestFullscreen || main.msRequestFullscreen).call(main).catch(() => {});
    } else {
      (document.exitFullscreen || document.webkitExitFullscreen || document.msExitFullscreen).call(document);
    }
  });

  function handleFullscreenChange() {
    const isFS = !!document.fullscreenElement;
    // Update fullscreen button icon
    if (isFS) {
      fullscreenBtn.innerHTML = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M8 3v3a2 2 0 01-2 2H3m18 0h-3a2 2 0 01-2-2V3m0 18v-3a2 2 0 012-2h3M3 16h3a2 2 0 012 2v3"/></svg>';
      fullscreenBtn.title = 'Exit Fullscreen';
    } else {
      fullscreenBtn.innerHTML = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M8 3H5a2 2 0 00-2 2v3m18 0V5a2 2 0 00-2-2h-3m0 18h3a2 2 0 002-2v-3M3 16v3a2 2 0 002 2h3"/></svg>';
      fullscreenBtn.title = 'Toggle Fullscreen';
    }

    // Recalculate base dimensions and apply current zoom
    setTimeout(() => {
      const mode = getDisplayMode();
      const { pageWidth: pw, pageHeight: ph } = calcPageSize();
      baseWidth = mode === 'double' ? pw * 2 : pw;
      baseHeight = ph;
      applyZoom();
    }, 100);
  }

  document.addEventListener('fullscreenchange', handleFullscreenChange);
  document.addEventListener('webkitfullscreenchange', handleFullscreenChange);

  // Handle resize (including display mode switching)
  function handleResize() {
    const newMode = getDisplayMode();
    if (newMode !== currentDisplayMode) {
      // Display mode changed — must destroy and re-init turn.js
      const currentPage = $flipbook.turn('page');
      $flipbook.turn('destroy');
      initTurnJs();
      // Restore page position
      const maxPage = $flipbook.turn('pages');
      $flipbook.turn('page', Math.min(currentPage, maxPage));
      applyZoom();
    } else {
      const mode = getDisplayMode();
      const { pageWidth: pw, pageHeight: ph } = calcPageSize();
      baseWidth = mode === 'double' ? pw * 2 : pw;
      baseHeight = ph;
      applyZoom();
    }
  }

  let resizeTimeout;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimeout);
    resizeTimeout = setTimeout(handleResize, 200);
  });

  window.addEventListener('orientationchange', () => {
    clearTimeout(resizeTimeout);
    resizeTimeout = setTimeout(handleResize, 300);
  });
});
