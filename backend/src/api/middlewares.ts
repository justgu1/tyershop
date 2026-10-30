import { defineMiddlewares, validateAndTransformBody } from "@medusajs/framework/http"
import { CreateDropSchema, UpdateDropSchema } from "./admin/drops/validators"
import { CreateLeadSchema, UpdateLeadSchema } from "./admin/leads/validators"
import { StoreCreateLeadSchema } from "./store/leads/validators"

export default defineMiddlewares({
  routes: [
    {
      matcher: "/admin/drops",
      method: "POST",
      middlewares: [validateAndTransformBody(CreateDropSchema)],
    },
    {
      matcher: "/admin/drops/:id",
      method: "POST",
      middlewares: [validateAndTransformBody(UpdateDropSchema)],
    },
    {
      matcher: "/admin/leads",
      method: "POST",
      middlewares: [validateAndTransformBody(CreateLeadSchema)],
    },
    {
      matcher: "/admin/leads/:id",
      method: "POST",
      middlewares: [validateAndTransformBody(UpdateLeadSchema)],
    },
    {
      matcher: "/store/leads",
      method: "POST",
      middlewares: [validateAndTransformBody(StoreCreateLeadSchema)],
    },
  ],
})
