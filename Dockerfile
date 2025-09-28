# Simple dev image that runs `npm run dev`
FROM node:20-bullseye-slim

ENV NODE_ENV=development
WORKDIR /app

# Install Python and build tools needed for native dependencies
RUN apt-get update && apt-get install -y \
    python3 \
    python3-pip \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

# Install dependencies first for better layer caching
COPY package*.json ./
RUN npm install

# Copy source code
COPY . .

# Next.js dev server
EXPOSE 3000

# Start development server (resets trading.db per package.json script)
CMD ["npm", "run", "dev"]

