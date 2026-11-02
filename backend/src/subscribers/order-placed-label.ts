import type { SubscriberArgs, SubscriberConfig } from "@medusajs/framework"
import { autoLabelEnabled, BusyError, purchaseLabel } from "../modules/melhor-envio/purchase"

/** Etiqueta automática (desligada por padrão). Separada da confirmação: um erro aqui não repete nem impede o e-mail. */
export default async function orderPlacedLabelHandler({ event: { data }, container }: SubscriberArgs<{ id: string }>) {
  if (!autoLabelEnabled()) return
  await purchaseLabel(container, data.id).catch((err) => {
    if (!(err instanceof BusyError)) container.resolve("logger").error(`[melhor-envio] ${err.message}`)
  })
}

export const config: SubscriberConfig = { event: "order.placed" }
