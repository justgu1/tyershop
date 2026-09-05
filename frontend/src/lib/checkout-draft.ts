/**
 * Rascunho não-sensível do formulário de checkout (nunca a senha) —
 * salvo em localStorage pra sobreviver a uma ida no fluxo de "esqueci
 * minha senha" (o link do e-mail pode abrir noutra aba) e voltar pro
 * checkout já preenchido, sem ter que digitar tudo de novo.
 */
export interface CheckoutDraft {
  email: string;
  first_name: string;
  last_name: string;
  cpf: string;
  phone: string;
  zip_code: string;
  street_name: string;
  street_number: string;
  neighborhood: string;
  city: string;
  federal_unit: string;
}

const KEY = 'tyer_checkout_draft';

export function saveCheckoutDraft(d: CheckoutDraft) {
  try {
    localStorage.setItem(KEY, JSON.stringify(d));
  } catch {
    /* storage indisponível: só não pré-preenche depois */
  }
}

export function loadCheckoutDraft(): CheckoutDraft | null {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as CheckoutDraft) : null;
  } catch {
    return null;
  }
}

export function hasCheckoutDraft(): boolean {
  try {
    return !!localStorage.getItem(KEY);
  } catch {
    return false;
  }
}

export function clearCheckoutDraft() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* ignora */
  }
}
