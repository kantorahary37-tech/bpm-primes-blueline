# Frontend Dockerfile with Node 22
FROM node:22-alpine

WORKDIR /app

# Install dependencies with npm
COPY package.json ./
RUN npm install

# Copy the rest of the application
COPY . .

# Expose the port
EXPOSE 3000

# Run the development server
CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0"]