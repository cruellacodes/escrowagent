use anchor_lang::prelude::*;
use crate::state::enums::*;

// ──────────────────────────────────────────────────────
// Events — emitted for off-chain indexing
// ──────────────────────────────────────────────────────

#[event]
pub struct EscrowCreated {
    pub escrow: Pubkey,
    pub client: Pubkey,
    pub provider: Pubkey,
    pub amount: u64,
    pub token_mint: Pubkey,
    pub deadline: i64,
    pub task_hash: [u8; 32],
    pub verification_type: VerificationType,
}

#[event]
pub struct EscrowAccepted {
    pub escrow: Pubkey,
    pub provider: Pubkey,
    pub accepted_at: i64,
}

#[event]
pub struct EscrowProofSubmitted {
    pub escrow: Pubkey,
    pub provider: Pubkey,
    pub proof_type: ProofType,
    pub submitted_at: i64,
}

#[event]
pub struct EscrowCompleted {
    pub escrow: Pubkey,
    pub amount_paid: u64,
    pub fee_collected: u64,
    pub completed_at: i64,
}

#[event]
pub struct EscrowCancelled {
    pub escrow: Pubkey,
    pub client: Pubkey,
    pub cancelled_at: i64,
}

#[event]
pub struct EscrowExpired {
    pub escrow: Pubkey,
    pub expired_at: i64,
    pub refund_amount: u64,
}

#[event]
pub struct DisputeRaised {
    pub escrow: Pubkey,
    pub raised_by: Pubkey,
    pub raised_at: i64,
}

#[event]
pub struct DisputeResolved {
    pub escrow: Pubkey,
    pub arbitrator: Pubkey,
    pub ruling: DisputeRuling,
    pub resolved_at: i64,
}
