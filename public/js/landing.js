document.addEventListener('DOMContentLoaded', async () => {
  const featuredSection = document.getElementById('featured-section');
  const olderSection = document.getElementById('older-section');
  const olderGrid = document.getElementById('older-grid');
  const emptyState = document.getElementById('empty-state');
  const loadingState = document.getElementById('loading-state');

  // Tab elements
  const tabBtns = document.querySelectorAll('.tab-btn');
  const heraldSection = document.getElementById('herald-section');
  const booksSection = document.getElementById('books-section');
  const booksGrid = document.getElementById('books-grid');
  const booksEmpty = document.getElementById('books-empty');
  const booksLoading = document.getElementById('books-loading');

  let booksLoaded = false;

  // Upload modal elements
  const uploadModal = document.getElementById('upload-modal');
  const uploadModalForm = document.getElementById('modal-upload-form');
  const modalFileInput = document.getElementById('modal-book-file');
  const modalFileLabel = document.getElementById('modal-file-label');
  const modalProgress = document.getElementById('modal-upload-progress');
  const modalProgressFill = document.getElementById('modal-upload-progress-fill');
  const modalProgressText = document.getElementById('modal-upload-progress-text');
  const modalError = document.getElementById('modal-upload-error');
  const modalSuccess = document.getElementById('modal-upload-success');
  const modalUploadBtn = document.getElementById('modal-upload-btn');

  // --- Upload Modal logic ---
  function openUploadModal() {
    if (!uploadModal) return;
    // Auto-fill today's date
    const dateInput = document.getElementById('modal-book-date');
    if (dateInput && !dateInput.value) {
      dateInput.value = new Date().toISOString().split('T')[0];
    }
    uploadModal.classList.add('active');
  }

  function closeUploadModal() {
    if (!uploadModal) return;
    uploadModal.classList.remove('active');
    // Reset form + messages
    if (uploadModalForm) uploadModalForm.reset();
    if (modalFileLabel) modalFileLabel.textContent = 'Choose a PDF file...';
    if (modalError) modalError.style.display = 'none';
    if (modalSuccess) modalSuccess.style.display = 'none';
    if (modalProgress) modalProgress.style.display = 'none';
    if (modalProgressFill) modalProgressFill.style.width = '0%';
  }

  // Open: click CTA button
  document.querySelectorAll('.upload-cta-btn').forEach(btn => {
    btn.addEventListener('click', openUploadModal);
  });

  // Close: backdrop, X button, Escape
  if (uploadModal) {
    uploadModal.querySelector('.upload-modal-backdrop')
      ?.addEventListener('click', closeUploadModal);
    uploadModal.querySelector('.upload-modal-close')
      ?.addEventListener('click', closeUploadModal);
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && uploadModal.classList.contains('active')) {
        closeUploadModal();
      }
    });
  }

  // Are we going through Cloudflare (not localhost)?
  const isRemote = location.hostname !== 'localhost' && location.hostname !== '127.0.0.1';
  const LARGE_FILE_MB = 15;

  // File input label update
  if (modalFileInput && modalFileLabel) {
    modalFileInput.addEventListener('change', () => {
      modalFileLabel.textContent = modalFileInput.files.length > 0
        ? modalFileInput.files[0].name
        : 'Choose a PDF file...';
      if (modalError) modalError.style.display = 'none';
      const file = modalFileInput.files[0];
      if (isRemote && file && file.size > LARGE_FILE_MB * 1024 * 1024 && modalError) {
        const sizeMB = (file.size / 1024 / 1024).toFixed(1);
        modalError.textContent = `Warning: This file is ${sizeMB} MB. Large uploads may time out. For files over ${LARGE_FILE_MB} MB, use http://localhost:4000/admin instead.`;
        modalError.style.display = 'block';
      }
    });
  }

  // Upload form submit
  if (uploadModalForm) {
    uploadModalForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      modalError.style.display = 'none';
      modalSuccess.style.display = 'none';

      const title = document.getElementById('modal-book-title').value;
      const author = document.getElementById('modal-book-author').value;
      const teacher = document.getElementById('modal-book-teacher').value;
      const publishedDate = document.getElementById('modal-book-date').value;
      const file = modalFileInput.files[0];

      if (!file) {
        modalError.textContent = 'Please select a PDF file.';
        modalError.style.display = 'block';
        return;
      }

      const formData = new FormData();
      formData.append('title', title);
      formData.append('author', author);
      formData.append('teacher', teacher);
      formData.append('publishedDate', publishedDate);
      formData.append('pdf', file);

      modalUploadBtn.disabled = true;
      modalProgress.style.display = 'block';

      try {
        const xhr = new XMLHttpRequest();

        xhr.upload.addEventListener('progress', (ev) => {
          if (ev.lengthComputable) {
            const pct = Math.round((ev.loaded / ev.total) * 100);
            modalProgressFill.style.width = pct + '%';
            modalProgressText.textContent = `Uploading... ${pct}%`;
          }
        });

        const result = await new Promise((resolve, reject) => {
          xhr.onload = () => {
            let data;
            try {
              data = JSON.parse(xhr.responseText);
            } catch (e) {
              reject(new Error('Server error (non-JSON response). The file may be too large or the connection timed out.'));
              return;
            }
            if (xhr.status >= 200 && xhr.status < 300) {
              resolve(data);
            } else {
              reject(new Error(data.error || 'Upload failed'));
            }
          };
          xhr.onerror = () => reject(new Error('Network error'));

          xhr.open('POST', '/api/books/upload');
          xhr.send(formData);
        });

        modalSuccess.textContent = `"${result.book.title}" uploaded successfully!`;
        modalSuccess.style.display = 'block';
        uploadModalForm.reset();
        modalFileLabel.textContent = 'Choose a PDF file...';

        // Close modal after brief delay, then reload books
        setTimeout(() => {
          closeUploadModal();
          loadBooks();
        }, 1500);
      } catch (err) {
        modalError.textContent = err.message || 'Upload failed. Please try again.';
        modalError.style.display = 'block';
      } finally {
        modalUploadBtn.disabled = false;
        modalProgress.style.display = 'none';
        modalProgressFill.style.width = '0%';
      }
    });
  }

  pdfjsLib.GlobalWorkerOptions.workerSrc = '/lib/pdf.worker.min.js';

  // Site mode (set by inline script in <head>)
  const mode = document.documentElement.getAttribute('data-site') || 'both';

  if (mode === 'books') {
    // Books-only: CSS already hides herald + tabs, just load books
    loadBooks();
  } else if (mode === 'herald') {
    // Herald-only: CSS already hides books + tabs
    loadHerald();
  } else {
    // Localhost: tabs visible, check URL param
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('tab') === 'books') {
      tabBtns.forEach(b => b.classList.remove('active'));
      document.querySelector('[data-tab="books"]').classList.add('active');
      heraldSection.style.display = 'none';
      booksSection.style.display = '';
      loadBooks();
    }

    // Tab switching
    tabBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        tabBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');

        const tab = btn.dataset.tab;
        if (tab === 'herald') {
          heraldSection.style.display = '';
          booksSection.style.display = 'none';
        } else {
          heraldSection.style.display = 'none';
          booksSection.style.display = '';
          if (!booksLoaded) loadBooks();
        }
      });
    });

    // Load Herald for both/localhost
    loadHerald();
  }

  // Load Herald editions
  async function loadHerald() {
    try {
      const res = await fetch('/api/editions');
      const editions = await res.json();

      loadingState.style.display = 'none';

      if (editions.length === 0) {
        emptyState.style.display = 'block';
        return;
      }

      const [latest, ...older] = editions;

      featuredSection.style.display = 'flex';
      featuredSection.innerHTML = `
        <a href="/read/${latest.slug}" class="featured-card">
          <div class="featured-cover">
            <canvas class="featured-canvas"></canvas>
            <div class="card-cover-loading"><div class="spinner"></div></div>
          </div>
          <div class="featured-info">
            <span class="featured-badge">Latest Edition</span>
            <h2 class="featured-title">${latest.title}</h2>
            <p class="featured-meta">${latest.season} ${latest.year}</p>
            <span class="featured-cta">Read Now <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M12 5l7 7-7 7"/></svg></span>
          </div>
        </a>
      `;
      renderCover(featuredSection.querySelector('.featured-canvas'), featuredSection.querySelector('.card-cover-loading'), latest.filename, 600);

      if (older.length > 0) {
        olderSection.style.display = 'block';

        older.forEach(edition => {
          const card = document.createElement('a');
          card.href = `/read/${edition.slug}`;
          card.className = 'edition-card';

          card.innerHTML = `
            <div class="card-cover">
              <canvas class="card-cover-canvas"></canvas>
              <div class="card-cover-loading"><div class="spinner"></div></div>
            </div>
            <div class="card-body">
              <h3 class="card-body-title">${edition.title}</h3>
              <p class="card-meta">${edition.season} ${edition.year}</p>
              <span class="card-cta">Read Now &rarr;</span>
            </div>
          `;

          olderGrid.appendChild(card);
          renderCover(card.querySelector('.card-cover-canvas'), card.querySelector('.card-cover-loading'), edition.filename, 400);
        });
      }
    } catch (err) {
      loadingState.innerHTML = '<p>Failed to load editions. Please try again later.</p>';
      console.error('Failed to load editions:', err);
    }
  }

  // Load books
  async function loadBooks() {
    booksLoaded = true;
    booksLoading.style.display = '';
    booksEmpty.style.display = 'none';
    booksGrid.innerHTML = '';

    try {
      const res = await fetch('/api/books');
      const books = await res.json();

      booksLoading.style.display = 'none';

      if (books.length === 0) {
        booksEmpty.style.display = 'block';
        return;
      }

      books.forEach(book => {
        const card = document.createElement('a');
        card.href = `/book/${book.slug}`;
        card.className = 'edition-card';

        const date = new Date(book.publishedDate + 'T00:00:00');
        const dateStr = date.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });

        card.innerHTML = `
          <div class="card-cover">
            <canvas class="card-cover-canvas"></canvas>
            <div class="card-cover-loading"><div class="spinner"></div></div>
          </div>
          <div class="card-body">
            <h3 class="card-body-title">${book.title}</h3>
            <p class="card-meta book-meta">by ${book.author}</p>
            <p class="card-meta book-meta-teacher">${book.teacher} &middot; ${dateStr}</p>
            <span class="card-cta">Read Now &rarr;</span>
          </div>
        `;

        booksGrid.appendChild(card);
        renderCover(card.querySelector('.card-cover-canvas'), card.querySelector('.card-cover-loading'), book.filename, 400);
      });

      // Initialize card effects after books are loaded
      initCardEffects();
    } catch (err) {
      booksLoading.innerHTML = '<p>Failed to load books. Please try again later.</p>';
      console.error('Failed to load books:', err);
    }
  }

  // --- Premium Card Effects (Books theme) ---
  function initCardEffects() {
    const siteMode = document.documentElement.getAttribute('data-site');
    if (siteMode !== 'books' && siteMode !== 'both') return;

    // Staggered entrance via IntersectionObserver (fallback for non-scroll-timeline)
    if (!CSS.supports || !CSS.supports('animation-timeline', 'view()')) {
      const cardObserver = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
          if (entry.isIntersecting) {
            entry.target.classList.add('card-visible');
            cardObserver.unobserve(entry.target);
          }
        });
      }, { threshold: 0.1, rootMargin: '50px' });

      document.querySelectorAll('.older-grid').forEach(grid => {
        grid.querySelectorAll('.edition-card').forEach(c => cardObserver.observe(c));
        // Watch for dynamically added cards
        new MutationObserver(mutations => {
          mutations.forEach(m => {
            m.addedNodes.forEach(node => {
              if (node.nodeType === 1 && node.classList.contains('edition-card')) {
                cardObserver.observe(node);
              }
            });
          });
        }).observe(grid, { childList: true });
      });
    }

    // 3D tilt effect on cards via event delegation
    let currentTiltCard = null;

    document.addEventListener('mousemove', (e) => {
      const card = e.target.closest('.edition-card');

      // Reset previous card if we moved away
      if (currentTiltCard && currentTiltCard !== card) {
        currentTiltCard.style.transform = '';
        currentTiltCard.style.transition = 'transform 0.5s cubic-bezier(0.34, 1.56, 0.64, 1)';
        currentTiltCard = null;
      }

      if (!card) return;
      currentTiltCard = card;

      const rect = card.getBoundingClientRect();
      const x = (e.clientX - rect.left) / rect.width;
      const y = (e.clientY - rect.top) / rect.height;
      const rotateX = (y - 0.5) * -8;
      const rotateY = (x - 0.5) * 8;

      card.style.transform = `perspective(800px) rotateX(${rotateX}deg) rotateY(${rotateY}deg) translateY(-4px)`;
      card.style.transition = 'transform 0.1s ease';
    });
  }
});

async function renderCover(canvas, loadingEl, filename, renderWidth) {
  try {
    const pdf = await pdfjsLib.getDocument(`/uploads/${filename}`).promise;
    const page = await pdf.getPage(1);

    const viewport = page.getViewport({ scale: 1 });
    const scale = renderWidth / viewport.width;
    const scaledViewport = page.getViewport({ scale });

    canvas.width = scaledViewport.width;
    canvas.height = scaledViewport.height;

    await page.render({
      canvasContext: canvas.getContext('2d'),
      viewport: scaledViewport
    }).promise;

    canvas.style.display = 'block';
    if (loadingEl) loadingEl.style.display = 'none';
  } catch (err) {
    console.error('Failed to render cover:', err);
    if (loadingEl) loadingEl.innerHTML = '<p style="color:#999;font-size:0.8rem;">Preview unavailable</p>';
  }
}
