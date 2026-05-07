
// ============ GLOBAL VARIABLES ============
let selectedFiles = [];
const maxFiles = 20;
const maxFileSize = 50 * 1024 * 1024; // 50MB

// Store conversion results
let conversionResults = {};
let isConverting = false;

let totalPixelsInBatch = 0;
let fileContributions = {};
let animationFrame = null;
let currentDisplayPixels = 0;
let targetPixels = 0;
let currentDisplayPercent = 0;
let targetPercent = 0;

// ============ WAIT FOR PAGE TO LOAD ============
document.addEventListener('DOMContentLoaded', function() {
    console.log('Page loaded, initializing...');
    initApp();
});

// ============ INITIALIZE APP ============
function initApp() {
    // Setup file input
    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.multiple = true;
    fileInput.accept = 'image/jpeg,image/jpg';
    fileInput.style.display = 'none';
    document.body.appendChild(fileInput);
    
    // Setup event listeners
    setupEventListeners(fileInput);
    
    console.log('App initialized successfully!');
}

// ============ SETUP EVENT LISTENERS ============
function setupEventListeners(fileInput) {
    // Get elements
    const dropzone = document.getElementById('dropzone');
    const clearAllBtn = document.getElementById('clearAllBtn');
    const convertBtn = document.getElementById('convertBtn');
    const cancelBtn = document.getElementById('cancelBtn');
    const downloadAllBtn = document.getElementById('downloadBtn');
    
    // Check if elements exist
    if (!dropzone || !clearAllBtn || !convertBtn) {
        console.error('Some elements not found!');
        return;
    }
    
    // Click dropzone to open file selector
    dropzone.addEventListener('click', function() {
        fileInput.click();
    });
    
    // File selected
    fileInput.addEventListener('change', function(event) {
        handleFileSelect(event, fileInput);
    });
    
    // Clear all button
    clearAllBtn.addEventListener('click', clearAllFiles);
    
    // Convert button
    convertBtn.addEventListener('click', startBatchConversion);
    
    // Cancel button
    if (cancelBtn) {
        cancelBtn.addEventListener('click', cancelAllConversions);
    }
    
    // Download all button
    if (downloadAllBtn) {
        downloadAllBtn.addEventListener('click', downloadAllConverted);
    }
    
    // Drag and drop
    setupDragAndDrop(dropzone, fileInput);
}

// ============ DRAG AND DROP ============
function setupDragAndDrop(dropzone, fileInput) {
    dropzone.addEventListener('dragover', function(e) {
        e.preventDefault();
        dropzone.classList.add('active-dropzone');
    });
    
    dropzone.addEventListener('dragleave', function() {
        dropzone.classList.remove('active-dropzone');
    });
    
    dropzone.addEventListener('drop', function(e) {
        e.preventDefault();
        dropzone.classList.remove('active-dropzone');
        
        const files = Array.from(e.dataTransfer.files);
        if (files.length > 0) {
            handleNewFiles(files, fileInput);
        }
    });
}

// ============ FILE SELECTION HANDLER ============
function handleFileSelect(event, fileInput) {
    const files = Array.from(event.target.files);
    handleNewFiles(files, fileInput);
    fileInput.value = ''; // Reset input
}

async function getFileWeight(file) {
    if (file.pixelWeight) return file.pixelWeight;
    return new Promise(resolve => {
        const img = new Image();
        img.onload = () => {
            file.pixelWeight = img.width * img.height;
            URL.revokeObjectURL(img.src);
            resolve(file.pixelWeight);
        };
        img.onerror = () => {
            file.pixelWeight = 1000000; // Fallback for corrupt files
            resolve(1000000);
        };
        img.src = URL.createObjectURL(file);
    });
}

// ============ HANDLE NEW FILES ============
function handleNewFiles(newFiles, fileInput) {
    let addedCount = 0;
    let duplicateCount = 0;
    let limitReachedCount = 0;

    // Process ALL dropped files one by one
    newFiles.forEach(file => {
        const result = validateFile(file);

        if (result.isValid) {
            // Only add if there is a physical slot available
            if (selectedFiles.length < maxFiles) {
                selectedFiles.push(file);
                getFileWeight(file);
                addedCount++;
            } else {
                limitReachedCount++;
            }
        } else if (result.reason === 'duplicate') {
            duplicateCount++;
        }
    });
    
    // Update UI if files were added
    if (addedCount > 0) {
        updateFilePreviews();
        updateFileCount();
        showPreviewSection();
        updateDropzoneText();
        showMessage(addedCount === 1 ? `Added 1 file` : `Added ${addedCount} files`);
    }

    // Report Duplicates (ONE message for all of them)
    if (duplicateCount > 0) {
        showError(duplicateCount === 1 
            ? `1 duplicate file ignored` 
            : `${duplicateCount} duplicate files ignored`);
    }

    // Report Limit Overflow
    if (limitReachedCount > 0) {
        showError(`Limit reached: ${limitReachedCount} extra files ignored (max ${maxFiles})`);
    }
}

// ============ VALIDATE SINGLE FILE ============
function validateFile(file) {
    // 1. Size Check
    if (file.size > maxFileSize) {
        showError(`${file.name} is too large (max 50MB)`);
        return { isValid: false, reason: 'size' };
    }
    
    // 2. Type Check
    const validTypes = ['image/jpeg', 'image/jpg'];
    const fileType = file.type.toLowerCase();
    if (!validTypes.some(type => fileType.includes(type.replace('image/', '')))) {
        showError(`${file.name} is not a supported image type`);
        return { isValid: false, reason: 'type' };
    }
    
    // 3. THE COLLISION FIX:
    // We check ONLY the name. If name exists, it's a duplicate.
    // This protects your "Find-by-Name" logic used in updateFileCardStatus.
    const isDuplicate = selectedFiles.some(f => f.name === file.name);
    
    if (isDuplicate) {
        return { isValid: false, reason: 'duplicate' };
    }
    
    return { isValid: true };
}

// ============ UPDATE FILE PREVIEWS ============
function updateFilePreviews() {
    const previewGrid = document.getElementById('previewGrid');
    if (!previewGrid) return;
    
    previewGrid.innerHTML = '';
    
    if (selectedFiles.length === 0) {
        previewGrid.innerHTML = `
            <div class="empty-preview">
                <div class="empty-preview-icon">📁</div>
                <p>No files selected</p>
                <p class="empty-preview-hint">Click the upload area to add files</p>
            </div>
        `;
        return;
    }
    
    selectedFiles.forEach((file, index) => {
        const card = createFileCard(file, index);
        previewGrid.appendChild(card);
    });
}

// ============ CREATE FILE CARD ============
// ============ CREATE FILE CARD ============
function createFileCard(file, index) {
    const card = document.createElement('div');
    card.className = 'preview-card';
    card.dataset.index = index; 
    
    // Get status from the results array
    const result = conversionResults[index];
    const isDone = result && result.status === 'success';
    const isProcessing = result && result.status === 'processing';

    // Apply CSS Classes for your black/orange/green styling
    if (isDone) card.classList.add('completed');
    if (isProcessing) card.classList.add('processing');

    // ONE ICON FOR EVERYTHING - Simple, clean, works for all
    const iconEmoji = '🖼️';

    card.innerHTML = `
        <button class="remove-file" title="Remove file">×</button>
        <div class="thumbnail-container">
            <div class="file-icon">${iconEmoji}</div>
            <img src="" alt="${file.name}" class="preview-image" style="display: none;">
            <div class="thumb-loader" style="display: none;">Loading...</div>
        </div>
        <div class="preview-info">
            <div class="file-name" title="${file.name}">${shortenFileName(file.name)}</div>
            <div class="file-size">${formatSize(file.size)}</div>
            <button class="convert-single-btn">
                ${isDone ? 'Download' : isProcessing ? 'Processing...' : 'Convert'}
            </button>
        </div>
    `;

    const imgElement = card.querySelector('.preview-image');
    const loader = card.querySelector('.thumb-loader');
    const iconElement = card.querySelector('.file-icon');

    // When image loads, hide icon and show image
    imgElement.onload = () => {
        iconElement.style.display = 'none';
        imgElement.style.display = 'block';
        loader.style.display = 'none';
    };

    // Generate preview in background
    generatePreviewThumbnail(file, imgElement, loader, iconElement);

    // Remove Logic
    card.querySelector('.remove-file').addEventListener('click', (e) => {
        e.preventDefault(); e.stopPropagation();
        const idx = parseInt(card.dataset.index);
        removeFile(idx);
    });
    
    // Convert/Download Logic
    card.querySelector('.convert-single-btn').addEventListener('click', (e) => {
        e.preventDefault(); e.stopPropagation();
        const idx = parseInt(card.dataset.index);
        
        const currentRes = conversionResults[idx];
        
        if (currentRes && currentRes.status === 'success') {
            downloadConvertedFile(idx);
        } else if (!isConverting && (!currentRes || currentRes.status !== 'processing')) {
            convertSingleFileStandalone(idx);
        }
    });
    
    return card;
}

async function generatePreviewThumbnail(file, imgElement, loaderElement) {
    try {
        // If the image is MASSIVE, we tell the browser to only decode 
        // a small portion of it into memory. This is the ultimate lag-fix.
        const bitmap = await createImageBitmap(file, { 
            resizeWidth: 300, 
            resizeQuality: 'low' 
        });

        const canvas = document.createElement('canvas');
        canvas.width = bitmap.width;
        canvas.height = bitmap.height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(bitmap, 0, 0);

        imgElement.src = canvas.toDataURL('image/jpeg', 0.6); // Lower quality for preview
        imgElement.style.display = 'block';
        if (loaderElement) loaderElement.style.display = 'none';

        bitmap.close();
    } catch (err) {
        // Fallback for images that are TOO big for the browser's canvas limit
        loaderElement.textContent = "Preview unavailable (Image too large)";
    }
}

// ============ UPDATE FILE CARD STATUS ============
function updateFileCardStatus(index, status) {
    const previewGrid = document.getElementById('previewGrid');
    if (!previewGrid) return;
    
    // 1. Get the actual file object from our array using the index
    const file = selectedFiles[index];
    if (!file) return;

    // 2. THE FIX: Instead of looking for [data-index], find the card 
    // where the .file-name element's title matches our file.name
    const cards = Array.from(previewGrid.querySelectorAll('.preview-card'));
    const card = cards.find(c => {
        const nameEl = c.querySelector('.file-name');
        return nameEl && nameEl.title === file.name;
    });

    // If card isn't found (maybe it was deleted), just exit
    if (!card) return;
    
    // 3. Keep the data-index attribute in sync just in case
    card.dataset.index = index;

    // 4. Update the classes and button as usual
    card.classList.remove('processing', 'completed', 'failed');
    if (status !== 'pending') card.classList.add(status);
    
    const btn = card.querySelector('.convert-single-btn');
    if (btn) {
        switch(status) {
            case 'processing':
                btn.textContent = 'Processing...';
                btn.disabled = true;
                break;
            case 'completed':
                btn.textContent = 'Download';
                btn.disabled = false;
                break;
            case 'failed':
                btn.textContent = 'Failed';
                btn.disabled = true;
                break;
            default:
                btn.textContent = 'Convert';
                btn.disabled = false;
        }
    }
}

// ============ MAIN CONVERSION FUNCTIONS ============
async function startBatchConversion() {
    if (selectedFiles.length === 0) { showError('Please select files first'); return; }

    const allDone = selectedFiles.every((_, i) => 
        conversionResults[i] && conversionResults[i].status === 'success'
    );
    if (allDone) { showMessage('All files are already converted! ✨'); return; }
    if (isConverting) return;

    // 🔥 FIX 1: Ensure all weights are ready so the denominator isn't zero
    await Promise.all(selectedFiles.map(f => getFileWeight(f)));
    
    totalPixelsInBatch = selectedFiles.reduce((acc, f) => acc + (f.pixelWeight || 0), 0);
    fileContributions = {};
    isConverting = true;
    showProgressModal(); 

    // 🔥 FIX 2: If files were already converted (standalone), add them to bar NOW
    selectedFiles.forEach((f, i) => {
        if (conversionResults[i] && conversionResults[i].status === 'success') {
            fileContributions[i] = f.pixelWeight;
        }
    });

    // Update targets immediately so the bar doesn't "jump" later
    targetPixels = Object.values(fileContributions).reduce((a, b) => a + b, 0);
    targetPercent = totalPixelsInBatch > 0 ? (targetPixels / totalPixelsInBatch) * 100 : 0;
    currentDisplayPercent = targetPercent; 

    const convertBtn = document.getElementById('convertBtn');
    if (convertBtn) {
        convertBtn.disabled = true;
        convertBtn.textContent = 'Processing...';
    }

    // Run the conversion loop
    for (let i = 0; i < selectedFiles.length; i++) {
        if (!isConverting) break; 
        if (conversionResults[i] && conversionResults[i].status === 'success') {
            updateProgress(i, 100);
            continue; 
        }
        await convertSingleFile(i);
        await new Promise(r => setTimeout(r, 50)); 
    }
    finalizeConversion();
}

async function convertSingleFile(index) {
    // FIX: Get the file by index but also store its NAME immediately
    const file = selectedFiles[index];
    if (!file) {
        console.log(`File at index ${index} no longer exists`);
        return;
    }
    
    const originalFileName = file.name; // Save the unique identifier
    
    // Update UI to show processing
    updateFileCardStatus(index, 'processing');
    
    try {
        console.log(`Converting: ${file.name} (${formatSize(file.size)})`);
        
        // Call conversion function
        const pngBlob = await convertJpgToPngSimple(file, index);
        
        // FIX: Find the current index by file name (in case array changed)
        const currentIndex = selectedFiles.findIndex(f => f.name === originalFileName);
        
        if (currentIndex === -1) {
            console.log(`File "${originalFileName}" was removed during conversion`);
            return; // File was deleted, skip saving result
        }
        
        // Store the result at the CORRECT current index
        conversionResults[currentIndex] = {
            blob: pngBlob,
            fileName: originalFileName.replace(/\.[^/.]+$/, "") + '.png',
            status: 'success'
        };
        
        // Update UI at the CORRECT current index
        updateFileCardStatus(currentIndex, 'completed');
        
        // Update progress
        updateProgress(index, 100);
        
    } catch (error) {
        console.error('Conversion failed:', error);
        
        // FIX: Also find index for error case
        const currentIndex = selectedFiles.findIndex(f => f.name === originalFileName);
        if (currentIndex !== -1) {
            conversionResults[currentIndex] = {
                error: error.message,
                status: 'failed'
            };
            updateFileCardStatus(currentIndex, 'failed');
        }
        
        // Update progress
        updateProgress(index, 100);
    }
}



// 1. Keep your worker pool variable global but empty at first
// ==========================================
// 1. ENGINE STATE & WORKER SETUP
// ==========================================
let jpgPngWorkers = [];
let jpgWorkerIndex = 0;
window.qualityMode = 'best'; // Global source of truth

async function initConverter() {
    try {
        const [upngRes, pakoRes] = await Promise.all([
            fetch('upng.js'),
            fetch('pako.js')
        ]);
        const upngCode = await upngRes.text();
        const pakoCode = await pakoRes.text();

        const numWorkers = Math.min(navigator.hardwareConcurrency || 4, 6);
        
        for (let i = 0; i < numWorkers; i++) {
            const workerCode = `
                const window = self;
                const global = self;
                ${pakoCode}
                ${upngCode}
                
                self.onmessage = async (e) => {
                    try {
                        const { buffer, mode } = e.data;
                        self.postMessage({ type: 'progress', percent: 10 });
                        // Convert buffer back to blob for bitmap
                        const blob = new Blob([buffer]);
                        const bitmap = await createImageBitmap(blob);
                        self.postMessage({ type: 'progress', percent: 30 });
                        
                        const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
                        const ctx = canvas.getContext("2d", { 
                            alpha: true, 
                            desynchronized: true // 🔥 DEEP OPTIMIZATION: Reduces latency
                        });
                        
                        ctx.imageSmoothingEnabled = false; // 🔥 Speed up draw
                        ctx.drawImage(bitmap, 0, 0);
                        self.postMessage({ type: 'progress', percent: 50 });
                        
                        let finalBuffer;
                        if (mode === 'optimized') {
                            const imageData = ctx.getImageData(0, 0, bitmap.width, bitmap.height).data;
                            self.postMessage({ type: 'progress', percent: 70 });
                            finalBuffer = UPNG.encode([imageData.buffer], bitmap.width, bitmap.height, 256);
                        } else {
                            self.postMessage({ type: 'progress', percent: 60 });
                            const finalBlob = await canvas.convertToBlob({ type: "image/png" });
                            self.postMessage({ type: 'progress', percent: 80 });
                            finalBuffer = await finalBlob.arrayBuffer();
                        }

                        bitmap.close();
                        ctx.clearRect(0, 0, canvas.width, canvas.height);
                        canvas.width = 1;
                        canvas.height = 1;

                        self.postMessage({ type: 'progress', percent: 100 });
                        self.postMessage({ buffer: finalBuffer }, [finalBuffer]);

                    } catch (err) {
                        self.postMessage({ error: err.message });
                    }
                };
            `;
            const workerUrl = URL.createObjectURL(new Blob([workerCode], { type: "application/javascript" }));
            const worker = new Worker(workerUrl);
            URL.revokeObjectURL(workerUrl);
            jpgPngWorkers.push(worker);
        }
        console.log("Converter Engine Ready.");
    } catch (err) {
        console.error("Failed to start converter:", err);
    }
}
initConverter();

// ==========================================
// 2. UI SELECTORS & SWITCH LOGIC
// ==========================================
const cp_btnBest = document.getElementById('optionBest');
const cp_btnOptimized = document.getElementById('optionOptimized');
const cp_slider = document.getElementById('qualitySlider');
const cp_labelCurrent = document.getElementById('currentSetting');
const cp_labelSize = document.getElementById('fileSizeEstimate');
const cp_labelComp = document.getElementById('compressionLevel');
const cp_labelUse = document.getElementById('bestForUse');

function cp_updateUI(mode) {
    window.qualityMode = mode; 

    if (mode === 'best') {
        cp_slider.style.transform = 'translateX(0%)';
        cp_btnBest.classList.add('active');
        cp_btnBest.classList.remove('inactive');
        cp_btnOptimized.classList.add('inactive');
        cp_btnOptimized.classList.remove('active');

        cp_labelCurrent.textContent = 'Best Quality (100%)';
        cp_labelCurrent.className = 'quality-value best';
        cp_labelSize.textContent = '~150-400% of original'; 
        cp_labelComp.textContent = 'Lossless (Native)';
        cp_labelUse.textContent = 'Print, Archiving, Professional Use';
    } else {
        cp_slider.style.transform = 'translateX(100%)';
        cp_btnOptimized.classList.add('active');
        cp_btnOptimized.classList.remove('inactive');
        cp_btnBest.classList.add('inactive');
        cp_btnBest.classList.remove('active');

        cp_labelCurrent.textContent = 'Optimized Size (256 Colors)';
        cp_labelCurrent.className = 'quality-value good';
        cp_labelSize.textContent = '~40-70% of original'; 
        cp_labelComp.textContent = 'Intelligent Quantization';
        cp_labelUse.textContent = 'Web, Email, Storage Saving';
    }
}

// Event Listeners
cp_btnBest.addEventListener('click', () => {
    cp_updateUI('best');
    if (typeof showAlert === "function") showAlert('🎯 Best quality mode selected', 'success');
});

cp_btnOptimized.addEventListener('click', () => {
    cp_updateUI('optimized');
    if (typeof showAlert === "function") showAlert('⚡ Optimized size mode selected', 'success');
});

// Initialize UI
cp_updateUI('best');

// ==========================================
// 3. THE FINAL CONVERSION CALL
// ==========================================

// ============ SMOOTH PIXEL COUNTER ============
function animatePixelCounter() {
    const progressText = document.getElementById('progressText');
    const progressBar = document.getElementById('progressBar');
    const progressPercent = document.getElementById('progressPercent');
    
    if (!progressText || !progressBar || !progressPercent) return;
    
    let needsUpdate = false;
    
    if (currentDisplayPixels < targetPixels) {
        const gap = targetPixels - currentDisplayPixels;
        const step = Math.max(1, Math.ceil(gap / 20));
        currentDisplayPixels = Math.min(currentDisplayPixels + step, targetPixels);
        needsUpdate = true;
    }
    
    if (totalPixelsInBatch > 0 && currentDisplayPercent < targetPercent) {
        const gap = targetPercent - currentDisplayPercent;
        const step = Math.max(0.1, gap / 20);
        currentDisplayPercent = Math.min(currentDisplayPercent + step, targetPercent);
        needsUpdate = true;
    }
    
    if (needsUpdate) {
        const formattedCurrent = Math.round(currentDisplayPixels).toLocaleString();
        
        if (totalPixelsInBatch > 0) {
            const formattedTotal = Math.round(totalPixelsInBatch).toLocaleString();
            progressText.textContent = `${formattedCurrent} / ${formattedTotal} pixels processed`;
            progressBar.style.width = `${currentDisplayPercent}%`;
            progressPercent.textContent = `${Math.round(currentDisplayPercent)}%`;
        } else {
            progressText.textContent = `${formattedCurrent} / ... pixels processed`;
            progressBar.style.width = `0%`;
            progressPercent.textContent = `0%`;
        }
        
        progressBar.setAttribute('aria-valuenow', Math.round(currentDisplayPercent));
    }
    
    const barNeedsToMove = totalPixelsInBatch > 0 && currentDisplayPercent < targetPercent;
    if (currentDisplayPixels < targetPixels || barNeedsToMove) {
        animationFrame = requestAnimationFrame(animatePixelCounter);
    } else {
        animationFrame = null;
    }
}
let downloadBtnVisible = false; // Initialize globally

function updateProgress(fileIndex, internalFilePercent = 100) {
    const total = selectedFiles.length;
    const file = selectedFiles[fileIndex];

    // Calculate pixel-based progress
    if (file && file.pixelWeight) {
        const pixelsDoneForThisFile = (internalFilePercent / 100) * file.pixelWeight;
        fileContributions[fileIndex] = pixelsDoneForThisFile;
    }

    const totalPixelsDone = Object.values(fileContributions).reduce((a, b) => a + b, 0);
    targetPixels = totalPixelsDone;
    
    targetPercent = totalPixelsInBatch > 0
        ? Math.min((totalPixelsDone / totalPixelsInBatch) * 100, 100)
        : 0;
    
    if (!animationFrame) {
        animatePixelCounter();
    }

    // Update the conversion stats UI
    const completed = Object.values(conversionResults).filter(r => r.status === 'success').length;
    const failed = Object.values(conversionResults).filter(r => r.status === 'failed').length;
    
    if (document.getElementById('completedCount')) 
        document.getElementById('completedCount').textContent = completed;
    if (document.getElementById('failedCount')) 
        document.getElementById('failedCount').textContent = failed;
    if (document.getElementById('remainingCount')) 
        document.getElementById('remainingCount').textContent = total - (completed + failed);

    // 🔥 OPTIMIZED CHECK: Shows button once and stops checking
    if (!downloadBtnVisible) {
        const hasSuccess = Object.values(conversionResults).some(r => r.status === 'success');
        if (hasSuccess) {
            const downloadAllBtn = document.getElementById('downloadBtn'); // Ensure ID is correct
            if (downloadAllBtn) {
                downloadAllBtn.style.display = 'block';
                downloadBtnVisible = true; 
            }
        }
    }
}

function convertJpgToPngSimple(jpgBlob, fileIndex) {
    return new Promise(async (resolve, reject) => {
        if (jpgPngWorkers.length === 0) return reject("Engine loading...");

        try {
            // 🔥 DEEP OPTIMIZATION: Pre-convert to ArrayBuffer
            const arrayBuffer = await jpgBlob.arrayBuffer();
            
            const worker = jpgPngWorkers[jpgWorkerIndex];
            jpgWorkerIndex = (jpgWorkerIndex + 1) % jpgPngWorkers.length;

            worker.onmessage = (e) => {
                if (e.data.type === 'progress') {
                    updateProgress(fileIndex, e.data.percent);
                } else if (e.data?.error) {
                    reject(e.data.error);
                } else {
                    const blob = new Blob([e.data.buffer], { type: 'image/png' });
                    resolve(blob);
                }
            };

            // 🔥 TRANSFERABLE: Use the second argument to transfer the buffer
            // This makes the data disappear from the Main Thread and appear in the Worker
            worker.postMessage({ 
                buffer: arrayBuffer, 
                mode: window.qualityMode 
            }, [arrayBuffer]);

        } catch (e) {
            reject("Read error: " + e.message);
        }
    });
}


// ============ CONVERT SINGLE FILE (STANDALONE) ============
async function convertSingleFileStandalone(index) {
    // 1. Force reset if a previous batch was cancelled/hidden
    const modal = document.getElementById('progressModal');
    const isModalVisible = modal && modal.style.display === 'flex';
    
    if (isConverting && !isModalVisible) {
        console.log("Forcing state reset - no active batch visible.");
        isConverting = false; 
    }

    // 2. True safety check
    if (isConverting) {
        showError('A batch conversion is in progress. Please wait.');
        return;
    }

    // Capture the specific file and its name IMMEDIATELY
    const file = selectedFiles[index];
    if (!file) return;
    const originalName = file.name; 
    const myConversionId = standaloneConversionId;

    // 3. Start Conversion
    isConverting = true;
    updateFileCardStatus(index, 'processing');

    try {
        // Core conversion logic
        const pngBlob = await convertJpgToPngSimple(file,index);
        if (myConversionId !== standaloneConversionId) return;
        
        // --- THE FIX: Find the FRESH index right now ---
        // If the user deleted a file while we were waiting for the blob, 
        // the original 'index' is now wrong. We find where the file is NOW.
        const currentIndex = selectedFiles.findIndex(f => f.name === originalName);
        
        // If the file was deleted entirely during conversion, stop here.
        if (currentIndex === -1) {
            console.log("File removed during conversion, discarding result.");
            return;
        }

        // Store the result at the CORRECT current index
        conversionResults[currentIndex] = {
            blob: pngBlob,
            fileName: originalName.replace(/\.[^/.]+$/, "") + '.png',
            status: 'success'
        };

        // Update the UI at the CORRECT current index
        updateFileCardStatus(currentIndex, 'completed');   
        
    } catch (error) {
        if (myConversionId !== standaloneConversionId) return;
        if (!isConverting && !isModalVisible) return;
        
        console.error('Conversion failed:', error);
        
        // Find fresh index for error handling too
        const currentIndex = selectedFiles.findIndex(f => f.name === originalName);
        if (currentIndex !== -1) {
            updateFileCardStatus(currentIndex, 'failed');
            showError(`Failed to convert ${originalName}`);
        }
    } finally {
        if (myConversionId === standaloneConversionId) {
            isConverting = false;
        }
        const hasSuccess = Object.values(conversionResults).some(r => r.status === 'success');
        
        // 2. Find the Download All button (make sure the ID matches your HTML)
        const downloadAllBtn = document.querySelector('.btn-download'); 
        
        if (downloadAllBtn && hasSuccess) {
            downloadAllBtn.style.display = 'block'; // Show it!
        }
    }
}

// ============ DOWNLOAD FUNCTIONS ============
function downloadConvertedFile(index) {
    // FIX: Get the actual card to find the file name
    const card = document.querySelector(`.preview-card[data-index="${index}"]`);
    if (!card) return;

    const fileNameEl = card.querySelector('.file-name');
    const originalFileName = fileNameEl ? fileNameEl.title : '';
    
    if (!originalFileName) return;
    
    // FIX: Find the result by matching file name instead of index
    const fileNameWithoutExt = originalFileName.replace(/\.[^/.]+$/, "");
    const expectedPngName = fileNameWithoutExt + '.png';
    
    // Find the result that matches this file
    const resultEntry = Object.entries(conversionResults).find(([_, result]) => 
        result && result.fileName === expectedPngName
    );
    
    if (!resultEntry) {
        showError('File not available for download');
        return;
    }
    
    const result = resultEntry[1];
    
    // Rest of your download code...
    const btn = card.querySelector('.convert-single-btn');
    if (btn) {
        btn.textContent = 'Downloading...';
        btn.style.opacity = '0.7';
        btn.style.pointerEvents = 'none';
    }
    
    const link = document.createElement('a');
    link.href = URL.createObjectURL(result.blob);
    link.download = result.fileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    setTimeout(() => {
        URL.revokeObjectURL(link.href);
        if (btn) {
            btn.textContent = 'Download';
            btn.style.opacity = '1';
            btn.style.pointerEvents = 'auto';
        }
    }, 1500);
}


async function downloadAllConverted() {
    const successEntries = Object.entries(conversionResults).filter(
        ([_, res]) => res && res.status === 'success' && res.blob
    );

    if (successEntries.length === 0) {
        if (typeof showError === 'function') showError('No converted files to download.');
        return;
    }

    const loader = document.getElementById('zipLoader');
    
    // 1. Show the Orange Loader
    if (loader) loader.style.display = 'flex';

    // 2. Small delay to allow UI to render loader before JSZip blocks thread
    setTimeout(async () => {
        try {
            const zip = new JSZip();
            
            // Add successful blobs to zip
            successEntries.forEach(([_, result]) => {
                zip.file(result.fileName, result.blob);
            });

            // Generate ZIP (STORE is fastest for images)
            const zipContent = await zip.generateAsync({ 
                type: "blob",
                compression: "STORE" 
            });

            // 3. FILENAME STYLE: Convertpixels_May 7(14-25-30).zip
            const now = new Date();
            const day = now.getDate();
            const month = now.toLocaleString('en-US', { month: 'short' });
            const hours = now.getHours().toString().padStart(2, '0');
            const minutes = now.getMinutes().toString().padStart(2, '0');
            const seconds = now.getSeconds().toString().padStart(2, '0');
            
            const zipName = `Convertpixels_${month} ${day}(${hours}-${minutes}-${seconds}).zip`;

            // 4. Trigger the Download
            const link = document.createElement('a');
            link.href = URL.createObjectURL(zipContent);
            link.download = zipName;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            
            // 5. Memory Management (Wait for download to start)
            setTimeout(() => URL.revokeObjectURL(link.href), 5000);

            if (typeof showMessage === 'function') {
                showMessage(`Download started: ${successEntries.length} files`);
            }

        } catch (err) {
            console.error("ZIP Error:", err);
            if (typeof showError === 'function') showError("Failed to bundle files.");
        } finally {
            // 6. Hide the Loader
            if (loader) loader.style.display = 'none';
        }
    }, 50); 
}

// ============ PROGRESS MANAGEMENT ============
function showProgressModal() {
    const progressModal = document.getElementById('progressModal');
    if (progressModal) {
        progressModal.style.display = 'flex';
        
        currentDisplayPixels = 0;
        targetPixels = 0;
        currentDisplayPercent = 0;
        targetPercent = 0;
        
        if (animationFrame) {
            cancelAnimationFrame(animationFrame);
            animationFrame = null;
        }
        
        const progressBar = document.getElementById('progressBar');
        if (progressBar) {
            progressBar.style.width = '0%';
            progressBar.setAttribute('aria-valuenow', 0);
        }
        
        const progressText = document.getElementById('progressText');
        if (progressText) {
            // ✅ FIX: Initial state matches the Phase 1 logic
            progressText.textContent = `0 / ... pixels processed`;
        }
        
        const progressPercent = document.getElementById('progressPercent');
        if (progressPercent) progressPercent.textContent = '0%';
        
        const completedCount = document.getElementById('completedCount');
        if (completedCount) completedCount.textContent = '0';
        
        const failedCount = document.getElementById('failedCount');
        if (failedCount) failedCount.textContent = '0';
        
        const remainingCount = document.getElementById('remainingCount');
        if (remainingCount) remainingCount.textContent = selectedFiles.length.toString();
        
        const cancelBtn = document.getElementById('cancelBtn');
        if (cancelBtn) cancelBtn.style.display = 'block';
        
    }
}

function hideProgressModal() {
    const progressModal = document.getElementById('progressModal');
    if (progressModal) {
        progressModal.style.display = 'none';
    }
}

var cancelAllBtn=document.querySelector(".btn-cancel");
cancelAllBtn.addEventListener("click",cancelAllConversions);

function cancelAllConversions() {
    // 1. Force the batch loop to stop immediately
    if (animationFrame) {
        cancelAnimationFrame(animationFrame);
        animationFrame = null;
    }
    isConverting = false; 
    
    // ============ THE FIX: SAFE WORKER TERMINATION ============
    // Check if the array exists and actually has workers in it
    if (Array.isArray(jpgPngWorkers) && jpgPngWorkers.length > 0) {
        // Instantly stop all background CPU processing
        jpgPngWorkers.forEach(worker => {
            if (worker instanceof Worker) {
                worker.terminate();
            }
        });
        
        // Clear the array of dead workers
        jpgPngWorkers = [];
        
        // Reset the worker pool index to avoid out-of-bounds errors
        jpgWorkerIndex = 0;
        
        // Restart the engine fresh for the next use
        initConverter();
    }
    // ======================================================

    hideProgressModal();
    
    // Reset Main Button UI
    const convertBtn = document.getElementById('convertBtn');
    if (convertBtn) {
        convertBtn.disabled = false;
        convertBtn.textContent = 'Convert All';
        convertBtn.classList.remove('processing');
    }

    // Reset UI cards but KEEP existing success results
    if (Array.isArray(selectedFiles)) {
        selectedFiles.forEach((_, index) => {
            const result = conversionResults[index];
            // If it wasn't finished, set it back to 'pending'
            if (!result || result.status !== 'success') {
                updateFileCardStatus(index, 'pending');
            }
        });
    }
    
    showMessage('Process stopped');
}

function finalizeConversion() {
    // Only hide modal if we actually finished or stopped
    hideProgressModal();
    isConverting = false;

    const convertBtn = document.getElementById('convertBtn');
    if (convertBtn) {
        convertBtn.disabled = false;
        convertBtn.textContent = 'Convert All';
    }

    // Show "Download All" only if there is at least one success
    const hasSuccess = Object.values(conversionResults).some(r => r.status === 'success');
}
let standaloneConversionId = 0;
// ============ FILE MANAGEMENT ============
function removeFile(index) {
    const targetIndex = parseInt(index);
    const card = document.querySelector(`.preview-card[data-index="${targetIndex}"]`);
    
    if (card && card.classList.contains('processing')) {
        isConverting = false; 
        standaloneConversionId++;
        if (Array.isArray(jpgPngWorkers) && jpgPngWorkers.length > 0) {
            jpgPngWorkers.forEach(w => w.terminate());
            jpgPngWorkers = [];
            jpgWorkerIndex = 0;
            initConverter(); 
        }
    }
    
    selectedFiles.splice(targetIndex, 1);
    
    const newResults = {};
    for (let i = 0; i < selectedFiles.length; i++) {
        let oldIndex = (i >= targetIndex) ? i + 1 : i;
        if (conversionResults[oldIndex]) newResults[i] = conversionResults[oldIndex];
    }
    conversionResults = newResults;

    // 🔥 FIX 3: REBUILD PIXEL MATH FROM ZERO (No ghost pixels)
    totalPixelsInBatch = 0;
    fileContributions = {};

    selectedFiles.forEach((file, i) => {
        const weight = file.pixelWeight || 0;
        totalPixelsInBatch += weight;
        if (conversionResults[i] && conversionResults[i].status === 'success') {
            fileContributions[i] = weight;
        }
    });

    targetPixels = Object.values(fileContributions).reduce((a, b) => a + b, 0);
    targetPercent = totalPixelsInBatch > 0 ? (targetPixels / totalPixelsInBatch) * 100 : 0;

    const previewGrid = document.getElementById('previewGrid');
    if (card) {
        card.remove(); 
        const remainingCards = previewGrid.querySelectorAll('.preview-card');
        remainingCards.forEach((c, i) => { c.dataset.index = i; });
    }

    updateFileCount();      
    updateDropzoneText();   
    
    if (selectedFiles.length === 0) {
        hidePreviewSection();
        updateFilePreviews();
    }
    if (document.getElementById('convertBtn')) document.getElementById('convertBtn').textContent = `Convert All`;
}

function clearAllFiles() {
    if (selectedFiles.length === 0) return;
    
    selectedFiles = [];
    conversionResults = {};
    updateFilePreviews();
    hidePreviewSection();
    updateDropzoneText();
    showMessage('All files cleared');
}

// ============ UI UPDATE FUNCTIONS ============
function updateFileCount() {
    const fileCount = document.getElementById('fileCount');
    if (fileCount) {
        fileCount.textContent = `(${selectedFiles.length}/${maxFiles})`;
    }
}

function showPreviewSection() {
    const previewSection = document.getElementById('previewSection');
    if (previewSection) {
        previewSection.style.display = 'block';
        previewSection.classList.add('visible');
        setTimeout(() => {
            previewSection.scrollIntoView({ 
                behavior: 'smooth', 
                block: 'start' 
            });
        }, 50); // Small delay to ensure the display: block is processed
    }
}

function hidePreviewSection() {
    const previewSection = document.getElementById('previewSection');
    if (previewSection) {
        previewSection.style.display = 'none';
        previewSection.classList.remove('visible');
    }
}

function updateDropzoneText() {
    const dropzone = document.getElementById('dropzone');
    if (!dropzone) return;
    
    const dropzoneText = dropzone.querySelector('.dropzone-text');
    if (dropzoneText) {
        if (selectedFiles.length > 0) {
            dropzoneText.textContent = `${selectedFiles.length} file${selectedFiles.length > 1 ? 's' : ''} selected`;
            dropzoneText.classList.add('has-files');
        } else {
            dropzoneText.textContent = 'Click or drag image to convert';
            dropzoneText.classList.remove('has-files');
        }
    }
}

// ============ HELPER FUNCTIONS ============
function shortenFileName(name, maxLength = 20) {
    if (name.length <= maxLength) return name;
    return name.substring(0, maxLength - 3) + '...';
}

function formatSize(bytes) {
    if (bytes === 0) return '0 Bytes';
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return (bytes / Math.pow(1024, i)).toFixed(1) + ' ' + sizes[i];
}

// ============ MESSAGE/ERROR FUNCTIONS ============
function showMessage(text) {
    createAlert(text, 'success');
}

function showError(text) {
    createAlert(text, 'error');
}

function createAlert(text, type) {
    // Create alert element
    const alert = document.createElement('div');
    alert.className = `alert alert-${type}`;
    
    // Set icon based on type
    let icon = 'ℹ️';
    if (type === 'error') icon = '⚠️';
    if (type === 'success') icon = '✅';
    
    alert.innerHTML = `
        <div class="alert-title">
            <span>${icon}</span>
            <span>${type === 'error' ? 'Error' : 'Success'}</span>
        </div>
        <div class="alert-message">${text}</div>
    `;
    
    // Add to container or create one
    let container = document.getElementById('alertContainer');
    if (!container) {
        container = document.createElement('div');
        container.id = 'alertContainer';
        container.className = 'alert-container';
        document.body.appendChild(container);
    }
    
    container.appendChild(alert);
    
    // Remove after 3 seconds
    setTimeout(function() {
        alert.classList.add('slide-out');
        setTimeout(function() {
            alert.remove();
        }, 300);
    }, 3000);
}


// Collapse/Expand Settings

const collapseBtn = document.getElementById('collapseBtn');
const qualityContainer = document.getElementById('qualityToggleContainer');

// Check if user previously opened settings
const wasExpanded = localStorage.getItem('settingsExpanded') === 'true';

// START HIDDEN - only expand if user previously opened
if (wasExpanded) {
    qualityContainer.classList.remove('collapsed');
    collapseBtn.classList.add('rotated');
} else {
    // Default: HIDDEN
    qualityContainer.classList.add('collapsed');
    collapseBtn.classList.remove('rotated');
}

collapseBtn.addEventListener('click', function() {
    const isCollapsed = qualityContainer.classList.contains('collapsed');
    
    if (isCollapsed) {
        // Expand settings
        qualityContainer.classList.remove('collapsed');
        collapseBtn.classList.add('rotated');
        localStorage.setItem('settingsExpanded', 'true');
    } else {
        // Collapse settings
        qualityContainer.classList.add('collapsed');
        collapseBtn.classList.remove('rotated');
        localStorage.setItem('settingsExpanded', 'false');
    }
});






