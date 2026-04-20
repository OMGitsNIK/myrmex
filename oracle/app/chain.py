"""
On-chain interaction: post oracle reports and read pool state.
Uses solders + httpx to construct and send Anchor instructions directly
(avoids needing anchorpy's IDL loader at runtime).
"""
import json
import os
import struct
import hashlib
from typing import Optional
import httpx
from solders.keypair import Keypair
from solders.pubkey import Pubkey
from solders.transaction import Transaction
from solders.instruction import Instruction, AccountMeta
from solders.hash import Hash
from solders.message import Message
from app.config import RPC_URL, PROGRAM_ID, ORACLE_KEYPAIR_PATH, ORACLE_KEYPAIR_JSON

PROGRAM_PUBKEY = Pubkey.from_string(PROGRAM_ID)


def load_oracle_keypair() -> Keypair:
    if ORACLE_KEYPAIR_JSON:
        secret = json.loads(ORACLE_KEYPAIR_JSON)
        return Keypair.from_bytes(bytes(secret))
    path = os.path.expanduser(ORACLE_KEYPAIR_PATH)
    with open(path) as f:
        secret = json.load(f)
    return Keypair.from_bytes(bytes(secret))


def _find_pda(seeds: list[bytes]) -> Pubkey:
    pda, _ = Pubkey.find_program_address(seeds, PROGRAM_PUBKEY)
    return pda


def _anchor_discriminator(namespace: str, name: str) -> bytes:
    """Compute the 8-byte Anchor instruction discriminator."""
    preimage = f"{namespace}:{name}"
    return hashlib.sha256(preimage.encode()).digest()[:8]


async def post_oracle_report(
    pool_pubkey: str,
    reported_value: int,
    description: str,
) -> str:
    """
    Post an oracle report on-chain for the given pool.
    Returns the transaction signature.
    """
    keypair = load_oracle_keypair()
    authority = keypair.pubkey()

    pool_pk = Pubkey.from_string(pool_pubkey)
    pool_config_pk = _find_pda([b"pool_config", bytes(pool_pk)])
    oracle_report_pk = _find_pda([b"oracle_report", bytes(pool_pk)])

    # Anchor discriminator for postOracleReport
    discriminator = _anchor_discriminator("global", "post_oracle_report")

    # Encode: reported_value (i64 LE) + description ([u8; 192])
    desc_bytes = description.encode("utf-8")[:191]
    desc_padded = desc_bytes + b"\x00" * (192 - len(desc_bytes))
    data = discriminator + struct.pack("<q", reported_value) + desc_padded

    accounts = [
        AccountMeta(pubkey=authority, is_signer=True, is_writable=True),
        AccountMeta(pubkey=pool_pk, is_signer=False, is_writable=False),
        AccountMeta(pubkey=pool_config_pk, is_signer=False, is_writable=False),
        AccountMeta(pubkey=oracle_report_pk, is_signer=False, is_writable=True),
        AccountMeta(
            pubkey=Pubkey.from_string("11111111111111111111111111111111"),
            is_signer=False,
            is_writable=False,
        ),
    ]

    ix = Instruction(PROGRAM_PUBKEY, bytes(data), accounts)

    async with httpx.AsyncClient(timeout=30) as client:
        # Get recent blockhash
        bh_resp = await client.post(
            RPC_URL,
            json={
                "jsonrpc": "2.0",
                "id": 1,
                "method": "getLatestBlockhash",
                "params": [{"commitment": "confirmed"}],
            },
        )
        blockhash = Hash.from_string(
            bh_resp.json()["result"]["value"]["blockhash"]
        )

        msg = Message.new_with_blockhash([ix], authority, blockhash)
        tx = Transaction([keypair], msg, blockhash)

        # Send transaction
        tx_resp = await client.post(
            RPC_URL,
            json={
                "jsonrpc": "2.0",
                "id": 2,
                "method": "sendTransaction",
                "params": [
                    bytes(tx).hex(),
                    {"encoding": "hex", "preflightCommitment": "confirmed"},
                ],
            },
        )
        result = tx_resp.json()
        if "error" in result:
            raise RuntimeError(f"RPC error: {result['error']}")
        return result["result"]


async def get_pool_config(pool_pubkey: str) -> Optional[dict]:
    """Fetch pool_config account data to read oracle_authority, thresholds."""
    pool_pk = Pubkey.from_string(pool_pubkey)
    pool_config_pk = _find_pda([b"pool_config", bytes(pool_pk)])

    async with httpx.AsyncClient(timeout=10) as client:
        resp = await client.post(
            RPC_URL,
            json={
                "jsonrpc": "2.0",
                "id": 1,
                "method": "getAccountInfo",
                "params": [
                    str(pool_config_pk),
                    {"encoding": "base64", "commitment": "confirmed"},
                ],
            },
        )
        data = resp.json()
        if data["result"]["value"] is None:
            return None
        # Raw account data — return as-is; caller can decode if needed
        return {
            "pubkey": str(pool_config_pk),
            "data": data["result"]["value"]["data"][0],
        }
