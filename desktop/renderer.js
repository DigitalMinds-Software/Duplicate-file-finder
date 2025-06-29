// Global state
let selectedDirectory = '';
let isScanning = false;
let scanResults = [];

// DOM elements
const selectDirBtn = document.getElementById('selectDirBtn');
const selectedPath = document.getElementById('selectedPath');
const scanBtn = document.getElementById('scanBtn');
const minSizeInput = document.getElementById('minSize');
const followSymlinksCheckbox = document.getElementById('followSymlinks');
const progressSection = document.getElementById('progressSection');
const progressBar = document.getElementById('progressBar');
const progressText = document.getElementById('progressText');
const scanOutput = document.getElementById('scanOutput');
const stopScanBtn = document.getElementById('stopScanBtn');
const resultsSection = document.getElementById('resultsSection');
const duplicatesList = document.getElementById('duplicatesList');
const duplicateCount = document.getElementById('duplicateCount');
const noDuplicates = document.getElementById('noDuplicates');
const clearResultsBtn = document.getElementById('clearResultsBtn');
const settingsBtn = document.getElementById('settingsBtn');
const settingsModal = document.getElementById('settingsModal');
const closeSettingsBtn = document.getElementById('closeSettingsBtn');
const cancelSettingsBtn = document.getElementById('cancelSettingsBtn');
const saveSettingsBtn = document.getElementById('saveSettingsBtn');
const defaultMinSize = document.getElementById('defaultMinSize');
const defaultFollowSymlinks = document.getElementById('defaultFollowSymlinks');
const loadingOverlay = document.getElementById('loadingOverlay');

// Initialize the application
async function init() {
    await loadSettings();
    setupEventListeners();
    showWelcomeMessage();
}

// Load user settings
async function loadSettings() {
    try {
        const settings = await window.electronAPI.getSettings();
        minSizeInput.value = settings.minSize || 0;
        followSymlinksCheckbox.checked = settings.followSymlinks || false;
        defaultMinSize.value = settings.minSize || 0;
        defaultFollowSymlinks.checked = settings.followSymlinks || false;
        
        if (settings.lastDirectory) {
            selectedDirectory = settings.lastDirectory;
            selectedPath.textContent = selectedDirectory;
            selectedPath.classList.add('text-blue-600', 'font-medium');
            scanBtn.disabled = false;
        }
    } catch (error) {
        console.error('Failed to load settings:', error);
    }
}

// Save user settings
async function saveSettings() {
    try {
        const settings = {
            minSize: parseInt(defaultMinSize.value) || 0,
            followSymlinks: defaultFollowSymlinks.checked,
            lastDirectory: selectedDirectory
        };
        await window.electronAPI.saveSettings(settings);
        
        // Update current form values
        minSizeInput.value = settings.minSize;
        followSymlinksCheckbox.checked = settings.followSymlinks;
        
        closeSettingsModal();
        showNotification('Settings saved successfully!', 'success');
    } catch (error) {
        console.error('Failed to save settings:', error);
        showNotification('Failed to save settings', 'error');
    }
}

// Setup event listeners
function setupEventListeners() {
    // Directory selection
    selectDirBtn.addEventListener('click', selectDirectory);
    
    // Scanning
    scanBtn.addEventListener('click', startScan);
    stopScanBtn.addEventListener('click', stopScan);
    
    // Results
    clearResultsBtn.addEventListener('click', clearResults);
    
    // Settings
    settingsBtn.addEventListener('click', openSettingsModal);
    closeSettingsBtn.addEventListener('click', closeSettingsModal);
    cancelSettingsBtn.addEventListener('click', closeSettingsModal);
    saveSettingsBtn.addEventListener('click', saveSettings);
    
    // Modal backdrop click
    settingsModal.addEventListener('click', (e) => {
        if (e.target === settingsModal) {
            closeSettingsModal();
        }
    });
    
    // Electron API event listeners
    window.electronAPI.onDirectorySelected((event, path) => {
        selectedDirectory = path;
        selectedPath.textContent = path;
        selectedPath.classList.add('text-blue-600', 'font-medium');
        scanBtn.disabled = false;
    });
    
    window.electronAPI.onScanProgress((event, data) => {
        appendScanOutput(data);
    });
}

// Directory selection
async function selectDirectory() {
    try {
        const path = await window.electronAPI.selectDirectory();
        if (path) {
            selectedDirectory = path;
            selectedPath.textContent = path;
            selectedPath.classList.add('text-blue-600', 'font-medium');
            scanBtn.disabled = false;
        }
    } catch (error) {
        console.error('Failed to select directory:', error);
        showNotification('Failed to select directory', 'error');
    }
}

// Start scanning
async function startScan() {
    if (!selectedDirectory || isScanning) return;
    
    isScanning = true;
    scanBtn.disabled = true;
    selectDirBtn.disabled = true;
    
    // Show progress section
    progressSection.classList.remove('hidden');
    resultsSection.classList.add('hidden');
    
    // Reset progress
    progressBar.style.width = '0%';
    progressText.textContent = 'Initializing scan...';
    scanOutput.innerHTML = '';
    
    try {
        const options = {
            directory: selectedDirectory,
            minSize: parseInt(minSizeInput.value) || 0,
            followSymlinks: followSymlinksCheckbox.checked
        };
        
        // Simulate progress
        let progress = 0;
        const progressInterval = setInterval(() => {
            progress += Math.random() * 15;
            if (progress > 90) progress = 90;
            progressBar.style.width = progress + '%';
            progressText.textContent = `Scanning files... ${Math.round(progress)}%`;
        }, 500);
        
        const result = await window.electronAPI.scanDirectory(options);
        
        clearInterval(progressInterval);
        progressBar.style.width = '100%';
        progressText.textContent = 'Scan completed!';
        
        // Process results
        setTimeout(() => {
            displayResults(result.duplicates, result.scanResult);
            progressSection.classList.add('hidden');
        }, 1000);
        
    } catch (error) {
        console.error('Scan failed:', error);
        showNotification(`Scan failed: ${error.message}`, 'error');
        progressSection.classList.add('hidden');
    } finally {
        isScanning = false;
        scanBtn.disabled = false;
        selectDirBtn.disabled = false;
    }
}

// Stop scanning
function stopScan() {
    isScanning = false;
    scanBtn.disabled = false;
    selectDirBtn.disabled = false;
    progressSection.classList.add('hidden');
    showNotification('Scan stopped', 'info');
}

// Display scan results
function displayResults(duplicates, scanResult) {
    scanResults = duplicates;
    resultsSection.classList.remove('hidden');
    
    // Update statistics
    let statsText = '';
    if (scanResult) {
        statsText = `${duplicates.length} duplicate groups (${scanResult.total_duplicates} duplicate files out of ${scanResult.total_files} total files)`;
    } else {
        statsText = `${duplicates.length} duplicate groups`;
    }
    
    if (!duplicates || duplicates.length === 0) {
        duplicatesList.classList.add('hidden');
        noDuplicates.classList.remove('hidden');
        duplicateCount.textContent = scanResult ? `0 duplicates (${scanResult.total_files} files scanned)` : '0 duplicates';
        return;
    }
    
    duplicatesList.classList.remove('hidden');
    noDuplicates.classList.add('hidden');
    duplicateCount.textContent = statsText;
    
    // Clear previous results
    duplicatesList.innerHTML = '';
    
    // Create duplicate groups
    duplicates.forEach((group, index) => {
        const groupElement = createDuplicateGroup(group, index);
        duplicatesList.appendChild(groupElement);
    });
}

// Create a duplicate group element
function createDuplicateGroup(files, groupIndex) {
    const groupDiv = document.createElement('div');
    groupDiv.className = 'bg-white rounded-xl border border-gray-200 p-4 shadow-sm hover:shadow-md transition-shadow';
    
    const headerDiv = document.createElement('div');
    headerDiv.className = 'flex items-center justify-between mb-3';
    
    const titleSpan = document.createElement('span');
    titleSpan.className = 'font-medium text-gray-800';
    titleSpan.textContent = `Duplicate Group ${groupIndex + 1}`;
    
    const countSpan = document.createElement('span');
    countSpan.className = 'text-sm text-gray-500';
    countSpan.textContent = `${files.length} files`;
    
    headerDiv.appendChild(titleSpan);
    headerDiv.appendChild(countSpan);
    
    const filesDiv = document.createElement('div');
    filesDiv.className = 'space-y-2';
    
    files.forEach((file, fileIndex) => {
        const fileDiv = createFileItem(file, groupIndex, fileIndex);
        filesDiv.appendChild(fileDiv);
    });
    
    groupDiv.appendChild(headerDiv);
    groupDiv.appendChild(filesDiv);
    
    return groupDiv;
}

// Create a file item element
function createFileItem(filePath, groupIndex, fileIndex) {
    const fileDiv = document.createElement('div');
    fileDiv.className = 'file-item flex items-center justify-between bg-gray-50 p-3 rounded-lg border border-gray-100';
    
    const fileInfoDiv = document.createElement('div');
    fileInfoDiv.className = 'flex-1 min-w-0';
    
    const fileName = filePath.split('\\').pop() || filePath.split('/').pop();
    
    const fileNameSpan = document.createElement('span');
    fileNameSpan.className = 'block font-medium text-gray-800 truncate';
    fileNameSpan.textContent = fileName;
    fileNameSpan.title = fileName;
    
    const filePathSpan = document.createElement('span');
    filePathSpan.className = 'block text-sm text-gray-500 truncate';
    filePathSpan.textContent = filePath;
    filePathSpan.title = filePath;
    
    const fileSizeSpan = document.createElement('span');
    fileSizeSpan.className = 'block text-xs text-gray-400';
    fileSizeSpan.textContent = 'Click to view file details';
    
    fileInfoDiv.appendChild(fileNameSpan);
    fileInfoDiv.appendChild(filePathSpan);
    fileInfoDiv.appendChild(fileSizeSpan);
    
    const actionsDiv = document.createElement('div');
    actionsDiv.className = 'flex items-center space-x-2 ml-4';
    
    const viewBtn = document.createElement('button');
    viewBtn.className = 'p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors';
    viewBtn.title = 'View file location';
    viewBtn.innerHTML = `
        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" 
                  d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"></path>
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" 
                  d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"></path>
        </svg>
    `;
    
    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors';
    deleteBtn.title = 'Delete this file';
    deleteBtn.innerHTML = `
        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" 
                  d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path>
        </svg>
    `;
    
    // Event listeners
    deleteBtn.addEventListener('click', () => confirmDeleteFile(filePath, groupIndex, fileIndex));
    viewBtn.addEventListener('click', () => showFileInfo(filePath));
    
    actionsDiv.appendChild(viewBtn);
    actionsDiv.appendChild(deleteBtn);
    
    fileDiv.appendChild(fileInfoDiv);
    fileDiv.appendChild(actionsDiv);
    
    return fileDiv;
}

// Show file information
function showFileInfo(filePath) {
    alert(`File: ${filePath}\n\nTo view this file in Explorer, you can manually navigate to its location.`);
}

// Confirm file deletion
async function confirmDeleteFile(filePath, groupIndex, fileIndex) {
    const fileName = filePath.split('\\').pop() || filePath.split('/').pop();
    
    if (confirm(`Are you sure you want to delete "${fileName}"?\n\nThis action cannot be undone.`)) {
        await deleteFile(filePath, groupIndex, fileIndex);
    }
}

// Delete a file
async function deleteFile(filePath, groupIndex, fileIndex) {
    try {
        loadingOverlay.classList.remove('hidden');
        
        const result = await window.electronAPI.deleteFile(filePath);
        
        if (result.success) {
            // Remove file from results
            scanResults[groupIndex].splice(fileIndex, 1);
            
            // If group is empty, remove it
            if (scanResults[groupIndex].length === 0) {
                scanResults.splice(groupIndex, 1);
            }
            
            // Refresh display
            displayResults(scanResults);
            showNotification('File deleted successfully', 'success');
        } else {
            showNotification(`Failed to delete file: ${result.error}`, 'error');
        }
    } catch (error) {
        console.error('Delete failed:', error);
        showNotification(`Failed to delete file: ${error.message}`, 'error');
    } finally {
        loadingOverlay.classList.add('hidden');
    }
}

// Clear all results
function clearResults() {
    scanResults = [];
    resultsSection.classList.add('hidden');
    progressSection.classList.add('hidden');
    scanOutput.innerHTML = '';
}

// Append scan output
function appendScanOutput(text) {
    const div = document.createElement('div');
    div.textContent = text.trim();
    scanOutput.appendChild(div);
    scanOutput.scrollTop = scanOutput.scrollHeight;
}

// Settings modal functions
function openSettingsModal() {
    settingsModal.classList.remove('hidden');
}

function closeSettingsModal() {
    settingsModal.classList.add('hidden');
}

// Show notification
function showNotification(message, type = 'info') {
    const notification = document.createElement('div');
    notification.className = `fixed top-4 right-4 z-50 px-6 py-4 rounded-lg shadow-lg text-white font-medium animate-slide-up`;
    
    switch (type) {
        case 'success':
            notification.classList.add('bg-green-500');
            break;
        case 'error':
            notification.classList.add('bg-red-500');
            break;
        case 'warning':
            notification.classList.add('bg-yellow-500');
            break;
        default:
            notification.classList.add('bg-blue-500');
    }
    
    notification.textContent = message;
    
    document.body.appendChild(notification);
    
    setTimeout(() => {
        notification.classList.add('opacity-0');
        setTimeout(() => {
            document.body.removeChild(notification);
        }, 300);
    }, 3000);
}

// Show welcome message
function showWelcomeMessage() {
    setTimeout(() => {
        showNotification('Welcome to DupeFinder!', 'info');
    }, 500);
}

// Initialize the application when DOM is loaded
document.addEventListener('DOMContentLoaded', init);

// Handle keyboard shortcuts
document.addEventListener('keydown', (e) => {
    if (e.ctrlKey || e.metaKey) {
        switch (e.key) {
            case 'o':
                e.preventDefault();
                selectDirectory();
                break;
            case 'r':
                if (!isScanning && selectedDirectory) {
                    e.preventDefault();
                    startScan();
                }
                break;
            case ',':
                e.preventDefault();
                openSettingsModal();
                break;
        }
    }
    
    if (e.key === 'Escape') {
        if (!settingsModal.classList.contains('hidden')) {
            closeSettingsModal();
        }
    }
});
