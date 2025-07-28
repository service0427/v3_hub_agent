#!/bin/bash

# V3 Batch Check (API Mode) Runner

echo "=== V3 Batch Check API Mode ==="
echo ""

# Check if parameter is provided
if [ $# -eq 0 ]; then
    echo "No parameter provided, using default (2 keywords)"
    echo "Usage: $0 <number_of_keywords>"
    echo "Example: $0 10"
    echo ""
    echo "Starting batch check for 2 keywords..."
    node batch-check-api.js
else
    echo "Starting batch check for $1 keywords..."
    node batch-check-api.js $1
fi