# Setup Guide

## Prerequisites

- Node.js 18+ installed
- Docker Desktop (for Neo4j) OR Neo4j Aura Free account
- OpenAI API key (or Anthropic API key)

## Step 1: Install Dependencies

```bash
npm run install:all
```

## Step 2: Set Up Neo4j

### Option A: Using Docker (Recommended for local development)

```bash
docker-compose up -d
```

Wait for Neo4j to start (check logs: `docker-compose logs neo4j`)

Access Neo4j Browser at: http://localhost:7474
- Username: `neo4j`
- Password: `password`

### Option B: Using Neo4j Aura (Cloud)

1. Sign up at https://neo4j.com/cloud/aura/
2. Create a free database
3. Copy the connection URI and credentials

## Step 3: Configure Environment Variables

Copy the example environment file:

```bash
cp backend/.env.example backend/.env
```

Edit `backend/.env` and fill in:

```env
# Server
PORT=3001
NODE_ENV=development

# Neo4j (use your Docker or Aura credentials)
NEO4J_URI=bolt://localhost:7687
NEO4J_USER=neo4j
NEO4J_PASSWORD=password

# OpenAI API Key (required)
OPENAI_API_KEY=sk-your-key-here

# Vector DB (Chroma - local, no config needed)
CHROMA_PATH=./chroma-data

# File Upload
UPLOAD_DIR=./uploads
MAX_FILE_SIZE=10485760
```

## Step 4: Start the Application

### Development Mode (both frontend and backend)

```bash
npm run dev
```

This will start:
- Backend API: http://localhost:3001
- Frontend: http://localhost:5173

### Or start separately:

```bash
# Terminal 1 - Backend
npm run dev:backend

# Terminal 2 - Frontend
npm run dev:frontend
```

## Step 5: Test the Application

1. Open http://localhost:5173 in your browser
2. Create a job posting with title and description
3. Upload a resume (PDF or TXT)
4. View matches on the job detail page
5. Chat with resumes using the chat feature

## Troubleshooting

### Neo4j Connection Issues

- Ensure Neo4j is running: `docker ps` (should show neo4j container)
- Check Neo4j logs: `docker-compose logs neo4j`
- Verify credentials in `.env` match your Neo4j setup

### Chroma/Vector DB Issues

- Chroma runs locally, no external setup needed
- If errors occur, delete `chroma-data` folder and restart

### OpenAI API Issues

- Verify your API key is correct
- Check you have credits/quota available
- Ensure the key has access to `gpt-4o-mini` and `text-embedding-3-small`

### File Upload Issues

- Ensure `backend/uploads` directory exists (created automatically)
- Check file size is under 10MB
- Only PDF and TXT files are supported

## Architecture Overview

- **Neo4j**: Stores jobs, resumes, skills, and relationships (graph structure)
- **Chroma**: Stores resume text embeddings for semantic search
- **OpenAI**: Powers skill extraction, embeddings, and RAG chat
- **Express**: REST API backend
- **React**: Modern frontend UI

## Next Steps

- Add more resume formats (DOCX, etc.)
- Implement job description scraping from URLs
- Add user authentication
- Enhance matching algorithm with more factors
- Add export functionality for match reports

