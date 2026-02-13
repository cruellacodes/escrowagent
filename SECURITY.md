# Security & Trust Model

This document explains the trust assumptions, admin powers, and security properties of the EscrowAgent protocol. Read this before escrowing significant funds.

---

## How Funds Are Protected

EscrowAgent is a **non-custodial** escrow protocol. Funds are held by smart contracts, not by any person or company.

| Property | Solana | Base |
|----------|--------|------|
| **Who holds the funds?** | PDA vault (program-derived account) | Contract itself (ERC-20 balance) |
| **Can the admin access escrowed funds?** | No | No (without upgrading the contract) |
| **Can anyone else access escrowed funds?** | No | No |
| **What triggers fund release?** | Only on-chain state transitions (confirm, cancel, expire, dispute resolve) | Same |
| **Is the code open source?** | Yes — verified on-chain and on GitHub | Yes — verified on Basescan and on GitHub |

**No one — including the protocol admin — can move escrowed funds outside of the defined escrow lifecycle.**

---

## Admin Powers

The protocol has a single admin key. Here is exactly what the admin CAN and CANNOT do:

### What the Admin CAN Do

| Action | Impact on Existing Escrows | Impact on New Escrows |
|--------|---------------------------|----------------------|
| **Change protocol fee** (max 5%) | None — fees are locked at creation | New escrows use new fee |
| **Change arbitrator fee** (max 5%) | None — fees are locked at creation | New escrows use new fee |
| **Change fee wallet** | Fees from future completions go to new wallet | Same |
| **Pause the protocol** | Blocks all operations until unpaused | Cannot create escrows |
| **Unpause the protocol** | Resumes all operations | Can create escrows again |
| **Change min/max escrow amounts** | None | New limits apply |
| **Upgrade the Base contract** (UUPS) | Could change contract logic | Same |
| **Upgrade the Solana program** | Could change program logic | Same |

### What the Admin CANNOT Do

| Action | Why |
|--------|-----|
| **Steal escrowed funds** | No instruction/function allows admin to withdraw from escrow vaults |
| **Change fees on existing escrows** | Fees are snapshotted per-escrow at creation time |
| **Force an escrow to complete** | Only the client can confirm; only the arbitrator can resolve disputes |
| **Prevent cancellations** | Clients can always cancel before acceptance (even during pause on Base) |
| **Change who the client/provider/arbitrator is** | Set at creation, immutable |

### The Upgrade Risk (Honest Disclosure)

On **Base**, the contract uses a UUPS proxy. The admin can deploy a new implementation that changes any logic. In theory, a malicious admin could upgrade the contract to add a `drainAllFunds()` function.

On **Solana**, the program has an upgrade authority that can deploy new versions of the program code.

**This is the biggest trust assumption in the protocol.** You are trusting that the admin will not deploy a malicious upgrade.

**Mitigations planned:**
- Transfer admin to a multisig (requires multiple people to agree on upgrades)
- Eventually transfer to DAO governance (community votes on upgrades)
- Timelock on upgrades (gives users time to withdraw before changes take effect)

---

## Escrow Trust Properties

### What You're Trusting When You Create an Escrow

| Who | What you trust them for | What happens if they're malicious |
|-----|------------------------|----------------------------------|
| **Provider** | To complete the work | Don't accept → escrow expires, you get full refund |
| **Arbitrator** (if set) | To judge disputes fairly | Could rule unfairly; choose a reputable arbitrator |
| **Protocol admin** | Not to deploy a malicious upgrade | See "Upgrade Risk" above |
| **Nobody else** | — | No other party can affect your escrow |

### What You're Trusting When You Accept an Escrow (as Provider)

| Who | What you trust them for | What happens if they're malicious |
|-----|------------------------|----------------------------------|
| **Client** | To confirm completion honestly | If they refuse, you can self-release after the grace period |
| **Arbitrator** (if set) | To judge disputes fairly | Could rule unfairly |
| **Protocol admin** | Not to deploy a malicious upgrade | See above |

### Choosing an Arbitrator

The arbitrator is **optional** and **chosen by the client** at escrow creation. Here's what to know:

- **No arbitrator** (`address(0)`): Disputes cannot be raised. The client must confirm, or the provider auto-releases after the grace period. **The client has no recourse if they disagree with the proof** — the provider will eventually get paid.

- **Trusted third party**: A wallet address both parties agree on. The arbitrator earns a 1% fee only if a dispute occurs. Choose someone both parties trust.

- **Smart contract arbitrator**: The arbitrator address can be a multisig, DAO, or external arbitration protocol (e.g., Kleros). This is the most decentralized option.

**Important:** The provider should review the arbitrator address before accepting an escrow. If the arbitrator is the client's friend, they could collude.

---

## Dispute Resolution

### How Disputes Work

1. Either party raises a dispute (during the grace period)
2. Funds are frozen — nobody can withdraw
3. The arbitrator reviews and rules: PayClient, PayProvider, or Split
4. Funds are distributed per the ruling

### What If the Arbitrator Disappears?

**On Base:** After 7 days (configurable), anyone can call `expireDispute()`. The client receives a full refund minus the protocol fee. The arbitrator gets nothing.

**On Solana:** There is currently no dispute timeout. A disappeared arbitrator means permanently locked funds. **This is a known limitation** — a dispute timeout will be added in a future program upgrade.

**Mitigation:** Only use arbitrators you trust to be responsive. Consider using a smart contract arbitrator (multisig or DAO) that doesn't depend on a single person.

---

## Token Risks

### Supported Tokens

The protocol works with any standard token:
- **Solana:** SPL tokens (USDC, USDT, etc.)
- **Base:** ERC-20 tokens (USDC, USDT, WETH, etc.)

### Token-Specific Risks

| Token Type | Risk | Affected Chain |
|-----------|------|---------------|
| **USDC/USDT** (blacklistable) | If Circle/Tether blacklists a participant's address, transfers to that address revert. This can lock funds in a disputed escrow. | Both |
| **Fee-on-transfer tokens** | On Base, the contract measures actual received amount (protected). On Solana, the stored amount matches what was sent (standard SPL tokens don't have transfer fees). | Base (protected) |
| **Rebasing tokens** (stETH, aTokens) | Balance changes over time without transfers. The protocol does not track rebases — excess tokens are trapped, deficit causes underpayment. | Both (unsupported) |

**Recommendation:** Use standard tokens (USDC, USDT, WETH) for escrows. Avoid exotic/rebasing tokens.

---

## Timing and Deadlines

### Key Timing Rules

| Event | Deadline | What Happens If Missed |
|-------|----------|----------------------|
| **Provider accepts** | Before `deadline` | Escrow can be expired (client refund) or cancelled |
| **Provider submits proof** | Before `deadline` | Escrow can be expired |
| **Client confirms** | No hard deadline | Provider can self-release after `grace_period` |
| **Dispute filed** | Before `deadline + grace_period` | Cannot dispute after grace period ends |
| **Arbitrator resolves** (Base) | Within `dispute_timeout` (default 7 days) | Dispute expires, client refunded |
| **Arbitrator resolves** (Solana) | No timeout currently | Funds locked until arbitrator acts |

### Grace Period Explained

The grace period serves two purposes:
1. **After the deadline:** Extra time to file disputes
2. **After proof submission:** Time for the client to review before the provider can self-release

On Base, the grace period is capped at 30 days maximum. On Solana, there is currently no maximum (will be added in a future upgrade).

---

## Security Audits

The protocol has undergone internal security review covering:

| Category | Issues Found | Issues Fixed |
|----------|-------------|-------------|
| **Base contract** (Solidity) | 85 | 85 |
| **Solana program** (Rust) | 30 | 28 (2 medium remain — see below) |
| **TypeScript SDK** | 15 | 15 |
| **Python SDK** | 8 | 8 |
| **Indexer** | 12 | 12 |
| **Infrastructure** | 20 | 20 |

### Known Remaining Issues

| ID | Chain | Severity | Description | Status |
|----|-------|----------|-------------|--------|
| SOL-M1 | Solana | Medium | No `max_grace_period` — extreme values can lock funds | Planned fix in next upgrade |
| SOL-M2 | Solana | Medium | No dispute timeout — AWOL arbitrator locks funds | Planned fix in next upgrade |

**No external audit has been performed.** If you are escrowing significant funds, you should review the code yourself or commission a professional audit.

---

## Reporting Vulnerabilities

If you find a security issue, please report it responsibly:

- **Email:** cruellacodes@proton.me
- **GitHub:** Open a private security advisory at [github.com/cruellacodes/escrowagent/security](https://github.com/cruellacodes/escrowagent/security)

Do not disclose vulnerabilities publicly before they are fixed.

---

## Summary

| Question | Answer |
|----------|--------|
| Can the admin steal my funds? | Not without upgrading the contract (which is visible on-chain) |
| Can another user steal my funds? | No — all access is gated by signatures |
| Can my funds get locked? | Only if: (1) arbitrator disappears on Solana, (2) USDC blacklists you, or (3) extreme config values |
| Is the code audited? | Internal audit complete. No external audit yet. |
| Is the code open source? | Yes — GitHub + verified on Basescan/Solscan |
| Who controls the protocol? | Single admin key (plan to move to multisig/DAO) |
