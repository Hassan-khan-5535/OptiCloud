FROM node:22-alpine
WORKDIR /workspace
COPY package*.json tsconfig.base.json ./
COPY apps/worker/package.json apps/worker/package.json
COPY packages packages
RUN npm install
COPY apps/worker apps/worker
RUN npm --workspace @cindr/worker run build
CMD ["npm", "--workspace", "@cindr/worker", "run", "start"]
