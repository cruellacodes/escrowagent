"""EscrowAgent Base (EVM) client — interacts with the Solidity contract on Base L2."""

from __future__ import annotations

import hashlib
import json
from datetime import datetime, timezone
from typing import Optional

import httpx
from web3 import AsyncWeb3
from web3.middleware import ExtraDataToPOAMiddleware
from eth_account import Account

from escrowagent.types import (
    AgentStats,
    CreateEscrowParams,
    DisputeRuling,
    EscrowInfo,
    EscrowStatus,
    ProofType,
    SubmitProofParams,
    TransactionResult,
    VerificationType,
)

# ──────────────────────────────────────────────────────
# Constants
# ──────────────────────────────────────────────────────

BASE_MAINNET_RPC = "https://mainnet.base.org"
BASE_SEPOLIA_RPC = "https://sepolia.base.org"
BASE_CHAIN_ID = 8453
BASE_SEPOLIA_CHAIN_ID = 84532

USDC_BASE = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913"
USDC_BASE_SEPOLIA = "0x036CbD53842c5426634e7929541eC2318f3dCF7e"

# Minimal ERC-20 ABI
ERC20_ABI = [
    {
        "name": "approve",
        "type": "function",
        "stateMutability": "nonpayable",
        "inputs": [
            {"name": "spender", "type": "address"},
            {"name": "amount", "type": "uint256"},
        ],
        "outputs": [{"name": "", "type": "bool"}],
    },
    {
        "name": "allowance",
        "type": "function",
        "stateMutability": "view",
        "inputs": [
            {"name": "owner", "type": "address"},
            {"name": "spender", "type": "address"},
        ],
        "outputs": [{"name": "", "type": "uint256"}],
    },
]

# EscrowAgent contract ABI (minimal for the functions we call)
ESCROW_AGENT_ABI = [
    {
        "name": "createEscrow",
        "type": "function",
        "stateMutability": "nonpayable",
        "inputs": [
            {"name": "provider", "type": "address"},
            {"name": "arbitrator", "type": "address"},
            {"name": "tokenAddress", "type": "address"},
            {"name": "amount", "type": "uint256"},
            {"name": "deadline", "type": "uint64"},
            {"name": "gracePeriod", "type": "uint64"},
            {"name": "taskHash", "type": "bytes32"},
            {"name": "verificationType", "type": "uint8"},
            {"name": "criteriaCount", "type": "uint8"},
        ],
        "outputs": [{"name": "escrowId", "type": "uint256"}],
    },
    {
        "name": "acceptEscrow",
        "type": "function",
        "stateMutability": "nonpayable",
        "inputs": [{"name": "escrowId", "type": "uint256"}],
        "outputs": [],
    },
    {
        "name": "submitProof",
        "type": "function",
        "stateMutability": "nonpayable",
        "inputs": [
            {"name": "escrowId", "type": "uint256"},
            {"name": "proofType", "type": "uint8"},
            {"name": "proofData", "type": "bytes"},
        ],
        "outputs": [],
    },
    {
        "name": "confirmCompletion",
        "type": "function",
        "stateMutability": "nonpayable",
        "inputs": [{"name": "escrowId", "type": "uint256"}],
        "outputs": [],
    },
    {
        "name": "cancelEscrow",
        "type": "function",
        "stateMutability": "nonpayable",
        "inputs": [{"name": "escrowId", "type": "uint256"}],
        "outputs": [],
    },
    {
        "name": "raiseDispute",
        "type": "function",
        "stateMutability": "nonpayable",
        "inputs": [{"name": "escrowId", "type": "uint256"}],
        "outputs": [],
    },
    {
        "name": "resolveDispute",
        "type": "function",
        "stateMutability": "nonpayable",
        "inputs": [
            {"name": "escrowId", "type": "uint256"},
            {
                "name": "ruling",
                "type": "tuple",
                "components": [
                    {"name": "rulingType", "type": "uint8"},
                    {"name": "clientBps", "type": "uint16"},
                    {"name": "providerBps", "type": "uint16"},
                ],
            },
        ],
        "outputs": [],
    },
    {
        "name": "expireEscrow",
        "type": "function",
        "stateMutability": "nonpayable",
        "inputs": [{"name": "escrowId", "type": "uint256"}],
        "outputs": [],
    },
    {
        "name": "providerRelease",
        "type": "function",
        "stateMutability": "nonpayable",
        "inputs": [{"name": "escrowId", "type": "uint256"}],
        "outputs": [],
    },
    {
        "name": "expireDispute",
        "type": "function",
        "stateMutability": "nonpayable",
        "inputs": [{"name": "escrowId", "type": "uint256"}],
        "outputs": [],
    },
    {
        "name": "getEscrow",
        "type": "function",
        "stateMutability": "view",
        "inputs": [{"name": "escrowId", "type": "uint256"}],
        "outputs": [
            {
                "name": "",
                "type": "tuple",
                "components": [
                    {"name": "client", "type": "address"},
                    {"name": "provider", "type": "address"},
                    {"name": "arbitrator", "type": "address"},
                    {"name": "tokenAddress", "type": "address"},
                    {"name": "amount", "type": "uint256"},
                    {"name": "protocolFeeBps", "type": "uint16"},
                    {"name": "arbitratorFeeBps", "type": "uint16"},
                    {"name": "taskHash", "type": "bytes32"},
                    {"name": "verificationType", "type": "uint8"},
                    {"name": "criteriaCount", "type": "uint8"},
                    {"name": "createdAt", "type": "uint64"},
                    {"name": "deadline", "type": "uint64"},
                    {"name": "gracePeriod", "type": "uint64"},
                    {"name": "status", "type": "uint8"},
                    {"name": "proofType", "type": "uint8"},
                    {"name": "proofSubmitted", "type": "bool"},
                    {"name": "proofData", "type": "bytes"},
                    {"name": "proofSubmittedAt", "type": "uint64"},
                    {"name": "disputeRaisedBy", "type": "address"},
                ],
            }
        ],
    },
    {
        "name": "nextEscrowId",
        "type": "function",
        "stateMutability": "view",
        "inputs": [],
        "outputs": [{"name": "", "type": "uint256"}],
    },
]

# ──────────────────────────────────────────────────────
# Helpers
# ──────────────────────────────────────────────────────

VERIFICATION_TYPE_MAP = {
    VerificationType.ON_CHAIN: 0,
    VerificationType.ORACLE_CALLBACK: 1,
    VerificationType.MULTI_SIG_CONFIRM: 2,
    VerificationType.AUTO_RELEASE: 3,
}

PROOF_TYPE_MAP = {
    ProofType.TRANSACTION_SIGNATURE: 0,
    ProofType.ORACLE_ATTESTATION: 1,
    ProofType.SIGNED_CONFIRMATION: 2,
}

STATUS_MAP = {
    0: EscrowStatus.AWAITING_PROVIDER,
    1: EscrowStatus.ACTIVE,
    2: EscrowStatus.PROOF_SUBMITTED,
    3: EscrowStatus.COMPLETED,
    4: EscrowStatus.DISPUTED,
    5: EscrowStatus.RESOLVED,
    6: EscrowStatus.EXPIRED,
    7: EscrowStatus.CANCELLED,
}

VERIFICATION_REVERSE_MAP = {
    0: VerificationType.ON_CHAIN,
    1: VerificationType.ORACLE_CALLBACK,
    2: VerificationType.MULTI_SIG_CONFIRM,
    3: VerificationType.AUTO_RELEASE,
}

PROOF_REVERSE_MAP = {
    0: ProofType.TRANSACTION_SIGNATURE,
    1: ProofType.ORACLE_ATTESTATION,
    2: ProofType.SIGNED_CONFIRMATION,
}


def _hash_task(description: str, criteria: list) -> bytes:
    """SHA-256 hash of task definition."""
    payload = json.dumps({"description": description, "criteria": criteria})
    return hashlib.sha256(payload.encode()).digest()


class BaseEscrowClient:
    """
    Base (EVM) client for the EscrowAgent protocol.

    Uses web3.py to interact with the Solidity contract on Base L2.

    Usage:
        client = BaseEscrowClient(
            rpc_url="https://mainnet.base.org",
            private_key="0x...",
            contract_address="0x...",
        )
        result = await client.create_escrow(params)
    """

    def __init__(
        self,
        rpc_url: str = BASE_MAINNET_RPC,
        private_key: str = "",
        contract_address: str = "",
        indexer_url: Optional[str] = None,
        chain_id: int = BASE_CHAIN_ID,
    ):
        self.w3 = AsyncWeb3(AsyncWeb3.AsyncHTTPProvider(rpc_url))
        self.w3.middleware_onion.inject(ExtraDataToPOAMiddleware, layer=0)
        self.account = Account.from_key(private_key)
        self.contract_address = AsyncWeb3.to_checksum_address(contract_address)
        self.contract = self.w3.eth.contract(
            address=self.contract_address, abi=ESCROW_AGENT_ABI
        )
        self.indexer_url = indexer_url
        self.chain_id = chain_id
        self._http = httpx.AsyncClient(timeout=30.0)

    async def create_escrow(self, params: CreateEscrowParams) -> TransactionResult:
        """Create a new escrow on Base, depositing ERC-20 tokens."""
        task = params.task or {}
        description = task.get("description", "")
        criteria = task.get("criteria", [])
        task_hash = _hash_task(description, criteria)

        deadline = params.deadline_seconds
        grace_period = params.grace_period or 300
        verification = VERIFICATION_TYPE_MAP.get(params.verification, 2)

        arbitrator = params.arbitrator or "0x" + "00" * 20

        # Ensure approval
        token = self.w3.eth.contract(
            address=AsyncWeb3.to_checksum_address(params.token_mint), abi=ERC20_ABI
        )
        allowance = await token.functions.allowance(
            self.account.address, self.contract_address
        ).call()

        if allowance < params.amount:
            approve_tx = await token.functions.approve(
                self.contract_address, params.amount
            ).build_transaction(await self._tx_params())
            await self._send_tx(approve_tx)

        # Create escrow
        tx = await self.contract.functions.createEscrow(
            AsyncWeb3.to_checksum_address(params.provider),
            AsyncWeb3.to_checksum_address(arbitrator),
            AsyncWeb3.to_checksum_address(params.token_mint),
            params.amount,
            deadline,
            grace_period,
            task_hash,
            verification,
            len(criteria),
        ).build_transaction(await self._tx_params())

        receipt = await self._send_tx(tx)

        next_id = await self.contract.functions.nextEscrowId().call()
        escrow_id = str(next_id - 1)

        return TransactionResult(
            signature=receipt["transactionHash"].hex(),
            escrow_address=escrow_id,
        )

    async def accept_escrow(self, escrow_address: str) -> str:
        tx = await self.contract.functions.acceptEscrow(
            int(escrow_address)
        ).build_transaction(await self._tx_params())
        receipt = await self._send_tx(tx)
        return receipt["transactionHash"].hex()

    async def submit_proof(self, escrow_address: str, proof: SubmitProofParams) -> str:
        proof_type = PROOF_TYPE_MAP.get(proof.proof_type, 0)
        proof_data = proof.data.encode() if isinstance(proof.data, str) else proof.data

        tx = await self.contract.functions.submitProof(
            int(escrow_address), proof_type, proof_data
        ).build_transaction(await self._tx_params())
        receipt = await self._send_tx(tx)
        return receipt["transactionHash"].hex()

    async def confirm_completion(self, escrow_address: str) -> str:
        tx = await self.contract.functions.confirmCompletion(
            int(escrow_address)
        ).build_transaction(await self._tx_params())
        receipt = await self._send_tx(tx)
        return receipt["transactionHash"].hex()

    async def cancel_escrow(self, escrow_address: str) -> str:
        tx = await self.contract.functions.cancelEscrow(
            int(escrow_address)
        ).build_transaction(await self._tx_params())
        receipt = await self._send_tx(tx)
        return receipt["transactionHash"].hex()

    async def raise_dispute(self, escrow_address: str, reason: str = "") -> str:
        if self.indexer_url and reason:
            await self._http.post(
                f"{self.indexer_url}/disputes",
                json={
                    "escrowAddress": escrow_address,
                    "raisedBy": self.account.address,
                    "reason": reason,
                },
            )

        tx = await self.contract.functions.raiseDispute(
            int(escrow_address)
        ).build_transaction(await self._tx_params())
        receipt = await self._send_tx(tx)
        return receipt["transactionHash"].hex()

    async def resolve_dispute(self, escrow_address: str, ruling: DisputeRuling) -> str:
        ruling_map = {"PayClient": 0, "PayProvider": 1, "Split": 2}
        ruling_type = ruling_map.get(ruling.ruling_type, 0)
        client_bps = getattr(ruling, "client_bps", 0) or 0
        provider_bps = getattr(ruling, "provider_bps", 0) or 0

        tx = await self.contract.functions.resolveDispute(
            int(escrow_address), (ruling_type, client_bps, provider_bps)
        ).build_transaction(await self._tx_params())
        receipt = await self._send_tx(tx)
        return receipt["transactionHash"].hex()

    async def expire_escrow(self, escrow_address: str) -> str:
        """Anyone can expire an escrow after deadline + grace period."""
        tx = await self.contract.functions.expireEscrow(int(escrow_address)).build_transaction(
            await self._tx_params()
        )
        receipt = await self._send_tx(tx)
        return receipt["transactionHash"].hex()

    async def provider_release(self, escrow_address: str) -> str:
        """Provider self-releases funds after confirmation timeout."""
        tx = await self.contract.functions.providerRelease(int(escrow_address)).build_transaction(
            await self._tx_params()
        )
        receipt = await self._send_tx(tx)
        return receipt["transactionHash"].hex()

    async def expire_dispute(self, escrow_address: str) -> str:
        """Anyone can expire a dispute after the timeout. Refunds client."""
        tx = await self.contract.functions.expireDispute(int(escrow_address)).build_transaction(
            await self._tx_params()
        )
        receipt = await self._send_tx(tx)
        return receipt["transactionHash"].hex()

    async def get_escrow(self, escrow_address: str) -> EscrowInfo:
        if self.indexer_url:
            resp = await self._http.get(f"{self.indexer_url}/escrows/{escrow_address}")
            data = resp.json()
            # Indexer returns {...escrow, task, proofs}; extract escrow fields
            return self._parse_indexer_escrow(data)

        data = await self.contract.functions.getEscrow(int(escrow_address)).call()
        return self._parse_escrow(escrow_address, data)

    async def list_escrows(
        self,
        status: Optional[str] = None,
        client: Optional[str] = None,
        provider: Optional[str] = None,
        limit: int = 50,
        offset: int = 0,
    ) -> list[EscrowInfo]:
        """List escrows. Uses indexer API if available; otherwise falls back to chain iteration."""
        if self.indexer_url:
            params: dict[str, str | int] = {"limit": limit, "offset": offset, "chain": "base"}
            if status:
                params["status"] = status
            if client:
                params["client"] = client
            if provider:
                params["provider"] = provider
            resp = await self._http.get(f"{self.indexer_url}/escrows", params=params)
            resp.raise_for_status()
            return [self._parse_indexer_escrow(e) for e in resp.json()]

        # Fall back to chain iteration
        next_id = await self.contract.functions.nextEscrowId().call()
        result: list[EscrowInfo] = []
        skipped = 0
        for i in range(int(next_id) - 1, 0, -1):
            if len(result) >= limit:
                break
            try:
                data = await self.contract.functions.getEscrow(i).call()
                escrow = self._parse_escrow(str(i), data)
                if status and escrow.status.value != status:
                    continue
                if client and escrow.client.lower() != client.lower():
                    continue
                if provider and escrow.provider.lower() != provider.lower():
                    continue
                if skipped < offset:
                    skipped += 1
                    continue
                result.append(escrow)
            except Exception:
                continue
        return result

    async def get_agent_stats(self, agent_address: str) -> AgentStats:
        if not self.indexer_url:
            raise RuntimeError("Indexer URL required for agent stats")
        resp = await self._http.get(f"{self.indexer_url}/agents/{agent_address}/stats")
        return AgentStats(**resp.json())

    async def close(self):
        await self._http.aclose()

    # ── Internal helpers ──

    async def _tx_params(self) -> dict:
        nonce = await self.w3.eth.get_transaction_count(self.account.address)
        return {
            "from": self.account.address,
            "nonce": nonce,
            "chainId": self.chain_id,
        }

    async def _send_tx(self, tx: dict) -> dict:
        signed = self.account.sign_transaction(tx)
        tx_hash = await self.w3.eth.send_raw_transaction(signed.raw_transaction)
        return await self.w3.eth.wait_for_transaction_receipt(tx_hash)

    def _parse_escrow(self, escrow_id: str, data) -> EscrowInfo:
        return EscrowInfo(
            address=escrow_id,
            client=data[0],
            provider=data[1],
            arbitrator=None if data[2] == "0x" + "00" * 20 else data[2],
            token_mint=data[3],
            amount=data[4],
            protocol_fee_bps=data[5],
            status=STATUS_MAP.get(data[13], EscrowStatus.AWAITING_PROVIDER),
            verification_type=VERIFICATION_REVERSE_MAP.get(data[8], VerificationType.MULTI_SIG_CONFIRM),
            task_hash=data[7].hex(),
            deadline=datetime.fromtimestamp(data[11], tz=timezone.utc),
            grace_period=data[12],
            created_at=datetime.fromtimestamp(data[10], tz=timezone.utc),
            proof_type=PROOF_REVERSE_MAP.get(data[14]) if data[15] else None,
            proof_submitted_at=datetime.fromtimestamp(data[17], tz=timezone.utc) if data[17] > 0 else None,
        )

    def _parse_indexer_escrow(self, row: dict) -> EscrowInfo:
        """Convert indexer API row to EscrowInfo."""
        def _parse_ts(v) -> Optional[datetime]:
            if v is None:
                return None
            if isinstance(v, (int, float)):
                return datetime.fromtimestamp(int(v), tz=timezone.utc)
            if isinstance(v, str):
                return datetime.fromisoformat(v.replace("Z", "+00:00"))
            return None

        def _verification(s: Optional[str]) -> VerificationType:
            if not s:
                return VerificationType.MULTI_SIG_CONFIRM
            for vt in VerificationType:
                if vt.value == s:
                    return vt
            return VerificationType.MULTI_SIG_CONFIRM

        def _proof_type(s: Optional[str]) -> Optional[ProofType]:
            if not s:
                return None
            for pt in ProofType:
                if pt.value == s:
                    return pt
            return None

        return EscrowInfo(
            address=row.get("escrow_address", row.get("address", "")),
            client=row.get("client_address", row.get("client", "")),
            provider=row.get("provider_address", row.get("provider", "")),
            arbitrator=row.get("arbitrator_address") or row.get("arbitrator"),
            token_mint=row.get("token_mint", ""),
            amount=int(row.get("amount", 0)),
            protocol_fee_bps=int(row.get("protocol_fee_bps", 0)),
            status=EscrowStatus(row["status"]) if "status" in row else EscrowStatus.AWAITING_PROVIDER,
            verification_type=_verification(row.get("verification_type")),
            task_hash=row.get("task_hash", ""),
            deadline=_parse_ts(row.get("deadline")) or datetime.now(timezone.utc),
            grace_period=int(row.get("grace_period", 0)),
            created_at=_parse_ts(row.get("created_at")) or datetime.now(timezone.utc),
            proof_type=_proof_type(row.get("proof_type")),
            proof_submitted_at=_parse_ts(row.get("proof_submitted_at")),
        )
