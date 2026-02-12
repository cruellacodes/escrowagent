use anchor_lang::prelude::*;
use anchor_spl::token::{self, Token, TokenAccount, Transfer};

use crate::errors::AgentVaultError;
use crate::events::{EscrowCompleted, EscrowProofSubmitted};
use crate::state::config::ProtocolConfig;
use crate::state::enums::*;
use crate::state::escrow::Escrow;

#[derive(Accounts)]
pub struct SubmitProof<'info> {
    /// The provider submitting proof of work
    #[account(mut)]
    pub provider: Signer<'info>,

    /// Protocol config — used to validate the fee account
    #[account(
        seeds = [ProtocolConfig::SEED],
        bump = config.bump,
    )]
    pub config: Account<'info, ProtocolConfig>,

    /// The escrow account
    #[account(
        mut,
        constraint = escrow.provider == provider.key() @ AgentVaultError::UnauthorizedProvider,
        constraint = escrow.status == EscrowStatus::Active @ AgentVaultError::NotActive,
    )]
    pub escrow: Account<'info, Escrow>,

    /// The escrow vault holding funds
    #[account(
        mut,
        constraint = escrow_vault.key() == escrow.escrow_vault,
    )]
    pub escrow_vault: Account<'info, TokenAccount>,

    /// CHECK: PDA authority over the vault
    #[account(
        seeds = [b"vault_authority", escrow.key().as_ref()],
        bump,
    )]
    pub escrow_vault_authority: UncheckedAccount<'info>,

    /// Provider's token account to receive payment (for auto-release)
    #[account(
        mut,
        constraint = provider_token_account.owner == provider.key(),
        constraint = provider_token_account.mint == escrow.token_mint,
    )]
    pub provider_token_account: Account<'info, TokenAccount>,

    /// Protocol fee token account — MUST match the config's fee_wallet
    #[account(
        mut,
        constraint = protocol_fee_account.key() == config.fee_wallet @ AgentVaultError::InvalidFeeAccount,
    )]
    pub protocol_fee_account: Account<'info, TokenAccount>,

    pub token_program: Program<'info, Token>,
}

pub fn handler(
    ctx: Context<SubmitProof>,
    proof_type: ProofType,
    proof_data: [u8; 64],
) -> Result<()> {
    let clock = Clock::get()?;
    let escrow = &mut ctx.accounts.escrow;

    // Verify deadline hasn't passed
    require!(
        clock.unix_timestamp <= escrow.deadline,
        AgentVaultError::DeadlinePassed
    );

    // Store proof
    escrow.proof_type = Some(proof_type);
    escrow.proof_data = proof_data;
    escrow.proof_submitted_at = clock.unix_timestamp;

    // Emit proof event
    emit!(EscrowProofSubmitted {
        escrow: escrow.key(),
        provider: escrow.provider,
        proof_type,
        submitted_at: clock.unix_timestamp,
    });

    // Handle based on verification type
    match escrow.verification_type {
        VerificationType::OnChain => {
            let protocol_fee = escrow.calculate_protocol_fee();
            let provider_amount = escrow.provider_payout();

            let escrow_key = escrow.key();
            let vault_authority_bump = ctx.bumps.escrow_vault_authority;
            let seeds = &[
                b"vault_authority".as_ref(),
                escrow_key.as_ref(),
                &[vault_authority_bump],
            ];
            let signer_seeds = &[&seeds[..]];

            // Transfer to provider
            let transfer_provider = CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                Transfer {
                    from: ctx.accounts.escrow_vault.to_account_info(),
                    to: ctx.accounts.provider_token_account.to_account_info(),
                    authority: ctx.accounts.escrow_vault_authority.to_account_info(),
                },
                signer_seeds,
            );
            token::transfer(transfer_provider, provider_amount)?;

            // Transfer protocol fee to the validated fee wallet
            if protocol_fee > 0 {
                let transfer_fee = CpiContext::new_with_signer(
                    ctx.accounts.token_program.to_account_info(),
                    Transfer {
                        from: ctx.accounts.escrow_vault.to_account_info(),
                        to: ctx.accounts.protocol_fee_account.to_account_info(),
                        authority: ctx.accounts.escrow_vault_authority.to_account_info(),
                    },
                    signer_seeds,
                );
                token::transfer(transfer_fee, protocol_fee)?;
            }

            escrow.status = EscrowStatus::Completed;

            emit!(EscrowCompleted {
                escrow: escrow.key(),
                amount_paid: provider_amount,
                fee_collected: protocol_fee,
                completed_at: clock.unix_timestamp,
            });
        }
        VerificationType::MultiSigConfirm | VerificationType::OracleCallback => {
            escrow.status = EscrowStatus::ProofSubmitted;
        }
        VerificationType::AutoRelease => {
            escrow.status = EscrowStatus::ProofSubmitted;
        }
    }

    Ok(())
}
