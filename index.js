const { app, BrowserWindow, dialog, ipcMain } = require('electron');
const fs = require('fs');
const path = require('path');
const pptxgen = require('pptxgenjs');

let mainWindow;

app.whenReady().then(() => {
    mainWindow = new BrowserWindow({
        width: 1000,
        height: 700,
        minWidth: 1000,
        minHeight: 700,
        icon: path.join(__dirname, 'assets', 'icon.png'),
        webPreferences: {
            nodeIntegration: true,  // Permite usar require no index.html
            contextIsolation: false // Evita conflitos ao usar ipcRenderer
        },
    });

    mainWindow.setTitle('Gerenciador de Arquivos');
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

ipcMain.handle('create-vsl', async (_, text, styleOptions) => {
    try {
        const result = await dialog.showSaveDialog(mainWindow, {
            title: 'Salvar Apresentação',
            defaultPath: path.join(app.getPath('documents'), 'apresentacao.pptx'),
            filters: [{ name: 'PowerPoint', extensions: ['pptx'] }]
        });

        if (!result.filePath) {
            return { success: false, message: 'Operação cancelada pelo usuário' };
        }

        const logs = [];
        logs.push('Iniciando criação da apresentação...');

        const pres = new pptxgen();
        const slides = text.split('\n').filter(line => line.trim());

        // Configurar o estilo padrão para todas as slides
        pres.layout = 'LAYOUT_16x9';
        pres.author = 'VSL Creator';

        for (let i = 0; i < slides.length; i++) {
            const slide = pres.addSlide();
            const text = slides[i].trim();
            
            // Configurar o fundo da slide
            slide.background = { color: styleOptions.backgroundColor };

            // Configurar o texto com as opções de estilo
            const textOptions = {
                x: '10%',
                y: '40%',
                w: '80%',
                h: '20%',
                fontSize: styleOptions.fontSize,
                color: styleOptions.textColor.replace('#', ''),
                align: 'center',
                valign: 'middle',
                fontFace: styleOptions.fontFamily,
                bold: styleOptions.bold,
                italic: styleOptions.italic,
                underline: styleOptions.underline
            };

            slide.addText(text, textOptions);
            logs.push(`✓ Slide ${i + 1} criada: "${text}"`);
        }

        await pres.writeFile({ fileName: result.filePath });
        logs.push(`Apresentação salva com sucesso em: ${result.filePath}`);

        return {
            success: true,
            message: 'Apresentação criada com sucesso!',
            logs: logs
        };
    } catch (error) {
        return {
            success: false,
            message: `Erro ao criar apresentação: ${error.message}`,
            logs: [`✗ Erro: ${error.message}`]
        };
    }
});