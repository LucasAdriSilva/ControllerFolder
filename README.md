# Renomeador de Arquivos

Um aplicativo desktop simples e eficiente para renomear arquivos automaticamente com numeração sequencial.

## 📋 Descrição

Este aplicativo permite que você renomeie múltiplos arquivos em uma pasta, adicionando uma numeração automática no início de cada nome de arquivo. É útil para organizar arquivos em uma sequência numérica, mantendo seus nomes originais após o número.

## 🎯 Casos de Uso

### Designers e Editores de Imagem
- Organização de pastas de projetos com múltiplas imagens
- Organização de assets para projetos de UI/UX
- Gerenciamento de bibliotecas de imagens para sites e aplicativos

### Fotógrafos
- Organização de sessões fotográficas
- Renomeação de fotos em lote
- Preparação de imagens para portfólio

### Desenvolvedores
- Organização de assets de projetos
- Gerenciamento de recursos de jogos
- Organização de imagens de documentação

## ✨ Funcionalidades

- Seleção de pasta com interface gráfica
- Renomeação automática de arquivos com numeração sequencial
- Barra de progresso visual
- Sistema de log detalhado
- Interface moderna e intuitiva
- Compatível com Windows e macOS

## 🚀 Como Usar

1. Clique no botão "Selecionar Pasta" para escolher a pasta que contém os arquivos que deseja renomear

![TImagem do aplicativo](https://github.com/LucasAdriSilva/ControllerFolder/blob/master/assets/app.png)

2. Clique em "Renomear Arquivos" para iniciar o processo
3. O aplicativo irá:
   - Identificar arquivos que já possuem numeração
   - Renomear os arquivos restantes começando do próximo número disponível
   - Mostrar o progresso em tempo real
   - Exibir um log detalhado das operações realizadas

##

## 💻 Requisitos do Sistema

- Node.js (versão 14 ou superior)
- npm (gerenciador de pacotes do Node.js)

## 🔧 Instalação

### Windows

1. Clone o repositório:
```bash
git clone https://github.com/LucasAdriSilva/ControllerFolder
cd renomeador-arquivos
```

2. Instale as dependências:
```bash
npm install
```

3. Execute o aplicativo:
```bash
npm start
```

### macOS

1. Clone o repositório:
```bash
git clone https://github.com/seu-usuario/renomeador-arquivos.git
cd renomeador-arquivos
```

2. Instale as dependências:
```bash
npm install
```

3. Execute o aplicativo:
```bash
npm start
```

## 📦 Criando um Executável

Para criar um executável do aplicativo:

```bash
npm run dist
```

Os executáveis serão gerados na pasta `dist`.

## 🛠️ Desenvolvimento

Para contribuir com o projeto:

1. Faça um fork do repositório
2. Crie uma branch para sua feature (`git checkout -b feature/AmazingFeature`)
3. Commit suas mudanças (`git commit -m 'Add some AmazingFeature'`)
4. Push para a branch (`git push origin feature/AmazingFeature`)
5. Abra um Pull Request

## 📝 Licença

Este projeto está sob a licença ISC. Veja o arquivo [LICENSE](LICENSE) para mais detalhes.

## 👥 Autores

- Lucas Adriano - [LucasAdriSilva](https://github.com/LucasAdriSilva)

## 🙏 Agradecimentos

- Electron.js
- Node.js
- Todos os contribuidores do projeto 