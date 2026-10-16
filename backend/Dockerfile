# Playwright's own image rather than a plain node base: it already ships
# Chromium plus the system libraries Chromium needs, which a slim Node image
# does not have. Keep the tag's Playwright version in step with the
# "playwright" dependency in package.json — a mismatch makes Playwright
# re-download a browser at runtime, which fails on Cloud Run's read-only
# filesystem.
FROM mcr.microsoft.com/playwright:v1.62.0-jammy

ENV NODE_ENV=production

WORKDIR /app

# Dependencies are copied and installed before the source so that editing
# application code does not invalidate the cached install layer.
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY . .

# Documents the default; Cloud Run overrides PORT at runtime and
# src/server.js already reads process.env.PORT.
EXPOSE 5000

CMD ["node", "src/server.js"]
