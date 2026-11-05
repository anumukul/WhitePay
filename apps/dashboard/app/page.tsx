import { redirect } from "next/navigation";
import { cookies } from "next/headers";

async function login(formData: FormData) {
  "use server";
  const key = String(formData.get("apiKey") ?? "").trim();
  if (!key.startsWith("wp_sk_")) throw new Error("API key must start with wp_sk_");
  const c = await cookies();
  c.set("dashboard_api_key", key, { httpOnly: true, sameSite: "lax", path: "/" });
  redirect("/payments");
}

export default function Home() {
  return (
    <main style={{ maxWidth: 520 }}>
      <form action={login}>
        <label style={{ display: "block", marginBottom: 8 }}>API key</label>
        <input
          name="apiKey"
          type="password"
          required
          placeholder="wp_sk_..."
          style={{ width: "100%", padding: 10, border: "1px solid #ccc", borderRadius: 6 }}
        />
        <button type="submit" style={{ marginTop: 12, padding: "10px 16px", background: "#111", color: "#fff", border: 0, borderRadius: 6 }}>
          Sign in
        </button>
      </form>
    </main>
  );
}
