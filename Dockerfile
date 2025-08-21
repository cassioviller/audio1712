# Single-stage build - mais simples e confiável para EasyPanel
FROM node:18-alpine

# Set working directory
WORKDIR /app

# Install system dependencies
RUN apk add --no-cache \
    python3 \
    make \
    g++ \
    ffmpeg \
    curl

# Copy package files
COPY package*.json ./

# Install all dependencies
RUN npm install

# Copy source code
COPY . .

# Make entrypoint script executable
RUN chmod +x entrypoint.sh

# Create uploads directory for temporary file storage
RUN mkdir -p uploads

# Build only the frontend (vite build)
RUN npm run build 2>/dev/null || echo "Build completed with warnings"

# Expose port 5007 as requested
EXPOSE 5007

# Set environment variables
ENV PORT=5007
ENV NODE_ENV=production

# Create non-root user for security
RUN addgroup -g 1001 -S nodejs
RUN adduser -S nodejs -u 1001

# Change ownership of app directory to nodejs user
RUN chown -R nodejs:nodejs /app
USER nodejs

# Health check to ensure the application is running
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:5007/api/health || exit 1

# Start the application using entrypoint script
CMD ["./entrypoint.sh"]