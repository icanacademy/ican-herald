document.addEventListener('DOMContentLoaded', () => {
  // Herald elements
  const loginSection = document.getElementById('login-section');
  const heraldDashboard = document.getElementById('herald-dashboard');
  const loginForm = document.getElementById('login-form');
  const loginError = document.getElementById('login-error');
  const logoutBtn = document.getElementById('logout-btn');
  const uploadForm = document.getElementById('upload-form');
  const uploadError = document.getElementById('upload-error');
  const uploadSuccess = document.getElementById('upload-success');
  const uploadProgress = document.getElementById('upload-progress');
  const uploadProgressFill = document.getElementById('upload-progress-fill');
  const uploadProgressText = document.getElementById('upload-progress-text');
  const uploadBtn = document.getElementById('upload-btn');
  const editionsList = document.getElementById('editions-list');
  const noEditions = document.getElementById('no-editions');
  const fileInput = document.getElementById('pdf-file');
  const fileLabel = document.getElementById('file-label');

  // Book elements
  const booksLoginSection = document.getElementById('books-login-section');
  const booksDashboard = document.getElementById('books-dashboard');
  const booksLoginForm = document.getElementById('books-login-form');
  const booksLoginError = document.getElementById('books-login-error');
  const bookUploadForm = document.getElementById('book-upload-form');
  const bookUploadError = document.getElementById('book-upload-error');
  const bookUploadSuccess = document.getElementById('book-upload-success');
  const bookUploadProgress = document.getElementById('book-upload-progress');
  const bookUploadProgressFill = document.getElementById('book-upload-progress-fill');
  const bookUploadProgressText = document.getElementById('book-upload-progress-text');
  const bookUploadBtn = document.getElementById('book-upload-btn');
  const booksList = document.getElementById('books-list');
  const noBooks = document.getElementById('no-books');
  const bookFileInput = document.getElementById('book-pdf-file');
  const bookFileLabel = document.getElementById('book-file-label');

  // Admin tab elements
  const adminTabBar = document.querySelector('.admin-tab-bar');
  const adminTabBtns = document.querySelectorAll('.admin-tab-btn');
  const adminHeraldTab = document.getElementById('admin-herald');
  const adminBooksTab = document.getElementById('admin-books');

  let adminToken = localStorage.getItem('adminToken');
  let booksToken = localStorage.getItem('booksToken');

  // Site mode (set by inline script in <head>)
  const mode = document.documentElement.getAttribute('data-site') || 'both';

  // Configure page based on mode (CSS handles visibility via [data-site])
  if (mode === 'books') {
    if (booksToken) showBooksDashboard();
  } else if (mode === 'herald') {
    // Show herald tab content (it starts hidden in HTML because books tab is default)
    adminHeraldTab.style.display = '';
    if (adminToken) showHeraldDashboard();
  } else {
    // Localhost: show tabs for both
    if (booksToken) showBooksDashboard();
    if (adminToken) showHeraldDashboard();

    // Tab switching
    adminTabBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        adminTabBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');

        const tab = btn.dataset.adminTab;
        if (tab === 'herald') {
          adminHeraldTab.style.display = '';
          adminBooksTab.style.display = 'none';
        } else {
          adminHeraldTab.style.display = 'none';
          adminBooksTab.style.display = '';
        }
      });
    });
  }

  // Are we going through Cloudflare (not localhost)?
  const isRemote = location.hostname !== 'localhost' && location.hostname !== '127.0.0.1';
  const LARGE_FILE_MB = 15; // warn above this size when on Cloudflare

  function checkFileSize(file, errorEl) {
    if (isRemote && file && file.size > LARGE_FILE_MB * 1024 * 1024) {
      const sizeMB = (file.size / 1024 / 1024).toFixed(1);
      errorEl.textContent = `Warning: This file is ${sizeMB} MB. Large uploads may time out through Cloudflare. For files over ${LARGE_FILE_MB} MB, use http://localhost:4000/admin instead.`;
      errorEl.style.display = 'block';
    }
  }

  // File input label updates
  fileInput.addEventListener('change', () => {
    fileLabel.textContent = fileInput.files.length > 0
      ? fileInput.files[0].name
      : 'Choose a PDF file...';
    uploadError.style.display = 'none';
    if (fileInput.files[0]) checkFileSize(fileInput.files[0], uploadError);
  });

  bookFileInput.addEventListener('change', () => {
    bookFileLabel.textContent = bookFileInput.files.length > 0
      ? bookFileInput.files[0].name
      : 'Choose a PDF file...';
    bookUploadError.style.display = 'none';
    if (bookFileInput.files[0]) checkFileSize(bookFileInput.files[0], bookUploadError);
  });

  // Herald login
  loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    loginError.style.display = 'none';

    const password = document.getElementById('password').value;
    try {
      const res = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password })
      });
      const data = await res.json();
      if (data.success) {
        adminToken = data.token;
        localStorage.setItem('adminToken', adminToken);
        showHeraldDashboard();
      } else {
        loginError.textContent = 'Invalid password. Please try again.';
        loginError.style.display = 'block';
      }
    } catch (err) {
      loginError.textContent = 'Connection error. Please try again.';
      loginError.style.display = 'block';
    }
  });

  // Logout (only affects Herald)
  logoutBtn.addEventListener('click', () => {
    adminToken = null;
    localStorage.removeItem('adminToken');
    loginSection.style.display = 'flex';
    heraldDashboard.style.display = 'none';
    logoutBtn.style.display = 'none';
  });

  function showHeraldDashboard() {
    loginSection.style.display = 'none';
    heraldDashboard.style.display = '';
    logoutBtn.style.display = 'inline-flex';
    loadEditions();
  }

  function handleSessionExpired() {
    adminToken = null;
    localStorage.removeItem('adminToken');
    loginSection.style.display = 'flex';
    heraldDashboard.style.display = 'none';
    logoutBtn.style.display = 'none';
    loginError.textContent = 'Session expired. Please log in again.';
    loginError.style.display = 'block';
  }

  // === BOOKS AUTH ===

  // Books login
  booksLoginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    booksLoginError.style.display = 'none';

    const password = document.getElementById('books-password').value;
    try {
      const res = await fetch('/api/books/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password })
      });
      const data = await res.json();
      if (data.success) {
        booksToken = data.token;
        localStorage.setItem('booksToken', booksToken);
        showBooksDashboard();
      } else {
        booksLoginError.textContent = 'Invalid password. Please try again.';
        booksLoginError.style.display = 'block';
      }
    } catch (err) {
      booksLoginError.textContent = 'Connection error. Please try again.';
      booksLoginError.style.display = 'block';
    }
  });

  function showBooksDashboard() {
    booksLoginSection.style.display = 'none';
    booksDashboard.style.display = '';
    loadBooks();
  }

  function handleBooksSessionExpired() {
    booksToken = null;
    localStorage.removeItem('booksToken');
    booksLoginSection.style.display = 'flex';
    booksDashboard.style.display = 'none';
    booksLoginError.textContent = 'Session expired. Please log in again.';
    booksLoginError.style.display = 'block';
  }

  // === HERALD (auth required) ===

  uploadForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    uploadError.style.display = 'none';
    uploadSuccess.style.display = 'none';

    const title = document.getElementById('title').value;
    const season = document.getElementById('season').value;
    const year = document.getElementById('year').value;
    const file = fileInput.files[0];

    if (!file) {
      uploadError.textContent = 'Please select a PDF file.';
      uploadError.style.display = 'block';
      return;
    }

    const formData = new FormData();
    formData.append('title', title);
    formData.append('season', season);
    formData.append('year', year);
    formData.append('pdf', file);

    uploadBtn.disabled = true;
    uploadProgress.style.display = 'block';

    try {
      const xhr = new XMLHttpRequest();

      xhr.upload.addEventListener('progress', (e) => {
        if (e.lengthComputable) {
          const pct = Math.round((e.loaded / e.total) * 100);
          uploadProgressFill.style.width = pct + '%';
          uploadProgressText.textContent = `Uploading... ${pct}%`;
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

        xhr.open('POST', '/api/upload');
        xhr.setRequestHeader('X-Admin-Token', adminToken);
        xhr.send(formData);
      });

      uploadSuccess.textContent = `"${result.edition.title}" uploaded successfully!`;
      uploadSuccess.style.display = 'block';
      uploadForm.reset();
      fileLabel.textContent = 'Choose a PDF file...';
      document.getElementById('year').value = '2026';
      loadEditions();
    } catch (err) {
      if (err.message === 'Unauthorized') {
        handleSessionExpired();
      } else {
        uploadError.textContent = err.message || 'Upload failed. Please try again.';
        uploadError.style.display = 'block';
      }
    } finally {
      uploadBtn.disabled = false;
      uploadProgress.style.display = 'none';
      uploadProgressFill.style.width = '0%';
    }
  });

  async function loadEditions() {
    try {
      const res = await fetch('/api/editions');
      const editions = await res.json();

      if (editions.length === 0) {
        editionsList.innerHTML = '';
        noEditions.style.display = 'block';
        return;
      }

      noEditions.style.display = 'none';
      editionsList.innerHTML = editions.map(ed => `
        <div class="edition-row">
          <div class="edition-info">
            <strong>${ed.title}</strong>
            <span class="edition-meta">${ed.season} ${ed.year}</span>
          </div>
          <div class="edition-actions">
            <a href="/read/${ed.slug}" class="btn btn-small" target="_blank">View</a>
            <button class="btn btn-small btn-danger" onclick="deleteEdition('${ed.slug}', '${ed.title.replace(/'/g, "\\'")}')">Delete</button>
          </div>
        </div>
      `).join('');
    } catch (err) {
      editionsList.innerHTML = '<p>Failed to load editions.</p>';
    }
  }

  window.deleteEdition = async (slug, title) => {
    if (!confirm(`Are you sure you want to delete "${title}"? This cannot be undone.`)) return;

    try {
      const res = await fetch(`/api/editions/${slug}`, {
        method: 'DELETE',
        headers: { 'X-Admin-Token': adminToken }
      });
      const data = await res.json();

      if (res.status === 401) {
        handleSessionExpired();
        return;
      }

      if (data.success) {
        loadEditions();
      } else {
        alert(data.error || 'Failed to delete edition.');
      }
    } catch (err) {
      alert('Failed to delete edition. Please try again.');
    }
  };

  // === BOOKS (auth for admin operations) ===

  bookUploadForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    bookUploadError.style.display = 'none';
    bookUploadSuccess.style.display = 'none';

    const title = document.getElementById('book-title').value;
    const author = document.getElementById('book-author').value;
    const teacher = document.getElementById('book-teacher').value;
    const publishedDate = document.getElementById('book-date').value;
    const file = bookFileInput.files[0];

    if (!file) {
      bookUploadError.textContent = 'Please select a PDF file.';
      bookUploadError.style.display = 'block';
      return;
    }

    const formData = new FormData();
    formData.append('title', title);
    formData.append('author', author);
    formData.append('teacher', teacher);
    formData.append('publishedDate', publishedDate);
    formData.append('pdf', file);

    bookUploadBtn.disabled = true;
    bookUploadProgress.style.display = 'block';

    try {
      const xhr = new XMLHttpRequest();

      xhr.upload.addEventListener('progress', (e) => {
        if (e.lengthComputable) {
          const pct = Math.round((e.loaded / e.total) * 100);
          bookUploadProgressFill.style.width = pct + '%';
          bookUploadProgressText.textContent = `Uploading... ${pct}%`;
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

      bookUploadSuccess.textContent = `"${result.book.title}" uploaded successfully!`;
      bookUploadSuccess.style.display = 'block';
      bookUploadForm.reset();
      bookFileLabel.textContent = 'Choose a PDF file...';
      loadBooks();
    } catch (err) {
      bookUploadError.textContent = err.message || 'Upload failed. Please try again.';
      bookUploadError.style.display = 'block';
    } finally {
      bookUploadBtn.disabled = false;
      bookUploadProgress.style.display = 'none';
      bookUploadProgressFill.style.width = '0%';
    }
  });

  async function loadBooks() {
    try {
      const res = await fetch('/api/books');
      const books = await res.json();

      if (books.length === 0) {
        booksList.innerHTML = '';
        noBooks.style.display = 'block';
        return;
      }

      noBooks.style.display = 'none';
      booksList.innerHTML = books.map(book => {
        const date = new Date(book.publishedDate + 'T00:00:00');
        const dateStr = date.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
        return `
          <div class="edition-row">
            <div class="edition-info">
              <strong>${book.title}</strong>
              <span class="edition-meta">by ${book.author} &middot; ${book.teacher} &middot; ${dateStr}</span>
            </div>
            <div class="edition-actions">
              <a href="/book/${book.slug}" class="btn btn-small" target="_blank">View</a>
              <button class="btn btn-small btn-danger" onclick="deleteBook('${book.slug}', '${book.title.replace(/'/g, "\\'")}')">Delete</button>
            </div>
          </div>
        `;
      }).join('');
    } catch (err) {
      booksList.innerHTML = '<p>Failed to load books.</p>';
    }
  }

  window.deleteBook = async (slug, title) => {
    if (!confirm(`Are you sure you want to delete "${title}"? This cannot be undone.`)) return;

    try {
      const res = await fetch(`/api/books/${slug}`, {
        method: 'DELETE',
        headers: { 'X-Books-Token': booksToken }
      });
      const data = await res.json();

      if (res.status === 401) {
        handleBooksSessionExpired();
        return;
      }

      if (data.success) {
        loadBooks();
      } else {
        alert(data.error || 'Failed to delete book.');
      }
    } catch (err) {
      alert('Failed to delete book. Please try again.');
    }
  };
});
