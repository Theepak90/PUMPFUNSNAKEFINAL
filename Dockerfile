# Use official Node.js image
FROM node

# Set working directory
WORKDIR /usr/src/app

# Copy only package.json + lock file for dependencies
COPY package*.json ./

# Install only production dependencies
RUN npm install --only=production

# Copy only the compiled file
COPY dist/production.cjs ./production.cjs

# Set NODE_ENV to production
ENV NODE_ENV=production

# Run the production file
CMD ["node", "production.cjs"]






# # Use official Node.js LTS image
# FROM node

# # Set working directory
# WORKDIR /usr/src/app

# # Copy dependency files
# COPY package*.json ./

# # Install dependencies
# RUN npm install

# # Copy app source
# COPY . .

# # Expose app port
# EXPOSE 3000

# # Run app (change start:dev to start if it's for production)
# CMD ["npm", "run", "start:dev"]