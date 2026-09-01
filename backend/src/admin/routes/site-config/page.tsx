import { defineRouteConfig } from "@medusajs/admin-sdk";
import { useEffect, useState } from "react";

type SiteConfig = {
  popup: {
    enabled: boolean;
    kicker: string;
    title: string;
    text: string;
    cta: string;
  };
  countdown: {
    enabled: boolean;
    label: string;
    targetIso: string;
    presaveEnabled: boolean;
    presaveCta: string;
  };
};

const EMPTY: SiteConfig = {
  popup: { enabled: true, kicker: "", title: "", text: "", cta: "" },
  countdown: { enabled: false, label: "", targetIso: "", presaveEnabled: false, presaveCta: "" },
};

function toLocalInputValue(iso: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

const SiteConfigPage = () => {
  const [config, setConfig] = useState<SiteConfig>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [error, setError] = useState("");

  function goToLogin() {
    window.location.href = "/app/login";
  }

  useEffect(() => {
    fetch("/admin/site-config", { credentials: "include" })
      .then((r) => {
        if (r.status === 401 || r.status === 403) {
          goToLogin();
          return null;
        }
        if (!r.ok) throw new Error("fail");
        return r.json();
      })
      .then((d) => {
        if (d) setConfig({ ...EMPTY, ...d.site_config });
      })
      .catch(() => setError("Não consegui carregar a configuração agora. Tente recarregar a página."))
      .finally(() => setLoading(false));
  }, []);

  async function save() {
    setSaving(true);
    setError("");
    try {
      const res = await fetch("/admin/site-config", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(config),
      });
      if (res.status === 401 || res.status === 403) {
        goToLogin();
        return;
      }
      if (!res.ok) throw new Error("fail");
      const d = await res.json();
      setConfig({ ...EMPTY, ...d.site_config });
      setSavedAt(Date.now());
    } catch {
      setError("Não consegui salvar agora. Tente de novo.");
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <div style={{ padding: 24 }}>Carregando...</div>;

  const inputStyle: any = {
    width: "100%",
    padding: "8px 10px",
    borderRadius: 6,
    border: "1px solid #d1d5db",
    fontSize: 14,
    marginTop: 4,
    marginBottom: 14,
    boxSizing: "border-box",
  };
  const labelStyle: any = { fontSize: 13, fontWeight: 600, color: "#374151" };
  const sectionStyle: any = {
    background: "#fff",
    border: "1px solid #e5e7eb",
    borderRadius: 10,
    padding: 20,
    marginBottom: 20,
  };

  return (
    <div style={{ padding: 24, maxWidth: 640 }}>
      <h1 style={{ fontSize: 20, fontWeight: 700, marginBottom: 4 }}>Configurações do site</h1>
      <p style={{ fontSize: 13, color: "#6b7280", marginBottom: 20 }}>
        Popup de notificação e contador do hero — o storefront lê isso direto (sem deploy).
      </p>

      <div style={sectionStyle}>
        <h2 style={{ fontSize: 15, fontWeight: 700, marginBottom: 12 }}>Popup de notificação</h2>
        <label style={labelStyle}>
          <input
            type="checkbox"
            checked={config.popup.enabled}
            onChange={(e) => setConfig({ ...config, popup: { ...config.popup, enabled: e.target.checked } })}
          />{" "}
          Ativo
        </label>
        <div style={{ marginTop: 12 }}>
          <label style={labelStyle}>Selo (kicker)</label>
          <input
            style={inputStyle}
            value={config.popup.kicker}
            onChange={(e) => setConfig({ ...config, popup: { ...config.popup, kicker: e.target.value } })}
          />
          <label style={labelStyle}>Título</label>
          <input
            style={inputStyle}
            value={config.popup.title}
            onChange={(e) => setConfig({ ...config, popup: { ...config.popup, title: e.target.value } })}
          />
          <label style={labelStyle}>Texto</label>
          <textarea
            style={{ ...inputStyle, minHeight: 70 }}
            value={config.popup.text}
            onChange={(e) => setConfig({ ...config, popup: { ...config.popup, text: e.target.value } })}
          />
          <label style={labelStyle}>Texto do botão</label>
          <input
            style={inputStyle}
            value={config.popup.cta}
            onChange={(e) => setConfig({ ...config, popup: { ...config.popup, cta: e.target.value } })}
          />
        </div>
      </div>

      <div style={sectionStyle}>
        <h2 style={{ fontSize: 15, fontWeight: 700, marginBottom: 12 }}>Contador do hero (drop)</h2>
        <label style={labelStyle}>
          <input
            type="checkbox"
            checked={config.countdown.enabled}
            onChange={(e) =>
              setConfig({ ...config, countdown: { ...config.countdown, enabled: e.target.checked } })
            }
          />{" "}
          Ativo
        </label>
        <div style={{ marginTop: 12 }}>
          <label style={labelStyle}>Texto acima do contador</label>
          <input
            style={inputStyle}
            value={config.countdown.label}
            onChange={(e) => setConfig({ ...config, countdown: { ...config.countdown, label: e.target.value } })}
          />
          <label style={labelStyle}>Data/hora alvo</label>
          <input
            style={inputStyle}
            type="datetime-local"
            value={toLocalInputValue(config.countdown.targetIso)}
            onChange={(e) => {
              const v = e.target.value;
              const iso = v ? new Date(v).toISOString() : "";
              setConfig({ ...config, countdown: { ...config.countdown, targetIso: iso } });
            }}
          />
          <label style={labelStyle}>
            <input
              type="checkbox"
              checked={config.countdown.presaveEnabled}
              onChange={(e) =>
                setConfig({
                  ...config,
                  countdown: { ...config.countdown, presaveEnabled: e.target.checked },
                })
              }
            />{" "}
            Mostrar botão de pre-save
          </label>
          <div style={{ marginTop: 8 }}>
            <label style={labelStyle}>Texto do botão de pre-save</label>
            <input
              style={inputStyle}
              value={config.countdown.presaveCta}
              onChange={(e) =>
                setConfig({ ...config, countdown: { ...config.countdown, presaveCta: e.target.value } })
              }
            />
          </div>
        </div>
      </div>

      {error && <p style={{ color: "#dc2626", fontSize: 13, marginBottom: 12 }}>{error}</p>}

      <button
        onClick={save}
        disabled={saving}
        style={{
          background: "#e77e23",
          color: "#fff",
          border: "none",
          borderRadius: 8,
          padding: "10px 20px",
          fontSize: 14,
          fontWeight: 700,
          cursor: saving ? "not-allowed" : "pointer",
          opacity: saving ? 0.6 : 1,
        }}
      >
        {saving ? "Salvando..." : "Salvar"}
      </button>
      {savedAt && !saving && (
        <span style={{ marginLeft: 12, fontSize: 13, color: "#16a34a" }}>Salvo!</span>
      )}
    </div>
  );
};

export const config = defineRouteConfig({
  label: "Site (popup/contador)",
});

export default SiteConfigPage;
