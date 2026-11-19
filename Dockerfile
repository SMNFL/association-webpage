FROM node:22-bookworm-slim AS python-deps

ENV PYTHONDONTWRITEBYTECODE=1

# Build tools are only needed to compile cffi on platforms without prebuilt wheels (e.g. ARMv7).
# They stay in this stage and never reach the runtime image.
RUN apt-get update \
    && DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends \
       python3 python3-venv gcc libc6-dev libffi-dev \
    && rm -rf /var/lib/apt/lists/*

RUN python3 -m venv /opt/instagram-venv \
    && /opt/instagram-venv/bin/pip install --no-cache-dir "curl_cffi==0.17.0"


FROM node:22-bookworm-slim

ENV NODE_ENV=production \
    INSTAGRAM_PYTHON=/opt/instagram-venv/bin/python \
    PYTHONDONTWRITEBYTECODE=1

WORKDIR /app

# Runtime only needs the Python interpreter (no compiler, headers or venv tooling).
RUN apt-get update \
    && DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends python3 \
    && rm -rf /var/lib/apt/lists/*

COPY --from=python-deps /opt/instagram-venv /opt/instagram-venv

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
