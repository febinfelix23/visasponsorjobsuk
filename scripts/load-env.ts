import { config } from "dotenv";

// Locally, read .env.local/.env. In GitHub Actions, the variables come from repository secrets.
config({ path: [".env.local", ".env"], quiet: true });
