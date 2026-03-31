# Use the official lightweight Node.js 20 image as the base image for the build stage.
# We recommend using a specific major version (like 20-slim) for stability.
FROM node:20-slim as builder

# Create and set the working directory for the application
WORKDIR /usr/src/app

# Copy package.json and package-lock.json (if you have one) to the workdir.
# We do this first to leverage Docker's build cache when dependencies don't change.
COPY package*.json ./

# Install application dependencies
RUN npm install --only=production

# Copy the rest of the application source code (server.js, html, etc.)
COPY . .

# Cloud Run requires the container to listen on the port specified by the PORT environment variable.
# Your code (server.js) already uses process.env.PORT || 8080, so exposing 8080 is a standard practice.
EXPOSE 8080

# Set production environment
ENV NODE_ENV=production
ENV PORT=8080

# Health check for Cloud Run (optional but recommended)
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=2 \
  CMD node -e "require('http').get('http://localhost:8080/health', (r) => {if (r.statusCode !== 200) throw new Error(r.statusCode)})"

# Run the app. The 'start' script from package.json will be executed.
CMD [ "npm", "start" ]