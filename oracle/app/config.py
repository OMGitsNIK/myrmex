import os
from dotenv import load_dotenv

load_dotenv()

RPC_URL = os.environ.get("RPC_URL", "https://api.devnet.solana.com")
PROGRAM_ID = os.environ.get("PROGRAM_ID", "9naJhrt9FdAHLwdLnQfgx6citNgEWmW8aLovCS9kYpan")
ANTHROPIC_API_KEY = os.environ.get("ANTHROPIC_API_KEY", "")
ORACLE_KEYPAIR_PATH = os.environ.get("ORACLE_KEYPAIR_PATH", "~/.config/solana/oracle.json")
ORACLE_KEYPAIR_JSON = os.environ.get("ORACLE_KEYPAIR_JSON", "")  # JSON array, Railway secret

# Polling interval in seconds for each event type
POLL_INTERVAL_SECS = int(os.environ.get("POLL_INTERVAL_SECS", "300"))  # 5 minutes

# Pool pubkeys (set after pool_config initialization)
FLIGHT_POOL = os.environ.get("FLIGHT_POOL", "")
CROP_POOL = os.environ.get("CROP_POOL", "")
DEFI_POOL = os.environ.get("DEFI_POOL", "")

# External data sources
OPEN_METEO_BASE = "https://api.open-meteo.com/v1"
DEFILLAMA_BASE = "https://api.llama.fi"
OPENSKY_BASE = "https://opensky-network.org/api"

# Location for crop drought monitoring (configurable)
CROP_LAT = float(os.environ.get("CROP_LAT", "41.8781"))   # Chicago default
CROP_LON = float(os.environ.get("CROP_LON", "-87.6298"))

# DeFi protocol slug to monitor for hack detection
DEFI_PROTOCOL = os.environ.get("DEFI_PROTOCOL", "aave-v3")
