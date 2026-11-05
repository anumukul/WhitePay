import { revalidatePath } from "next/cache";
import { creditBalance, spendOneCredit } from "@/lib/db/entitlements";

async function spend() {
  "use server";
  spendOneCredit();
  revalidatePath("/credits");
}

export const dynamic = "force-dynamic";

export default function CreditsPage() {
  const balance = creditBalance();
  return (
    <main style={{ maxWidth: 420 }}>
      <h2>Credits</h2>
      <p style={{ fontSize: 32, margin: "16px 0" }}>{balance}</p>
      <form action={spend}>
        <button
          type="submit"
          disabled={balance <= 0}
          style={{
            padding: "10px 16px",
            background: balance > 0 ? "#111" : "#999",
            color: "#fff",
            border: 0,
            borderRadius: 6,
          }}
        >
          Spend 1 credit
        </button>
      </form>
    </main>
  );
}
