# Schemat Render Service

A unified service for rendering Minecraft schematics, featuring:
- 🎨 High-quality schematic rendering via Puppeteer
- 🤖 Discord bot integration
- 🌐 React frontend for web interface
- 🚀 Single container deployment
- ⚡ Optimized with Bun runtime

## Quick Start

```bash
# Install dependencies
bun install

# Setup project
bun run setup-libs

# Configure environment
cp .env.example .env
# Edit .env with your Discord token and other settings

# Add schematic renderer library
# Place schematic-renderer.tar.gz in libs/ directory

# Start development
bun run dev
```

## Architecture

- **Backend**: Express.js + TypeScript + Puppeteer
- **Frontend**: React + Vite + TypeScript  
- **Bot**: Discord.js v14
- **Runtime**: Bun for package management and execution
- **Container**: Docker with multi-stage builds

## API Endpoints

- `POST /api/render` - Render schematic file
- `GET /health` - Service health check
- `GET /` - React frontend

## Discord Commands

- `/render` - Render uploaded schematic
- `/health` - Bot status

## Development

```bash
bun run dev          # Start both frontend and backend
bun run dev:backend  # Backend only
bun run dev:frontend # Frontend only
```

## Production

```bash
# Build everything
bun run build

# Run with Docker
docker-compose up --build

# Or run directly
bun start
```

## License

MIT
