use anchor_lang::prelude::*;

#[error_code]
pub enum AgentVaultError {
    // ── Creation errors ──
    #[msg("Escrow amount must be greater than zero")]
    AmountZero,

    #[msg("Deadline must be in the future")]
    DeadlineInPast,

    #[msg("Grace period must be non-negative")]
    InvalidGracePeriod,

    #[msg("Protocol fee exceeds maximum allowed (5%)")]
    FeeTooHigh,

    #[msg("Minimum escrow amount is 1000 lamports / token units")]
    BelowMinimumAmount,

    // ── Status errors ──
    #[msg("Escrow is not in the expected status for this operation")]
    InvalidStatus,

    #[msg("Escrow is not awaiting a provider")]
    NotAwaitingProvider,

    #[msg("Escrow is not active")]
    NotActive,

    #[msg("Escrow has no proof submitted")]
    NoProofSubmitted,

    // ── Authorization errors ──
    #[msg("Only the client can perform this action")]
    UnauthorizedClient,

    #[msg("Only the provider can perform this action")]
    UnauthorizedProvider,

    #[msg("Only the designated arbitrator can perform this action")]
    UnauthorizedArbitrator,

    #[msg("Caller is not a participant in this escrow")]
    NotParticipant,

    #[msg("No arbitrator is assigned to this escrow")]
    NoArbitrator,

    // ── Timing errors ──
    #[msg("The deadline for this escrow has passed")]
    DeadlinePassed,

    #[msg("The escrow has not yet expired (deadline + grace period)")]
    NotYetExpired,

    #[msg("Cannot dispute outside the grace period")]
    GracePeriodExpired,

    // ── Verification errors ──
    #[msg("Proof data is invalid or does not match criteria")]
    InvalidProof,

    #[msg("Verification type mismatch")]
    VerificationTypeMismatch,

    #[msg("Oracle is not registered for this escrow")]
    UnregisteredOracle,

    // ── Dispute errors ──
    #[msg("Dispute ruling basis points must total 10000")]
    InvalidSplitRuling,

    #[msg("Duplicate mutable accounts detected")]
    DuplicateAccounts,

    #[msg("Cannot dispute an escrow that is already disputed")]
    AlreadyDisputed,

    // ── Arithmetic errors ──
    #[msg("Arithmetic overflow")]
    Overflow,

    #[msg("Insufficient funds in escrow vault")]
    InsufficientFunds,

    // ── Protocol config errors ──
    #[msg("Protocol config has already been initialized")]
    ConfigAlreadyInitialized,

    #[msg("Only the protocol admin can perform this action")]
    UnauthorizedAdmin,

    #[msg("Protocol fee account does not match the config")]
    InvalidFeeAccount,

    #[msg("Protocol is currently paused")]
    ProtocolPaused,

    #[msg("Escrow amount exceeds the maximum allowed")]
    AboveMaximumAmount,

    // ── Security audit fixes ──
    #[msg("Client and provider cannot be the same address")]
    SelfEscrow,

    #[msg("Arbitrator cannot be the client or provider")]
    ArbitratorConflict,

    #[msg("Grace period is below the minimum required")]
    GracePeriodTooShort,

    #[msg("Deadline exceeds maximum allowed duration")]
    DeadlineTooFar,

    #[msg("Confirmation period expired, provider can self-release")]
    ConfirmationTimeout,

    #[msg("Auto-release delay has not elapsed yet")]
    AutoReleaseNotReady,

    #[msg("Dispute has timed out, default resolution applies")]
    DisputeTimeout,
}
