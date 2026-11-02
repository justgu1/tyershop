import { defineRouteConfig } from "@medusajs/admin-sdk"
import { useEffect, useState } from "react"
import { adminFetch, ui } from "../../lib/api"

type Status = {
  connected: boolean
  expires_at: string | null
  configured: boolean
  environment: "sandbox" | "production"
  authorize_url: string | null
}

const MelhorEnvioPage = () => {
  const [status, setStatus] = useState<Status | null>(null)
  const [error, setError] = useState("")

  useEffect(() => {
    adminFetch<Status>("/admin/melhor-envio")
      .then(setStatus)
      .catch(() => setError("Não foi possível carregar o estado da conexão."))
  }, [])

  return (
    <div className="p-6" style={{ maxWidth: 640 }}>
      <h1 className="text-xl font-semibold mb-4">Melhor Envio</h1>
      {error && <p style={{ color: "#c0392b" }}>{error}</p>}
      {status && (
        <div className="flex flex-col gap-3">
          <p>
            Ambiente: <strong>{status.environment === "sandbox" ? "Sandbox (testes)" : "Produção"}</strong>
          </p>
          <p>
            Conexão:{" "}
            <strong>
              {status.connected
                ? `conectado (token válido até ${new Date(status.expires_at as string).toLocaleDateString("pt-BR")}, renova sozinho)`
                : "não conectado"}
            </strong>
          </p>
          {!status.configured && (
            <p style={{ color: "#c0392b" }}>
              Faltam as variáveis MELHOR_ENVIO_CLIENT_ID, MELHOR_ENVIO_CLIENT_SECRET e MELHOR_ENVIO_REDIRECT_URI no servidor.
            </p>
          )}
          {status.authorize_url && (
            <a href={status.authorize_url} target="_blank" rel="noreferrer" style={{ ...ui.button, display: "inline-block", textDecoration: "none", width: "fit-content" }}>
              {status.connected ? "Reconectar" : "Conectar ao Melhor Envio"}
            </a>
          )}
        </div>
      )}
    </div>
  )
}

export const config = defineRouteConfig({ label: "Melhor Envio" })

export default MelhorEnvioPage
