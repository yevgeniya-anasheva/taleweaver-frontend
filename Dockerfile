# Use an official Node runtime as a parent image
FROM node:20

# Set the working directory to /app
WORKDIR /app

# Copy only package.json to avoid npm optional dependency bug with package-lock.json
COPY ./package*.json ./

# Install the dependencies (without package-lock.json to ensure optional deps install correctly)
RUN npm ci

# Copy the remaining application files to the working directory
COPY . .

# Build the application
RUN npm run build

# Expose port 3000 for the application
EXPOSE 3001

# Start the application
CMD [ "npm", "run", "start" ]