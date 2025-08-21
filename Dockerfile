# Multi-stage build for smaller production image
FROM node:18-alpine AS builder

# Set working directory
WORKDIR /app

# Install build dependencies
RUN apk add --no-cache python3 make g++

# Copy package files
COPY package*.json ./

# Install all dependencies (including dev dependencies)
RUN npm ci

# Copy source code
COPY . .

# Build the application
RUN npm run build

# Production stage
FROM node:18-alpine AS production

# Set working directory
WORKDIR /app

# Install runtime dependencies
RUN apk add --no-cache \
    ffmpeg \
    curl

# Copy package files
COPY package*.json ./

# Install only production dependencies
RUN npm ci --only=production && npm cache clean --force

# Copy built application from builder stage
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/client/dist ./client/dist

# Copy other necessary files
COPY server ./server
COPY shared ./shared

# Create uploads directory for temporary file storage
RUN mkdir -p uploads

# Expose port 5007 as requested
EXPOSE 5007

# Set environment variable for port
ENV PORT=5007

# Create non-root user for security
RUN addgroup -g 1001 -S nodejs
RUN adduser -S nodejs -u 1001

# Change ownership of app directory to nodejs user
RUN chown -R nodejs:nodejs /app
USER nodejs

# Health check to ensure the application is running
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:5007/api/health || exit 1

# Start the application
CMD ["npm", "start"]