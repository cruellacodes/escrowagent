"""AgentVault Python SDK — escrow & SLA layer for agent-to-agent transactions on Solana."""

from agentvault.client import AgentVault
from agentvault.types import (
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
