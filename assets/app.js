const urlParams = new URLSearchParams(window.location.search);
const EVENT_SLUG = urlParams.get('event') || 'default';

const dropZone = document.getElementById('dropZone');
const fileInput = document.getElementById('fileInput');
const video = document.getElementById('video');
const canvas = document.getElementById('canvas');
const startCameraBtn = document.getElementById('startCamera');
const snapPhotoBtn = document.getElementById('snapPhoto');
const retakeBtn = document.getElementById('retakePhoto');
const uploadCaptureBtn = document.getElementById('uploadCapture');
const resultDiv = document.getElementById('result');
const previewImg = document.getElementById('preview');
const resultText = document.getElementById('resultText');
const copyUrlBtn = document.getElementById('copyUrl');
const errorDiv = document.getElementById('error');
const refreshGalleryBtn = document.getElementById('refreshGallery');
const galleryGrid = document.getElementById('galleryGrid');
const refreshMspaintifiedBtn = document.getElementById('refreshMspaintified');
const mspaintifiedGrid = document.getElementById('mspaintifiedGrid');

let stream = null;
let capturedBlob = null;

// Tabs
document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById(btn.dataset.tab).classList.add('active');
  });
});

// File upload via drop zone
dropZone.addEventListener('click', () => fileInput.click());
dropZone.addEventListener('dragover', (e) => {
  e.preventDefault();
  dropZone.classList.add('dragover');
});
dropZone.addEventListener('dragleave', () => dropZone.classList.remove('dragover'));
dropZone.addEventListener('drop', (e) => {
  e.preventDefault();
  dropZone.classList.remove('dragover');
  if (e.dataTransfer.files.length) {
    uploadFile(e.dataTransfer.files[0]);
  }
});
fileInput.addEventListener('change', () => {
  if (fileInput.files.length) {
    uploadFile(fileInput.files[0]);
  }
});

async function uploadFile(file) {
  hideResult();
  hideError();

  const formData = new FormData();
  formData.append('file', file);

  try {
    const res = await fetch(`/api/upload?event=${EVENT_SLUG}`, { method: 'POST', body: formData });
    const data = await res.json();

    if (!res.ok) {
      throw new Error(data.error || 'Upload failed');
    }

    showResult(data.key, `/api/photos/${data.key}`);
  } catch (err) {
    showError(err.message);
  }
}

// Camera
startCameraBtn.addEventListener('click', async () => {
  try {
    stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
    video.srcObject = stream;
    video.hidden = false;
    canvas.hidden = true;
    startCameraBtn.hidden = true;
    snapPhotoBtn.hidden = false;
  } catch (err) {
    showError('Could not access camera: ' + err.message);
  }
});

snapPhotoBtn.addEventListener('click', () => {
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  canvas.getContext('2d').drawImage(video, 0, 0);

  canvas.toBlob((blob) => {
    capturedBlob = blob;
    video.hidden = true;
    canvas.hidden = false;
    snapPhotoBtn.hidden = true;
    retakeBtn.hidden = false;
    uploadCaptureBtn.hidden = false;
  }, 'image/jpeg', 0.9);
});

retakeBtn.addEventListener('click', () => {
  capturedBlob = null;
  video.hidden = false;
  canvas.hidden = true;
  snapPhotoBtn.hidden = false;
  retakeBtn.hidden = true;
  uploadCaptureBtn.hidden = true;
});

uploadCaptureBtn.addEventListener('click', () => {
  if (!capturedBlob) return;
  const file = new File([capturedBlob], 'camera-capture.jpg', { type: 'image/jpeg' });
  uploadFile(file);
});

// Gallery
refreshGalleryBtn.addEventListener('click', loadGallery);
refreshMspaintifiedBtn.addEventListener('click', loadMspaintified);

async function loadGallery() {
  galleryGrid.innerHTML = '<p>Loading...</p>';
  try {
    const res = await fetch(`/api/photos?event=${EVENT_SLUG}`);
    const data = await res.json();

    if (!res.ok) {
      throw new Error(data.error || 'Failed to load gallery');
    }

    galleryGrid.innerHTML = '';
    if (!data.photos || data.photos.length === 0) {
      galleryGrid.innerHTML = '<p>No photos yet.</p>';
      return;
    }

    for (const photo of data.photos) {
      const item = document.createElement('div');
      item.className = 'gallery-item';
      const url = `/api/photos/${photo.key}`;
      item.innerHTML = `
        <img src="${url}" alt="${photo.key}" loading="lazy">
        <div class="meta">
          <div>${(photo.size / 1024).toFixed(1)} KB</div>
          <div>${new Date(photo.uploaded).toLocaleString()}</div>
        </div>
        <button class="mspaintify-btn" data-key="${photo.key}">🎨 MSPaintify</button>
      `;
      item.querySelector('.mspaintify-btn').addEventListener('click', (e) => {
        e.stopPropagation();
        mspaintify(photo.key, item);
      });
      galleryGrid.appendChild(item);
    }
  } catch (err) {
    galleryGrid.innerHTML = `<p style="color:#c00">${err.message}</p>`;
  }
}

async function loadMspaintified() {
  mspaintifiedGrid.innerHTML = '<p>Loading...</p>';
  try {
    const res = await fetch(`/api/photos?event=${EVENT_SLUG}&type=mspaintified`);
    const data = await res.json();

    if (!res.ok) {
      throw new Error(data.error || 'Failed to load mspaintified images');
    }

    mspaintifiedGrid.innerHTML = '';
    if (!data.photos || data.photos.length === 0) {
      mspaintifiedGrid.innerHTML = '<p>No mspaintified images yet.</p>';
      return;
    }

    for (const photo of data.photos) {
      const item = document.createElement('div');
      item.className = 'gallery-item';
      const url = `/api/photos/${photo.key}`;
      item.innerHTML = `
        <img src="${url}" alt="${photo.key}" loading="lazy">
        <div class="meta">
          <div>${(photo.size / 1024).toFixed(1)} KB</div>
          <div>${new Date(photo.uploaded).toLocaleString()}</div>
        </div>
      `;
      mspaintifiedGrid.appendChild(item);
    }
  } catch (err) {
    mspaintifiedGrid.innerHTML = `<p style="color:#c00">${err.message}</p>`;
  }
}

// Result display
function showResult(key, url) {
  previewImg.src = url;
  resultText.textContent = `Key: ${key}`;
  resultDiv.classList.remove('hidden');
  copyUrlBtn.onclick = () => {
    navigator.clipboard.writeText(window.location.origin + url);
    copyUrlBtn.textContent = 'Copied!';
    setTimeout(() => (copyUrlBtn.textContent = 'Copy URL'), 1500);
  };
}

function hideResult() {
  resultDiv.classList.add('hidden');
  previewImg.src = '';
}

function showError(msg) {
  errorDiv.textContent = msg;
  errorDiv.classList.remove('hidden');
}

function hideError() {
  errorDiv.classList.add('hidden');
}

async function mspaintify(key, itemEl) {
  const btn = itemEl.querySelector('.mspaintify-btn');
  btn.disabled = true;
  btn.textContent = 'Processing...';

  try {
    const res = await fetch(`/api/mspaintify/${key}?event=${EVENT_SLUG}`, { method: 'POST' });
    const data = await res.json();

    if (!res.ok) {
      throw new Error(data.error || 'MSPaintify failed');
    }

    btn.textContent = 'Done! Check MSPaintified tab';
    btn.style.background = '#27ae60';
    setTimeout(() => {
      btn.textContent = '🎨 MSPaintify';
      btn.style.background = '';
      btn.disabled = false;
    }, 3000);
  } catch (err) {
    btn.textContent = 'Error - try again';
    btn.style.background = '#c0392b';
    setTimeout(() => {
      btn.textContent = '🎨 MSPaintify';
      btn.style.background = '';
      btn.disabled = false;
    }, 3000);
    showError(err.message);
  }
}
