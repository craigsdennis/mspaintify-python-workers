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
const processingSteps = document.getElementById('processingSteps');
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

// Upload and start workflow
async function uploadAndProcess() {
  if (!capturedBlob) return;

  previewView.classList.add('hidden');
  processingView.classList.remove('hidden');
  updateProgress(10, 'Uploading photo...');

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
    updateProgress(30, 'Photo uploaded!');

    // Poll for workflow completion
    await pollWorkflow(data.key);

  } catch (err) {
    showError(err.message);
  }
}

// Poll workflow status
async function pollWorkflow(originalKey) {
  const steps = [
    { progress: 40, text: 'Reading your photo...' },
    { progress: 60, text: 'Asking GPT to make it terrible...' },
    { progress: 80, text: 'Saving the terrible result...' },
  ];
  let stepIndex = 0;

  return new Promise((resolve, reject) => {
    const interval = setInterval(async () => {
      try {
        // Advance the fake progress steps
        if (stepIndex < steps.length) {
          updateProgress(steps[stepIndex].progress, steps[stepIndex].text);
          stepIndex++;
        }

        // Check if mspaintified version exists
        const mspaintKey = originalKey.replace('photos/', 'mspaintified/');
        const res = await fetch(`${API_BASE}/api/photos/${encodeURIComponent(mspaintKey)}`);

        if (res.ok) {
          // It's done!
          clearInterval(interval);
          updateProgress(100, 'Done!');

          setTimeout(() => {
            showResult(originalKey, mspaintKey);
            resolve();
          }, 500);
        }
      } catch (err) {
        // Keep polling
      }
    }, 2000);

    // Timeout after 2 minutes
    setTimeout(() => {
      clearInterval(interval);
      reject(new Error('Taking too long... Check the big screen later!'));
    }, 120000);
  });
}

// Update progress UI
function updateProgress(percent, text) {
  progressFill.style.width = percent + '%';
  if (text) processingSteps.textContent = text;
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
  updateProgress(0, 'Uploading photo');

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
