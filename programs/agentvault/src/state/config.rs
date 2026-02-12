use anchor_lang::prelude::*;

// ──────────────────────────────────────────────────────
// Protocol Config — singleton PDA, initialized once by admin
//
// Stores the protocol fee wallet, fee rates, and admin authority.
// Every instruction that moves fees validates against this config.
// ──────────────────────────────────────────────────────

#[account]
pub struct ProtocolConfig {
    /// The admin authority — can update config, transfer authority
    pub admin: Pubkey,

    /// The token account that receives protocol fees
    pub fee_wallet: Pubkey,

    /// Protocol fee in basis points (e.g., 50 = 0.5%)
    pub protocol_fee_bps: u16,

    /// Arbitrator fee in basis points (e.g., 100 = 1.0%)
    pub arbitrator_fee_bps: u16,

    /// Minimum escrow amount (in smallest token unit)
    pub min_escrow_amount: u64,

    /// Maximum escrow amount (0 = no limit)
    pub max_escrow_amount: u64,

    /// Whether the protocol is paused (emergency stop)
    pub paused: bool,

    /// PDA bump
    pub bump: u8,
}

impl ProtocolConfig {
    pub const LEN: usize = 8   // discriminator
        + 32                    // admin
        + 32                    // fee_wallet
        + 2                     // protocol_fee_bps
        + 2                     // arbitrator_fee_bps
        + 8                     // min_escrow_amount
        + 8                     // max_escrow_amount
        + 1                     // paused
        + 1                     // bump
        + 64;                   // padding for future fields

    /// The PDA seed — only one config account per program
    pub const SEED: &'static [u8] = b"protocol_config";
}
