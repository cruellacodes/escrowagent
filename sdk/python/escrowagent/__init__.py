"""EscrowAgent Python SDK — escrow & SLA layer for agent-to-agent transactions on Solana and Base."""

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

__version__ = "0.2.0"
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
