import { authenticate, defineMiddlewares, validateAndTransformBody } from "@medusajs/framework/http"
import { CreateDropSchema, UpdateDropSchema } from "./admin/drops/validators"
import { SetDropProductsSchema } from "./admin/drops/[id]/products/validators"
import { CreateLeadSchema, UpdateLeadSchema } from "./admin/leads/validators"
import { StoreCreateLeadSchema } from "./store/leads/validators"
import { IdentifySchema } from "./store/drop/identify/validators"
import { StoreQuoteSchema } from "./store/shipping/quote/validators"
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
        rateLimit("leads", { windowMs: 600_000, max: 8, globalMax: 100 }),
        rateLimit("leads-email", { windowMs: 3_600_000, max: 3, by: bodyEmail }),
        validateAndTransformBody(StoreCreateLeadSchema),
      ],
    },
    {
      matcher: "/store/drop/identify",
      method: "POST",
      middlewares: [
        rateLimit("identify", { windowMs: 600_000, max: 10, globalMax: 300 }),
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
        rateLimit("reset", { windowMs: 600_000, max: 8, globalMax: 40 }),
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
      // Login do admin também fica na internet: sem teto, dá para tentar senhas à vontade.
      matcher: "/auth/user/emailpass",
      method: "POST",
      middlewares: [
        rateLimit("admin-login", { windowMs: 600_000, max: 10 }),
        rateLimit("admin-login-email", { windowMs: 600_000, max: 5, by: bodyEmail }),
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
      // Notificações do Mercado Pago: cada uma custa uma consulta à API deles; teto alto para não barrar o tráfego legítimo.
      matcher: "/hooks/payment/*",
      method: "POST",
      middlewares: [rateLimit("mp-hook", { windowMs: 60_000, max: 120, globalMax: 600 })],
    },
    {
      matcher: "/store/shipping/quote",
      method: "POST",
      middlewares: [rateLimit("quote", { windowMs: 600_000, max: 40, globalMax: 600 }), validateAndTransformBody(StoreQuoteSchema)],
    },
    {
      matcher: "/store/melhor-envio/callback",
      method: "POST",
      middlewares: [rateLimit("me-callback", { windowMs: 600_000, max: 20 })],
    },
    {
      // Conclusão do pedido: só a conta dona do carrinho (a rota confere o dono).
      matcher: "/store/checkout/complete",
      method: "POST",
      // Primeiro a conta (o limite é por cliente, não por IP: várias pessoas atrás do mesmo IP não disputam o mesmo balde).
      middlewares: [
        requiredCustomer,
        rateLimit("checkout-complete", { windowMs: 600_000, max: 300 }),
        rateLimit("checkout-complete-conta", { windowMs: 600_000, max: 20, perIp: false, by: (req) => (req as any).auth_context?.actor_id }),
      ],
    },
    {
      matcher: "/store/orders/:id/invoice",
      method: "GET",
      middlewares: [requiredCustomer, rateLimit("invoice", { windowMs: 600_000, max: 60, perIp: false, by: (req) => (req as any).auth_context?.actor_id })],
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
