#!/bin/sh
# Starts the HTTPS relay and a Chopsticks fork of the Portaldot V3 testnet on ws://127.0.0.1:8000.
cd "$(dirname "$0")"
mkdir -p ../.chopsticks
pkill -f ws-relay.mjs 2>/dev/null
RELAY_LOG=1 node ws-relay.mjs > ../.chopsticks/relay.txt 2>&1 &
sleep 1
exec npx -y @acala-network/chopsticks@1.5.2 --config portaldot-v3.yml
