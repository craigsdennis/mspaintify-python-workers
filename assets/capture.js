// ========================================
// Mobile Capture Logic
// Camera, upload, workflow polling
// ========================================

const API_BASE = '';

// DOM refs
const video = document.getElementById('video');
const canvas = document.getElementById('canvas');
const shutterBtn = document.getElementById('shutterBtn');
const cameraView = document.querySelector('.camera-view');
const previewView = document.getElementById('previewView');
const previewImg = document.getElementById('previewImg');
const retakeBtn = document.getElementById('retakeBtn');
const makeSlopBtn = document.getElementById('makeSlopBtn');
const processingView = document.getElementById('processingView');
const progressFill = document.getElementById('progressFill');
const typewriterContainer = document.getElementById('typewriterContainer');
const resultView = document.getElementById('resultView');
const resultBefore = document.getElementById('resultBefore');
const resultAfter = document.getElementById('resultAfter');
const shareBtn = document.getElementById('shareBtn');
const againBtn = document.getElementById('againBtn');
const errorView = document.getElementById('errorView');
const errorText = document.getElementById('errorText');
const retryBtn = document.getElementById('retryBtn');

let stream = null;
let capturedBlob = null;
let workflowId = null;
let typewriterTimeout = null;

// Cloudflare Workers selling points
const SELLING_POINTS = [
  "Cloudflare Workers runs your code at the edge, close to your users...",
  "You just deploy to region:earth...",
  "Python Workers are powered by Pyodide, compiling Python to WebAssembly...",
  "That means you can write Python that executes in 300+ cities worldwide!",
  "We're using Python Workflows, a brand new primitive...",
  "Workflows give you durable execution with automatic retries...",
  "Each step in the DAG can run for up to 15 minutes!",
  "AI Gateway gives you one unified bill for all your AI providers...",
  "We're routing through Cloudflare's AI Gateway to OpenAI's GPT Image model...",
  "No API keys to manage, just one bill from Cloudflare!",
  "Workers KV, D1, R2, Durable Objects, Queues, Workflows...",
  "All available in Python...",
  "Check out workers.cloudflare.com to learn more!",
  "Almost done... ✨"
];

// Start camera immediately (front-facing / selfie)
async function startCamera() {
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'user' }
    });
    video.srcObject = stream;
  } catch (err) {
    showError('Could not access camera: ' + err.message);
  }
}

// Take photo
function capturePhoto() {
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  canvas.getContext('2d').drawImage(video, 0, 0);

  canvas.toBlob((blob) => {
    capturedBlob = blob;
    previewImg.src = canvas.toDataURL('image/jpeg');

    cameraView.classList.add('hidden');
    previewView.classList.remove('hidden');
  }, 'image/jpeg', 0.9);
}

// Typewriter that accumulates lines
function startTypewriter() {
  typewriterContainer.innerHTML = '';
  let messageIndex = 0;
  let charIndex = 0;
  let currentLine = null;

  function typeNextChar() {
    if (messageIndex >= SELLING_POINTS.length) return;

    const message = SELLING_POINTS[messageIndex];

    // Create a new line element when starting a message
    if (charIndex === 0) {
      currentLine = document.createElement('div');
      currentLine.className = 'typewriter-line';
      typewriterContainer.appendChild(currentLine);
      // Scroll to bottom
      typewriterContainer.scrollTop = typewriterContainer.scrollHeight;
    }

    // Type one character
    currentLine.textContent = message.substring(0, charIndex + 1);
    charIndex++;

    if (charIndex < message.length) {
      // Continue typing this message
      typewriterTimeout = setTimeout(typeNextChar, 30);
    } else {
      // Finished this message, start next after pause
      charIndex = 0;
      messageIndex++;
      typewriterTimeout = setTimeout(typeNextChar, 1500);
    }
  }

  typeNextChar();
}

function stopTypewriter() {
  if (typewriterTimeout) {
    clearTimeout(typewriterTimeout);
    typewriterTimeout = null;
  }
}

// Upload and start workflow
async function uploadAndProcess() {
  if (!capturedBlob) return;

  previewView.classList.add('hidden');
  processingView.classList.remove('hidden');

  startTypewriter();
  updateProgress(10);

  const formData = new FormData();
  formData.append('file', new File([capturedBlob], 'capture.jpg', { type: 'image/jpeg' }));

  try {
    const res = await fetch(`${API_BASE}/api/upload`, {
      method: 'POST',
      body: formData,
    });
    const data = await res.json();

    if (!res.ok) {
      throw new Error(data.error || 'Upload failed');
    }

    workflowId = data.workflow_id;
    updateProgress(30);

    // Poll for workflow completion
    await pollWorkflow(data.key);

  } catch (err) {
    stopTypewriter();
    showError(err.message);
  }
}

// Poll workflow status
async function pollWorkflow(originalKey) {
  const progressSteps = [40, 55, 70, 85, 95];
  let progressIndex = 0;

  return new Promise((resolve, reject) => {
    const interval = setInterval(async () => {
      try {
        // Advance progress
        if (progressIndex < progressSteps.length) {
          updateProgress(progressSteps[progressIndex]);
          progressIndex++;
        }

        // Check if mspaintified version exists
        const mspaintKey = originalKey.replace('photos/', 'mspaintified/');
        const res = await fetch(`${API_BASE}/api/photos/${mspaintKey}`);

        if (res.ok) {
          // It's done!
          clearInterval(interval);
          stopTypewriter();
          updateProgress(100);

          setTimeout(() => {
            showResult(originalKey, mspaintKey);
            resolve();
          }, 800);
        }
      } catch (err) {
        // Keep polling
      }
    }, 2500);

    // Timeout after 2 minutes
    setTimeout(() => {
      clearInterval(interval);
      stopTypewriter();
      reject(new Error('Taking too long... Check the big screen later!'));
    }, 120000);
  });
}

// Update progress UI
function updateProgress(percent) {
  progressFill.style.width = percent + '%';
}

// Show final result
function showResult(beforeKey, afterKey) {
  processingView.classList.add('hidden');
  resultView.classList.remove('hidden');

  resultBefore.src = `${API_BASE}/api/photos/${beforeKey}`;
  resultAfter.src = `${API_BASE}/api/photos/${afterKey}`;
}

// Share photos using Web Share API
async function sharePhotos() {
  if (!navigator.canShare) {
    alert('Sharing not supported on this device');
    return;
  }

  try {
    shareBtn.disabled = true;
    shareBtn.textContent = 'Loading...';

    // Fetch both images as blobs
    const [beforeRes, afterRes] = await Promise.all([
      fetch(resultBefore.src),
      fetch(resultAfter.src)
    ]);

    const [beforeBlob, afterBlob] = await Promise.all([
      beforeRes.blob(),
      afterRes.blob()
    ]);

    const beforeFile = new File([beforeBlob], 'before.jpg', { type: 'image/jpeg' });
    const afterFile = new File([afterBlob], 'slop.jpg', { type: 'image/jpeg' });

    const shareData = {
      title: 'My MSPaintify Slop',
      text: 'I mspaintified at PyCon 2026. Check out my slop 🧡',
      files: [beforeFile, afterFile]
    };

    if (navigator.canShare(shareData)) {
      await navigator.share(shareData);
      shareBtn.textContent = '✅ Shared!';
    } else {
      alert('Sharing files not supported on this device');
      shareBtn.disabled = false;
      shareBtn.textContent = '📤 Share My Slop';
    }
  } catch (err) {
    // User cancelled or error
    console.log('Share cancelled or failed:', err);
    shareBtn.disabled = false;
    shareBtn.textContent = '📤 Share My Slop';
  }
}

// Show error
function showError(msg) {
  processingView.classList.add('hidden');
  previewView.classList.add('hidden');
  errorView.classList.remove('hidden');
  errorText.textContent = msg;
}

// Reset to camera
function reset() {
  capturedBlob = null;
  workflowId = null;
  previewImg.src = '';
  resultBefore.src = '';
  resultAfter.src = '';
  updateProgress(0);
  stopTypewriter();

  errorView.classList.add('hidden');
  resultView.classList.add('hidden');
  previewView.classList.add('hidden');
  cameraView.classList.remove('hidden');

  // Restart camera if needed
  if (!stream) startCamera();
}

// Check if Web Share API is supported
if (!navigator.share || !navigator.canShare) {
  document.body.classList.add('no-share');
}

// Event listeners
shutterBtn.addEventListener('click', capturePhoto);
retakeBtn.addEventListener('click', () => {
  previewView.classList.add('hidden');
  cameraView.classList.remove('hidden');
});
makeSlopBtn.addEventListener('click', uploadAndProcess);
shareBtn.addEventListener('click', sharePhotos);
againBtn.addEventListener('click', reset);
retryBtn.addEventListener('click', reset);

// Start on load
startCamera();
