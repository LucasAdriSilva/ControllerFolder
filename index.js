const { app, BrowserWindow, dialog, ipcMain } = require('electron');
const fs = require('fs');
const path = require('path');
const pptxgen = require('pptxgenjs');
const sharp = require('sharp');
const { createCanvas } = require('canvas');

let mainWindow;
let selectedImagePath = null;

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

    mainWindow.setTitle('Tools Design');
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

async function generatePowerPoint(text, styleOptions, outputPath) {
    const pres = new pptxgen();
    const slides = text.split('\n').filter(line => line.trim());
    const logs = [];

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

    await pres.writeFile({ fileName: outputPath });
    logs.push(`Apresentação salva com sucesso em: ${outputPath}`);

    return logs;
}

ipcMain.handle('create-vsl', async (_, text, styleOptions) => {
    try {
        // Perguntar ao usuário qual formato deseja
        const result = await dialog.showMessageBox(mainWindow, {
            type: 'question',
            title: 'Escolher Formato',
            message: 'Em qual formato você deseja gerar o conteúdo?',
            buttons: ['PowerPoint', 'Imagens', 'Cancelar'],
            defaultId: 0,
            cancelId: 2
        });

        if (result.response === 2) { // Cancelar
            return { success: false, message: 'Operação cancelada pelo usuário' };
        }

        const logs = [];
        logs.push('Iniciando geração do conteúdo...');

        if (result.response === 0) { // PowerPoint
            const saveResult = await dialog.showSaveDialog(mainWindow, {
                title: 'Salvar Apresentação',
                defaultPath: path.join(app.getPath('documents'), 'apresentacao.pptx'),
                filters: [{ name: 'PowerPoint', extensions: ['pptx'] }]
            });

            if (!saveResult.filePath) {
                return { success: false, message: 'Operação cancelada pelo usuário' };
            }

            const pptLogs = await generatePowerPoint(text, styleOptions, saveResult.filePath);
            logs.push(...pptLogs);

            return {
                success: true,
                message: 'Apresentação criada com sucesso!',
                logs: logs
            };
        } else { // Imagens
            const folderResult = await dialog.showOpenDialog(mainWindow, {
                title: 'Selecionar Pasta para Salvar Imagens',
                properties: ['openDirectory']
            });

            if (!folderResult.filePaths[0]) {
                return { success: false, message: 'Operação cancelada pelo usuário' };
            }

            const outputDir = folderResult.filePaths[0];
            const imagesDir = path.join(outputDir, 'imagens');
            
            // Criar pasta 'imagens' se não existir
            if (!fs.existsSync(imagesDir)) {
                fs.mkdirSync(imagesDir);
            }

            const slides = text.split('\n').filter(line => line.trim());
            
            for (let i = 0; i < slides.length; i++) {
                const text = slides[i].trim();
                
                // Criar um canvas com dimensões 1920x1080 (16:9)
                const canvas = createCanvas(1920, 1080);
                const ctx = canvas.getContext('2d');

                // Preencher o fundo
                ctx.fillStyle = styleOptions.backgroundColor;
                ctx.fillRect(0, 0, 1920, 1080);

                // Configurar o texto
                ctx.fillStyle = styleOptions.textColor;
                ctx.font = `${styleOptions.bold ? 'bold' : ''} ${styleOptions.italic ? 'italic' : ''} ${styleOptions.fontSize}px ${styleOptions.fontFamily}`;
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';

                // Adicionar o texto
                ctx.fillText(text, 960, 540);

                // Converter o canvas para buffer
                const buffer = canvas.toBuffer('image/png');

                // Salvar a imagem com numeração simples
                const fileName = `${i + 1}.png`;
                const filePath = path.join(imagesDir, fileName);
                
                await sharp(buffer)
                    .png()
                    .toFile(filePath);

                logs.push(`✓ Imagem ${i + 1} criada: "${fileName}"`);
            }

            logs.push(`Imagens salvas com sucesso em: ${imagesDir}`);

            return {
                success: true,
                message: 'Imagens criadas com sucesso!',
                logs: logs
            };
        }
    } catch (error) {
        return {
            success: false,
            message: `Erro ao criar conteúdo: ${error.message}`,
            logs: [`✗ Erro: ${error.message}`]
        };
    }
});

ipcMain.handle('select-image-folder', async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
        properties: ['openFile', 'openDirectory'],
        filters: [
            { name: 'Imagens', extensions: ['jpg', 'jpeg', 'png', 'webp', 'avif', 'tiff'] },
            { name: 'Todos os Arquivos', extensions: ['*'] }
        ]
    });
    selectedImagePath = result.filePaths[0] || null;
    return selectedImagePath;
});

ipcMain.handle('convert-images', async (_, outputFormat) => {
    if (!selectedImagePath) {
        return { success: false, message: 'Nenhuma imagem ou pasta selecionada' };
    }

    const stats = fs.statSync(selectedImagePath);
    const isDirectory = stats.isDirectory();
    const files = isDirectory 
        ? fs.readdirSync(selectedImagePath).filter(file => {
            const ext = path.extname(file).toLowerCase();
            return ['.jpg', '.jpeg', '.png', '.webp', '.avif', '.tiff'].includes(ext);
        })
        : [path.basename(selectedImagePath)];

    // Criar pasta de saída com nome mais descritivo
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const outputDir = isDirectory 
        ? path.join(selectedImagePath, `imagens_convertidas_${outputFormat.toUpperCase()}_${timestamp}`)
        : path.join(path.dirname(selectedImagePath), `imagens_convertidas_${outputFormat.toUpperCase()}_${timestamp}`);

    // Criar a pasta de saída
    if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
    }

    const logs = [];
    logs.push(`Iniciando conversão de ${files.length} imagem(ns)...`);

    for (const file of files) {
        const inputPath = isDirectory ? path.join(selectedImagePath, file) : selectedImagePath;
        const outputPath = path.join(outputDir, `${path.parse(file).name}.${outputFormat}`);

        try {
            // Obter tamanho original
            const originalStats = fs.statSync(inputPath);
            const originalSize = (originalStats.size / 1024).toFixed(2); // Tamanho em KB

            // Converter a imagem
            await sharp(inputPath)
                .toFormat(outputFormat)
                .toFile(outputPath);

            // Obter tamanho após conversão
            const convertedStats = fs.statSync(outputPath);
            const convertedSize = (convertedStats.size / 1024).toFixed(2); // Tamanho em KB

            // Calcular redução
            const reduction = ((originalStats.size - convertedStats.size) / originalStats.size * 100).toFixed(1);
            
            logs.push(`✓ Convertido: ${file}`);
            logs.push(`  Tamanho original: ${originalSize} KB`);
            logs.push(`  Tamanho após conversão: ${convertedSize} KB`);
            logs.push(`  Redução: ${reduction}%`);
            logs.push(`  Salvo em: ${outputPath}`);
        } catch (error) {
            logs.push(`✗ Erro ao converter ${file}: ${error.message}`);
        }
    }

    return {
        success: true,
        message: `Conversão concluída! Arquivos salvos em: ${outputDir}`,
        logs
    };
});