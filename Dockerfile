FROM node:22-bookworm-slim

ENV NODE_ENV=production \
    INSTAGRAM_PYTHON=/opt/instagram-venv/bin/python \
    PYTHONDONTWRITEBYTECODE=1

WORKDIR /app

# Install Python and the libraries needed to build cffi on ARMv7.
RUN apt-get update \
    && DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends \
       python3 python3-venv gcc libc6-dev libffi-dev \
    && rm -rf /var/lib/apt/lists/*

# Install the Instagram fetcher's Python dependency.
RUN python3 -m venv /opt/instagram-venv \
    && /opt/instagram-venv/bin/pip install --no-cache-dir curl_cffi

# Install Node.js dependencies.
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY public ./public
COPY server ./server
COPY scripts ./scripts
COPY ui-web-edit-tool ./ui-web-edit-tool

RUN chown -R node:node /app

USER node
EXPOSE 8080

CMD ["npm", "run", "start"]