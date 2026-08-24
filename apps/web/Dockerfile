FROM node:22-alpine
WORKDIR /workspace
COPY package*.json tsconfig.base.json ./
COPY apps/web/package.json apps/web/package.json
COPY packages packages
RUN npm ci
COPY apps/web apps/web
RUN npm --workspace @cindr/web run build
USER node
EXPOSE 3000
CMD ["npm", "--workspace", "@cindr/web", "run", "start"]
