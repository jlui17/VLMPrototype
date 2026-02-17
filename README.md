# VLM Video Q&A API

A backend API that lets users query videos using a VLM (Video Language Model) with natural language Q&A. Submit a video, ask questions about it, and get answers powered by a model-agnostic VLM provider.

## Architecture

[View / Edit on Excalidraw](https://excalidraw.com/#json=00XAXWYlC_WVhZ_hP_rR_,mUooXloAqeqxJxnwoJlrQQ)

```
              ┌──────────────────┐
              │    API Server    │
              │  (Bun + Express) │
              └──┬───────────┬───┘
                 │           │
     store video │           │ create job /
                 │           │ read status
                 ▼           ▼
        ┌─────────────┐  ┌──────────────────┐
        │ Blob Storage│  │     Database     │
        │             │  │ (Jobs + Results) │
        └─────────────┘  └──────────────────┘
                 ▲           ▲
     fetch video │           │ poll jobs /
                 │           │ write results
              ┌──┴───────────┴──┐
              │     Worker      │
              └────────┬────────┘
                       │
                       │ video + query
                       ▼
              ┌──────────────────┐
              │  VLM Provider    │
              └──────────────────┘
```

### Components

| Component | Role |
|---|---|
| **API Server** (Bun + Express) | Receives requests, stores videos, creates jobs, returns results |
| **Database** (Jobs + Results) | Stores job state (`pending` → `processing` → `completed`) and query results. Also acts as the job queue — the Worker polls for pending jobs |
| **Blob Storage** | Stores uploaded video files |
| **Worker** | Polls the database for pending jobs, fetches videos, calls the VLM, and writes results back |
| **VLM Provider** | External, model-agnostic video understanding API |

### Processing Model

1. Client uploads a video → API Server stores it in Blob Storage
2. Client submits a query → API Server creates a job record (`pending`) in the Database and returns a job ID
3. Worker polls the Database for pending jobs, claims one, fetches the video from Blob Storage, sends it with the query to the VLM Provider, and writes the result back to the Database
4. Client polls the API Server with the job ID → API Server reads the result from the Database and returns it

## Getting Started

```bash
bun install
```

Copy `.env.example` to `.env` and adjust values if needed, then start both processes:

```bash
# API server
bun run src/index.ts

# Worker (separate terminal)
bun run src/worker.ts
```

## Tech Stack

- **Runtime**: Bun
- **Framework**: Express
- **VLM**: Model-agnostic (pluggable provider)
