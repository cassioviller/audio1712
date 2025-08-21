#!/bin/sh

# Script de entrada para o Docker container
echo "Starting Audio Transcription Application..."

# Verify environment
echo "Node.js version: $(node --version)"
echo "NPM version: $(npm --version)"
echo "Environment: $NODE_ENV"
echo "Port: $PORT"

# Check if OpenAI API key is set
if [ -z "$OPENAI_API_KEY" ]; then
    echo "WARNING: OPENAI_API_KEY not set. Transcription will fail."
else
    echo "OpenAI API key configured ✓"
fi

# Ensure uploads directory exists
mkdir -p uploads

# Check if dist directory exists and has content
if [ -f "dist/index.js" ]; then
    echo "Using compiled version..."
    exec node dist/index.js
else
    echo "Using TypeScript version with tsx..."
    exec npx tsx server/index.ts
fi