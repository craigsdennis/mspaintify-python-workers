// ========================================
// Presenter Screen Logic
// Slideshow, QR code, polling
// ========================================

const API_BASE = '';
const POLL_INTERVAL = 3000;
const SLIDE_INTERVAL = 5000;

const urlParams = new URLSearchParams(window.location.search);
const EVENT_SLUG = urlParams.get('event') || 'default';

let mspaintifiedPhotos = [];
let currentSlide = 0;
let slideshowTimer = null;
let eventConfig = null;

// DOM refs
const qrSection = document.querySelector('.qr-section');
const slideshowPair = document.getElementById('slideshowPair');
const slideshowEmpty = document.getElementById('slideshowEmpty');
const beforeImg = document.getElementById('beforeImg');
const afterImg = document.getElementById('afterImg');
const pageTitle = document.querySelector('title');
const pageHeader = document.querySelector('.presenter-header h1');
const qrLabel = document.querySelector('.qr-label');

// Init - start centered, move to corner when photos arrive
if (mspaintifiedPhotos.length === 0) {
  qrSection.classList.add('centered');
}

// Fetch event config and initialize
async function initEvent() {
  try {
    const res = await fetch(`${API_BASE}/api/config?event=${EVENT_SLUG}`);
    if (res.ok) {
      eventConfig = await res.json();
      const title = eventConfig.title || 'MSPaintify';
      pageTitle.textContent = title;
      pageHeader.textContent = title;
      if (eventConfig.title) {
        qrLabel.textContent = `MSPaintify yourself at ${title}!`;
      }
    } else {
      console.warn('No config found for event:', EVENT_SLUG);
    }
  } catch (err) {
    console.error('Failed to load config:', err);
  }

  initQR();
  pollPhotos();
  setInterval(pollPhotos, POLL_INTERVAL);
}

// Generate QR code on load
function initQR() {
  const captureUrl = `${window.location.origin}/capture.html?event=${EVENT_SLUG}`;
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
    const res = await fetch(`${API_BASE}/api/photos?event=${EVENT_SLUG}&type=mspaintified`);
    const data = await res.json();

    if (!res.ok) throw new Error(data.error);

    if (data.photos && data.photos.length > 0) {
      // Map mspaintified keys back to original keys
      const newPhotos = data.photos.map(photo => ({
        afterKey: photo.key,
        beforeKey: photo.key.replace(`${EVENT_SLUG}/mspaintified/`, `${EVENT_SLUG}/photos/`),
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

// Go to previous slide
function prevSlide() {
  showSlide(currentSlide - 1 + mspaintifiedPhotos.length);
}

// Keyboard controls
function handleKeydown(e) {
  if (mspaintifiedPhotos.length === 0) return;

  if (e.key === 'ArrowRight') {
    e.preventDefault();
    // Stop auto-slideshow so manual control takes over
    if (slideshowTimer) {
      clearInterval(slideshowTimer);
      slideshowTimer = null;
    }
    nextSlide();
  } else if (e.key === 'ArrowLeft') {
    e.preventDefault();
    if (slideshowTimer) {
      clearInterval(slideshowTimer);
      slideshowTimer = null;
    }
    prevSlide();
  } else if (e.key === ' ') {
    // Space to toggle auto-slideshow
    e.preventDefault();
    if (slideshowTimer) {
      clearInterval(slideshowTimer);
      slideshowTimer = null;
    } else {
      slideshowTimer = setInterval(nextSlide, SLIDE_INTERVAL);
    }
  }
}

document.addEventListener('keydown', handleKeydown);

// Init
initEvent();
