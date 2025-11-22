FROM node:20-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./
COPY x*/package*.json ./x*/

# Install dependencies
RUN npm ci

# Copy source code
COPY . .

# Build if needed
# RUN npm run build

# Expose ports
EXPOSE 3000 3001 3002 3003 3004 3005 3006 3007 3008

# Default command
CMD ["node", "scripts/run-modules.js"]

