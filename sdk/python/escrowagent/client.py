"""EscrowAgent Python SDK Client — high-level interface for the escrow protocol."""

from __future__ import annotations

import hashlib
import json
import time
from datetime import datetime
from pathlib import Path
from typing import Optional

import httpx
from anchorpy import Context, Idl, Program, Provider, Wallet
from solana.rpc.async_api import AsyncClient
from solders.keypair import Keypair
from solders.pubkey import Pubkey
from solders.system_program import ID as SYS_PROGRAM_ID
from solders.sysvar import RENT

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

# Default program ID (placeholder — set after deployment)
PROGRAM_ID = Pubkey.from_string("8rXSN62qT7hb3DkcYrMmi6osPxak7nhXi2cBGDNbh7Py")

# SPL Token program ID
TOKEN_PROGRAM_ID = Pubkey.from_string("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA")

# Associated Token Program ID (for ATA derivation)
ASSOCIATED_TOKEN_PROGRAM_ID = Pubkey.from_string(
    "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL"
)

# USDC mint addresses
USDC_MAINNET = Pubkey.from_string("EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v")
USDC_DEVNET = Pubkey.from_string("4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU")


def _hash_task(description: str, criteria: list) -> bytes:
    """SHA-256 hash of task definition."""
    payload = json.dumps({"description": description, "criteria": criteria})
    return hashlib.sha256(payload.encode()).digest()


def _derive_config_pda(program_id: Pubkey = PROGRAM_ID) -> tuple[Pubkey, int]:
    """Derive the protocol config PDA address."""
    return Pubkey.find_program_address([b"protocol_config"], program_id)


def _derive_escrow_pda(
    client: Pubkey, provider: Pubkey, task_hash: bytes, program_id: Pubkey = PROGRAM_ID
) -> tuple[Pubkey, int]:
    """Derive the escrow PDA address."""
    return Pubkey.find_program_address(
        [b"escrow", bytes(client), bytes(provider), task_hash],
        program_id,
    )


def _derive_vault_pda(
    escrow: Pubkey, program_id: Pubkey = PROGRAM_ID
) -> tuple[Pubkey, int]:
    """Derive the vault PDA address."""
    return Pubkey.find_program_address([b"vault", bytes(escrow)], program_id)


def _derive_vault_authority_pda(
    escrow: Pubkey, program_id: Pubkey = PROGRAM_ID
) -> tuple[Pubkey, int]:
    """Derive the vault authority PDA address."""
    return Pubkey.find_program_address(
        [b"vault_authority", bytes(escrow)], program_id
    )


def _get_associated_token_address(
    wallet: Pubkey, mint: Pubkey, token_program_id: Pubkey = TOKEN_PROGRAM_ID
) -> Pubkey:
    """Derive the associated token account address for a wallet and mint."""
    return Pubkey.find_program_address(
        [
            bytes(wallet),
            bytes(token_program_id),
            bytes(mint),
        ],
        ASSOCIATED_TOKEN_PROGRAM_ID,
    )[0]


def _load_idl(idl_path: Optional[str] = None) -> Idl:
    """Load IDL from file. Defaults to target/idl/escrowagent.json relative to cwd."""
    if idl_path is None:
        idl_path = Path.cwd() / "target" / "idl" / "escrowagent.json"
    else:
        idl_path = Path(idl_path)
    if not idl_path.exists():
        raise FileNotFoundError(
            f"IDL not found at {idl_path}. "
            "Provide idl_path or run from project root with built IDL."
        )
    return Idl.from_json(idl_path.read_text())


def _verification_type_to_idl(value: VerificationType) -> dict:
    """Convert VerificationType enum to IDL format."""
    return {
        VerificationType.ON_CHAIN: {"onChain": {}},
        VerificationType.ORACLE_CALLBACK: {"oracleCallback": {}},
        VerificationType.MULTI_SIG_CONFIRM: {"multiSigConfirm": {}},
        VerificationType.AUTO_RELEASE: {"autoRelease": {}},
    }.get(value, {"multiSigConfirm": {}})


def _proof_type_to_idl(value: ProofType) -> dict:
    """Convert ProofType enum to IDL format."""
    return {
        ProofType.TRANSACTION_SIGNATURE: {"transactionSignature": {}},
        ProofType.ORACLE_ATTESTATION: {"oracleAttestation": {}},
        ProofType.SIGNED_CONFIRMATION: {"signedConfirmation": {}},
    }.get(value, {"transactionSignature": {}})


def _dispute_ruling_to_idl(ruling: DisputeRuling) -> dict:
    """Convert DisputeRuling to IDL format."""
    if ruling.ruling_type == "PayClient":
        return {"payClient": {}}
    if ruling.ruling_type == "PayProvider":
        return {"payProvider": {}}
    if ruling.ruling_type == "Split":
        return {"split": {"client_bps": ruling.client_bps, "provider_bps": ruling.provider_bps}}
    raise ValueError(f"Unknown ruling type: {ruling.ruling_type}")


class AgentVault:
    """
    High-level Python client for the EscrowAgent escrow protocol.

    Usage:
        vault = AgentVault(
            rpc_url="https://api.devnet.solana.com",
            keypair=my_keypair,
            indexer_url="https://api.escrowagent.xyz",
        )

        result = await vault.create_escrow(
            provider="AgentBpubkey...",
            amount=50_000_000,
            token_mint=str(USDC_DEVNET),
            deadline_seconds=600,
            task={
                "description": "Swap 10 USDC to SOL on Jupiter",
                "criteria": [{"type": "TransactionExecuted", "description": "Swap tx confirmed"}],
            },
        )
    """

    def __init__(
        self,
        rpc_url: str,
        keypair: Keypair,
        indexer_url: Optional[str] = None,
        program_id: Optional[Pubkey] = None,
        idl_path: Optional[str] = None,
        protocol_fee_account: Optional[Pubkey] = None,
    ):
        """
        Initialize the EscrowAgent client.

        Args:
            rpc_url: Solana RPC endpoint (e.g. https://api.devnet.solana.com)
            keypair: Keypair for signing transactions
            indexer_url: Optional indexer API URL for queries and task storage
            program_id: Program ID (defaults to AgntVLT1111111111111111111111111111111111111)
            idl_path: Path to IDL JSON file. If None, fetches IDL from program on-chain
            protocol_fee_account: Protocol fee token account. If None, fetched from config
        """
        self.rpc_url = rpc_url
        self.keypair = keypair
        self.pubkey = keypair.pubkey()
        self.indexer_url = indexer_url
        self.program_id = program_id or PROGRAM_ID
        self.idl_path = idl_path
        self.protocol_fee_account = protocol_fee_account
        self._http = httpx.AsyncClient(timeout=30.0)
        self._program: Optional[Program] = None
        self._provider: Optional[Provider] = None
        self._connection: Optional[AsyncClient] = None

    async def _get_program(self) -> Program:
        """Lazily initialize and return the Anchor Program instance."""
        if self._program is not None:
            return self._program

        self._connection = AsyncClient(self.rpc_url)
        wallet = Wallet(self.keypair)
        self._provider = Provider(self._connection, wallet)

        if self.idl_path is not None:
            idl = _load_idl(self.idl_path)
            self._program = Program(idl, self.program_id, self._provider)
        else:
            self._program = await Program.at(self.program_id, self._provider)
        return self._program

    async def _get_protocol_fee_account(self) -> Pubkey:
        """Fetch protocol fee account from config if not provided."""
        if self.protocol_fee_account is not None:
            return self.protocol_fee_account
        program = await self._get_program()
        config_pda, _ = _derive_config_pda(self.program_id)
        config = await program.account["ProtocolConfig"].fetch(config_pda)
        fee_wallet = config.fee_wallet
        return fee_wallet if isinstance(fee_wallet, Pubkey) else Pubkey.from_string(str(fee_wallet))

    def _parse_escrow_account(self, address: str, data) -> EscrowInfo:
        """Parse raw escrow account data into EscrowInfo."""
        status_map = {
            "awaitingProvider": EscrowStatus.AWAITING_PROVIDER,
            "active": EscrowStatus.ACTIVE,
            "proofSubmitted": EscrowStatus.PROOF_SUBMITTED,
            "completed": EscrowStatus.COMPLETED,
            "disputed": EscrowStatus.DISPUTED,
            "resolved": EscrowStatus.RESOLVED,
            "expired": EscrowStatus.EXPIRED,
            "cancelled": EscrowStatus.CANCELLED,
        }
        status_key = list(data.status.keys())[0] if hasattr(data.status, "keys") else str(data.status)
        status = status_map.get(status_key, EscrowStatus.AWAITING_PROVIDER)

        arbitrator = data.arbitrator
        if hasattr(arbitrator, "__iter__") and not isinstance(arbitrator, (str, bytes)):
            arbitrator_str = None
        else:
            arbitrator_str = str(arbitrator) if arbitrator else None

        def _ts(val):
            if hasattr(val, "toNumber"):
                return datetime.fromtimestamp(val.toNumber())
            n = int(val) if val else 0
            return datetime.fromtimestamp(n) if n else datetime.fromtimestamp(0)

        return EscrowInfo(
            address=address,
            client=str(data.client),
            provider=str(data.provider),
            arbitrator=arbitrator_str,
            token_mint=str(data.token_mint),
            amount=int(data.amount),
            protocol_fee_bps=int(data.protocol_fee_bps),
            status=status,
            verification_type=VerificationType(
                list(data.verification_type.keys())[0]
                if hasattr(data.verification_type, "keys")
                else str(data.verification_type)
            ),
            task_hash=bytes(data.task_hash).hex() if hasattr(data.task_hash, "__len__") else str(data.task_hash),
            deadline=_ts(data.deadline),
            grace_period=int(data.grace_period),
            created_at=_ts(data.created_at),
            proof_type=None,
            proof_submitted_at=None,
        )

    # ──────────────────────────────────────────────────────
    # ESCROW LIFECYCLE
    # ──────────────────────────────────────────────────────

    async def create_escrow(self, **kwargs) -> TransactionResult:
        """
        Create a new escrow and deposit funds.

        Builds and sends the Anchor create_escrow transaction.
        """
        params = CreateEscrowParams(**kwargs)
        provider_pk = Pubkey.from_string(params.provider)
        token_mint_pk = Pubkey.from_string(params.token_mint)
        arbitrator_pk = (
            Pubkey.from_string(params.arbitrator) if params.arbitrator else Pubkey.default()
        )
        task_hash = _hash_task(
            params.task["description"], params.task.get("criteria", [])
        )

        escrow_pda, _ = _derive_escrow_pda(
            self.pubkey, provider_pk, task_hash, self.program_id
        )
        vault_pda, _ = _derive_vault_pda(escrow_pda, self.program_id)
        vault_authority_pda, _ = _derive_vault_authority_pda(
            escrow_pda, self.program_id
        )
        config_pda, _ = _derive_config_pda(self.program_id)
        client_token_account = _get_associated_token_address(
            self.pubkey, token_mint_pk
        )

        deadline = int(time.time()) + params.deadline_seconds
        grace_period = params.grace_period
        criteria_count = len(params.task.get("criteria", []))
        verification_idl = _verification_type_to_idl(params.verification)

        program = await self._get_program()

        sig = await program.rpc["create_escrow"](
            params.amount,
            deadline,
            grace_period,
            list(task_hash),
            verification_idl,
            criteria_count,
            ctx=Context(
                accounts={
                    "client": self.pubkey,
                    "provider": provider_pk,
                    "arbitrator": arbitrator_pk,
                    "config": config_pda,
                    "escrow": escrow_pda,
                    "token_mint": token_mint_pk,
                    "client_token_account": client_token_account,
                    "escrow_vault": vault_pda,
                    "escrow_vault_authority": vault_authority_pda,
                    "token_program": TOKEN_PROGRAM_ID,
                    "system_program": SYS_PROGRAM_ID,
                    "rent": RENT,
                },
                signers=[self.keypair],
            ),
        )

        if self.indexer_url:
            await self._store_task(task_hash.hex(), params.task)

        return TransactionResult(signature=str(sig), escrow_address=str(escrow_pda))

    async def accept_escrow(self, escrow_address: str) -> str:
        """Accept an escrow as the provider (Agent B)."""
        escrow_pk = Pubkey.from_string(escrow_address)
        config_pda, _ = _derive_config_pda(self.program_id)

        program = await self._get_program()

        sig = await program.rpc["accept_escrow"](
            ctx=Context(
                accounts={
                    "provider": self.pubkey,
                    "config": config_pda,
                    "escrow": escrow_pk,
                },
                signers=[self.keypair],
            ),
        )
        return str(sig)

    async def submit_proof(
        self,
        escrow_address: str,
        proof_type: str,
        data: str | bytes,
    ) -> str:
        """Submit proof of task completion as the provider."""
        escrow_pk = Pubkey.from_string(escrow_address)
        vault_pda, _ = _derive_vault_pda(escrow_pk, self.program_id)
        vault_authority_pda, _ = _derive_vault_authority_pda(
            escrow_pk, self.program_id
        )
        config_pda, _ = _derive_config_pda(self.program_id)

        program = await self._get_program()
        escrow_data = await program.account["Escrow"].fetch(escrow_pk)

        token_mint_pk = (
            escrow_data.token_mint
            if isinstance(escrow_data.token_mint, Pubkey)
            else Pubkey.from_string(str(escrow_data.token_mint))
        )
        provider_token_account = _get_associated_token_address(
            self.pubkey, token_mint_pk
        )
        protocol_fee_account = await self._get_protocol_fee_account()

        proof_type_enum = ProofType(proof_type) if isinstance(proof_type, str) else proof_type
        proof_type_idl = _proof_type_to_idl(proof_type_enum)

        raw_data = data.encode() if isinstance(data, str) else bytes(data)
        proof_buffer = bytearray(64)
        proof_buffer[: min(len(raw_data), 64)] = raw_data[:64]
        proof_data = list(proof_buffer)

        sig = await program.rpc["submit_proof"](
            proof_type_idl,
            proof_data,
            ctx=Context(
                accounts={
                    "provider": self.pubkey,
                    "config": config_pda,
                    "escrow": escrow_pk,
                    "escrow_vault": vault_pda,
                    "escrow_vault_authority": vault_authority_pda,
                    "provider_token_account": provider_token_account,
                    "protocol_fee_account": protocol_fee_account,
                    "token_program": TOKEN_PROGRAM_ID,
                },
                signers=[self.keypair],
            ),
        )
        return str(sig)

    async def confirm_completion(self, escrow_address: str) -> str:
        """Confirm task completion as the client. Releases funds."""
        escrow_pk = Pubkey.from_string(escrow_address)
        vault_pda, _ = _derive_vault_pda(escrow_pk, self.program_id)
        vault_authority_pda, _ = _derive_vault_authority_pda(
            escrow_pk, self.program_id
        )
        config_pda, _ = _derive_config_pda(self.program_id)

        program = await self._get_program()
        escrow_data = await program.account["Escrow"].fetch(escrow_pk)

        provider_pk = (
            escrow_data.provider
            if isinstance(escrow_data.provider, Pubkey)
            else Pubkey.from_string(str(escrow_data.provider))
        )
        token_mint_pk = (
            escrow_data.token_mint
            if isinstance(escrow_data.token_mint, Pubkey)
            else Pubkey.from_string(str(escrow_data.token_mint))
        )
        provider_token_account = _get_associated_token_address(
            provider_pk, token_mint_pk
        )
        protocol_fee_account = await self._get_protocol_fee_account()

        sig = await program.rpc["confirm_completion"](
            ctx=Context(
                accounts={
                    "client": self.pubkey,
                    "config": config_pda,
                    "escrow": escrow_pk,
                    "escrow_vault": vault_pda,
                    "escrow_vault_authority": vault_authority_pda,
                    "provider_token_account": provider_token_account,
                    "protocol_fee_account": protocol_fee_account,
                    "token_program": TOKEN_PROGRAM_ID,
                },
                signers=[self.keypair],
            ),
        )
        return str(sig)

    async def cancel_escrow(self, escrow_address: str) -> str:
        """Cancel an escrow before provider accepts. Full refund."""
        escrow_pk = Pubkey.from_string(escrow_address)
        vault_pda, _ = _derive_vault_pda(escrow_pk, self.program_id)
        vault_authority_pda, _ = _derive_vault_authority_pda(
            escrow_pk, self.program_id
        )
        config_pda, _ = _derive_config_pda(self.program_id)

        program = await self._get_program()
        escrow_data = await program.account["Escrow"].fetch(escrow_pk)

        token_mint_pk = (
            escrow_data.token_mint
            if isinstance(escrow_data.token_mint, Pubkey)
            else Pubkey.from_string(str(escrow_data.token_mint))
        )
        client_token_account = _get_associated_token_address(
            self.pubkey, token_mint_pk
        )

        sig = await program.rpc["cancel_escrow"](
            ctx=Context(
                accounts={
                    "client": self.pubkey,
                    "config": config_pda,
                    "escrow": escrow_pk,
                    "escrow_vault": vault_pda,
                    "escrow_vault_authority": vault_authority_pda,
                    "client_token_account": client_token_account,
                    "token_program": TOKEN_PROGRAM_ID,
                },
                signers=[self.keypair],
            ),
        )
        return str(sig)

    async def raise_dispute(self, escrow_address: str, reason: str) -> str:
        """Raise a dispute on an escrow."""
        escrow_pk = Pubkey.from_string(escrow_address)

        if self.indexer_url:
            await self._http.post(
                f"{self.indexer_url}/disputes",
                json={
                    "escrow_address": escrow_address,
                    "raised_by": str(self.pubkey),
                    "reason": reason,
                },
            )

        program = await self._get_program()

        sig = await program.rpc["raise_dispute"](
            ctx=Context(
                accounts={
                    "raiser": self.pubkey,
                    "escrow": escrow_pk,
                },
                signers=[self.keypair],
            ),
        )
        return str(sig)

    async def resolve_dispute(
        self, escrow_address: str, ruling: DisputeRuling
    ) -> str:
        """Resolve a dispute as the arbitrator."""
        escrow_pk = Pubkey.from_string(escrow_address)
        vault_pda, _ = _derive_vault_pda(escrow_pk, self.program_id)
        vault_authority_pda, _ = _derive_vault_authority_pda(
            escrow_pk, self.program_id
        )
        config_pda, _ = _derive_config_pda(self.program_id)

        program = await self._get_program()
        escrow_data = await program.account["Escrow"].fetch(escrow_pk)

        client_pk = (
            escrow_data.client
            if isinstance(escrow_data.client, Pubkey)
            else Pubkey.from_string(str(escrow_data.client))
        )
        provider_pk = (
            escrow_data.provider
            if isinstance(escrow_data.provider, Pubkey)
            else Pubkey.from_string(str(escrow_data.provider))
        )
        token_mint_pk = (
            escrow_data.token_mint
            if isinstance(escrow_data.token_mint, Pubkey)
            else Pubkey.from_string(str(escrow_data.token_mint))
        )
        client_token_account = _get_associated_token_address(
            client_pk, token_mint_pk
        )
        provider_token_account = _get_associated_token_address(
            provider_pk, token_mint_pk
        )
        arbitrator_token_account = _get_associated_token_address(
            self.pubkey, token_mint_pk
        )
        protocol_fee_account = await self._get_protocol_fee_account()

        ruling_idl = _dispute_ruling_to_idl(ruling)

        sig = await program.rpc["resolve_dispute"](
            ruling_idl,
            ctx=Context(
                accounts={
                    "arbitrator": self.pubkey,
                    "config": config_pda,
                    "escrow": escrow_pk,
                    "escrow_vault": vault_pda,
                    "escrow_vault_authority": vault_authority_pda,
                    "client_token_account": client_token_account,
                    "provider_token_account": provider_token_account,
                    "arbitrator_token_account": arbitrator_token_account,
                    "protocol_fee_account": protocol_fee_account,
                    "token_program": TOKEN_PROGRAM_ID,
                },
                signers=[self.keypair],
            ),
        )
        return str(sig)

    # ──────────────────────────────────────────────────────
    # QUERIES
    # ──────────────────────────────────────────────────────

    async def get_escrow(self, escrow_address: str) -> EscrowInfo:
        """Get details of a single escrow."""
        if self.indexer_url:
            try:
                resp = await self._http.get(
                    f"{self.indexer_url}/escrows/{escrow_address}"
                )
                resp.raise_for_status()
                return EscrowInfo(**resp.json())
            except httpx.HTTPError:
                pass

        program = await self._get_program()
        escrow_pk = Pubkey.from_string(escrow_address)
        data = await program.account["Escrow"].fetch(escrow_pk)
        return self._parse_escrow_account(escrow_address, data)

    async def get_agent_stats(self, agent_address: str) -> AgentStats:
        """Get reputation stats for an agent."""
        if not self.indexer_url:
            raise ValueError("Indexer URL required for agent stats")

        resp = await self._http.get(
            f"{self.indexer_url}/agents/{agent_address}/stats"
        )
        resp.raise_for_status()
        return AgentStats(**resp.json())

    async def list_escrows(
        self,
        status: Optional[str] = None,
        client: Optional[str] = None,
        provider: Optional[str] = None,
        limit: int = 50,
        offset: int = 0,
    ) -> list[EscrowInfo]:
        """List escrows with optional filters."""
        if self.indexer_url:
            params = {"limit": limit, "offset": offset}
            if status:
                params["status"] = status
            if client:
                params["client"] = client
            if provider:
                params["provider"] = provider

            resp = await self._http.get(f"{self.indexer_url}/escrows", params=params)
            resp.raise_for_status()
            return [EscrowInfo(**e) for e in resp.json()]

        program = await self._get_program()
        accounts = await program.account["Escrow"].all()
        result = [
            self._parse_escrow_account(str(a.public_key), a.account)
            for a in accounts
        ]
        if status:
            result = [e for e in result if e.status.value == status]
        if client:
            result = [e for e in result if e.client == client]
        if provider:
            result = [e for e in result if e.provider == provider]
        return result[offset : offset + limit]

    # ──────────────────────────────────────────────────────
    # INTERNAL
    # ──────────────────────────────────────────────────────

    async def _store_task(self, task_hash: str, task: dict) -> None:
        """Store task description off-chain via indexer."""
        try:
            await self._http.post(
                f"{self.indexer_url}/tasks",
                json={
                    "task_hash": task_hash,
                    "description": task.get("description", ""),
                    "criteria": task.get("criteria", []),
                    "metadata": task.get("metadata"),
                },
            )
        except Exception as e:
            print(f"Warning: failed to store task off-chain: {e}")

    async def close(self) -> None:
        """Close the HTTP client and connection."""
        await self._http.aclose()
        if self._connection:
            await self._connection.close()

    async def __aenter__(self):
        return self

    async def __aexit__(self, *args):
        await self.close()
