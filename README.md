# AI-Enabled Job Resume Intelligence Platform

## KPMG Full Stack Role Assessment

### Objective
Build a full-stack AI-enabled web application to analyze job descriptions, extract skills, compare them with resumes, rank candidates, and enable conversational AI on resumes.

### Core Functional Requirements
- Enter job title
- Scrape or load job descriptions
- Extract job skills
- Upload resume (PDF or text)
- Extract resume skills
- Show match percentage, matched skills, missing skills

### Extended AI Requirements
- Recommend top 10 resumes per job
- Chat with uploaded resume PDFs
- Persistent conversation memory

### Backend Responsibilities
- Job data processing
- Resume ingestion and embeddings
- Skill extraction and matching
- Resume ranking engine
- RAG-based resume chat
- Conversation memory management

### Technology Stack
- **Frontend:** React / Vue / Angular
- **Backend:** Node.js + Express
- **AI:** LangChain, LangGraph, Mem0, AI SDK
- **Data:** Neo4j, Vector DB (optional)

### Evaluation Focus
- AI orchestration
- RAG implementation
- Memory-aware systems
- MERN + LLM integration

---
See SETUP.md for installation and usage instructions.

# AI-Enabled Job Resume Intelligence Platform

Full-stack AI-powered platform for analyzing job descriptions, extracting skills, matching resumes, ranking candidates, and enabling conversational AI on resumes.

> **📖 For complete project flow and technical details, see:**
> - [`PROJECT_DESCRIPTION.md`](./PROJECT_DESCRIPTION.md) - Full UI flow, technical implementation, and architecture
> - [`IMPLEMENTATION_STATUS.md`](./IMPLEMENTATION_STATUS.md) - Current status and enhancement roadmap

## Tech Stack

### Frontend
- React 18 + TypeScript
- Vite
- Tailwind CSS
- Axios

### Backend
- Node.js + Express + TypeScript
- Neo4j (Graph Database)
- Chroma (Vector Database)
- LangChain (AI orchestration)
- OpenAI API (LLM & Embeddings)
- In-memory conversation memory (can be upgraded to Mem0)

## Features

### ✅ Core Features (Implemented)
- Job description ingestion (paste or URL)
- Skill extraction from job descriptions (LLM-powered)
- Resume upload (PDF/text)
- Resume skill extraction (LLM-powered)
- Match percentage calculation (graph + vector similarity)
- Matched/missing skills display
- Top 10 resume recommendations per job
- RAG-based chat with resumes
- Conversation memory (in-memory, upgradeable to persistent)

### 🎯 Platform Flow
1. **Create Job** → Paste JD → AI extracts skills → Stored in Neo4j graph
2. **Upload Resumes** → PDF/TXT → Parsed → Skills extracted → Embedded → Stored
3. **View Matches** → Select job → See ranked candidates with match % and skills
4. **Chat with Resume** → Ask questions → RAG retrieval → LLM response → Memory updated

## Quick Start

See [SETUP.md](./SETUP.md) for detailed setup instructions.

```bash
# Install dependencies
npm run install:all

# Start Neo4j (Docker)
docker-compose up -d

# Configure environment
cp backend/.env.example backend/.env
# Edit backend/.env with your OpenAI API key

# Start development servers
npm run dev
```

Backend: `http://localhost:3001`  
Frontend: `http://localhost:5173`  
Neo4j Browser: `http://localhost:7474`

## Project Structure

```
├── backend/          # Express API server
│   ├── src/
│   │   ├── routes/   # API routes
│   │   ├── services/ # Business logic
│   │   ├── neo4j/    # Neo4j graph operations
│   │   ├── vector/   # Vector DB operations
│   │   └── ai/       # AI/LLM integrations
├── frontend/         # React application
│   ├── src/
│   │   ├── pages/    # Page components
│   │   ├── components/ # Reusable components
│   │   └── services/ # API clients
└── README.md
```

## API Endpoints

- `POST /api/jobs` - Create job from title/description
- `GET /api/jobs/:id` - Get job details
- `POST /api/resumes` - Upload resume
- `GET /api/resumes/:id` - Get resume details
- `GET /api/jobs/:id/matches` - Get top matching resumes

