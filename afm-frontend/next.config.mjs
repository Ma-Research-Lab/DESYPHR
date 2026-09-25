// Plain JS (not .ts) on purpose: `next start` needs the `typescript` package
// installed just to read a `next.config.ts`, which would force a TypeScript
// compiler into the production container. The JSDoc annotation below keeps
// editor type-checking and autocomplete without that runtime dependency.

/** @type {import('next').NextConfig} */
const nextConfig = {};

export default nextConfig;
