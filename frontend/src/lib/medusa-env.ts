/** URL base do Store API Medusa (build e runtime devem usar a mesma origem para paths estáticos baterem com o fetch). */
export function getMedusaStoreUrl(): string {
  return (
    import.meta.env.MEDUSA_INTERNAL_URL ||
    import.meta.env.MEDUSA_URL ||
    import.meta.env.PUBLIC_MEDUSA_URL ||
    'http://localhost:9003'
  );
}
