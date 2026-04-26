const { loadEnv, defineConfig } = require('@medusajs/framework/utils')

loadEnv(process.env.NODE_ENV || 'development', process.cwd())

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
      maxUploadFileSize: 20 * 1024 * 1024,
    },
  modules: {
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
