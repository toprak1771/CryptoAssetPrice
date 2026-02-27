# Crypto Asset Price API

A NestJS-based cryptocurrency price inquiry service backed by the [CoinGecko API](https://www.coingecko.com/en/api). Implements request batching, JWT authentication, Redis caching, circuit breaker, and retry with exponential backoff.

The project runs entirely on Docker. No local Node.js runtime required for running the application.

---

## Task Compliance

This project meets **all general requirements, minimum requirements, and nice-to-have items** from the task document.

### General Requirements (Expected Approach)

| # | Requirement | Implementation |
|---|------------|----------------|
| 1 | **Request Batching** | Requests for the same coin are not sent directly to the CoinGecko API; they are queued in memory via `PriceBatcherService`. |
| 2 | **5s Waiting Period** | After the first request, the system waits 5 seconds for the same coin; configurable via `BATCH_WINDOW_MS=5000`. |
| 3 | **Batch Response** | At the end of 5 seconds, all pending requests for that coin receive the same response; a single CoinGecko call is distributed to all. |
| 4 | **Threshold (3)** | When 3 requests are pending, the API is called before the 5 seconds elapse; configurable via `BATCH_THRESHOLD=3`. |
| 5 | **Database Recording** | Price data from CoinGecko is saved to PostgreSQL. No DB write for cache hits (optimization). |
| 6 | **Historical Query** | Historical price records are queried via `GET /v1/price/:coinId/history`; returns user-scoped history. |

### Minimum Requirements

| # | Requirement | Implementation |
|---|-------------|----------------|
| 1 | **Node.js** | Project is built and runs with Node.js 20. |
| 2 | **GET /v1/price/:coinId** | Price query endpoint available; supports `currency` query parameter. |
| 3 | **GET /v1/price/:coinId/history** | History query endpoint available; supports `currency` and `limit` parameters. |

### Nice to Have (All Implemented)

| # | Requirement | Implementation |
|---|-------------|----------------|
| 1 | **NestJS Framework** | Project is built with NestJS; uses modular structure, DI, controllers, services, guards. |
| 2 | **PostgreSQL** | Database is PostgreSQL; Prisma ORM manages `PriceRecord` and `User` models. |
| 3 | **Swagger / OpenAPI** | API documentation with Swagger; interactive UI at `/docs`. |
| 4 | **Test** | Unit tests written for `PriceService`, `PriceBatcherService`, `CircuitBreaker`, and `Retry`. |
| 5 | **Authorization (JWT / API Key)** | JWT-based authorization: register, login, Bearer token for protected endpoints. |
| 6 | **Structured Logging** | Structured JSON logging with Winston; log level via `DEBUG_MODE`. |
| 7 | **Docker** | Entire project runs with `docker-compose`; app, PostgreSQL, and Redis start with a single command. |

---

### Additional Features

The project also includes:

- **Redis** – Cache layer for CoinGecko responses and history cache
- **Circuit Breaker** – Circuit breaker for API failures
- **Retry with Exponential Backoff** – Retry on transient errors
- **Rate Limiting** – Redis-based rate limiting
- **DTO Validation** – Request validation with `class-validator`

## Prerequisites

- Docker & Docker Compose

## Installation

### 1. Clone the repository

```bash
git clone <repository-url>
cd CryptoAssetPrice
```

### 2. Environment setup

Copy the example environment file and configure it:

```bash
cp .env.example .env
```

Edit `.env` with your values (see [Environment Variables](#environment-variables) below). For Docker, ensure `JWT_SECRET` and other required variables are set.

### 3. Start infrastructure and run migrations

First, start PostgreSQL and Redis:

```bash
docker compose up -d postgres redis
```

Wait for the services to be healthy (a few seconds), then run migrations. You need Node.js and `npm install` locally only for this step:

```bash
npm install
npx prisma migrate deploy
```

> **Note:** `DATABASE_URL` in `.env` must point to `postgresql://postgres:postgres@localhost:5433/crypto_asset_price` so migrations can reach the Dockerized Postgres.

### 4. Start the application with Docker

```bash
docker compose up --build -d
```

This builds and starts the NestJS app. Migrations also run automatically on app startup (idempotent if already applied).

> **Migration note:** Following the steps above, migrations apply without issues. The manual `prisma migrate deploy` step ensures the schema is ready before the app starts. If you skip it, the app container runs migrations on startup as a fallback.

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `PORT` | Application port | `3000` |
| `NODE_ENV` | Environment | `development` |
| `DATABASE_URL` | PostgreSQL connection string | - |
| `DATABASE_HOST` | Database host | `postgres` (Docker) / `localhost` |
| `DATABASE_PORT` | Database port | `5432` (Docker) / `5433` |
| `DATABASE_USER` | Database user | `postgres` |
| `DATABASE_PASSWORD` | Database password | `postgres` |
| `DATABASE_NAME` | Database name | `crypto_asset_price` |
| `REDIS_HOST` | Redis host | `redis` (Docker) / `localhost` |
| `REDIS_PORT` | Redis port | `6379` (Docker) / `6380` |
| `JWT_SECRET` | Secret for JWT signing | - |
| `JWT_EXPIRATION` | Token expiry (seconds) | `3600` |
| `COINGECKO_API_URL` | CoinGecko API base URL | `https://api.coingecko.com/api/v3` |
| `COINGECKO_API_KEY` | CoinGecko API key | - |
| `DEBUG_MODE` | Enable debug logging | `true` |
| `BATCH_WINDOW_MS` | Batching window (ms) | `5000` |
| `BATCH_THRESHOLD` | Requests before immediate flush | `3` |
| `CACHE_TTL_SECONDS` | Redis cache TTL for history | `10` |

Docker Compose overrides `DATABASE_URL`, `DATABASE_HOST`, `DATABASE_PORT`, `REDIS_HOST`, and `REDIS_PORT` for the app container.

## Docker Commands

### Start all services

```bash
docker compose up --build -d
```

Services:

- **App** – NestJS API on port `3000`
- **PostgreSQL** – Database on host port `5433`
- **Redis** – Cache on host port `6380`

### View logs

```bash
docker compose logs -f app
```

### Stop services

```bash
docker compose down
```

### Rebuild after code changes

```bash
docker compose up --build -d
```

## Run Commands (local development)

For linting, tests, or creating new migrations:

```bash
npm install
npm run lint
npm test
npx prisma migrate dev --name <migration_name>   # Create new migrations
```

## API Usage

Base URL: `http://localhost:3000/v1`

### Swagger documentation

Open [http://localhost:3000/docs](http://localhost:3000/docs) for interactive API docs.

---

### Auth APIs

#### Register

`POST /v1/auth/register`

Creates a new user. Password must be at least 6 characters.

**Request body:**
```json
{
  "email": "user@example.com",
  "password": "YourSecurePass123!"
}
```

**Response (201):**
```json
{
  "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

**Errors:** `409` – Email already registered

```bash
curl -X POST http://localhost:3000/v1/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"user@example.com","password":"YourSecurePass123!"}'
```

#### Login

`POST /v1/auth/login`

Returns a JWT access token for authenticated requests.

**Request body:**
```json
{
  "email": "user@example.com",
  "password": "YourSecurePass123!"
}
```

**Response (200):**
```json
{
  "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

**Errors:** `401` – Invalid credentials

```bash
curl -X POST http://localhost:3000/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"user@example.com","password":"YourSecurePass123!"}'
```

Use `accessToken` in the `Authorization: Bearer <token>` header for protected endpoints.

---

### Price APIs (require Bearer token)

#### Get current price

`GET /v1/price/:coinId`

**Query params:** `currency` (optional, default: `usd`)

```bash
curl -X GET "http://localhost:3000/v1/price/bitcoin?currency=usd" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
```

#### Get price history

`GET /v1/price/:coinId/history`

**Query params:** `currency` (optional, default: `usd`), `limit` (optional, 1–500, default: 50)

Returns the authenticated user's price history for the given asset.

```bash
curl -X GET "http://localhost:3000/v1/price/bitcoin/history?currency=usd&limit=10" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
```

## Delivery

- Code is hosted in a public GitHub repository
- README includes: installation steps, environment variables, run commands, Docker instructions
- Repo link can be shared for review

## License

UNLICENSED
