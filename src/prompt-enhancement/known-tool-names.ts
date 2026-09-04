import { SECRET_IN_TEXT } from '../classifier/mistake-categories.js';

/**
 * The curated known tool / service / credential name list — the deterministic name layer.
 *
 * Why it exists: the invention detector's shape patterns (CamelCase, long ALL-CAPS) catch a
 * product name only when its casing cooperates — measured at 37% over 30 real tool names.
 * Capitalisation is not a proxy for "is a product name"; this list is. It serves TWO consumers
 * through one artefact so the two can never disagree about what counts as a known name:
 *   1. the invention detector (`preservation-floors.ts`) — a body naming a listed tool that the
 *      user's prompt (and source facts) never mentioned is a fabrication finding;
 *   2. the pre-composer gate predicate below, wired later by the declare-then-judge work.
 *
 * Content is OWNER-APPROVED (2026-08-25) and frozen for this phase; additions ride their own
 * approval. Two deliberate shapes of exclusion, kept visible here so they read as decisions:
 *   - `JWT` is allow-listed BY DESIGN in the detector's GENERIC_UPPER_TOKENS — a generic term,
 *     not a product — and is asserted absent from this list by test.
 *   - Names whose lowercase form collides with ordinary English or everyday dev prose are NOT
 *     listed (React, Express, Render, Flask, Rails, Angular, Remix, Bun, Jest, Mocha,
 *     Playwright, Cypress, Bootstrap, Storybook, Mongoose, Drizzle, Electron, Expo, Flutter,
 *     Capacitor, Helm, Maven, Rollup, Vault, Clerk, Slack, Discord, Telegram, Sentry, Segment,
 *     Notion, Intercom, Amplitude, Neon, Convex, Railway, Vagrant, Caddy, Nomad, Snowflake,
 *     Realm, Lambda, Prettier, Gemini, Pinecone, Chroma, Replicate, Apollo, Mistral, Plaid,
 *     Paddle, Postmark, Pusher, Airflow, Elastic, Pulsar, Azure, Claude — plus the ubiquitous
 *     JavaScript/Python/Node/npm/HTML/CSS). Matching is case-insensitive whole-word, so listing
 *     "express" would flag "express the intent" — the false-positive direction this layer must
 *     never take. Each exclusion can be pulled in individually on a later approval.
 */
export const KNOWN_TOOL_AND_CREDENTIAL_NAMES_V1: readonly string[] = [
  // The measured 30-name seed (JWT excluded by ruling): the 11 the shape patterns caught —
  // kept so coverage never depends on capitalisation luck — and the 18 they missed.
  'SAML', 'RabbitMQ', 'MongoDB', 'PostgreSQL', 'GraphQL', 'TypeScript', 'GitHub', 'SendGrid',
  'LDAP', 'SSO', 'NextAuth',
  'OAuth', 'Redis', 'Kafka', 'Postgres', 'Docker', 'Stripe', 'Vercel', 'Nginx', 'Auth0',
  'Firebase', 'Supabase', 'Cloudflare', 'Twilio', 'Okta', 'Keycloak', 'bcrypt', 'argon2',
  'Passport',
  // Databases, queues, storage.
  'MySQL', 'MariaDB', 'SQLite', 'DynamoDB', 'Cassandra', 'CouchDB', 'Elasticsearch',
  'OpenSearch', 'Memcached', 'ClickHouse', 'BigQuery', 'Neo4j', 'InfluxDB', 'Firestore',
  'PlanetScale', 'CockroachDB', 'Redshift', 'Kinesis', 'ActiveMQ', 'ZeroMQ', 'SQS', 'SNS',
  'S3', 'EC2', 'RDS',
  // Auth, identity, security.
  'OAuth2', 'OIDC', 'Cognito', 'Authelia', 'HashiCorp', 'scrypt', 'PBKDF2', 'HMAC', 'TOTP',
  'WebAuthn', 'reCAPTCHA', 'hCaptcha', 'Snyk', 'OWASP',
  // Payments, comms, SaaS, observability.
  'PayPal', 'Braintree', 'Razorpay', 'Mailgun', 'Mailchimp', 'WhatsApp', 'Shopify',
  'Salesforce', 'HubSpot', 'Zapier', 'Airtable', 'Mixpanel', 'PostHog', 'Datadog', 'Grafana',
  'Prometheus', 'Kibana', 'Logstash', 'OpenTelemetry',
  // Infrastructure, deploy, build.
  'Podman', 'Kubernetes', 'k8s', 'Terraform', 'Ansible', 'Pulumi', 'Traefik', 'Netlify',
  'Heroku', 'Akamai', 'DigitalOcean', 'Linode', 'Fastly', 'Upstash', 'Appwrite', 'Vite',
  'Webpack', 'esbuild', 'Turbopack', 'Bazel', 'Gradle', 'CircleCI', 'Jenkins', 'GitLab',
  'Bitbucket', 'ArgoCD', 'AWS', 'GCP',
  // Frameworks and libraries.
  'Next.js', 'Nuxt', 'Svelte', 'SvelteKit', 'Astro', 'Django', 'Laravel', 'Symfony',
  'FastAPI', 'Fastify', 'NestJS', 'Deno', 'Prisma', 'Sequelize', 'Knex', 'TypeORM', 'Zod',
  'Axios', 'TanStack', 'Redux', 'Zustand', 'tRPC', 'Socket.io', 'Ably', 'LiveKit', 'Tauri',
  'Tailwind', 'Chakra', 'shadcn', 'Vitest', 'ESLint',
  // The AI/LLM stack.
  'OpenAI', 'Anthropic', 'ChatGPT', 'LangChain', 'LlamaIndex', 'Ollama', 'Weaviate', 'Qdrant',
  'HuggingFace', 'Groq', 'DeepSeek',
];

const escapeForRegex = (name: string): string => name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** One precompiled case-insensitive whole-word matcher per name (dots matched literally). */
const NAME_MATCHERS: readonly { name: string; pattern: RegExp }[] =
  KNOWN_TOOL_AND_CREDENTIAL_NAMES_V1.map((name) => ({
    name,
    pattern: new RegExp(`\\b${escapeForRegex(name)}\\b`, 'i'),
  }));

/**
 * Every curated name the text mentions, in list casing — the detector's half of the artefact.
 * Case-insensitive and whole-word: "redis" and "REDIS" both name Redis; "predisposed" does not.
 */
export function findKnownToolNamesInTextV1(text: string): readonly string[] {
  if (text.length === 0) return [];
  return NAME_MATCHERS.filter(({ pattern }) => pattern.test(text)).map(({ name }) => name);
}

/**
 * The pre-composer gate's half: does this text name a known tool/credential, or carry a
 * credential-shaped token (the classifier's one secret-shape definition, reused)?
 *
 * RECORDED COST, expected rather than a bug: an unlisted noun ("my auth thingy") makes this
 * gate answer false, so a gated consumer would omit its block for that text. That is acceptable
 * ONLY while the ungated judge half still runs on everything — a consumer that gates BOTH
 * halves on this predicate must remove the gate instead.
 */
export function textNamesKnownToolOrCredentialV1(text: string): boolean {
  return findKnownToolNamesInTextV1(text).length > 0 || SECRET_IN_TEXT.test(text);
}
