# MissedBuild

**Explore public repositories and evidence-backed directions for your next development idea.**

MissedBuild helps students and developers check what already exists before they start building. You describe a project idea in plain language. MissedBuild finds the closest public GitHub repositories, sorts them into categories, and uses **Meta Muse Spark** to analyze them. Each analysis lists what a repository already does, where it falls short, and which projects, extensions and improvements could be built on top of it. Every claim is tied to the README, issues or source code it came from.

---

## Table of Contents

- [Key Features](#key-features)
- [How It Works](#how-it-works)
- [Analysis Results](#analysis-results)
- [Evidence-Based Analysis](#evidence-based-analysis)
- [Security Measures](#security-measures)
- [Tech Stack](#tech-stack)
- [Project Structure](#project-structure)
- [Getting Started](#getting-started)
- [Environment Variables](#environment-variables)
- [Available Scripts](#available-scripts)
- [API Reference](#api-reference)
- [Database Schema](#database-schema)

---

## Key Features

- **Natural-language idea search.** Describe an idea such as "study planner for students". Short, clear queries go straight to GitHub. Longer descriptions are first turned into focused search keywords by Meta Muse Spark.
- **Clarifying questions.** If an idea is too vague to search for, the AI asks one short question instead of returning poor results.
- **Relevance filtering and ranking.** Up to 10 GitHub candidates are scored by rule-based checks against your idea. Unrelated results are removed, and the 5 closest matches are shown, closest first.
- **Automatic categorization.** Each new repository is placed in one of 19 domain categories, such as Education, Healthcare, Finance or Developer Tools, with a confidence score and a reason.
- **Category browsing.** The landing page lists categories that already contain saved repositories. You can open a category and filter its repositories by *Analyzed* or *Not analyzed*.
- **Automatic analysis of the best match.** After a search, the closest match that has enough evidence is analyzed automatically. Every other repository is analyzed only when you ask.
- **On-demand repository analysis** with live progress steps, from reading the README and issues to checking citations.
- **Cached results.** If a repository's evidence and the prompt version haven't changed, the stored analysis is reused and no new AI call is made. The UI shows when a repository has new commits since its last analysis.
- **Graceful degradation.** If an AI or GitHub step fails, MissedBuild falls back where it can, for example to keyword search, topic-based classification or stored copies of content. It records a warning and doesn't fail the whole request.

---

## How It Works

### 1. Search

```
User idea ──► Query check ──► (optional) AI query refinement ──► GitHub Search API
          ──► README fetch ──► Relevance filter & ranking ──► AI classification
          ──► Automatic analysis of the closest match
```

1. **Validation.** The query must be 2–200 characters and contain letters or numbers.
2. **Query check.** Stop words and GitHub search qualifiers (for example `user:`, `stars:>`) are stripped. Queries of up to 8 words and 5 keywords are searched as they are.
3. **AI refinement.** Longer descriptions are sent to Meta Muse Spark. It returns 1–3 keyword queries or a clarification question. If refinement fails, a keyword fallback is used.
4. **GitHub search.** Queries run in order until 10 candidates are collected. Repository metadata is saved to PostgreSQL.
5. **Relevance.** READMEs are fetched or loaded from storage, and each candidate is scored on its name, topics, description and README. Only relevant results are kept, up to 5.
6. **Classification.** New repositories are classified in a single batched AI call. Picks with confidence below 0.6 go to *Other*. If the AI call fails, repositories are matched by their GitHub topics.
7. **Automatic analysis.** The highest-ranked result is analyzed in the background if its README is at least 500 characters or it has open issues.

Searches run as background jobs. The frontend polls `GET /api/searches/:id` to follow the status (`processing`, `completed`, `partial`, `no_results`, `needs_clarification`, `failed`) and the current stage.

### 2. Repository Analysis

1. **Evidence collection** from GitHub:
   - The README.
   - The 20 most recently updated open issues and the 10 most recently updated closed issues, kept separate.
   - A **repository map** generated from the file tree: project areas, file counts, folders and declared dependencies.
   - **Selected source files**, chosen by rule-based ranking across project areas (data, API, UI, domain, entry points). Manifests are read first. Each file is read in full or as an outline of its declarations, within a fixed character budget.
2. **Secret scanning.** All evidence is scanned and redacted before it is sent to the AI (see [Security Measures](#security-measures)).
3. **Size guard.** If the complete prompt is longer than 120,000 characters, no AI request is made.
4. **AI analysis** with Meta Muse Spark.
5. **Validation and grounding.** The reply is parsed and checked against the collected evidence, then stored (see [Evidence-Based Analysis](#evidence-based-analysis)).

### AI Integration: Meta Muse Spark

MissedBuild calls the `muse-spark-1.3` model through the OpenAI-compatible **Responses API** at `https://api.meta.ai/v1`, using the official `openai` Node.js SDK. The model is used for four tasks:

| Task | Purpose | Timeout per attempt | Retries |
|---|---|---|---|
| Query refinement | Turn an idea into GitHub search keywords or ask a clarifying question | 20 s | 0 |
| Classification | Assign each repository to an approved category | 45 s | 1 |
| Repository analysis | Produce the full structured analysis | 90 s | 1 |
| Comparison | Compare opportunities across analyses (implemented but not currently used) | 30 s | 1 |

Every AI call is logged in the `ai_usage` table with its operation, status, error category, duration and the token counts reported by Meta. Prompts, outputs and error messages are never stored.

### GitHub API Integration

MissedBuild uses the GitHub REST API (`2022-11-28`) for:

- **Repository search:** `/search/repositories`
- **Repository metadata by GitHub ID:** survives renames and transfers. Requests use ETags, so unchanged repositories return `304 Not Modified`.
- **README:** `/repos/{owner}/{repo}/readme`
- **Issues:** open and closed, with pull requests filtered out
- **File tree and file contents:** read at a single fixed commit, so all files come from the same snapshot

All GitHub responses are validated with Zod before use. Repositories opened more than 24 hours after their last sync are refreshed. Repositories that are deleted or no longer available are hidden. A `GITHUB_TOKEN` is optional, but GitHub allows far fewer requests per hour without one.

---

## Analysis Results

Each analysis contains the following sections:

| Section | Description | Limit |
|---|---|---|
| **Summary** | What the project is, who it is for and what it does | 1 |
| **Existing Features** | What the evidence shows the project does today | up to 10 |
| **Limitations** | Current problems shown by the evidence. Closed issues are never used as evidence of a current limitation. | up to 10 |
| **Project Ideas** | Larger, independently valuable projects that extend or reuse the repository. Each includes the problem, target users, proposed solution, core features, reusable parts (with sources), what still needs building, and complexity (`low` / `medium` / `high`). | 1–3 |
| **Functional Extensions** | New capabilities that improve the existing product, with the value for its users | up to 6 |
| **Technical Improvements** | Lowest priority: code quality, compatibility, refactoring, testing or documentation | up to 4 |
| **Evidence Limitations** | What the analysis could not see, for example a truncated README, unread code or redacted files | up to 10 |

Every item carries:

- **A label:** `fact`, `inference` or `hypothesis`.
- **Sources:** links to the README, a specific issue, the repository map, or a specific **file and line** on GitHub.

## Security Measures

- **Prompt-injection defenses.** All repository content is wrapped in `<evidence>` tags and labeled as untrusted data. `<` characters are escaped so the content can't close the tag. A reminder is placed after the evidence so repository text is never the last thing the model reads.
- **Secret detection and redaction.** README, issue, source file and repository map text is scanned before it is sent to the AI. The scanner detects private keys, AWS, GitHub, Slack, Stripe, Google, OpenAI/Anthropic, SendGrid and npm tokens, JWTs, URLs with passwords and assigned credentials. Entropy checks and placeholder filters reduce false positives. Text that contains a private key, or more than 3 matches, is withheld entirely. Scan results record only counts and rule names, never the matched values.
- **Repository content is never executed.** Files are read as text only. Files over 1 MB and binary files are skipped.
- **Input validation.** All request bodies, parameters and query strings are validated with Zod. GitHub qualifiers and operators in user or AI text are removed and never passed to GitHub. Request bodies are limited to 32 KB.
- **External data validation.** GitHub and AI responses are validated against schemas before use.
- **Safe error handling.** Clients receive only `{ error: { code, message } }`. Stack traces, SQL and upstream responses are logged on the server only. AI failures are logged without the prompt, headers or API key.
- **CORS** is restricted to the frontend origin (`http://localhost:5173`).

---

## Tech Stack

**Frontend**
- React 19 + TypeScript
- Vite
- Material UI (MUI) with Emotion
- Axios
- ESLint

**Backend**
- Node.js + Express 5 + TypeScript (run with `tsx` during development)
- PostgreSQL with **Drizzle ORM** and **drizzle-kit** migrations (`postgres` driver)
- Zod for validation
- `openai` SDK, pointed at Meta's API, for Meta Muse Spark
- GitHub REST API

**Tooling**
- `concurrently` to run the frontend and backend together

---

## Project Structure

```
MissedBuild/
├── package.json                # Root script: runs backend and frontend together
├── backend/
│   ├── drizzle.config.ts       # Drizzle Kit configuration
│   └── src/
│       ├── index.ts            # Express app and server startup
│       ├── config.ts           # Environment configuration
│       ├── data/
│       │   └── categories.json # The category list (single source of truth)
│       ├── db/
│       │   ├── index.ts        # Database connection
│       │   └── schema/         # Drizzle table definitions
│       ├── migrations/         # SQL migrations generated by drizzle-kit
│       ├── middleware/         # Centralized error handler
│       ├── routes/             # categories, searches, repositories
│       ├── services/           # GitHub, Meta, search, classification, analysis, ...
│       ├── types/              # Shared TypeScript types and result schemas
│       └── utils/              # Relevance, source selection, secret scanning,
│                               # repository map, file excerpts, JSON repair, ...
└── frontend/
    ├── index.html
    └── src/
        ├── App.tsx             # Main layout, search and browsing flow
        ├── api/                # Axios client and API calls
        ├── components/         # Search, repository grid, analysis drawer, results
        │   └── landing/        # Landing page sections
        ├── hooks/              # Search polling, analysis runs, categories, ...
        ├── utils/              # Analysis stages, status helpers, formatting
        └── theme.ts            # MUI theme
```

---

## Getting Started

### Prerequisites

- Node.js and npm
- A PostgreSQL database
- A Meta API key for Muse Spark
- *(Optional)* A GitHub personal access token for higher rate limits

### 1. Clone the repository

```bash
git clone <repository-url>
cd MissedBuild
```

### 2. Install dependencies

The root, backend and frontend each have their own `package.json`:

```bash
npm install
npm install --prefix backend
npm install --prefix frontend
```

### 3. Configure environment variables

Create `backend/.env`:

```env
DATABASE_URL=postgres://<user>:<password>@localhost:5432/<database>
PORT=3000
META_API_KEY=<your-meta-api-key>
GITHUB_TOKEN=<your-github-token>   # optional
```

See [Environment Variables](#environment-variables) for details.

### 4. Run database migrations

Migrations are not applied automatically on startup. Run them manually:

```bash
cd backend
npm run db:migrate
```

### 5. Start the app

From the project root, this starts the backend and frontend together:

```bash
npm run dev
```

- Frontend: <http://localhost:5173>
- Backend API: <http://localhost:3000> (or the `PORT` you set)

---

## Environment Variables

### Backend (`backend/.env`)

| Variable | Required | Description |
|---|---|---|
| `DATABASE_URL` | Yes | PostgreSQL connection string |
| `PORT` | Yes | Port for the Express server. The frontend expects `3000` by default. |
| `META_API_KEY` | Yes | API key for Meta Muse Spark. The server won't start without it. |
| `GITHUB_TOKEN` | No | GitHub token. Without it, GitHub allows far fewer requests per hour. |
| `META_TIMEOUT_MS` | No | Default timeout for the Meta client in milliseconds (default `30000`). Each AI task currently sets its own timeout, listed in the [AI Integration](#ai-integration-meta-muse-spark) table. |

#### Getting a `META_API_KEY`

1. Sign in to Meta's developer platform at [dev.meta.ai](https://dev.meta.ai) and create an API key. Meta's guide [Build with Muse Spark](https://developer.meta.com/ai/resources/blog/build-with-muse-spark/) walks through the steps.
2. Copy the key right away. It may not be shown again.
3. Add it to `backend/.env`:

   ```env
   META_API_KEY=your_meta_api_key_here
   ```

> **Note:** Meta's own examples name this variable `MODEL_API_KEY`. MissedBuild reads only `META_API_KEY`, so use that name in your `.env` file.

#### Setting `DATABASE_URL`

`DATABASE_URL` tells the backend how to connect to PostgreSQL. A typical local setup looks like this:

```env
DATABASE_URL=postgresql://postgres:your_password@localhost:5432/missedbuild
```

| Part | Example | Meaning |
|---|---|---|
| `postgresql://` | | Connection protocol (`postgres://` also works) |
| Username | `postgres` | Your PostgreSQL user |
| Password | `your_password` | That user's password |
| Host | `localhost` | Where PostgreSQL is running |
| Port | `5432` | PostgreSQL's port (`5432` is the default) |
| Database name | `missedbuild` | The database MissedBuild will use |

Replace the username, password, host, port and database name with the values from your own PostgreSQL setup.

You must create the database before you run the migrations. For example, using `psql`:

```bash
psql -U postgres -c "CREATE DATABASE missedbuild;"
```

Then run `npm run db:migrate` in `backend/` to create the tables.

> **Security:** All values above are placeholders. Never commit your real `.env` file. `backend/.gitignore` already excludes `.env`.

### Frontend (optional, e.g. `frontend/.env.local`)

| Variable | Required | Description |
|---|---|---|
| `VITE_API_URL` | No | Backend base URL. Defaults to `http://localhost:3000`. |

> **Note:** The backend's CORS origin is set to `http://localhost:5173`, the default Vite dev server address, in `backend/src/config.ts`.

---

## Available Scripts

**Root**

| Command | Description |
|---|---|
| `npm run dev` | Run the backend and frontend together |

**Backend** (`cd backend`)

| Command | Description |
|---|---|
| `npm run dev` | Start the API with hot reload (`tsx watch`) |
| `npm run build` | Compile TypeScript to `dist/` |
| `npm start` | Run the compiled server |
| `npm run db:generate` | Generate a new migration after a schema change |
| `npm run db:migrate` | Apply pending migrations |

**Frontend** (`cd frontend`)

| Command | Description |
|---|---|
| `npm run dev` | Start the Vite dev server |
| `npm run build` | Type-check and build for production |
| `npm run lint` | Run ESLint |

---

## API Reference

All endpoints are prefixed with `/api`.

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/categories` | All categories |
| `GET` | `/categories/summary` | Categories that contain saved repositories, with counts |
| `POST` | `/searches` | Start a search: `{ "query": "..." }`. Returns `202` with the search ID. |
| `GET` | `/searches/:id` | Search status, ranked repositories and automatic-analysis status |
| `GET` | `/repositories` | List saved repositories. Query parameters: `category`, `searchId`, `analysis` (`all` \| `analyzed` \| `not_analyzed`), `limit` (1–50), `offset` |
| `GET` | `/repositories/:id` | Repository details. Refreshed from GitHub when stale. |
| `POST` | `/repositories/:id/analysis` | Run an analysis, or return a cached result if the evidence hasn't changed |
| `GET` | `/repositories/:id/analysis` | Latest stored analysis |
| `GET` | `/repositories/:id/analysis/progress` | Live progress of a running analysis |

Errors use a consistent shape:

```json
{ "error": { "code": "SEARCH_NOT_FOUND", "message": "Search not found." } }
```

---

## Database Schema

The schema is managed by Drizzle ORM. Migrations are in `backend/src/migrations/`.

| Table | Purpose |
|---|---|
| `searches` | Search jobs: query, status, stage, refined queries, warnings, result counts |
| `repositories` | Cached GitHub repository metadata, README, category, classification details, ETag |
| `search_repositories` | Ranked links between a search and its results |
| `repository_issues` | Stored GitHub issues per repository |
| `repository_analyses` | Analysis results, unique per repository, evidence fingerprint and prompt version |
| `idea_analyses` | Automatic analysis job attached to each search |
| `ai_usage` | One row per Meta call: operation, status, duration and reported tokens |

If the server restarts while a search or automatic analysis is running, that job is marked as failed on the next startup so the frontend stops polling.
