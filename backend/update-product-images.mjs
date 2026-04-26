/**
 * update-product-images.mjs
 *
 * Busca cada produto pelo handle no Medusa, monta a galeria de imagens
 * a partir do mapa de pastas do Minio e faz o PATCH via API Admin.
 *
 * Uso:
 *   node update-product-images.mjs
 *
 * Variáveis de ambiente (ou edite as constantes abaixo):
 *   MEDUSA_API_URL   — URL base do Medusa  (padrão: http://localhost:9000)
 *   MEDUSA_API_KEY   — API key do admin    (obrigatório)
 *   MINIO_URL        — URL base do Minio   (padrão: http://minio.local:9000/tyershop)
 */

const MEDUSA_API_URL = process.env.MEDUSA_API_URL ?? "http://localhost:9000";
const MEDUSA_API_KEY = process.env.MEDUSA_API_KEY ?? ""; // preencha ou passe via env
const MINIO_URL      = process.env.MINIO_URL      ?? "http://minio.local:9000/tyershop";

// ---------------------------------------------------------------------------
// MAPA: handle do produto → array de pastas do Minio (em ordem)
// Cada pasta vira uma sequência de imagens na galeria (1.webp, 2.webp, ...)
// Para produtos com cores, todas as pastas de cor entram juntas.
// ---------------------------------------------------------------------------
const PRODUCT_IMAGE_MAP = {
  // ── Tyer Pro ──────────────────────────────────────────────────────────────
  "shorts-tyer-pro": {
    folders: ["drops/tyer-pro/shorts"],
    imageCounts: [5],
  },

  // ── Tyer Starter ──────────────────────────────────────────────────────────
  "camiseta-tyer-starter-dry-fit": {
    folders: [
      "drops/tyer-starter/camiseta-branca",
      "drops/tyer-starter/camiseta-preta",
    ],
    imageCounts: [6, 6],
  },
  "shorts-tyer-starter-dry-fit": {
    folders: ["drops/tyer-starter/shorts"],
    imageCounts: [5],
  },

  // ── Tyer Tech ─────────────────────────────────────────────────────────────
  "tyertech": {
    folders: ["drops/tyer-tech/jaqueta"],
    imageCounts: [7],
  },

  // ── Tyer Pro shorts (alias) já coberto acima ──────────────────────────────

  // ── Exclusivos: Tyer Day ──────────────────────────────────────────────────
  "shorts-tyer-day-2k25-mbqip": {
    folders: ["drops/exclusivos/tyer-day/shorts"],
    imageCounts: [5],
  },

  // ── Exclusivos: Five Stars ────────────────────────────────────────────────
  "camiseta-tyer-five-stars": {
    folders: [
      "drops/exclusivos/tyer-five-stars/camiseta-amarela",
      "drops/exclusivos/tyer-five-stars/camiseta-preta",
    ],
    imageCounts: [7, 8],
  },
  "shorts-tyer-five-stars": {
    folders: [
      "drops/exclusivos/tyer-five-stars/shorts-amarelo",
      "drops/exclusivos/tyer-five-stars/shorts-preto",
    ],
    imageCounts: [11, 7],
  },

  // ── Exclusivos: In Paris ──────────────────────────────────────────────────
  "camiseta-tyer-in-paris-boxy": {
    folders: ["drops/exclusivos/tyer-in-paris/camiseta"],
    imageCounts: [6],
  },
  "shorts-tyer-in-paris": {
    folders: ["drops/exclusivos/tyer-in-paris/shorts"],
    imageCounts: [5],
  },

  // ── Exclusivos: MVP ───────────────────────────────────────────────────────
  "mvp1": {
    folders: ["drops/exclusivos/tyer-mvp/camiseta"],
    imageCounts: [5],
  },

  // ── Exclusivos: Red Rose ──────────────────────────────────────────────────
  "camiseta-tyer-red-rose": {
    folders: [
      "drops/exclusivos/tyer-red-rose/camiseta-vermelha",
      "drops/exclusivos/tyer-red-rose/camiseta-preta",
    ],
    imageCounts: [8, 7],
  },
  "shorts-tyer-red-rose-dry-fit": {
    folders: ["drops/exclusivos/tyer-red-rose/shorts"],
    imageCounts: [5],
  },

  // ── Exclusivos: Savage Mode ───────────────────────────────────────────────
  "tyer-savage-mode-1-dry-fit": {
    folders: ["drops/exclusivos/tyer-savage-mode/mode-1"],
    imageCounts: [7],
  },
  "tyer-savage-mode-2-dry-fit": {
    folders: ["drops/exclusivos/tyer-savage-mode/mode-2"],
    imageCounts: [3],
  },
  "regata-savage-mode": {
    folders: [
      "drops/exclusivos/tyer-savage-mode/regata-preta",
      "drops/exclusivos/tyer-savage-mode/regata-branca",
    ],
    imageCounts: [8, 7],
  },

  // ── Acessórios ────────────────────────────────────────────────────────────
  "chaveiro-tyer-five-stars-only": {
    folders: ["drops/accessorios/chaveiros"],
    imageCounts: [4],
  },
  "chaveiro-tyer-logo": {
    folders: ["drops/accessorios/chaveiros"],
    imageCounts: [4],
  },
  "chaveiro-tyer-boy": {
    folders: ["drops/accessorios/chaveiros"],
    imageCounts: [4],
  },
  "pulseira-tyer": {
    folders: [
      "drops/accessorios/pulseira-branca",
      "drops/accessorios/pulseira-preta",
    ],
    imageCounts: [4, 4],
  },

  // ── Kit / Bundle ──────────────────────────────────────────────────────────
  "treino-de-ferias-3-0-summer-edition": {
    folders: [
      "drops/exclusivos/tyer-five-stars/camiseta-amarela",
      "drops/exclusivos/tyer-five-stars/shorts-amarelo",
    ],
    imageCounts: [7, 11],
  },
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Monta a lista de URLs de imagem para um produto */
function buildImageUrls({ folders, imageCounts }) {
  const urls = [];
  folders.forEach((folder, i) => {
    const count = imageCounts[i] ?? 0;
    for (let n = 1; n <= count; n++) {
      urls.push(`${MINIO_URL}/${folder}/${n}.webp`);
    }
  });
  return urls;
}

/** Busca o produto pelo handle — retorna { id, title } ou null */
async function getProductByHandle(handle) {
  const res = await fetch(
    `${MEDUSA_API_URL}/admin/products?handle=${handle}&fields=id,title,handle`,
    {
      headers: {
        "x-medusa-access-token": MEDUSA_API_KEY,
        "Content-Type": "application/json",
      },
    }
  );

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`GET /admin/products?handle=${handle} → ${res.status}: ${text}`);
  }

  const data = await res.json();
  const product = data.products?.find((p) => p.handle === handle);
  return product ?? null;
}

/** Atualiza as imagens do produto via PATCH */
async function updateProductImages(productId, imageUrls) {
  const body = {
    images: imageUrls.map((url) => ({ url })),
  };

  const res = await fetch(`${MEDUSA_API_URL}/admin/products/${productId}`, {
    method: "POST", // Medusa v2 usa POST para update
    headers: {
      "x-medusa-access-token": MEDUSA_API_KEY,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`POST /admin/products/${productId} → ${res.status}: ${text}`);
  }

  return res.json();
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  if (!MEDUSA_API_KEY) {
    console.error("❌  MEDUSA_API_KEY não definida. Exporte a variável ou edite o script.");
    process.exit(1);
  }

  const handles = Object.keys(PRODUCT_IMAGE_MAP);
  console.log(`\n🚀  Atualizando imagens de ${handles.length} produtos...\n`);

  const results = { ok: [], notFound: [], error: [] };

  for (const handle of handles) {
    const config = PRODUCT_IMAGE_MAP[handle];
    const imageUrls = buildImageUrls(config);

    process.stdout.write(`  [${handle}] ${imageUrls.length} imagens → `);

    try {
      const product = await getProductByHandle(handle);

      if (!product) {
        console.log("⚠️  produto não encontrado (ainda não importado?)");
        results.notFound.push(handle);
        continue;
      }

      await updateProductImages(product.id, imageUrls);
      console.log(`✅  OK (id: ${product.id})`);
      results.ok.push(handle);
    } catch (err) {
      console.log(`❌  ERRO: ${err.message}`);
      results.error.push({ handle, error: err.message });
    }

    // Pequeno delay para não sobrecarregar a API
    await new Promise((r) => setTimeout(r, 150));
  }

  // Sumário
  console.log("\n─────────────────────────────────────────");
  console.log(`✅  Sucesso:       ${results.ok.length}`);
  console.log(`⚠️   Não encontrado: ${results.notFound.length}`);
  console.log(`❌  Erros:         ${results.error.length}`);
  if (results.notFound.length)
    console.log("   Não encontrados:", results.notFound.join(", "));
  if (results.error.length)
    results.error.forEach(({ handle, error }) =>
      console.log(`   ${handle}: ${error}`)
    );
  console.log("─────────────────────────────────────────\n");
}

main();
