#!/bin/bash

# V3 Batch Check (API Mode) Runner

echo "=== V3 Batch Check API Mode ==="
echo ""

# Check if parameter is provided
if [ $# -eq 0 ]; then
    echo "Usage: $0 <number_of_keywords>"
    echo "Example: $0 100"
    exit 1
fi

# Run batch check
echo "Starting batch check for $1 keywords..."
node batch-check-api.js $1