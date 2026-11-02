const { loadEnv, defineConfig } = require('@medusajs/framework/utils')

loadEnv(process.env.NODE_ENV || 'development', process.cwd())

// Segredos padrão em produção deixariam qualquer um forjar sessões de cliente e de admin.
if (process.env.NODE_ENV === 'production') {
  for (const name of ['JWT_SECRET', 'COOKIE_SECRET']) {
    if (!process.env[name] || process.env[name] === 'supersecret') {
      throw new Error(`${name} precisa estar definido em produção`)
    }
  }
}

module.exports = defineConfig({
  projectConfig: {
    databaseUrl: process.env.DATABASE_URL,
    redisUrl: process.env.REDIS_URL,
    databaseDriverOptions: {
      ssl: false,
    },
    http: {
      storeCors: process.env.STORE_CORS || "http://localhost:4321,http://localhost:3000,http://172.24.0.8:4321,http://127.0.0.1:4321",
      adminCors: process.env.ADMIN_CORS,
      authCors: process.env.AUTH_CORS || process.env.STORE_CORS || "http://localhost:4321,http://localhost:3000,http://172.24.0.8:4321,http://127.0.0.1:4321",
      jwtSecret: process.env.JWT_SECRET || "supersecret",
      cookieSecret: process.env.COOKIE_SECRET || "supersecret",
    },
  },
  admin: {
      disable: false,
      // No container de dev o código fica em /app: o mesmo prefixo do admin faz o
      // Vite descartar a base dos imports absolutos e não achar as páginas custom.
      path: process.env.MEDUSA_ADMIN_PATH || "/app",
      maxUploadFileSize: 20 * 1024 * 1024,
    },
  modules: {
    drop: { resolve: "./src/modules/drop" },
    melhorEnvio: { resolve: "./src/modules/melhor-envio" },
    lead: { resolve: "./src/modules/lead" },
    ticket: { resolve: "./src/modules/ticket" },
    // Sem SMTP configurado o provider não é registrado (a validação das opções derrubaria o boot).
    ...(process.env.SMTP_HOST
      ? {
          notification: {
            resolve: "@medusajs/notification",
            options: {
              providers: [
                {
                  resolve: "./src/modules/notification-smtp",
                  id: "smtp",
                  options: {
                    channels: ["email"],
                    host: process.env.SMTP_HOST,
                    port: Number(process.env.SMTP_PORT) || undefined,
                    secure: process.env.SMTP_SECURE ? process.env.SMTP_SECURE === "true" : Number(process.env.SMTP_PORT) === 465,
                    user: process.env.SMTP_USER,
                    password: process.env.SMTP_PASSWORD,
                    from: process.env.SMTP_FROM,
                  },
                },
              ],
            },
          },
        }
      : {}),
    fulfillment: {
      resolve: "@medusajs/fulfillment",
      options: {
        providers: [
          { resolve: "@medusajs/fulfillment-manual", id: "manual" },
          { resolve: "./src/modules/fulfillment-melhorenvio", id: "melhorenvio" },
        ],
      },
    },
    payment: {
      resolve: "@medusajs/payment",
      options: {
        providers: [
          {
            resolve: "./src/modules/payment-mercadopago",
            id: "mercadopago",
            options: {
              accessToken: process.env.MERCADOPAGO_ACCESS_TOKEN,
              publicKey: process.env.PUBLIC_MERCADOPAGO_PUBLIC_KEY,
              notificationUrl: process.env.MERCADOPAGO_NOTIFICATION_URL,
              webhookSecret: process.env.MERCADOPAGO_WEBHOOK_SECRET,
            },
          },
        ],
      },
    },
    file: {
      resolve: "@medusajs/file",
      options: {
        providers: [
          {
            resolve: "@medusajs/file-s3",
            id: "s3",
            options: {
              bucket: process.env.AWS_BUCKET,
              region: process.env.AWS_DEFAULT_REGION,
              access_key_id: process.env.AWS_ACCESS_KEY_ID,
              secret_access_key: process.env.AWS_SECRET_ACCESS_KEY,
              endpoint: process.env.AWS_ENDPOINT,
              force_path_style: true,
              file_url: process.env.AWS_URL,
              additional_client_config: {
                forcePathStyle: true,
              },
            },
          },
        ],
      },
    },
  },
})
