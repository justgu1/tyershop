import type { AuthenticatedMedusaRequest, MedusaNextFunction, MedusaResponse } from "@medusajs/framework/http"
import { blockedProductIds } from "../modules/drop/access"

/**
 * Produtos de drop fora de venda (ou em pré-venda sem ingresso) não saem da API pública:
 * esconder só na tela deixaria lista, preço e fotos a uma chamada de distância.
 */
export async function hideBlockedProducts(req: AuthenticatedMedusaRequest, res: MedusaResponse, next: MedusaNextFunction) {
  let blocked: Set<string>
  try {
    blocked = await blockedProductIds(req.scope, req.auth_context?.actor_id)
  } catch {
    return next()
  }
  if (!blocked.size) return next()

  const send = res.json.bind(res)
  res.json = ((body: any) => {
    if (Array.isArray(body?.products)) {
      const products = body.products.filter((p: any) => !blocked.has(p.id))
      const removed = body.products.length - products.length
      return send({ ...body, products, ...(typeof body.count === "number" ? { count: Math.max(0, body.count - removed) } : {}) })
    }
    const single = body?.product ?? body?.variant?.product
    const productId = body?.product?.id ?? body?.variant?.product_id ?? single?.id
    if (productId && blocked.has(productId)) {
      res.status(404)
      return send({ type: "not_found", message: "Produto não encontrado." })
    }
    return send(body)
  }) as typeof res.json
  next()
}
