# Frontend Dockerfile with Bun
FROM oven/bun:1-alpine

WORKDIR /app

# Install dependencies with Bun
COPY package.json ./
RUN bun install

# Copy the rest of the application
COPY . .

# Expose the port
EXPOSE 3000

# Run the development server with Bun
CMD ["bun", "run", "dev", "--", "--host", "0.0.0.0"]