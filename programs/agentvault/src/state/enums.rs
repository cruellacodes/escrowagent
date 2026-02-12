use anchor_lang::prelude::*;

// ──────────────────────────────────────────────────────
// Escrow Status — tracks lifecycle state
// ──────────────────────────────────────────────────────

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, Debug)]
pub enum EscrowStatus {
    AwaitingProvider, // Created, waiting for agent B to accept
    Active,           // Agent B accepted, work in progress
    ProofSubmitted,   // Agent B says "done", proof submitted
    Completed,        // Verified and funds released
    Disputed,         // One party challenged the outcome
    Resolved,         // Dispute settled by arbitrator
    Expired,          // Deadline passed, no completion
    Cancelled,        // Cancelled before acceptance
}

impl Default for EscrowStatus {
    fn default() -> Self {
        EscrowStatus::AwaitingProvider
    }
}

// ──────────────────────────────────────────────────────
// Verification Type — how completion is verified
// ──────────────────────────────────────────────────────

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, Debug)]
pub enum VerificationType {
    OnChain,          // Proof is a tx signature on Solana
    OracleCallback,   // External oracle confirms completion
    MultiSigConfirm,  // Both parties (or arbitrator) confirm
    AutoRelease,      // Timer-based release if no dispute
}

impl Default for VerificationType {
    fn default() -> Self {
        VerificationType::MultiSigConfirm
    }
}

// ──────────────────────────────────────────────────────
// Criterion Type — what kind of success metric
// ──────────────────────────────────────────────────────

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, Debug)]
pub enum CriterionType {
    TransactionExecuted, // A specific tx happened on-chain
    TokenTransferred,    // Tokens moved to expected address
    PriceThreshold,      // Executed below/above a price
    TimeBound,           // Completed within timeframe
    Custom,              // Verified by oracle or multi-sig
}

// ──────────────────────────────────────────────────────
// Proof Type — format of the submitted proof
// ──────────────────────────────────────────────────────

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, Debug)]
pub enum ProofType {
    TransactionSignature,
    OracleAttestation,
    SignedConfirmation,
}

// ──────────────────────────────────────────────────────
// Dispute Ruling — how an arbitrator resolves a dispute
// ──────────────────────────────────────────────────────

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, Debug)]
pub enum DisputeRuling {
    PayClient,                         // Full refund to client
    PayProvider,                       // Full payment to provider
    Split { client_bps: u16, provider_bps: u16 }, // Split in basis points (must total 10000)
}
