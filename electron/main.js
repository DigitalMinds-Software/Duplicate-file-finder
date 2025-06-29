const { app, BrowserWindow, ipcMain, dialog, Menu } = require('electron');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const Store = require('electron-store');

const store = new Store();
let mainWindow;
let goProcess;

// Enable live reload for development
const isDev = process.argv.includes('--dev');

function createWindow() {
  // Create the browser window
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    },
    icon: path.join(__dirname, '..', 'static', 'favicon.png'),
    show: false,
    titleBarStyle: 'default'
  });

  // Load the HTML file
  mainWindow.loadFile(path.join(__dirname, '..', 'desktop', 'index.html'));

  // Show window when ready to prevent visual flash
  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    
    // Focus on window (ensures it's brought to front)
    mainWindow.focus();
  });

  // Open DevTools in development
  if (isDev) {
    mainWindow.webContents.openDevTools();
  }

  // Handle window closed
  mainWindow.on('closed', () => {
    mainWindow = null;
    if (goProcess) {
      goProcess.kill();
    }
  });

  // Create application menu
  createMenu();
}

function createMenu() {
  const template = [
    {
      label: 'File',
      submenu: [
        {
          label: 'Select Directory',
          accelerator: 'CmdOrCtrl+O',
          click: () => {
            selectDirectory();
          }
        },
        { type: 'separator' },
        {
          label: 'Exit',
          accelerator: process.platform === 'darwin' ? 'Cmd+Q' : 'Ctrl+Q',
          click: () => {
            app.quit();
          }
        }
      ]
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' }
      ]
    },
    {
      label: 'View',
      submenu: [
        { role: 'reload' },
        { role: 'forceReload' },
        { role: 'toggleDevTools' },
        { type: 'separator' },
        { role: 'actualSize' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' }
      ]
    },
    {
      label: 'Window',
      submenu: [
        { role: 'minimize' },
        { role: 'close' }
      ]
    },
    {
      label: 'Help',
      submenu: [
        {
          label: 'About',
          click: () => {
            dialog.showMessageBox(mainWindow, {
              type: 'info',
              title: 'About DupeFinder',
              message: 'DupeFinder v1.0.0',
              detail: 'A smart tool that can scan directories to identify and remove duplicate files.',
              buttons: ['OK']
            });
          }
        }
      ]
    }
  ];

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
}

// App event handlers
app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

// IPC handlers
async function selectDirectory() {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory'],
    title: 'Select Directory to Scan for Duplicates'
  });

  if (!result.canceled && result.filePaths.length > 0) {
    const selectedPath = result.filePaths[0];
    mainWindow.webContents.send('directory-selected', selectedPath);
    return selectedPath;
  }
  return null;
}

ipcMain.handle('select-directory', selectDirectory);

ipcMain.handle('scan-directory', async (event, options) => {
  return new Promise((resolve, reject) => {
    const { directory, minSize, followSymlinks } = options;
    
    // Get the path to the Go executable
    const goExePath = getGoExecutablePath();
    
    console.log('Checking for Go executable at:', goExePath);
    console.log('File exists:', fs.existsSync(goExePath));
    
    if (!fs.existsSync(goExePath)) {
      // Try to build the executable first
      console.log('Go executable not found, attempting to build it...');
      const { spawn } = require('child_process');
      const buildProcess = spawn('go', ['build', '-o', goExePath, '.'], {
        cwd: path.join(__dirname, '..'),
        shell: false,
        windowsHide: true
      });
      
      buildProcess.on('close', (code) => {
        if (code === 0) {
          console.log('Go executable built successfully');
          // Now proceed with the scan
          performScan();
        } else {
          reject(new Error('Failed to build Go executable. Please ensure Go is installed and run "go build -o bin/duplicate-file-finder.exe ." manually.'));
        }
      });
      
      buildProcess.on('error', (err) => {
        reject(new Error(`Failed to build Go executable: ${err.message}. Please ensure Go is installed.`));
      });
      
      return;
    }
    
    // Executable exists, proceed with scan
    performScan();
    
    function performScan() {
      const args = ['--json'];  // Use JSON output mode
      if (minSize && minSize > 0) {
        args.push(`--minsize=${minSize}`);
      }
      if (followSymlinks) {
        args.push('--follow-symlinks');
      }
      args.push(directory);

      console.log('Starting scan with executable:', goExePath);
      console.log('Starting scan with args:', args);
      console.log('Working directory:', path.dirname(goExePath));
      
      const goProcess = spawn(goExePath, args, {
        cwd: path.dirname(goExePath),
        shell: false,  // Don't use shell to avoid path issues
        windowsHide: true
      });

      let output = '';
      let errorOutput = '';

      goProcess.stdout.on('data', (data) => {
        const text = data.toString();
        output += text;
        console.log('Go process output:', text);
        // Send progress updates to the renderer
        mainWindow.webContents.send('scan-progress', text);
      });

      goProcess.stderr.on('data', (data) => {
        const text = data.toString();
        errorOutput += text;
        console.log('Go process error:', text);
      });

      goProcess.on('close', (code) => {
        console.log('Go process closed with code:', code);
        if (code === 0) {
          // Parse the JSON output
          try {
            const result = JSON.parse(output);
            console.log('Parsed scan result:', result);
            
            // Convert to the expected format for the frontend
            const duplicates = result.duplicate_groups.map(group => group.files);
            resolve({ duplicates, output, scanResult: result });
          } catch (parseError) {
            console.error('Failed to parse JSON output:', parseError);
            console.log('Raw output:', output);
            // Fallback to old parsing method
            const duplicates = parseScanOutput(output);
            resolve({ duplicates, output });
          }
        } else {
          reject(new Error(`Scan failed with code ${code}: ${errorOutput}`));
        }
      });

      goProcess.on('error', (err) => {
        console.log('Go process error:', err);
        reject(new Error(`Failed to start scan: ${err.message}`));
      });
    }
  });
});

ipcMain.handle('delete-file', async (event, filePath) => {
  try {
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
      return { success: true };
    } else {
      return { success: false, error: 'File not found' };
    }
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('get-settings', () => {
  return {
    minSize: store.get('minSize', 0),
    followSymlinks: store.get('followSymlinks', false),
    lastDirectory: store.get('lastDirectory', '')
  };
});

ipcMain.handle('save-settings', (event, settings) => {
  store.set('minSize', settings.minSize);
  store.set('followSymlinks', settings.followSymlinks);
  store.set('lastDirectory', settings.lastDirectory);
  return true;
});

function getGoExecutablePath() {
  const isDev = process.argv.includes('--dev') || !app.isPackaged;
  
  if (isDev) {
    // In development, use the built executable in bin directory
    const devPath = path.join(__dirname, '..', 'bin', 'duplicate-file-finder.exe');
    console.log('Development mode - looking for executable at:', devPath);
    return devPath;
  } else {
    // In production, the executable should be in the resources
    const prodPath = path.join(process.resourcesPath, 'bin', 'duplicate-file-finder.exe');
    console.log('Production mode - looking for executable at:', prodPath);
    return prodPath;
  }
}

function parseScanOutput(output) {
  const duplicates = [];
  const lines = output.split('\n');
  
  for (const line of lines) {
    if (line.startsWith('Duplicates:')) {
      const filesString = line.replace('Duplicates:', '').trim();
      const files = filesString.split('|');
      if (files.length >= 2) {
        // Clean up the file paths and filter out empty ones
        const cleanedFiles = files.map(f => f.trim()).filter(f => f.length > 0);
        if (cleanedFiles.length >= 2) {
          duplicates.push(cleanedFiles);
        }
      }
    }
  }
  
  console.log('Parsed duplicates:', duplicates);
  return duplicates;
}

// Handle app termination
process.on('SIGTERM', () => {
  if (goProcess) {
    goProcess.kill();
  }
  app.quit();
});

process.on('SIGINT', () => {
  if (goProcess) {
    goProcess.kill();
  }
  app.quit();
});
