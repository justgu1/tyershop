import { ExecArgs } from "@medusajs/framework/types";
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils";
import { capturePaymentWorkflow } from "@medusajs/medusa/core-flows";

// Os pedidos da Nuvemshop entraram como "não pago / não atendido". Esta rotina leva cada um ao estado que tinha lá:
//  - pagamento Confirmado (ou parcialmente estornado) -> pago; Recusado -> cancelado;
//  - envio Enviado -> enviado; Entregue -> entregue; "Não está embalado" -> segue sem envio.
// O status do admin sai de payment_collections (pago) e de fulfillments com packed/shipped/delivered_at (atendimento).
// Idempotente (marca metadata.status_importado; REVER=1 reprocessa os já marcados, sem duplicar pagamento nem envio). Rode antes com LIMITE=5 e confira no admin: LIMITE=5 medusa exec ./src/scripts/ajustar-pedidos-importados.ts
export type Alvo = { pago: boolean; cancelado: boolean; enviado: boolean; entregue: boolean };

export function alvoDoPedido(pagamento?: string | null, envio?: string | null): Alvo {
  const pag = String(pagamento ?? "").toLowerCase();
  const env = String(envio ?? "").toLowerCase();
  const cancelado = pag === "recusado" || pag === "cancelado";
  const pago = !cancelado && (pag === "confirmado" || pag.includes("estornado"));
  const entregue = pago && env === "entregue";
  const enviado = pago && (entregue || env === "enviado");
  return { pago, cancelado, enviado, entregue };
}

export default async function ajustarPedidosImportados({ container }: ExecArgs) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER);
  const query = container.resolve(ContainerRegistrationKeys.QUERY);
  const orderModule = container.resolve(Modules.ORDER) as any;
  const paymentModule = container.resolve(Modules.PAYMENT) as any;
  const link = container.resolve(ContainerRegistrationKeys.LINK);
  const fulfillmentModule = container.resolve(Modules.FULFILLMENT) as any;
  const { data: locations } = await query.graph({ entity: "stock_location", fields: ["id"], pagination: { take: 1 } });
  const locationId = (locations as any[])[0]?.id as string | undefined;
  const limite = Number(process.env.LIMITE) || Infinity;

  const { data } = await query.graph({
    entity: "order",
    fields: ["id", "display_id", "status", "currency_code", "created_at", "metadata", "payment_collections.id", "fulfillments.id"],
    pagination: { take: 5000 },
  });
  const pedidos = (data as any[]).filter((o) => o.metadata?.nuvemshop_order_number != null && (!o.metadata?.status_importado || process.env.REVER === "1")).slice(0, limite);
  logger.info(`${pedidos.length} pedido(s) importado(s) para ajustar`);

  const cont = { pago: 0, cancelado: 0, enviado: 0, entregue: 0, falhas: 0 };
  for (const o of pedidos) {
    const alvo = alvoDoPedido(o.metadata.nuvemshop_payment_status, o.metadata.nuvemshop_shipping_status);
    try {
      // O total vem do módulo de pedidos (o grafo devolve totais zerados nos pedidos importados).
      const detail = await orderModule.retrieveOrder(o.id, { select: ["id", "total"], relations: ["items", "shipping_address"] });
      const total = Number(detail.total ?? 0);
      const items = (detail.items ?? []).map((i: any) => ({ id: i.id, quantity: Number(i.quantity) })).filter((i: any) => i.quantity > 0);

      if (alvo.pago && !o.payment_collections?.length && total > 0) {
        const collection = await paymentModule.createPaymentCollections({ currency_code: o.currency_code, amount: total });
        const session = await paymentModule.createPaymentSession(collection.id, {
          provider_id: "pp_system_default",
          currency_code: o.currency_code,
          amount: total,
          data: {},
        });
        const payment = await paymentModule.authorizePaymentSession(session.id, {});
        await link.create({ [Modules.ORDER]: { order_id: o.id }, [Modules.PAYMENT]: { payment_collection_id: collection.id } });
        const { errors } = await capturePaymentWorkflow(container).run({ input: { payment_id: payment.id, amount: total }, throwOnError: false });
        if (errors?.length) throw new Error(`captura: ${errors[0].error?.message}`);
        cont.pago++;
      }
      if (alvo.enviado && items.length && !o.fulfillments?.length && locationId) {
        const a = detail.shipping_address ?? {};
        const quando = new Date(o.created_at);
        const envio = await fulfillmentModule.createFulfillment({
          location_id: locationId,
          provider_id: "manual_manual",
          delivery_address: { address_1: a.address_1 ?? "", address_2: a.address_2 ?? "", city: a.city ?? "", province: a.province ?? "", postal_code: a.postal_code ?? "", country_code: "br" },
          items: (detail.items ?? []).map((i: any) => ({ title: i.title ?? "Item", sku: i.variant_sku ?? "", quantity: Number(i.quantity), barcode: "" })),
          labels: [],
          order: { id: o.id },
        });
        await link.create({ [Modules.ORDER]: { order_id: o.id }, [Modules.FULFILLMENT]: { fulfillment_id: envio.id } });
        await fulfillmentModule.updateFulfillment(envio.id, { packed_at: quando, shipped_at: quando, delivered_at: alvo.entregue ? quando : null });
      }
      if (alvo.enviado && items.length && !o.metadata?.status_importado) {
        const ref = { order_id: o.id, items, reference: "fulfillment", reference_id: `nuvemshop-${o.metadata.nuvemshop_order_number}` };
        await orderModule.registerFulfillment(ref);
        await orderModule.registerShipment(ref);
        cont.enviado++;
        if (alvo.entregue) {
          await orderModule.registerDelivery(ref);
          cont.entregue++;
        }
      }
      if (alvo.cancelado) {
        await orderModule.updateOrders([{ id: o.id, status: "canceled", canceled_at: new Date() }]);
        cont.cancelado++;
      }
      await orderModule.updateOrders([{ id: o.id, metadata: { ...o.metadata, status_importado: true } }]);
    } catch (err) {
      cont.falhas++;
      logger.warn(`pedido #${o.display_id}: ${(err as Error).message}`);
    }
  }
  logger.info(`ajustados: ${JSON.stringify(cont)}`);
}
