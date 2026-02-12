use anchor_lang::prelude::*;

// ──────────────────────────────────────────────────────
// Protocol Config — singleton PDA, initialized once by admin
//
// Stores the protocol fee authority, fee rates, and admin authority.
// Fee token accounts are derived as ATAs per mint at runtime.
// Every instruction that moves fees validates against this config.
// ──────────────────────────────────────────────────────

#[account]
pub struct ProtocolConfig {
    /// The admin authority — can update config, transfer authority
    pub admin: Pubkey,

    /// The wallet (authority) that receives protocol fees — fee ATAs derived per mint
    pub fee_authority: Pubkey,

    /// Protocol fee in basis points (e.g., 50 = 0.5%)
    pub protocol_fee_bps: u16,

    /// Arbitrator fee in basis points (e.g., 100 = 1.0%)
    pub arbitrator_fee_bps: u16,

    /// Minimum escrow amount (in smallest token unit)
    pub min_escrow_amount: u64,

    /// Maximum escrow amount (0 = no limit)
    pub max_escrow_amount: u64,

    /// Minimum grace period in seconds (default 300 = 5 min)
    pub min_grace_period: i64,

    /// Maximum deadline offset in seconds from creation (default 604800 = 7 days)
    pub max_deadline_seconds: i64,

    /// Whether the protocol is paused (emergency stop)
    pub paused: bool,

    /// PDA bump
    pub bump: u8,
}

impl ProtocolConfig {
    pub const LEN: usize = 8   // discriminator
        + 32                    // admin
        + 32                    // fee_authority
        + 2                     // protocol_fee_bps
        + 2                     // arbitrator_fee_bps
        + 8                     // min_escrow_amount
        + 8                     // max_escrow_amount
        + 8                     // min_grace_period
        + 8                     // max_deadline_seconds
        + 1                     // paused
        + 1                     // bump
        + 48;                   // padding for future fields

    /// The PDA seed — only one config account per program
    pub const SEED: &'static [u8] = b"protocol_config";
}
