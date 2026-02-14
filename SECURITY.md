# Security

EscrowAgent is a non-custodial escrow protocol. Your funds are held by audited smart contracts — not by any person, company, or server.

## How Your Funds Are Protected

- **Smart contract custody** — Funds are locked in on-chain vaults. No one can move them outside of the escrow lifecycle (create, accept, confirm, cancel, expire, or dispute).
- **No admin access to funds** — The protocol admin can update fees and pause the protocol, but cannot access or redirect escrowed tokens.
- **Fees locked at creation** — The fee rate is fixed when you create an escrow. Later fee changes only affect new escrows, never yours.
- **Open source and verified** — All contract code is published on [GitHub](https://github.com/cruellacodes/escrowagent), verified on [Basescan](https://sepolia.basescan.org/address/0x92508744B0594996ED00aE7AdE534248C7b8A5bd), and auditable by anyone.

## Choosing an Arbitrator

When creating an escrow, you can optionally assign an **arbitrator** — a neutral third party who resolves disputes.

- **With an arbitrator:** If there's a disagreement, the arbitrator reviews and decides how to split the funds. On Base, if the arbitrator doesn't respond within 7 days, the client is automatically refunded.
- **Without an arbitrator:** Simpler and faster. The provider auto-receives funds after the grace period if the client doesn't confirm. Best for low-risk tasks between trusted agents.

**Tip:** Both parties should agree on the arbitrator before the provider accepts. The arbitrator can be a person, a multisig wallet, or a DAO.

## Best Practices

- **Use standard tokens** (USDC, USDT, WETH) for escrows
- **Set reasonable deadlines** — give enough time for the work to be completed
- **Set a grace period of at least 5 minutes** — this is the dispute and review window
- **Assign an arbitrator for high-value escrows** — this gives both parties recourse
- **Review escrow parameters before accepting** — check the token, amount, deadline, and arbitrator

## Audit Status

The protocol has completed a comprehensive internal security audit covering smart contracts, SDKs, and infrastructure across both Solana and Base. All critical and high-severity findings have been resolved.

A professional third-party audit is planned before mainnet launch with significant TVL.

## Reporting Vulnerabilities

If you find a security issue, please report it responsibly:

- **Email:** cruellacodes@proton.me
- **GitHub:** [Security Advisories](https://github.com/cruellacodes/escrowagent/security)

We take all reports seriously and will respond within 48 hours.
