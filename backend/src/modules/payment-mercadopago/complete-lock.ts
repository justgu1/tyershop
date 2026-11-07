/** Chave única da conclusão de um carrinho: rota do checkout e conciliação disputam a mesma trava. */
export const completeCartLockKey = (cartId: string) => `complete-cart:${cartId}`
