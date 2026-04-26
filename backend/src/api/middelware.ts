import { defineMiddlewares } from "@medusajs/framework/http"

export default defineMiddlewares({
  routes: [
    {
      matcher: "/admin*",
      middlewares: [
        (req, res, next) => {
          console.log("➡️", req.method, req.originalUrl)
          next()
        },
      ],
    },
  ],
})