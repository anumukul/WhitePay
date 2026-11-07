# syntax=docker/dockerfile:1.7
# Backend image for the WhitePay API, worker and relayer.
#
# Build and run through docker-compose.yml. The SERVICE build argument chooses
# which workspace package starts. These images run the TypeScript sources with
# tsx (the repo has no per-service JS build step yet) so the image matches the
# code under test instead of a second, divergent build artifact.
FROM node:24-slim

RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates \
    && rm -rf /var/lib/apt/lists/* \
    && npm install -g pnpm@10.25.0

WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PNPM_HOME=/pnpm \
    PATH=/pnpm:/usr/local/bin:$PATH

COPY pnpm-workspace.yaml pnpm-lock.yaml package.json ./
COPY packages ./packages
COPY services ./services
COPY apps ./apps

# tsx is a devDependency but is required by the source-based service runtime.
RUN --mount=type=cache,id=whitepay-pnpm,target=/pnpm/store pnpm install --frozen-lockfile --prod=false \
    --filter @whitepay/api... \
    --filter @whitepay/worker... \
    --filter @whitepay/relayer...

ARG SERVICE=api
ENV SERVICE=${SERVICE}

# Overridden per service by compose healthchecks.
CMD ["sh", "-lc", "pnpm --filter @whitepay/${SERVICE} dev"]
