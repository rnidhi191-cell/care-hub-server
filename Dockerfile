FROM node:22-alpine

WORKDIR /app

# Copy package descriptors
COPY package*.json ./
COPY prisma ./prisma/

# Install dependencies and generate Prisma client
RUN npm ci --omit=dev && npx prisma generate

# Copy application source
COPY . .

EXPOSE 5000

CMD ["npm", "start"]

