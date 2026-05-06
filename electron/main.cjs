const { app, BrowserWindow, shell } = require('electron')
const path = require('path')

// En modo empaquetado process.resourcesPath = .../resources/
// Con asar:false la estructura es resources/app/dist/
// En dev __dirname = project/electron/
const DIST = app.isPackaged
  ? path.join(process.resourcesPath, 'app', 'dist')
  : path.join(__dirname, '..', 'dist')

function createWindow() {
  const win = new BrowserWindow({
    width: 1366,
    height: 768,
    minWidth: 960,
    minHeight: 600,
    title: 'Fuels - DataVision',
    icon: path.join(__dirname, '..', 'build', 'icon.png'),
    backgroundColor: '#1e2230',
    show: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      webSecurity: false,
    },
  })

  win.setMenuBarVisibility(false)
  win.once('ready-to-show', () => win.show())
  win.loadFile(path.join(DIST, 'index.html'))

  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })
}

app.whenReady().then(createWindow)
app.on('window-all-closed', () => app.quit())
