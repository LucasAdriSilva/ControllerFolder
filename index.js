const { app, BrowserWindow, dialog, ipcMain } = require('electron');
const fs = require('fs');
const path = require('path');

let mainWindow;

app.whenReady().then(() => {
    mainWindow = new BrowserWindow({
        width: 600,
        height: 400,
        webPreferences: {
            nodeIntegration: true,  // Permite usar require no index.html
            contextIsolation: false // Evita conflitos ao usar ipcRenderer
        },
    });

    mainWindow.loadFile('index.html');
});

ipcMain.handle('select-folder', async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
        properties: ['openDirectory'],
    });
    return result.filePaths[0] || null;
});
ipcMain.handle('rename-files', async (_, folderPath) => {
    if (!folderPath) return { success: false, message: 'Nenhuma pasta selecionada' };

    const files = fs.readdirSync(folderPath).filter(file => fs.statSync(path.join(folderPath, file)).isFile());

    // Filtrar arquivos que já possuem numeração e separá-los
    let numberedFiles = [];
    let unnumberedFiles = [];

    files.forEach(file => {
        const match = file.match(/^\d+ - (.+)$/);
        if (match) {
            numberedFiles.push({ original: file, name: match[1] });
        } else {
            unnumberedFiles.push(file);
        }
    });

    // Determinar o próximo número disponível
    let usedNumbers = numberedFiles.map(f => parseInt(f.original.split(' - ')[0])).sort((a, b) => a - b);
    let counter = 1;

    while (usedNumbers.includes(counter)) {
        counter++;
    }

    // Ordenar arquivos não numerados e renomeá-los começando do próximo número disponível
    unnumberedFiles.sort().forEach(file => {
        const newFileName = `${counter} - ${file}`;
        fs.renameSync(path.join(folderPath, file), path.join(folderPath, newFileName));
        usedNumbers.push(counter);
        counter++;
        while (usedNumbers.includes(counter)) {
            counter++;
        }
    });

    return { success: true, message: 'Arquivos renomeados com sucesso!' };
});