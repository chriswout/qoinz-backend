FROM node:18-alpine

WORKDIR /app

# Install curl for healthcheck
RUN apk add --no-cache curl

COPY package*.json ./

RUN npm install --production

COPY . .

# Create logs directory
RUN mkdir -p logs

# Set environment variables
ENV PORT=3000
ENV NODE_ENV=production

# Expose both the app port and debug port
EXPOSE 3000 9229

# Add healthcheck
HEALTHCHECK --interval=30s --timeout=30s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:3000/health || exit 1

# Use debug mode with proper signal handling
CMD ["node", "--inspect=0.0.0.0:9229", "--max-old-space-size=512", "src/index.js"] 