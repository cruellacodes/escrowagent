use anchor_lang::prelude::*;
use crate::state::enums::*;
use crate::errors::AgentVaultError;

// ──────────────────────────────────────────────────────
// Escrow Account — one per transaction between agents
// ──────────────────────────────────────────────────────

#[account]
pub struct Escrow {
    // ── Participants ──
    pub client: Pubkey,              // Agent A — the payer
    pub provider: Pubkey,            // Agent B — the worker
    pub arbitrator: Pubkey,          // Third party for disputes (Pubkey::default() if none)

    // ── Funds ──
    pub token_mint: Pubkey,          // Which SPL token (e.g., USDC)
    pub escrow_vault: Pubkey,        // PDA token account holding escrowed funds
    pub amount: u64,                 // Total escrowed amount (in smallest unit)
    pub protocol_fee_bps: u16,       // Protocol fee in basis points (50 = 0.5%)
    pub arbitrator_fee_bps: u16,     // Arbitrator fee in basis points (100 = 1.0%)

    // ── Task Definition (SLA) ──
    pub task_hash: [u8; 32],         // SHA-256 of full task description (stored off-chain)
    pub verification_type: VerificationType,
    pub criteria_count: u8,          // Number of success criteria (stored in separate accounts for flexibility)

    // ── Timing ──
    pub created_at: i64,             // Unix timestamp
    pub deadline: i64,               // Must complete by this time
    pub grace_period: i64,           // Seconds after deadline for dispute filing

    // ── State ──
    pub status: EscrowStatus,

    // ── Proof ──
    pub proof_type: Option<ProofType>,
    pub proof_data: [u8; 64],        // Fixed-size proof (tx sig = 64 bytes)
    pub proof_submitted_at: i64,

    // ── Dispute ──
    pub dispute_raised_by: Pubkey,   // Who raised the dispute (default = no dispute)

    // ── PDA ──
    pub bump: u8,
    pub vault_bump: u8,
}

impl Default for Escrow {
    fn default() -> Self {
        Self {
            client: Pubkey::default(),
            provider: Pubkey::default(),
            arbitrator: Pubkey::default(),
            token_mint: Pubkey::default(),
            escrow_vault: Pubkey::default(),
            amount: 0,
            protocol_fee_bps: 0,
            arbitrator_fee_bps: 0,
            task_hash: [0u8; 32],
            verification_type: VerificationType::default(),
            criteria_count: 0,
            created_at: 0,
            deadline: 0,
            grace_period: 0,
            status: EscrowStatus::default(),
            proof_type: None,
            proof_data: [0u8; 64],
            proof_submitted_at: 0,
            dispute_raised_by: Pubkey::default(),
            bump: 0,
            vault_bump: 0,
        }
    }
}

impl Escrow {
    // Fixed account size for rent calculation
    pub const LEN: usize = 8    // discriminator
        + 32 * 5                // pubkeys: client, provider, arbitrator, token_mint, escrow_vault
        + 8                     // amount
        + 2                     // protocol_fee_bps
        + 2                     // arbitrator_fee_bps
        + 32                    // task_hash
        + 1                     // verification_type
        + 1                     // criteria_count
        + 8 * 3                 // timestamps: created_at, deadline, grace_period
        + 1                     // status
        + 2                     // proof_type (Option<enum>)
        + 64                    // proof_data
        + 8                     // proof_submitted_at
        + 32                    // dispute_raised_by
        + 1                     // bump
        + 1                     // vault_bump
        + 72;                   // padding for future fields

    pub fn is_expired(&self, current_time: i64) -> bool {
        current_time > self.deadline + self.grace_period
    }

    pub fn can_dispute(&self) -> bool {
        matches!(
            self.status,
            EscrowStatus::Active | EscrowStatus::ProofSubmitted
        )
    }

    pub fn calculate_protocol_fee(&self) -> Result<u64> {
        (self.amount as u128)
            .checked_mul(self.protocol_fee_bps as u128)
            .and_then(|n| n.checked_div(10_000))
            .and_then(|n| u64::try_from(n).ok())
            .ok_or(AgentVaultError::Overflow.into())
    }

    pub fn calculate_arbitrator_fee(&self) -> Result<u64> {
        (self.amount as u128)
            .checked_mul(self.arbitrator_fee_bps as u128)
            .and_then(|n| n.checked_div(10_000))
            .and_then(|n| u64::try_from(n).ok())
            .ok_or(AgentVaultError::Overflow.into())
    }

    pub fn provider_payout(&self) -> Result<u64> {
        let protocol_fee = self.calculate_protocol_fee()?;
        self.amount
            .checked_sub(protocol_fee)
            .ok_or(AgentVaultError::Overflow.into())
    }

    pub fn provider_payout_after_dispute(&self) -> Result<u64> {
        let protocol_fee = self.calculate_protocol_fee()?;
        let arbitrator_fee = self.calculate_arbitrator_fee()?;
        self.amount
            .checked_sub(protocol_fee)
            .and_then(|n| n.checked_sub(arbitrator_fee))
            .ok_or(AgentVaultError::Overflow.into())
    }
}
