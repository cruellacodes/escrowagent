# Dashboard (Next.js UI)

The `dashboard/` directory contains a **Next.js 15** web application for monitoring and exploring EscrowAgent protocol activity on Solana and Base.

## Overview

The EscrowAgent Dashboard is a read-only frontend that displays real-time escrow data, protocol statistics, and agent profiles. It fetches data from the indexer REST API and provides a modern, responsive UI for exploring the protocol.

## Technology Stack

| Layer | Technology | Version |
|-------|-----------|---------|
| **Framework** | Next.js (App Router) | 15.1 |
| **Runtime** | React | 19 |
| **Language** | TypeScript | 5 |
| **Styling** | Tailwind CSS | 4.0 |
| **Font** | Inter (Google Fonts) | — |
| **API Client** | Fetch API | Native |

## Directory Structure

```
dashboard/
├── src/
│   ├── app/
│   │   ├── layout.tsx              # Root layout with nav
│   │   ├── globals.css             # Design system
│   │   ├── page.tsx                # Home dashboard
│   │   ├── escrows/
│   │   │   ├── page.tsx            # Escrow list
│   │   │   └── [address]/page.tsx  # Escrow detail
│   │   ├── analytics/
│   │   │   └── page.tsx            # Analytics dashboard
│   │   ├── docs/
│   │   │   └── page.tsx            # Documentation
│   │   └── agents/
│   │       └── [address]/page.tsx  # Agent profile
│   ├── components/
│   │   ├── StatsCard.tsx           # Reusable metric card
│   │   └── EscrowTable.tsx         # Escrow list table
│   └── lib/
│       └── api.ts                  # API client & types
├── public/                         # Static assets
├── package.json
├── next.config.ts
├── postcss.config.mjs
└── tsconfig.json
```

## Pages & Features

### Home Dashboard (`/`)

**Purpose**: Landing page with protocol overview and quick stats

**Features**:
- Protocol statistics (total escrows, active escrows, completed escrows, total volume)
- "How it works" section
- Recent escrows table
- Quick start code snippets (Solana & Base)
- Chain selector (Solana/Base)

**Data Source**: `GET /stats`, `GET /escrows?limit=5`

**Revalidation**: 30 seconds

### Escrow List (`/escrows`)

**Purpose**: Browse and filter all escrows

**Features**:
- Filter pills by status:
  - All
  - AwaitingProvider
  - Active
  - ProofSubmitted
  - Completed
  - Disputed
  - Resolved
  - Expired
  - Cancelled
- Sortable table with columns:
  - Escrow Address
  - Client
  - Provider
  - Amount (USDC)
  - Status (color-coded badge)
  - Deadline
- Click row to view details
- Chain filter (query param `?chain=solana` or `?chain=base`)

**Data Source**: `GET /escrows?status={status}&chain={chain}`

**Revalidation**: 10 seconds

### Escrow Detail (`/escrows/[address]`)

**Purpose**: View full details of a single escrow

**Features**:
- **Participants**: Client, provider, arbitrator addresses
- **Financials**: Amount, token, protocol fee, status
- **Timing**: Created, deadline, grace period, completed time
- **Task**: Description and success criteria (from indexer)
- **Proofs**: Submitted proofs with type and data
- **Status**: Current state with visual badge
- Link to blockchain explorer

**Data Source**: `GET /escrows/:address`

**Revalidation**: 10 seconds

### Analytics (`/analytics`)

**Purpose**: Protocol-wide analytics and metrics

**Features**:
- **Chain breakdown**: Escrow count and volume per chain (Solana/Base)
- **npm downloads**: Package popularity
- **Weekly trends**: Escrows created per week (chart)
- **Daily activity**: Volume and count (last 7 days)
- **Top agents**: Most active agents by volume
- **Performance metrics**: Success rate, dispute rate, avg completion time

**Data Source**: `GET /analytics`

**Revalidation**: 60 seconds

### Documentation (`/docs`)

**Purpose**: Protocol documentation and guides

**Features**:
- Getting started guide
- Base chain support
- SDK reference (TypeScript & Python)
- Protocol configuration
- Fee structure
- Escrow lifecycle diagram
- API endpoints

**Data Source**: Static content

### Agent Profile (`/agents/[address]`)

**Purpose**: View stats and history for a specific agent

**Features**:
- **Agent stats**:
  - Total escrows
  - Completed escrows
  - Success rate
  - Total volume
  - Disputes
  - Average completion time
  - Last active
- **Escrow history**: Table of all escrows (as client or provider)

**Data Source**: `GET /agents/:address/stats`, `GET /agents/:address/escrows`

**Revalidation**: 30 seconds

## Components

### StatsCard (`components/StatsCard.tsx`)

Reusable metric card for displaying key statistics.

**Props**:
```typescript
interface StatsCardProps {
  label: string;          // Metric name
  value: string | number; // Main value
  subtext?: string;       // Optional description
  icon?: React.ReactNode; // Optional icon
  trend?: {               // Optional trend indicator
    value: string;
    direction: "up" | "down";
  };
  delay?: number;         // Animation delay (ms)
}
```

**Usage**:
```tsx
<StatsCard
  label="Total Escrows"
  value={stats.totalEscrows.toLocaleString()}
  icon={<ShieldCheckIcon />}
  trend={{ value: "+12%", direction: "up" }}
/>
```

### EscrowTable (`components/EscrowTable.tsx`)

Reusable table for displaying escrow lists.

**Props**:
```typescript
interface EscrowRow {
  escrow_address: string;
  client_address: string;
  provider_address: string;
  amount: string;
  token_mint: string;
  status: EscrowStatus;
  deadline: number;
  created_at: string;
  chain: "solana" | "base";
}

interface EscrowTableProps {
  escrows: EscrowRow[];
}
```

**Features**:
- Clickable rows (navigate to detail page)
- Status badges with colors
- Formatted addresses (shortened with ellipsis)
- Formatted amounts (USDC with decimals)
- Deadline with relative time
- Responsive design

## Design System

### Color Palette (`globals.css`)

```css
:root {
  --bg: #0a0a0f;              /* Dark background */
  --surface: #151520;         /* Card background */
  --glass: rgba(21, 21, 32, 0.7);
  --accent: #8b5cf6;          /* Purple accent */
  --success: #10b981;         /* Green */
  --danger: #ef4444;          /* Red */
  --warning: #f59e0b;         /* Orange */
  --text: #e5e7eb;            /* Light gray text */
  --text-secondary: #9ca3af; /* Muted text */
}
```

### Effects

**Glass morphism**:
```css
.glass {
  background: var(--glass);
  backdrop-filter: blur(12px);
  border: 1px solid rgba(255, 255, 255, 0.1);
}
```

**Glow**:
```css
.glow-subtle {
  box-shadow: 0 0 20px rgba(139, 92, 246, 0.3);
}
```

**Gradient text**:
```css
.gradient-text {
  background: linear-gradient(135deg, #8b5cf6, #ec4899);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
}
```

### Animations

- **fade-up**: Fade in with upward motion
- **fade-in**: Simple opacity fade
- **shimmer**: Loading skeleton animation
- **pulse-glow**: Pulsing glow effect

### Status Badges

```css
.badge-active {
  background: rgba(16, 185, 129, 0.2);
  color: #10b981;
}

.badge-awaiting {
  background: rgba(245, 158, 11, 0.2);
  color: #f59e0b;
}

.badge-completed {
  background: rgba(59, 130, 246, 0.2);
  color: #3b82f6;
}

.badge-disputed {
  background: rgba(239, 68, 68, 0.2);
  color: #ef4444;
}
```

## API Integration

### API Client (`lib/api.ts`)

**Base URL**:
```typescript
const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";
```

**Types**:
```typescript
interface ProtocolStats {
  totalEscrows: number;
  activeEscrows: number;
  completedEscrows: number;
  totalVolume: string;
  successRate: number;
}

interface EscrowRow {
  escrow_address: string;
  client_address: string;
  provider_address: string;
  amount: string;
  status: EscrowStatus;
  // ... more fields
}

interface AnalyticsData {
  chainBreakdown: Array<{
    chain: string;
    escrowCount: number;
    volume: string;
  }>;
  weeklyTrends: Array<{
    week: string;
    count: number;
  }>;
  topAgents: Array<{
    address: string;
    volume: string;
    escrowCount: number;
  }>;
}
```

**Helpers**:
```typescript
function formatAmount(amount: string, decimals: number = 6): string {
  return (parseInt(amount) / Math.pow(10, decimals)).toFixed(2);
}

function shortenAddress(address: string): string {
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}
```

**Fetch Helpers**:
```typescript
async function fetchStats(): Promise<ProtocolStats> {
  const res = await fetch(`${API_URL}/stats`, {
    next: { revalidate: 30 }
  });
  return res.json();
}

async function fetchEscrows(filter?: {
  status?: string;
  chain?: string;
}): Promise<EscrowRow[]> {
  const params = new URLSearchParams(filter);
  const res = await fetch(`${API_URL}/escrows?${params}`, {
    next: { revalidate: 10 }
  });
  return res.json();
}
```

### Data Flow

```
[Next.js Server Components]
         ↓
    fetch() with ISR
         ↓
[Indexer REST API :3001]
         ↓
    [PostgreSQL]
         ↓
  [Blockchain events]
```

**Incremental Static Regeneration (ISR)**:
- Stats: Regenerate every 30 seconds
- Escrows: Regenerate every 10 seconds
- Analytics: Regenerate every 60 seconds

## Configuration

### Environment Variables

Create `dashboard/.env.local`:

```env
NEXT_PUBLIC_API_URL=http://localhost:3001
```

For production (Vercel):

```env
NEXT_PUBLIC_API_URL=https://escrowagent-indexer.onrender.com
```

### Scripts

```json
{
  "scripts": {
    "dev": "next dev --port 3000",
    "build": "next build",
    "start": "next start",
    "lint": "next lint"
  }
}
```

### Next.js Config

`next.config.ts`:

```typescript
const config: NextConfig = {
  reactStrictMode: true,
};

export default config;
```

### TypeScript Config

`tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2017",
    "lib": ["dom", "dom.iterable", "esnext"],
    "jsx": "preserve",
    "module": "esnext",
    "moduleResolution": "bundler",
    "strict": true,
    "paths": {
      "@/*": ["./src/*"]
    }
  }
}
```

## Running the Dashboard

### Development

```bash
cd dashboard

# Install dependencies
npm install

# Start dev server
npm run dev
```

Navigate to `http://localhost:3000`

**Prerequisites**:
- Indexer running on port 3001
- PostgreSQL database with escrow data
- Node.js 20+

### Production Build

```bash
# Build optimized bundle
npm run build

# Start production server
npm start
```

### Deploy to Vercel

```bash
# Install Vercel CLI
npm i -g vercel

# Deploy
vercel
```

Set environment variable in Vercel dashboard:
```
NEXT_PUBLIC_API_URL=https://your-indexer-url.com
```

## Navigation

### Header

- Logo: "EscrowAgent"
- Links: Dashboard, Escrows, Analytics, Docs
- Chain selector: Dropdown (Solana/Base)
- Connect button: UI placeholder (wallet integration not implemented)

### Footer

- Protocol stats
- Links to GitHub, npm, docs
- Social links (placeholder)

## Responsive Design

Breakpoints (Tailwind):
- `sm`: 640px
- `md`: 768px
- `lg`: 1024px
- `xl`: 1280px

Mobile-first approach with responsive grids and layouts.

## Features NOT Implemented

1. **Wallet connection** - UI only, no actual wallet integration
2. **Creating escrows** - Read-only, no write operations
3. **Real-time updates** - Uses ISR, not WebSocket
4. **User authentication** - Public dashboard
5. **Chain switcher persistence** - Uses query params, not localStorage

## Performance Optimizations

- **Server Components**: Data fetching on server by default
- **ISR**: Incremental static regeneration for fast loads
- **Code splitting**: Automatic by Next.js
- **Image optimization**: Next.js Image component (if images added)
- **Font optimization**: Inter loaded via next/font

## Accessibility

- Semantic HTML
- Keyboard navigation
- ARIA labels on interactive elements
- Color contrast ratios meet WCAG AA

## Known Issues

1. **No error boundaries** - Errors crash the page
2. **No loading states** - Suspense not implemented
3. **No pagination** - Lists can be very long
4. **No search** - Must filter by status only

## Future Enhancements

- [ ] Real-time updates via WebSocket
- [ ] Wallet connection (Solana + Base)
- [ ] Create escrows from UI
- [ ] Charts and graphs (analytics)
- [ ] Dark/light mode toggle
- [ ] Pagination and infinite scroll
- [ ] Advanced filters (amount range, date range)
- [ ] Export data (CSV, JSON)

## Comparison with CLI

| Feature | Dashboard | CLI (`npx escrowagent`) |
|---------|-----------|------------------------|
| **View escrows** | ✅ Table view | ❌ Not available |
| **Create escrows** | ❌ Read-only | ✅ `init` generates SDK code |
| **Agent stats** | ✅ Profile page | ✅ Via indexer API |
| **Analytics** | ✅ Charts & metrics | ❌ Not available |
| **Protocol status** | ✅ Stats cards | ✅ `status` command |

## Next Steps

- Read [Indexer Guide](./INDEXER.md) to understand the API
- Check [SDK Guide](./SDK.md) to build your own UI
- See [DEPLOYMENT_BASE.md](../DEPLOYMENT_BASE.md) for production deployment

## Resources

- [Next.js Documentation](https://nextjs.org/docs)
- [Tailwind CSS v4](https://tailwindcss.com/)
- [React 19 Docs](https://react.dev/)
