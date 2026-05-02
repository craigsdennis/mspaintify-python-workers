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
const makeTerribleBtn = document.getElementById('makeTerribleBtn');
const processingView = document.getElementById('processingView');
const progressFill = document.getElementById('progressFill');
const typewriterLine = document.getElementById('typewriterLine');
const resultView = document.getElementById('resultView');
const resultBefore = document.getElementById('resultBefore');
const resultAfter = document.getElementById('resultAfter');
const againBtn = document.getElementById('againBtn');
const errorView = document.getElementById('errorView');
const errorText = document.getElementById('errorText');
const retryBtn = document.getElementById('retryBtn');

let stream = null;
let capturedBlob = null;
let workflowId = null;
let typewriterInterval = null;

// Cloudflare Workers selling points for the typewriter
const SELLING_POINTS = [
  "Cloudflare Workers runs your code at the edge, close to your users...",
  "Python Workers are powered by Pyodide, compiling Python to WebAssembly...",
  "That means you can write Python that executes in 300+ cities worldwide!",
  "We're using Python Workflows, a brand new primitive...",
  "Workflows give you durable execution with automatic retries...",
  "Each step in the DAG can run for up to 15 minutes!",
  "AI Gateway gives you one unified bill for all your AI providers...",
  "We're routing through Cloudflare's AI Gateway to OpenAI's GPT Image model...",
  "No API keys to manage, just one bill from Cloudflare!",
  "Workers KV, D1, R2, Durable Objects, Queues, Workflows...",
  "All available in Python, TypeScript, Rust, Go, and more...",
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

// Typewriter effect for selling points
function startTypewriter() {
  let messageIndex = 0;
  let charIndex = 0;
  let isDeleting = false;
  let currentText = '';

  typewriterLine.textContent = '';

  function type() {
    const currentMessage = SELLING_POINTS[messageIndex];

    if (isDeleting) {
      currentText = currentMessage.substring(0, charIndex - 1);
      charIndex--;
    } else {
      currentText = currentMessage.substring(0, charIndex + 1);
      charIndex++;
    }

    typewriterLine.textContent = currentText;

    let typeSpeed = isDeleting ? 20 : 40;

    if (!isDeleting && charIndex === currentMessage.length) {
      // Finished typing this message, pause then delete
      typeSpeed = 2000;
      isDeleting = true;
    } else if (isDeleting && charIndex === 0) {
      // Finished deleting, move to next message
      isDeleting = false;
      messageIndex = (messageIndex + 1) % SELLING_POINTS.length;
      typeSpeed = 500;
    }

    typewriterInterval = setTimeout(type, typeSpeed);
  }

  type();
}

function stopTypewriter() {
  if (typewriterInterval) {
    clearTimeout(typewriterInterval);
    typewriterInterval = null;
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
        const res = await fetch(`${API_BASE}/api/photos/${encodeURIComponent(mspaintKey)}`);

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

// Event listeners
shutterBtn.addEventListener('click', capturePhoto);
retakeBtn.addEventListener('click', () => {
  previewView.classList.add('hidden');
  cameraView.classList.remove('hidden');
});
makeTerribleBtn.addEventListener('click', uploadAndProcess);
againBtn.addEventListener('click', reset);
retryBtn.addEventListener('click', reset);

// Start on load
startCamera();
