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

            // Criar um canvas com o tamanho alvo e fundo transparente
            const canvas = createCanvas(width, height);
            const ctx = canvas.getContext('2d');

            // Limpar o canvas com transparência
            ctx.clearRect(0, 0, width, height);

            // Calcular a posição central
            const x = Math.round((width - newWidth) / 2);
            const y = Math.round((height - newHeight) / 2);

            // Redimensionar a imagem mantendo a proporção e transparência
            const resizedBuffer = await sharp(inputFilePath)
                .resize(newWidth, newHeight, {
                    fit: 'contain',
                    background: { r: 0, g: 0, b: 0, alpha: 0 }
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
                    compressionLevel: 9,
                    background: { r: 0, g: 0, b: 0, alpha: 0 }
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

ipcMain.handle('process-unity-sprites', async (_, inputPath, options) => {
    if (!inputPath) {
        return { success: false, message: 'Nenhuma imagem selecionada' };
    }

    try {
        // Obter metadados da imagem
        const metadata = await sharp(inputPath).metadata();
        const imageWidth = metadata.width;
        const imageHeight = metadata.height;

        // Calcular número de sprites por linha e coluna
        const spritesPerRow = Math.floor((imageWidth + options.spacingX) / (options.spriteWidth + options.spacingX));
        const spritesPerColumn = Math.floor((imageHeight + options.spacingY) / (options.spriteHeight + options.spacingY));
        const totalSprites = spritesPerRow * spritesPerColumn;

        // Criar pasta de saída
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const outputDir = path.join(path.dirname(inputPath), `unity_sprites_${timestamp}`);
        if (!fs.existsSync(outputDir)) {
            fs.mkdirSync(outputDir, { recursive: true });
        }

        const logs = [];
        logs.push(`Processando sprite sheet: ${path.basename(inputPath)}`);
        logs.push(`Dimensões originais: ${imageWidth}x${imageHeight}px`);
        logs.push(`Sprites por linha: ${spritesPerRow}`);
        logs.push(`Sprites por coluna: ${spritesPerColumn}`);
        logs.push(`Total de sprites: ${totalSprites}`);

        // Processar cada sprite
        for (let row = 0; row < spritesPerColumn; row++) {
            for (let col = 0; col < spritesPerRow; col++) {
                const spriteIndex = row * spritesPerRow + col;
                const outputPath = path.join(outputDir, `sprite_${spriteIndex + 1}.png`);

                // Calcular posição do sprite
                const left = col * (options.spriteWidth + options.spacingX);
                const top = row * (options.spriteHeight + options.spacingY);

                // Extrair e redimensionar o sprite
                await sharp(inputPath)
                    .extract({
                        left: left,
                        top: top,
                        width: options.spriteWidth,
                        height: options.spriteHeight
                    })
                    .resize(options.finalWidth, options.finalHeight, {
                        fit: 'contain',
                        background: { r: 0, g: 0, b: 0, alpha: 0 }
                    })
                    .png({
                        quality: 100,
                        compressionLevel: 9
                    })
                    .toFile(outputPath);

                logs.push(`✓ Processado sprite ${spriteIndex + 1}`);
            }
        }

        logs.push(`Todos os sprites foram processados e salvos em: ${outputDir}`);

        return {
            success: true,
            message: 'Sprites processados com sucesso!',
            logs: logs
        };
    } catch (error) {
        return {
            success: false,
            message: `Erro ao processar sprites: ${error.message}`,
            logs: [`✗ Erro: ${error.message}`]
        };
    }
});

ipcMain.handle('select-unity-meta', async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
        properties: ['openFile'],
        filters: [
            { name: 'Unity Meta Files', extensions: ['meta'] }
        ],
        buttonLabel: 'Selecionar Meta',
        title: 'Selecionar Arquivo .meta da Unity'
    });
    return result.filePaths[0] || null;
});

function parseUnityMeta(metaContent) {
    const spriteData = {
        sprites: [],
        pixelsToUnits: 100,
        pivot: { x: 0.5, y: 0.5 }
    };

    console.log('Iniciando análise do arquivo .meta...');

    // Dividir o conteúdo em linhas
    const lines = metaContent.split('\n');
    let currentSprite = null;

    // Procurar por cada sprite no arquivo
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();

        // Se encontrar o início de um sprite
        if (line.includes('name:') && line.includes('[SHOOT]')) {
            const name = line.split('name:')[1].trim().replace(/['"]/g, '');
            currentSprite = {
                name: name,
                rect: { x: 0, y: 0, width: 0, height: 0 }
            };
        }

        // Se encontrar as coordenadas do sprite
        if (currentSprite) {
            if (line.includes('x:')) {
                currentSprite.rect.x = parseInt(line.split('x:')[1].trim());
            }
            if (line.includes('y:')) {
                currentSprite.rect.y = parseInt(line.split('y:')[1].trim());
            }
            if (line.includes('width:')) {
                currentSprite.rect.width = parseInt(line.split('width:')[1].trim());
            }
            if (line.includes('height:')) {
                currentSprite.rect.height = parseInt(line.split('height:')[1].trim());
                
                // Se temos todas as coordenadas, adicionar o sprite
                if (currentSprite.rect.width > 0 && currentSprite.rect.height > 0) {
                    spriteData.sprites.push(currentSprite);
                    console.log('Sprite encontrado:', currentSprite);
                }
                currentSprite = null;
            }
        }
    }

    console.log('Total de sprites encontrados:', spriteData.sprites.length);
    return spriteData;
}

ipcMain.handle('process-unity-meta', async (_, metaPath, options) => {
    try {
        // Passo 1: Ler o arquivo .meta e coletar os dados
        const metaContent = fs.readFileSync(metaPath, 'utf8');
        console.log('Arquivo .meta lido:', metaPath);
        
        const spriteData = parseUnityMeta(metaContent);
        console.log('Dados dos sprites extraídos:', spriteData);

        if (spriteData.sprites.length === 0) {
            return {
                success: false,
                message: 'Nenhum sprite encontrado no arquivo .meta',
                logs: ['✗ Erro: Nenhum sprite encontrado no arquivo .meta']
            };
        }

        // Passo 2: Encontrar a imagem correspondente ao .meta
        const metaFileName = path.basename(metaPath, '.meta');
        const metaDir = path.dirname(metaPath);
        
        // Lista de extensões possíveis para imagens
        const possibleExtensions = ['.png', '.jpg', '.jpeg', '.webp', '.tga', '.psd', '.tif', '.tiff'];
        let imagePath = null;

        // Primeiro, tentar encontrar a imagem com o mesmo nome do arquivo .meta
        for (const ext of possibleExtensions) {
            const possiblePath = path.join(metaDir, metaFileName + ext);
            if (fs.existsSync(possiblePath)) {
                imagePath = possiblePath;
                break;
            }
        }

        // Se não encontrou, procurar por qualquer imagem na pasta
        if (!imagePath) {
            const files = fs.readdirSync(metaDir);
            for (const file of files) {
                const ext = path.extname(file).toLowerCase();
                if (possibleExtensions.includes(ext)) {
                    imagePath = path.join(metaDir, file);
                    break;
                }
            }
        }

        if (!imagePath) {
            return {
                success: false,
                message: 'Imagem referenciada pelo .meta não encontrada',
                logs: [
                    '✗ Erro: Imagem referenciada pelo .meta não encontrada',
                    'Tentou encontrar arquivos com as seguintes extensões: ' + possibleExtensions.join(', '),
                    'Diretório pesquisado: ' + metaDir
                ]
            };
        }

        // Criar pasta de saída
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const outputDir = path.join(metaDir, `unity_sprites_${timestamp}`);
        if (!fs.existsSync(outputDir)) {
            fs.mkdirSync(outputDir, { recursive: true });
        }

        const logs = [];
        logs.push(`Processando sprite sheet: ${path.basename(imagePath)}`);
        logs.push(`Total de sprites encontrados: ${spriteData.sprites.length}`);

        // Passo 3: Processar cada sprite
        for (const sprite of spriteData.sprites) {
            // Primeiro, extrair o sprite da imagem original
            const tempPath = path.join(outputDir, `temp_${sprite.name}.png`);
            const outputPath = path.join(outputDir, `${sprite.name}.png`);

            // Extrair o sprite usando as dimensões do .meta
            await sharp(imagePath)
                .extract({
                    left: sprite.rect.x,
                    top: sprite.rect.y,
                    width: sprite.rect.width,
                    height: sprite.rect.height
                })
                .toFile(tempPath);

            // Depois, redimensionar para o tamanho final
            await sharp(tempPath)
                .resize(options.finalWidth, options.finalHeight, {
                    fit: 'contain',
                    background: { r: 0, g: 0, b: 0, alpha: 0 }
                })
                .png({
                    quality: 100,
                    compressionLevel: 9
                })
                .toFile(outputPath);

            // Remover o arquivo temporário
            fs.unlinkSync(tempPath);

            logs.push(`✓ Sprite processado: ${sprite.name}`);
            logs.push(`  Posição original: x=${sprite.rect.x}, y=${sprite.rect.y}`);
            logs.push(`  Dimensões originais: ${sprite.rect.width}x${sprite.rect.height}`);
            logs.push(`  Dimensões finais: ${options.finalWidth}x${options.finalHeight}`);
        }

        logs.push(`Todos os sprites foram processados e salvos em: ${outputDir}`);

        return {
            success: true,
            message: 'Sprites processados com sucesso!',
            logs: logs
        };
    } catch (error) {
        return {
            success: false,
            message: `Erro ao processar sprites: ${error.message}`,
            logs: [`✗ Erro: ${error.message}`]
        };
    }
});