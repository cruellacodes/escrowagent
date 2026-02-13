"""Type definitions for the EscrowAgent Python SDK."""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime
from enum import Enum
from typing import Optional


class EscrowStatus(str, Enum):
    AWAITING_PROVIDER = "AwaitingProvider"
    ACTIVE = "Active"
    PROOF_SUBMITTED = "ProofSubmitted"
    COMPLETED = "Completed"
    DISPUTED = "Disputed"
    RESOLVED = "Resolved"
    EXPIRED = "Expired"
    CANCELLED = "Cancelled"


class VerificationType(str, Enum):
    ON_CHAIN = "OnChain"
    ORACLE_CALLBACK = "OracleCallback"
    MULTI_SIG_CONFIRM = "MultiSigConfirm"
    AUTO_RELEASE = "AutoRelease"


class ProofType(str, Enum):
    TRANSACTION_SIGNATURE = "TransactionSignature"
    ORACLE_ATTESTATION = "OracleAttestation"
    SIGNED_CONFIRMATION = "SignedConfirmation"


class CriterionType(str, Enum):
    TRANSACTION_EXECUTED = "TransactionExecuted"
    TOKEN_TRANSFERRED = "TokenTransferred"
    PRICE_THRESHOLD = "PriceThreshold"
    TIME_BOUND = "TimeBound"
    CUSTOM = "Custom"


@dataclass
class DisputeRuling:
    ruling_type: str  # "PayClient", "PayProvider", "Split"
    client_bps: int = 0
    provider_bps: int = 0


@dataclass
class TaskCriterion:
    type: CriterionType
    description: str
    target_value: Optional[int] = None


@dataclass
class CreateEscrowParams:
    provider: str
    amount: int
    token_mint: str
    deadline_seconds: int
    task: dict
    verification: VerificationType = VerificationType.MULTI_SIG_CONFIRM
    grace_period: int = 300
    arbitrator: Optional[str] = None


@dataclass
class SubmitProofParams:
    proof_type: ProofType
    data: str | bytes


@dataclass
class TransactionResult:
    """Result of a transaction submission."""

    signature: str
    escrow_address: Optional[str] = None


@dataclass
class EscrowInfo:
    address: str
    client: str
    provider: str
    arbitrator: Optional[str]
    token_mint: str
    amount: int
    protocol_fee_bps: int
    status: EscrowStatus
    verification_type: VerificationType
    task_hash: str
    deadline: datetime
    grace_period: int
    created_at: datetime
    proof_type: Optional[ProofType] = None
    proof_submitted_at: Optional[datetime] = None


@dataclass
class AgentStats:
    address: str
    total_escrows: int = 0
    completed_escrows: int = 0
    disputed_escrows: int = 0
    expired_escrows: int = 0
    total_volume: int = 0
    success_rate: float = 0.0
    avg_completion_time: int = 0
    last_active: Optional[datetime] = None


# ──────────────────────────────────────────────────────
# ProtocolConfig types (from IDL)
# ──────────────────────────────────────────────────────


@dataclass
class InitializeProtocolParams:
    """Parameters for initializing the protocol config (admin only)."""

    fee_wallet: str
    protocol_fee_bps: int
    arbitrator_fee_bps: int
    min_escrow_amount: int
    max_escrow_amount: int


@dataclass
class ConfigUpdate:
    """
    Optional updates for protocol config. All fields optional — pass None to keep current value.
    Admin only.
    """

    fee_wallet: Optional[str] = None
    protocol_fee_bps: Optional[int] = None
    arbitrator_fee_bps: Optional[int] = None
    min_escrow_amount: Optional[int] = None
    max_escrow_amount: Optional[int] = None
    paused: Optional[bool] = None
    new_admin: Optional[str] = None
