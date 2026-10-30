import { authenticate, defineMiddlewares, validateAndTransformBody } from "@medusajs/framework/http"
import { CreateDropSchema, UpdateDropSchema } from "./admin/drops/validators"
import { SetDropProductsSchema } from "./admin/drops/[id]/products/validators"
import { CreateLeadSchema, UpdateLeadSchema } from "./admin/leads/validators"
import { StoreCreateLeadSchema } from "./store/leads/validators"
import { RedeemTicketSchema } from "./store/tickets/redeem/validators"

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
      matcher: "/admin/drops/:id/products",
      method: "POST",
      middlewares: [validateAndTransformBody(SetDropProductsSchema)],
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
    {
      matcher: "/store/tickets/redeem",
      method: "POST",
      middlewares: [validateAndTransformBody(RedeemTicketSchema)],
    },
    {
      // Visitante anônimo vê a página; logado também recebe os produtos a que tem direito.
      matcher: "/store/drop",
      method: "GET",
      middlewares: [authenticate("customer", ["session", "bearer"], { allowUnauthenticated: true })],
    },
  ],
})
