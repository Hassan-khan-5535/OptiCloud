FROM node:22-alpine
WORKDIR /workspace
COPY package*.json tsconfig.base.json ./
COPY apps/worker/package.json apps/worker/package.json
COPY packages packages
RUN npm ci
COPY apps/worker apps/worker
RUN npm run build --workspace @cindr/cloud-adapters && npm run build --workspace @cindr/db && npm --workspace @cindr/worker run build
USER node
CMD ["npm", "--workspace", "@cindr/worker", "run", "start"]
