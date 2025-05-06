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
            underline: styleOptions.underline,
            breakLine: false,
            maxLines: undefined,
            autoFit: true,
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

        // Determinar dimensões baseado na orientação
        const isVertical = styleOptions.orientation === 'vertical';
        const width = isVertical ? 1080 : 1920;
        const height = isVertical ? 1920 : 1080;

        if (result.response === 0) { // PowerPoint
            const saveResult = await dialog.showSaveDialog(mainWindow, {
                title: 'Salvar Apresentação',
                defaultPath: path.join(app.getPath('documents'), 'apresentacao.pptx'),
                filters: [{ name: 'PowerPoint', extensions: ['pptx'] }]
            });

            if (!saveResult.filePath) {
                return { success: false, message: 'Operação cancelada pelo usuário' };
            }

            const pres = new pptxgen();
            const slides = text.split('\n').filter(line => line.trim());

            // Configurar o estilo padrão para todas as slides
            if (isVertical) {
                pres.defineLayout({ width: 11.7, height: 16.5 });
            } else {
                pres.layout = isVertical ? '9x16' : '16x9';
            }
            pres.author = 'VSL Creator';

            for (let i = 0; i < slides.length; i++) {
                const slide = pres.addSlide();
                const text = slides[i].trim();

                // Configurar o fundo da slide
                slide.background = { color: styleOptions.backgroundColor };

                // Configurar o texto com as opções de estilo
                const textOptions = {
                    x: isVertical ? '30%' : '10%',
                    y: isVertical ? '30%' : '40%',
                    w: isVertical ? '40%' : '80%',
                    h: isVertical ? '40%' : '20%',
                    fontSize: styleOptions.fontSize,
                    color: styleOptions.textColor.replace('#', ''),
                    align: 'center',
                    valign: 'middle',
                    fontFace: styleOptions.fontFamily,
                    bold: styleOptions.bold,
                    italic: styleOptions.italic,
                    underline: styleOptions.underline,
                    breakLine: isVertical ? true : false,
                    maxLines: undefined,
                    autoFit: true,
                    fontSize: styleOptions.fontSize
                };

                slide.addText(text, textOptions);
                logs.push(`✓ Slide ${i + 1} criada: "${text}"`);
            }

            await pres.writeFile({ fileName: saveResult.filePath });
            logs.push(`Apresentação salva com sucesso em: ${saveResult.filePath}`);

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

                // Criar um canvas com dimensões baseado na orientação
                const canvas = createCanvas(width, height);
                const ctx = canvas.getContext('2d');

                // Preencher o fundo
                ctx.fillStyle = styleOptions.backgroundColor;
                ctx.fillRect(0, 0, width, height);

                // Configurar o texto
                ctx.fillStyle = styleOptions.textColor;
                ctx.font = `${styleOptions.bold ? 'bold' : ''} ${styleOptions.italic ? 'italic' : ''} ${styleOptions.fontSize}px ${styleOptions.fontFamily}`;
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';

                // Adicionar o texto
                ctx.fillText(text, width / 2, height / 2);

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
        ],
        buttonLabel: 'Selecionar',
        title: 'Selecionar Imagem ou Pasta',
        defaultPath: app.getPath('pictures')
    });
    selectedImagePath = result.filePaths[0] || null;
    return selectedImagePath;
});

ipcMain.handle('select-resize-image', async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
        properties: ['openFile'],
        filters: [
            { name: 'Imagens', extensions: ['jpg', 'jpeg', 'png', 'webp', 'avif', 'tiff'] }
        ],
        buttonLabel: 'Selecionar Imagem',
        title: 'Selecionar Imagem para Redimensionar',
        defaultPath: app.getPath('pictures')
    });
    return result.filePaths[0] || null;
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

ipcMain.handle('resize-images', async (_, inputPath, width, height) => {
    if (!inputPath) {
        return { success: false, message: 'Nenhuma imagem selecionada' };
    }

    const stats = fs.statSync(inputPath);
    const isDirectory = stats.isDirectory();
    
    // Verificar se é um arquivo de imagem válido
    if (!isDirectory) {
        const ext = path.extname(inputPath).toLowerCase();
        const validExtensions = ['.jpg', '.jpeg', '.png', '.webp', '.avif', '.tiff'];
        if (!validExtensions.includes(ext)) {
            return { 
                success: false, 
                message: 'O arquivo selecionado não é uma imagem válida',
                logs: [`✗ Erro: O arquivo ${path.basename(inputPath)} não é uma imagem válida`]
            };
        }
    }

    const files = isDirectory
        ? fs.readdirSync(inputPath).filter(file => {
            const ext = path.extname(file).toLowerCase();
            return ['.jpg', '.jpeg', '.png', '.webp', '.avif', '.tiff'].includes(ext);
        })
        : [path.basename(inputPath)];

    // Criar pasta de saída com nome descritivo
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const outputDir = isDirectory
        ? path.join(inputPath, `imagens_redimensionadas_${width}x${height}_${timestamp}`)
        : path.join(path.dirname(inputPath), `imagens_redimensionadas_${width}x${height}_${timestamp}`);

    // Criar a pasta de saída
    if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
    }

    const logs = [];
    logs.push(`Iniciando redimensionamento de ${files.length} imagem(ns) para ${width}x${height}px...`);

    for (const file of files) {
        const inputFilePath = isDirectory ? path.join(inputPath, file) : inputPath;
        const outputPath = path.join(outputDir, `${path.parse(file).name}.png`);

        try {
            // Obter dimensões originais
            const metadata = await sharp(inputFilePath).metadata();
            const originalWidth = metadata.width;
            const originalHeight = metadata.height;

            // Calcular as novas dimensões mantendo a proporção
            let newWidth = width;
            let newHeight = height;
            const originalRatio = originalWidth / originalHeight;
            const targetRatio = width / height;

            if (originalRatio > targetRatio) {
                // Imagem original é mais larga que o alvo
                newHeight = Math.round(width / originalRatio);
            } else {
                // Imagem original é mais alta que o alvo
                newWidth = Math.round(height * originalRatio);
            }

            // Criar um canvas com o tamanho alvo
            const canvas = createCanvas(width, height);
            const ctx = canvas.getContext('2d');

            // Preencher o fundo com branco
            ctx.fillStyle = '#FFFFFF';
            ctx.fillRect(0, 0, width, height);

            // Calcular a posição central
            const x = Math.round((width - newWidth) / 2);
            const y = Math.round((height - newHeight) / 2);

            // Redimensionar a imagem mantendo a proporção
            const resizedBuffer = await sharp(inputFilePath)
                .resize(newWidth, newHeight, {
                    fit: 'contain',
                    background: { r: 255, g: 255, b: 255, alpha: 1 }
                })
                .toBuffer();

            // Converter o buffer para uma imagem
            const img = await sharp(resizedBuffer).toBuffer();

            // Colar a imagem redimensionada no centro do canvas
            await sharp(canvas.toBuffer())
                .composite([{
                    input: img,
                    top: y,
                    left: x
                }])
                .png({
                    quality: 100,
                    compressionLevel: 9
                })
                .toFile(outputPath);

            logs.push(`✓ Redimensionado: ${file}`);
            logs.push(`  Dimensões originais: ${originalWidth}x${originalHeight}px`);
            logs.push(`  Dimensões redimensionadas: ${newWidth}x${newHeight}px`);
            logs.push(`  Dimensões finais: ${width}x${height}px`);
            logs.push(`  Salvo em: ${outputPath}`);
        } catch (error) {
            logs.push(`✗ Erro ao redimensionar ${file}: ${error.message}`);
        }
    }

    return {
        success: true,
        message: `Redimensionamento concluído! Arquivos salvos em: ${outputDir}`,
        logs
    };
});