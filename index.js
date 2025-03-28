const { app, BrowserWindow, dialog, ipcMain } = require('electron');
const fs = require('fs');
const path = require('path');

let mainWindow;

app.whenReady().then(() => {
    mainWindow = new BrowserWindow({
        width: 800,
        height: 700,
        minWidth: 800,
        minHeight: 700,
        icon: path.join(__dirname, 'assets', 'icon.jpg'),
        webPreferences: {
            nodeIntegration: true,  // Permite usar require no index.html
            contextIsolation: false // Evita conflitos ao usar ipcRenderer
        },
    });

    mainWindow.setTitle('Renomeador de Arquivos');
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
    const logs = [];
    logs.push(`Iniciando renomeação de ${files.length} arquivos...`);

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

    logs.push(`Encontrados ${unnumberedFiles.length} arquivos para renomear`);

    // Determinar o próximo número disponível
    let usedNumbers = numberedFiles.map(f => parseInt(f.original.split(' - ')[0])).sort((a, b) => a - b);
    let counter = 1;

    while (usedNumbers.includes(counter)) {
        counter++;
    }

    // Ordenar arquivos não numerados e renomeá-los começando do próximo número disponível
    unnumberedFiles.sort().forEach((file, index) => {
        const newFileName = `${counter} - ${file}`;
        const oldPath = path.join(folderPath, file);
        const newPath = path.join(folderPath, newFileName);
        
        try {
            fs.renameSync(oldPath, newPath);
            logs.push(`✓ Renomeado: ${file} → ${newFileName}`);
            usedNumbers.push(counter);
            counter++;
            while (usedNumbers.includes(counter)) {
                counter++;
            }
        } catch (error) {
            logs.push(`✗ Erro ao renomear ${file}: ${error.message}`);
        }
    });

    logs.push('Processo de renomeação concluído!');
    return { 
        success: true, 
        message: 'Arquivos renomeados com sucesso!',
        logs: logs
    };
});