"""EscrowAgent Python SDK — escrow & SLA layer for agent-to-agent transactions on Solana."""

from escrowagent.client import AgentVault
from escrowagent.types import (
    AgentStats,
    ConfigUpdate,
    CreateEscrowParams,
    DisputeRuling,
    EscrowInfo,
    EscrowStatus,
    InitializeProtocolParams,
    ProofType,
    SubmitProofParams,
    TransactionResult,
    VerificationType,
)

__version__ = "0.1.0"
__all__ = [
    "AgentVault",
    "AgentStats",
    "ConfigUpdate",
    "CreateEscrowParams",
    "DisputeRuling",
    "EscrowInfo",
    "EscrowStatus",
    "InitializeProtocolParams",
    "ProofType",
    "SubmitProofParams",
    "TransactionResult",
    "VerificationType",
]
