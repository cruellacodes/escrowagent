# Base Chain Deployment Guide

Step-by-step guide to deploying EscrowAgent on Base and setting up the full infrastructure.

---

## Prerequisites Checklist

- [ ] Phantom wallet installed (supports both Solana and Base)
- [ ] 0.02 ETH bridged to Base Mainnet (or Sepolia for testing)
- [ ] Supabase account (free)
- [ ] Render account (free)
- [ ] Vercel account (free)
- [ ] Basescan API key (free, for contract verification)

---

## Step 1: Supabase (PostgreSQL Database)

1. Go to [supabase.com/dashboard](https://supabase.com/dashboard)
2. Click "New project"
3. Fill in:
   - **Name:** `escrowagent` (or whatever you want)
   - **Database Password:** Generate a strong one (save it!)
   - **Region:** Choose closest to you
   - **Plan:** Free tier is fine
4. Wait ~2 minutes for provisioning
5. Go to **Settings → Database** → **Connection String**
6. Copy the **Connection String** (URI mode). It looks like:
   ```
   postgresql://postgres.xxx:[YOUR-PASSWORD]@aws-0-us-west-1.pooler.supabase.com:6543/postgres
   ```
7. **Important:** Replace `[YOUR-PASSWORD]` with the actual password you set
8. Save this as `DATABASE_URL` — you'll need it for Render

**Set up the schema:**

The indexer will auto-migrate the schema on first run, but if you want to do it manually:
1. In Supabase dashboard → SQL Editor
2. Paste the `MIGRATION_SQL` from `indexer/src/db.ts` (lines 28-109)
3. Click "Run"

---

## Step 2: Phantom Wallet Setup

### Solana Wallet

1. Open Phantom
2. Click your profile → Settings → Developer Settings
3. Export Private Key (or show your seed phrase)
4. For the **deployer wallet**, you need a **keypair JSON array**:
   ```bash
   # In terminal
   solana-keygen pubkey ~/.config/solana/id.json
   # Copy the bytes from id.json as: [1,2,3,...]
   ```
5. Save this as `AGENT_PRIVATE_KEY` in your `.env`

### Base Wallet

1. In Phantom, switch to Ethereum network
2. Click your profile → Settings → Developer Settings
3. Export Private Key (it's a hex string like `0x...`)
4. Save this as:
   - `DEPLOYER_PRIVATE_KEY` (for deploying the contract)
   - `BASE_PRIVATE_KEY` (for the indexer/SDK)

**Important:** The same Phantom wallet gives you addresses on both chains:
- Solana address: Base58 format (e.g., `ABC123...xyz`)
- Base address: Ethereum format (e.g., `0x1234...abcd`)

---

## Step 3: Get API Keys

### Basescan API Key (for contract verification)

1. Go to [basescan.org/register](https://basescan.org/register)
2. Create a free account
3. Go to API Keys → Add → Name it "EscrowAgent"
4. Copy the API key
5. Save as `BASESCAN_API_KEY`

### Alchemy RPC (optional but recommended)

Free tier gives you 300M compute units/month (plenty for testing):

1. Go to [alchemy.com/dashboard](https://alchemy.com/dashboard)
2. Create app → Choose **Base** and **Base Sepolia**
3. Copy the HTTPS endpoint, looks like: `https://base-mainnet.g.alchemy.com/v2/YOUR_KEY`
4. Repeat for Solana if you want
5. Save as `BASE_RPC_URL` and `SOLANA_RPC_URL`

---

## Step 4: Deploy Base Smart Contract

### Test on Base Sepolia (Testnet) First

1. Get Sepolia ETH from a faucet:
   - [faucet.quicknode.com/base/sepolia](https://faucet.quicknode.com/base/sepolia)
   - Or bridge from Ethereum Sepolia

2. Create `.env` in the `contracts/` folder:
   ```env
   DEPLOYER_PRIVATE_KEY=0x...  # From Phantom export
   BASESCAN_API_KEY=...
   BASE_RPC_URL=https://sepolia.base.org
   ```

3. Deploy:
   ```bash
   cd contracts
   source ../.env  # Load env vars
   forge script script/Deploy.s.sol --rpc-url $BASE_RPC_URL --broadcast --verify
   ```

4. **Save the deployed contract address** from the output:
   ```
   EscrowAgent deployed at: 0xABC123...
   ```

5. Test it works:
   ```bash
   cast call 0xYourContractAddress "nextEscrowId()" --rpc-url $BASE_RPC_URL
   # Should return 0x0000...0001 (uint256 = 1)
   ```

### Deploy to Base Mainnet (Production)

Same steps, but:
- Use `https://mainnet.base.org` or your Alchemy Base Mainnet URL
- Double-check you have ETH on Base Mainnet (not Sepolia)
- This is the REAL deployment — test thoroughly first

---

## Step 5: Deploy Indexer to Render

1. Go to [render.com/dashboard](https://render.com/dashboard)
2. Click "New +" → **Web Service**
3. Connect your GitHub repo (or "Deploy from Git URL")
4. Fill in:
   - **Name:** `escrowagent-indexer`
   - **Region:** Same as Supabase
   - **Branch:** `main`
   - **Root Directory:** `indexer`
   - **Runtime:** Node
   - **Build Command:** `npm install && npm run build` (if you have a build script)
   - **Start Command:** `npm start` or `node dist/index.js`
   - **Plan:** Free tier

5. Add **Environment Variables** (in Render dashboard):
   ```env
   DATABASE_URL=postgresql://postgres.xxx:...@supabase.com:6543/postgres
   SOLANA_RPC_URL=https://api.mainnet-beta.solana.com
   BASE_RPC_URL=https://mainnet.base.org
   BASE_CONTRACT_ADDRESS=0x...  # From your forge deploy
   BASE_CHAIN_ID=8453
   PORT=3001
   NODE_ENV=production
   ```

6. Click "Create Web Service"
7. Wait for deploy (~2 min)
8. Copy the public URL: `https://escrowagent-indexer.onrender.com`

**Verify it works:**
```bash
curl https://escrowagent-indexer.onrender.com/health
# Should return: {"status":"ok","timestamp":"..."}
```

---

## Step 6: Deploy Dashboard to Vercel

1. Go to [vercel.com/dashboard](https://vercel.com/dashboard)
2. Click "Add New" → Project
3. Import your GitHub repo
4. Vercel auto-detects Next.js:
   - **Root Directory:** `dashboard`
   - **Framework Preset:** Next.js
   - **Build Command:** `npm run build` (auto-detected)
   - **Output Directory:** `.next` (auto-detected)

5. Add Environment Variable:
   ```
   NEXT_PUBLIC_API_URL=https://escrowagent-indexer.onrender.com
   ```

6. Click "Deploy"
7. Wait ~1 minute
8. Visit your live site: `https://escrowagent-xyz.vercel.app`

**Test the analytics page:**
- Visit `https://your-site.vercel.app/analytics`
- Should show npm downloads + on-chain data

---

## Step 7: Publish npm Packages

```bash
# Make sure you're logged in
npm login

# SDK
cd sdk/typescript && npm publish

# Agent Tools
cd sdk/agent-tools && npm publish

# CLI (update version to 0.2.0 first)
cd sdk/cli && npm publish
```

---

## Step 8: Environment Variables Reference

Here's every env var you need, and where it goes:

### `.env` (local development, root of project)
```env
# Solana
SOLANA_RPC_URL=https://api.mainnet-beta.solana.com
AGENT_PRIVATE_KEY=[your,keypair,bytes]

# Base
BASE_RPC_URL=https://mainnet.base.org
BASE_PRIVATE_KEY=0x...
BASE_CONTRACT_ADDRESS=0x...
BASESCAN_API_KEY=...

# Database
DATABASE_URL=postgresql://...

# Indexer
PORT=3001
```

### Render (indexer)
```
DATABASE_URL
SOLANA_RPC_URL
BASE_RPC_URL
BASE_CONTRACT_ADDRESS
BASE_CHAIN_ID=8453
PORT=3001
```

### Vercel (dashboard)
```
NEXT_PUBLIC_API_URL=https://your-indexer.onrender.com
```

---

## Step 9: Verification Checklist

Once everything is deployed, verify:

- [ ] Solana program deployed and initialized
- [ ] Base contract deployed and verified on Basescan
- [ ] Supabase DB has tables (check SQL Editor)
- [ ] Indexer running on Render (`/health` endpoint works)
- [ ] Dashboard live on Vercel
- [ ] Analytics page shows data
- [ ] npm packages published
- [ ] README badges showing download counts

---

## Costs Summary

| Service | Cost |
|---------|------|
| Supabase (PostgreSQL) | Free |
| Render (indexer) | Free (or $7/mo for non-sleeping) |
| Vercel (dashboard) | Free |
| Alchemy RPC | Free tier (300M compute units/month) |
| Base gas (deployment) | ~$2 one-time |
| Solana gas (deployment) | ~$5-10 one-time |
| Basescan API | Free |
| npm publishing | Free |
| **Total recurring:** | **$0-7/month** |

---

Ready to start? Let me know when you're ready and I'll walk you through Step 1 (Supabase).
