FROM node:22-alpine
WORKDIR /workspace
COPY package*.json tsconfig.base.json ./
COPY apps/api/package.json apps/api/package.json
COPY packages packages
RUN npm install
COPY apps/api apps/api
RUN npm --workspace @cindr/api run build
EXPOSE 4000
CMD ["npm", "--workspace", "@cindr/api", "run", "start"]
