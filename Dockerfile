FROM node:22-alpine

WORKDIR /app

# Copy dependency definitions
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy application files
COPY . .

# Build production frontend assets
RUN npm run build

# Expose server port
ENV NODE_ENV=production
ENV PORT=3000
EXPOSE 3000

# Run full-stack application (frontend + Node.js backend)
CMD ["npm", "start"]
