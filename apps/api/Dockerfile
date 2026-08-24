FROM node:22-alpine
WORKDIR /workspace
COPY package*.json tsconfig.base.json ./
COPY apps/api/package.json apps/api/package.json
COPY packages packages
RUN npm ci
COPY apps/api apps/api
RUN npm run build --workspace @cindr/cloud-adapters && npm run build --workspace @cindr/db && npm run build --workspace @cindr/slack && npm --workspace @cindr/api run build
USER node
EXPOSE 4000
CMD ["npm", "--workspace", "@cindr/api", "run", "start"]
