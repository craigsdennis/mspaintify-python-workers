// ========================================
// Presenter Screen Logic
// Slideshow, QR code, polling
// ========================================

const API_BASE = '';
const POLL_INTERVAL = 3000;
const SLIDE_INTERVAL = 5000;

let mspaintifiedPhotos = [];
let currentSlide = 0;
let slideshowTimer = null;

// DOM refs
const qrSection = document.querySelector('.qr-section');
const slideshowPair = document.getElementById('slideshowPair');
const slideshowEmpty = document.getElementById('slideshowEmpty');
const beforeImg = document.getElementById('beforeImg');
const afterImg = document.getElementById('afterImg');
const photoCount = document.getElementById('photoCount');
const statusText = document.getElementById('statusText');

// Init - start centered, move to corner when photos arrive
if (mspaintifiedPhotos.length === 0) {
  qrSection.classList.add('centered');
}

// Generate QR code on load
function initQR() {
  const captureUrl = window.location.origin + '/capture.html';
  new QRCode(document.getElementById('qrcode'), {
    text: captureUrl,
    width: 180,
    height: 180,
    colorDark: '#000000',
    colorLight: '#ffffff',
    correctLevel: QRCode.CorrectLevel.M,
  });
}

// Poll for new mspaintified photos
async function pollPhotos() {
  try {
    const res = await fetch(`${API_BASE}/api/photos?prefix=mspaintified/`);
    const data = await res.json();

    if (!res.ok) throw new Error(data.error);

    if (data.photos && data.photos.length > 0) {
      // Map mspaintified keys back to original keys
      const newPhotos = data.photos.map(photo => ({
        afterKey: photo.key,
        beforeKey: photo.key.replace('mspaintified/', 'photos/'),
      }));

      // Check if we have new photos
      const hadPhotos = mspaintifiedPhotos.length > 0;
      mspaintifiedPhotos = newPhotos;

      if (!hadPhotos) {
        // First photo arrived!
        qrSection.classList.remove('centered');
        slideshowEmpty.classList.add('hidden');
        startSlideshow();
      }

      photoCount.textContent = mspaintifiedPhotos.length;
      statusText.textContent = `${mspaintifiedPhotos.length} photos slopped`;
    }
  } catch (err) {
    console.error('Poll error:', err);
  }
}

// Start the slideshow
function startSlideshow() {
  if (slideshowTimer) return;
  showSlide(0);
  slideshowTimer = setInterval(nextSlide, SLIDE_INTERVAL);
}

// Show a specific slide
function showSlide(index) {
  if (mspaintifiedPhotos.length === 0) return;

  currentSlide = index % mspaintifiedPhotos.length;
  const photo = mspaintifiedPhotos[currentSlide];

  beforeImg.src = `${API_BASE}/api/photos/${photo.beforeKey}`;
  afterImg.src = `${API_BASE}/api/photos/${photo.afterKey}`;

  slideshowPair.classList.remove('active');
  // Force reflow
  void slideshowPair.offsetWidth;
  slideshowPair.classList.add('active');
}

// Advance to next slide
function nextSlide() {
  showSlide(currentSlide + 1);
}

// Init
initQR();
pollPhotos();
setInterval(pollPhotos, POLL_INTERVAL);
