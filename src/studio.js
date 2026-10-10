import './styles.css';

const encoder = new TextEncoder();
const decoder = new TextDecoder();
const MAGIC = 'SAFEDATA_STEGO_V1';
const PBKDF2_ITERATIONS = 120000;

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];

function bytesToBase64(bytes) {
  let binary = '';
  const chunkSize = 0x8000;
  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize));
  }
  return btoa(binary);
}

function base64ToBytes(value) {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

async function deriveKey(password, salt, usage) {
  const baseKey = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: PBKDF2_ITERATIONS, hash: 'SHA-256' },
    baseKey,
    { name: 'AES-GCM', length: 256 },
    false,
    [usage],
  );
}

async function encryptMessage(message, password) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(password, salt, 'encrypt');
  const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, encoder.encode(message));
  return JSON.stringify({ magic: MAGIC, salt: bytesToBase64(salt), iv: bytesToBase64(iv), data: bytesToBase64(new Uint8Array(ciphertext)) });
}

async function decryptMessage(payload, password) {
  if (!payload || payload.magic !== MAGIC || !payload.salt || !payload.iv || !payload.data) throw new Error('This image does not contain a SafeData message.');
  const salt = base64ToBytes(payload.salt);
  const iv = base64ToBytes(payload.iv);
  const key = await deriveKey(password, salt, 'decrypt');
  const plaintext = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, base64ToBytes(payload.data));
  return decoder.decode(plaintext);
}

function loadImage(file) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    const url = URL.createObjectURL(file);
    image.onload = () => { URL.revokeObjectURL(url); resolve(image); };
    image.onerror = () => { URL.revokeObjectURL(url); reject(new Error('That file could not be read as an image.')); };
    image.src = url;
  });
}

function drawImageToCanvas(image, canvas) {
  canvas.width = image.naturalWidth;
  canvas.height = image.naturalHeight;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  context.drawImage(image, 0, 0);
  return context;
}

function writeBits(data, bytes) {
  const requiredBits = 32 + (bytes.length * 8);
  const capacityBits = Math.floor(data.length / 4) * 3;
  if (requiredBits > capacityBits) {
    throw new Error(`This image is too small for the message. It can carry about ${Math.floor((capacityBits - 32) / 8)} bytes.`);
  }
  let bitIndex = 0;
  const writeBit = (bit) => {
    const pixelIndex = Math.floor(bitIndex / 3);
    const channelIndex = bitIndex % 3;
    const dataIndex = (pixelIndex * 4) + channelIndex;
    data[dataIndex] = (data[dataIndex] & 254) | bit;
    bitIndex += 1;
  };
  for (let shift = 31; shift >= 0; shift -= 1) writeBit((bytes.length >>> shift) & 1);
  for (const byte of bytes) for (let shift = 7; shift >= 0; shift -= 1) writeBit((byte >>> shift) & 1);
}

function readBits(data) {
  let bitIndex = 0;
  const readBit = () => {
    const pixelIndex = Math.floor(bitIndex / 3);
    const channelIndex = bitIndex % 3;
    bitIndex += 1;
    return data[(pixelIndex * 4) + channelIndex] & 1;
  };
  let byteLength = 0;
  for (let index = 0; index < 32; index += 1) byteLength = (byteLength * 2) + readBit();
  const capacityBytes = Math.floor((Math.floor(data.length / 4) * 3 - 32) / 8);
  if (!byteLength || byteLength > capacityBytes) throw new Error('No SafeData message was found in this image.');
  const bytes = new Uint8Array(byteLength);
  for (let byteIndex = 0; byteIndex < byteLength; byteIndex += 1) {
    for (let shift = 7; shift >= 0; shift -= 1) bytes[byteIndex] |= readBit() << shift;
  }
  return bytes;
}

function setStatus(element, message, type = '') {
  element.textContent = message;
  element.className = `tool-status ${type}`;
}

function wireFileInput(inputSelector, labelSelector) {
  const input = $(inputSelector);
  const label = $(labelSelector);
  input?.addEventListener('change', () => {
    const file = input.files?.[0];
    if (file) label.textContent = file.name;
  });
  return input;
}

const encodeFile = wireFileInput('#encode-file', '#encode-file-name');
const decodeFile = wireFileInput('#decode-file', '#decode-file-name');
const encodeStatus = $('#encode-status');
const decodeStatus = $('#decode-status');
const encodeResults = $('#encode-results');
const decodeResults = $('#decode-results');

$('#encode-message')?.addEventListener('input', (event) => {
  $('#encode-count').textContent = `${event.target.value.length} characters`;
});

$$('.studio-tab').forEach((tab) => {
  tab.addEventListener('click', () => {
    $$('.studio-tab').forEach((item) => { item.classList.remove('active'); item.setAttribute('aria-selected', 'false'); });
    $$('.tool-panel').forEach((panel) => { panel.classList.remove('active'); panel.hidden = true; });
    tab.classList.add('active');
    tab.setAttribute('aria-selected', 'true');
    const panel = $(`#${tab.dataset.panel}`);
    panel.classList.add('active');
    panel.hidden = false;
  });
});

$('#encode-form')?.addEventListener('submit', async (event) => {
  event.preventDefault();
  const file = encodeFile.files?.[0];
  const password = $('#encode-password').value;
  const message = $('#encode-message').value.trim();
  if (!file || !password || !message) {
    setStatus(encodeStatus, 'Choose an image, password, and message before encoding.', 'error');
    return;
  }
  setStatus(encodeStatus, 'Encrypting and hiding your message locally…');
  encodeResults.hidden = true;
  try {
    const image = await loadImage(file);
    const originalCanvas = $('#original-canvas');
    const encodedCanvas = $('#encoded-canvas');
    drawImageToCanvas(image, originalCanvas);
    const encodedContext = drawImageToCanvas(image, encodedCanvas);
    const encryptedPayload = await encryptMessage(message, password);
    const payloadBytes = encoder.encode(encryptedPayload);
    const imageData = encodedContext.getImageData(0, 0, encodedCanvas.width, encodedCanvas.height);
    writeBits(imageData.data, payloadBytes);
    encodedContext.putImageData(imageData, 0, 0);
    $('#download-image').href = encodedCanvas.toDataURL('image/png');
    encodeResults.hidden = false;
    setStatus(encodeStatus, 'Protected locally. Your original image was not changed.', 'success');
    encodeResults.scrollIntoView({ behavior: 'smooth', block: 'start' });
  } catch (error) {
    setStatus(encodeStatus, error.message || 'The image could not be protected.', 'error');
  }
});

$('#decode-form')?.addEventListener('submit', async (event) => {
  event.preventDefault();
  const file = decodeFile.files?.[0];
  const password = $('#decode-password').value;
  if (!file || !password) {
    setStatus(decodeStatus, 'Choose a protected image and enter its password.', 'error');
    return;
  }
  setStatus(decodeStatus, 'Reading and decrypting locally…');
  decodeResults.hidden = true;
  try {
    const image = await loadImage(file);
    const canvas = $('#decoded-canvas');
    const context = drawImageToCanvas(image, canvas);
    const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
    const payload = JSON.parse(decoder.decode(readBits(imageData.data)));
    const message = await decryptMessage(payload, password);
    $('#decoded-message').textContent = message;
    decodeResults.hidden = false;
    setStatus(decodeStatus, 'Message decrypted locally. Nothing was uploaded.', 'success');
    decodeResults.scrollIntoView({ behavior: 'smooth', block: 'start' });
  } catch (error) {
    setStatus(decodeStatus, error.name === 'OperationError' ? 'That password could not unlock this message.' : (error.message || 'The image could not be decoded.'), 'error');
  }
});

$('#copy-message')?.addEventListener('click', async () => {
  const message = $('#decoded-message').textContent;
  await navigator.clipboard.writeText(message);
  $('#copy-status').textContent = 'Copied';
  window.setTimeout(() => { $('#copy-status').textContent = ''; }, 1800);
});

$$('.file-drop').forEach((drop) => {
  ['dragenter', 'dragover'].forEach((eventName) => drop.addEventListener(eventName, (event) => { event.preventDefault(); drop.classList.add('is-dragging'); }));
  ['dragleave', 'drop'].forEach((eventName) => drop.addEventListener(eventName, (event) => { event.preventDefault(); drop.classList.remove('is-dragging'); }));
  drop.addEventListener('drop', (event) => {
    const input = drop.querySelector('input');
    const file = event.dataTransfer.files?.[0];
    if (!file || !file.type.startsWith('image/')) return;
    const transfer = new DataTransfer();
    transfer.items.add(file);
    input.files = transfer.files;
    input.dispatchEvent(new Event('change', { bubbles: true }));
  });
});
