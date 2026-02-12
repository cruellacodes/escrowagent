#!/bin/bash

# AgentVault Deployment Script
# Automates building, program ID extraction, file updates, and deployment

set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# Default values
NETWORK="devnet"
CONFIRM=false

# Parse arguments
while [[ $# -gt 0 ]]; do
  case $1 in
    --network)
      NETWORK="$2"
      shift 2
      ;;
    --confirm)
      CONFIRM=true
      shift
      ;;
    -h|--help)
      echo "Usage: $0 [--network localnet|devnet|mainnet] [--confirm]"
      echo ""
      echo "Options:"
      echo "  --network    Target network (default: devnet)"
      echo "  --confirm     Skip confirmation prompts"
      echo "  -h, --help   Show this help message"
      exit 0
      ;;
    *)
      echo -e "${RED}Unknown option: $1${NC}"
      exit 1
      ;;
  esac
done

# Validate network
if [[ ! "$NETWORK" =~ ^(localnet|devnet|mainnet)$ ]]; then
  echo -e "${RED}Error: Invalid network '$NETWORK'. Must be: localnet, devnet, or mainnet${NC}"
  exit 1
fi

# Mainnet warning
if [[ "$NETWORK" == "mainnet" ]]; then
  echo -e "${RED}⚠️  WARNING: You are deploying to MAINNET${NC}"
  echo -e "${RED}   This is IRREVERSIBLE. Ensure you have:${NC}"
  echo -e "${RED}   1. Tested thoroughly on devnet${NC}"
  echo -e "${RED}   2. Set up a multisig for admin${NC}"
  echo -e "${RED}   3. Verified program source code${NC}"
  echo ""
  if [[ "$CONFIRM" != "true" ]]; then
    read -p "Type 'DEPLOY TO MAINNET' to continue: " confirmation
    if [[ "$confirmation" != "DEPLOY TO MAINNET" ]]; then
      echo -e "${YELLOW}Deployment cancelled.${NC}"
      exit 1
    fi
  fi
fi

echo -e "${BLUE}╔════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║     AgentVault Deployment Script                     ║${NC}"
echo -e "${BLUE}║     Network: $NETWORK${NC}"
echo -e "${BLUE}╚════════════════════════════════════════════════════════╝${NC}"
echo ""

# ──────────────────────────────────────────────────────
# Step 1: Check Prerequisites
# ──────────────────────────────────────────────────────

echo -e "${BLUE}[1/7] Checking prerequisites...${NC}"

check_command() {
  if ! command -v "$1" &> /dev/null; then
    echo -e "${RED}✗ $1 not found${NC}"
    echo -e "${YELLOW}   Install: $2${NC}"
    return 1
  else
    local version
    version=$($1 --version 2>&1 | head -n1)
    echo -e "${GREEN}✓ $1 found${NC} ${YELLOW}($version)${NC}"
    return 0
  fi
}

MISSING_DEPS=false

check_command "solana" "sh -c \"\$(curl -sSfL https://release.solana.com/stable/install)\"" || MISSING_DEPS=true
check_command "anchor" "cargo install --git https://github.com/coral-xyz/anchor avm --locked --force && avm install 0.32.1" || MISSING_DEPS=true
check_command "node" "Install Node.js 18+ from https://nodejs.org" || MISSING_DEPS=true
check_command "rustc" "curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh" || MISSING_DEPS=true

if [[ "$MISSING_DEPS" == "true" ]]; then
  echo -e "${RED}Please install missing dependencies and try again.${NC}"
  exit 1
fi

# Check Solana config
echo ""
echo -e "${BLUE}Checking Solana configuration...${NC}"
CURRENT_CLUSTER=$(solana config get | grep "RPC URL" | awk '{print $3}' || echo "")
echo -e "${YELLOW}Current cluster: $CURRENT_CLUSTER${NC}"

if [[ "$NETWORK" == "devnet" ]] && [[ ! "$CURRENT_CLUSTER" =~ devnet ]]; then
  echo -e "${YELLOW}⚠️  Solana CLI is not configured for devnet${NC}"
  if [[ "$CONFIRM" != "true" ]]; then
    read -p "Configure for devnet? (y/n): " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
      solana config set --url devnet
      echo -e "${GREEN}✓ Configured for devnet${NC}"
    fi
  else
    solana config set --url devnet
    echo -e "${GREEN}✓ Configured for devnet${NC}"
  fi
elif [[ "$NETWORK" == "mainnet" ]] && [[ ! "$CURRENT_CLUSTER" =~ mainnet ]]; then
  echo -e "${RED}⚠️  Solana CLI is not configured for mainnet${NC}"
  if [[ "$CONFIRM" != "true" ]]; then
    read -p "Configure for mainnet? (y/n): " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
      solana config set --url mainnet-beta
      echo -e "${GREEN}✓ Configured for mainnet${NC}"
    fi
  else
    solana config set --url mainnet-beta
    echo -e "${GREEN}✓ Configured for mainnet${NC}"
  fi
fi

# Check wallet balance
echo ""
WALLET_ADDRESS=$(solana address)
BALANCE=$(solana balance --lamports 2>/dev/null | awk '{print $1}' || echo "0")

echo -e "${BLUE}Wallet: ${YELLOW}$WALLET_ADDRESS${NC}"
echo -e "${BLUE}Balance: ${YELLOW}$BALANCE lamports${NC}"

if [[ "$NETWORK" != "localnet" ]]; then
  MIN_BALANCE=2000000000  # 2 SOL
  if (( BALANCE < MIN_BALANCE )); then
    echo -e "${YELLOW}⚠️  Low balance. You may need more SOL for deployment.${NC}"
    if [[ "$NETWORK" == "devnet" ]]; then
      echo -e "${YELLOW}   Requesting airdrop...${NC}"
      solana airdrop 2 "$WALLET_ADDRESS" || echo -e "${RED}   Airdrop failed. Get SOL manually.${NC}"
      sleep 2
      BALANCE=$(solana balance --lamports 2>/dev/null | awk '{print $1}' || echo "0")
      echo -e "${BLUE}New balance: ${YELLOW}$BALANCE lamports${NC}"
    fi
  fi
fi

# ──────────────────────────────────────────────────────
# Step 2: Build Program
# ──────────────────────────────────────────────────────

echo ""
echo -e "${BLUE}[2/7] Building program...${NC}"
cd "$PROJECT_ROOT"

if ! anchor build; then
  echo -e "${RED}✗ Build failed${NC}"
  exit 1
fi

echo -e "${GREEN}✓ Build successful${NC}"

# ──────────────────────────────────────────────────────
# Step 3: Extract Program ID
# ──────────────────────────────────────────────────────

echo ""
echo -e "${BLUE}[3/7] Extracting program ID...${NC}"

KEYPAIR_FILE="$PROJECT_ROOT/target/deploy/agentvault-keypair.json"

if [[ ! -f "$KEYPAIR_FILE" ]]; then
  echo -e "${RED}✗ Keypair file not found: $KEYPAIR_FILE${NC}"
  exit 1
fi

PROGRAM_ID=$(solana address -k "$KEYPAIR_FILE")

if [[ -z "$PROGRAM_ID" ]]; then
  echo -e "${RED}✗ Failed to extract program ID${NC}"
  exit 1
fi

echo -e "${GREEN}✓ Program ID: ${YELLOW}$PROGRAM_ID${NC}"

# ──────────────────────────────────────────────────────
# Step 4: Update Program ID in Files
# ──────────────────────────────────────────────────────

echo ""
echo -e "${BLUE}[4/7] Updating program ID across codebase...${NC}"

# Files to update
FILES_UPDATED=0

# Helper to update file with sed (handles macOS vs Linux)
update_with_sed() {
  local file="$1"
  local pattern="$2"
  local replacement="$3"
  
  if [[ ! -f "$file" ]]; then
    echo -e "${YELLOW}⚠️  File not found: $file${NC}"
    return 1
  fi
  
  if [[ "$OSTYPE" == "darwin"* ]]; then
    sed -i '' "s|$pattern|$replacement|g" "$file"
  else
    sed -i "s|$pattern|$replacement|g" "$file"
  fi
  
  echo -e "${GREEN}✓ Updated: $file${NC}"
  return 0
}

# 1. lib.rs - update declare_id!
LIB_RS="$PROJECT_ROOT/programs/agentvault/src/lib.rs"
if [[ -f "$LIB_RS" ]]; then
  if update_with_sed "$LIB_RS" \
    'declare_id!("[^"]*")' \
    "declare_id!(\"$PROGRAM_ID\")"; then
    ((FILES_UPDATED++))
  fi
fi

# 2. Anchor.toml - update both localnet and devnet/mainnet sections
ANCHOR_TOML="$PROJECT_ROOT/Anchor.toml"
if [[ -f "$ANCHOR_TOML" ]]; then
  # Update devnet section
  if [[ "$NETWORK" == "devnet" ]] || [[ "$NETWORK" == "mainnet" ]]; then
    if [[ "$OSTYPE" == "darwin"* ]]; then
      sed -i '' "/^\[programs\.devnet\]/,/^\[/ s|agentvault = \".*\"|agentvault = \"$PROGRAM_ID\"|" "$ANCHOR_TOML"
    else
      sed -i "/^\[programs\.devnet\]/,/^\[/ s|agentvault = \".*\"|agentvault = \"$PROGRAM_ID\"|" "$ANCHOR_TOML"
    fi
    echo -e "${GREEN}✓ Updated: Anchor.toml (devnet)${NC}"
    ((FILES_UPDATED++))
  fi
  
  # Update localnet section
  if [[ "$OSTYPE" == "darwin"* ]]; then
    sed -i '' "/^\[programs\.localnet\]/,/^\[/ s|agentvault = \".*\"|agentvault = \"$PROGRAM_ID\"|" "$ANCHOR_TOML"
  else
    sed -i "/^\[programs\.localnet\]/,/^\[/ s|agentvault = \".*\"|agentvault = \"$PROGRAM_ID\"|" "$ANCHOR_TOML"
  fi
  echo -e "${GREEN}✓ Updated: Anchor.toml (localnet)${NC}"
  ((FILES_UPDATED++))
fi

# 3. SDK TypeScript utils.ts - handle multiline pattern
UTILS_TS="$PROJECT_ROOT/sdk/typescript/src/utils.ts"
if [[ -f "$UTILS_TS" ]]; then
  # Replace the program ID string (handles multiline format)
  # Matches: "AgntVLT..." or any program ID string
  if [[ "$OSTYPE" == "darwin"* ]]; then
    sed -i '' "s|\"AgntVLT[^\"]*\"|\"$PROGRAM_ID\"|g" "$UTILS_TS"
  else
    sed -i "s|\"AgntVLT[^\"]*\"|\"$PROGRAM_ID\"|g" "$UTILS_TS"
  fi
  echo -e "${GREEN}✓ Updated: sdk/typescript/src/utils.ts${NC}"
  ((FILES_UPDATED++))
fi

# 4. SDK Python client.py
CLIENT_PY="$PROJECT_ROOT/sdk/python/agentvault/client.py"
if [[ -f "$CLIENT_PY" ]]; then
  # Replace program ID string
  if [[ "$OSTYPE" == "darwin"* ]]; then
    sed -i '' "s|Pubkey\.from_string(\"AgntVLT[^\"]*\"|Pubkey.from_string(\"$PROGRAM_ID\"|g" "$CLIENT_PY"
  else
    sed -i "s|Pubkey\.from_string(\"AgntVLT[^\"]*\"|Pubkey.from_string(\"$PROGRAM_ID\"|g" "$CLIENT_PY"
  fi
  echo -e "${GREEN}✓ Updated: sdk/python/agentvault/client.py${NC}"
  ((FILES_UPDATED++))
fi

# 5. Indexer listener.ts
LISTENER_TS="$PROJECT_ROOT/indexer/src/listener.ts"
if [[ -f "$LISTENER_TS" ]]; then
  # Replace program ID string in the fallback
  if [[ "$OSTYPE" == "darwin"* ]]; then
    sed -i '' "s|process\.env\.PROGRAM_ID || \"AgntVLT[^\"]*\"|process.env.PROGRAM_ID || \"$PROGRAM_ID\"|g" "$LISTENER_TS"
  else
    sed -i "s|process\.env\.PROGRAM_ID || \"AgntVLT[^\"]*\"|process.env.PROGRAM_ID || \"$PROGRAM_ID\"|g" "$LISTENER_TS"
  fi
  echo -e "${GREEN}✓ Updated: indexer/src/listener.ts${NC}"
  ((FILES_UPDATED++))
fi

echo -e "${GREEN}✓ Updated $FILES_UPDATED files${NC}"

# ──────────────────────────────────────────────────────
# Step 5: Rebuild After Program ID Update
# ──────────────────────────────────────────────────────

echo ""
echo -e "${BLUE}[5/7] Rebuilding with updated program ID...${NC}"

if ! anchor build; then
  echo -e "${RED}✗ Rebuild failed${NC}"
  exit 1
fi

echo -e "${GREEN}✓ Rebuild successful${NC}"

# ──────────────────────────────────────────────────────
# Step 6: Deploy
# ──────────────────────────────────────────────────────

echo ""
echo -e "${BLUE}[6/7] Deploying to $NETWORK...${NC}"

if [[ "$NETWORK" == "localnet" ]]; then
  DEPLOY_CMD="anchor deploy"
elif [[ "$NETWORK" == "devnet" ]]; then
  DEPLOY_CMD="anchor deploy --provider.cluster devnet"
elif [[ "$NETWORK" == "mainnet" ]]; then
  DEPLOY_CMD="anchor deploy --provider.cluster mainnet-beta"
fi

if [[ "$CONFIRM" != "true" ]]; then
  echo -e "${YELLOW}About to deploy. This will cost SOL.${NC}"
  read -p "Continue? (y/n): " -n 1 -r
  echo
  if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo -e "${YELLOW}Deployment cancelled.${NC}"
    exit 0
  fi
fi

if eval "$DEPLOY_CMD"; then
  echo -e "${GREEN}✓ Deployment successful!${NC}"
else
  echo -e "${RED}✗ Deployment failed${NC}"
  exit 1
fi

# ──────────────────────────────────────────────────────
# Step 7: Print Next Steps
# ──────────────────────────────────────────────────────

echo ""
echo -e "${BLUE}[7/7] Deployment complete!${NC}"
echo ""
echo -e "${GREEN}╔════════════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║           Deployment Successful!                       ║${NC}"
echo -e "${GREEN}╚════════════════════════════════════════════════════════╝${NC}"
echo ""
echo -e "${BLUE}Program ID:${NC} ${YELLOW}$PROGRAM_ID${NC}"
echo ""
echo -e "${BLUE}Next Steps:${NC}"
echo ""
echo -e "1. ${YELLOW}Initialize the protocol:${NC}"
echo -e "   ${GREEN}npx ts-node scripts/initialize_protocol.ts <FEE_WALLET_ADDRESS>${NC}"
echo ""
echo -e "2. ${YELLOW}Verify deployment:${NC}"
echo -e "   ${GREEN}solana program show $PROGRAM_ID${NC}"
echo ""
echo -e "3. ${YELLOW}Set up indexer:${NC}"
echo -e "   ${GREEN}cd indexer && cp .env.example .env${NC}"
echo -e "   ${GREEN}# Edit .env with PROGRAM_ID=$PROGRAM_ID${NC}"
echo -e "   ${GREEN}npm install && npm start${NC}"
echo ""
echo -e "4. ${YELLOW}Set up dashboard:${NC}"
echo -e "   ${GREEN}cd dashboard${NC}"
echo -e "   ${GREEN}# Set NEXT_PUBLIC_PROGRAM_ID=$PROGRAM_ID${NC}"
echo -e "   ${GREEN}npm install && npm run dev${NC}"
echo ""
if [[ "$NETWORK" == "mainnet" ]]; then
  echo -e "${RED}5. ${YELLOW}IMPORTANT - Set upgrade authority to multisig:${NC}"
  echo -e "   ${GREEN}solana program set-upgrade-authority $PROGRAM_ID \\${NC}"
  echo -e "     ${GREEN}--new-upgrade-authority <MULTISIG_ADDRESS>${NC}"
  echo ""
fi
echo -e "${BLUE}For detailed instructions, see: ${YELLOW}DEPLOYMENT.md${NC}"
echo ""
