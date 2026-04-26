import Medusa from "@medusajs/medusa-js";

const isServer = typeof window === "undefined";
const baseUrl = isServer 
  ? "http://backend:9000"
  : (import.meta.env.PUBLIC_MEDUSA_URL || "http://localhost:9003");

const medusa = new Medusa({
  baseUrl,
  publishableApiKey: import.meta.env.PUBLIC_MEDUSA_PUBLISHABLE_KEY,
  maxRetries: 3,
});

export default medusa;
