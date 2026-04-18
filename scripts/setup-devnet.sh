#!/bin/bash
set -e

echo "Setting up MYRMEX on Solana devnet..."

command -v solana &>/dev/null || { echo "Install Solana CLI"; exit 1; }
command -v anchor &>/dev/null || { echo "Install Anchor CLI"; exit 1; }

solana config set --url devnet
solana config set --keypair ~/.config/solana/id.json

echo "Airdropping SOL..."
solana airdrop 4 || true
sleep 3

echo "Building Anchor program..."
anchor build

echo "Deploying to devnet..."
anchor deploy

PROGRAM_ID=$(solana-keygen pubkey target/deploy/myrmex-keypair.json)
echo "Program ID: $PROGRAM_ID"

# Update program ID in source files
sed -i '' "s/9naJhrt9FdAHLwdLnQfgx6citNgEWmW8aLovCS9kYpan/$PROGRAM_ID/g" programs/myrmex/src/lib.rs
sed -i '' "s/9naJhrt9FdAHLwdLnQfgx6citNgEWmW8aLovCS9kYpan/$PROGRAM_ID/g" Anchor.toml

anchor build

cp target/idl/myrmex.json app/src/idl/

echo "Setup complete! Program ID: $PROGRAM_ID"
echo "Update NEXT_PUBLIC_PROGRAM_ID=$PROGRAM_ID in app/.env.local"
