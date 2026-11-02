import { authenticate, defineMiddlewares, validateAndTransformBody } from "@medusajs/framework/http"
import { CreateDropSchema, UpdateDropSchema } from "./admin/drops/validators"
import { SetDropProductsSchema } from "./admin/drops/[id]/products/validators"
import { CreateLeadSchema, UpdateLeadSchema } from "./admin/leads/validators"
import { StoreCreateLeadSchema } from "./store/leads/validators"
import { IdentifySchema } from "./store/drop/identify/validators"
import { RedeemTicketSchema } from "./store/tickets/redeem/validators"
import { bodyEmail, rateLimit } from "./rate-limit"
import { hideBlockedProducts } from "./hide-blocked-products"

const optionalCustomer = authenticate("customer", ["session", "bearer"], { allowUnauthenticated: true })
const requiredCustomer = authenticate("customer", ["session", "bearer"])

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
      middlewares: [
        rateLimit("leads", { windowMs: 600_000, max: 8 }),
        rateLimit("leads-email", { windowMs: 3_600_000, max: 3, by: bodyEmail }),
        validateAndTransformBody(StoreCreateLeadSchema),
      ],
    },
    {
      matcher: "/store/drop/identify",
      method: "POST",
      middlewares: [
        rateLimit("identify", { windowMs: 600_000, max: 10 }),
        rateLimit("identify-email", { windowMs: 3_600_000, max: 5, by: bodyEmail }),
        validateAndTransformBody(IdentifySchema),
      ],
    },
    {
      matcher: "/store/tickets/redeem",
      method: "POST",
      middlewares: [rateLimit("redeem", { windowMs: 600_000, max: 10 }), validateAndTransformBody(RedeemTicketSchema)],
    },
    {
      // Reset de senha: sem teto, dá para encher a caixa de alguém (e gastar o limite diário do SMTP).
      matcher: "/auth/customer/emailpass/reset-password",
      method: "POST",
      middlewares: [
        rateLimit("reset", { windowMs: 600_000, max: 8 }),
        rateLimit("reset-email", { windowMs: 3_600_000, max: 3, by: bodyEmail }),
      ],
    },
    {
      matcher: "/auth/customer/emailpass",
      method: "POST",
      middlewares: [
        rateLimit("login", { windowMs: 600_000, max: 20 }),
        rateLimit("login-email", { windowMs: 600_000, max: 8, by: bodyEmail }),
      ],
    },
    {
      matcher: "/auth/customer/emailpass/register",
      method: "POST",
      middlewares: [rateLimit("register", { windowMs: 3_600_000, max: 10 })],
    },
    {
      // Cobrança sempre em nome da conta logada, dona do carrinho.
      matcher: "/store/checkout/mercadopago/*",
      middlewares: [rateLimit("checkout", { windowMs: 600_000, max: 60 }), requiredCustomer],
    },
    {
      matcher: "/store/products*",
      method: "GET",
      middlewares: [optionalCustomer, hideBlockedProducts],
    },
    {
      matcher: "/store/product-variants*",
      method: "GET",
      middlewares: [optionalCustomer, hideBlockedProducts],
    },
    {
      // Visitante anônimo vê a página; logado também recebe os produtos a que tem direito.
      matcher: "/store/drop",
      method: "GET",
      middlewares: [authenticate("customer", ["session", "bearer"], { allowUnauthenticated: true })],
    },
    {
      matcher: "/store/drop/gate",
      method: "POST",
      middlewares: [authenticate("customer", ["session", "bearer"], { allowUnauthenticated: true })],
    },
  ],
})
