"""EscrowAgent Python SDK Client — multi-chain factory.

Creates the appropriate chain-specific client (Solana or Base) based on config.

Usage:
    # Solana (default)
    vault = AgentVault(chain="solana", rpc_url="https://api.devnet.solana.com", keypair=kp)

    # Base
    vault = AgentVault(chain="base", rpc_url="https://mainnet.base.org",
                       private_key="0x...", contract_address="0x...")
"""

from __future__ import annotations

from typing import Optional


class AgentVault:
    """Multi-chain escrow client factory.

    Instantiates the correct chain-specific client based on the ``chain`` parameter.
    All methods delegate to the underlying client.
    """

    def __init__(
        self,
        chain: str = "solana",
        *,
        # Solana-specific
        rpc_url: Optional[str] = None,
        keypair=None,
        indexer_url: Optional[str] = None,
        program_id=None,
        idl_path: Optional[str] = None,
        protocol_fee_account=None,
        # Base-specific
        private_key: Optional[str] = None,
        contract_address: Optional[str] = None,
        chain_id: Optional[int] = None,
    ):
        self.chain = chain

        if chain == "base":
            from escrowagent.base import BaseEscrowClient, BASE_CHAIN_ID

            self._client = BaseEscrowClient(
                rpc_url=rpc_url or "https://mainnet.base.org",
                private_key=private_key or "",
                contract_address=contract_address or "",
                indexer_url=indexer_url,
                chain_id=chain_id or BASE_CHAIN_ID,
            )
        else:
            from escrowagent.solana import AgentVault as SolanaAgentVault

            self._client = SolanaAgentVault(
                rpc_url=rpc_url or "https://api.devnet.solana.com",
                keypair=keypair,
                indexer_url=indexer_url,
                program_id=program_id,
                idl_path=idl_path,
                protocol_fee_account=protocol_fee_account,
            )

    # ── Delegate lifecycle methods ──

    async def create_escrow(self, params):
        return await self._client.create_escrow(params)

    async def accept_escrow(self, escrow_address: str):
        return await self._client.accept_escrow(escrow_address)

    async def submit_proof(self, escrow_address: str, proof):
        return await self._client.submit_proof(escrow_address, proof)

    async def confirm_completion(self, escrow_address: str):
        return await self._client.confirm_completion(escrow_address)

    async def cancel_escrow(self, escrow_address: str):
        return await self._client.cancel_escrow(escrow_address)

    async def raise_dispute(self, escrow_address: str, reason: str = ""):
        return await self._client.raise_dispute(escrow_address, reason)

    async def resolve_dispute(self, escrow_address: str, ruling):
        return await self._client.resolve_dispute(escrow_address, ruling)

    async def get_escrow(self, escrow_address: str):
        return await self._client.get_escrow(escrow_address)

    async def get_agent_stats(self, agent_address: str):
        return await self._client.get_agent_stats(agent_address)

    async def close(self):
        if hasattr(self._client, "close"):
            await self._client.close()

    async def __aenter__(self):
        return self

    async def __aexit__(self, *args):
        await self.close()
