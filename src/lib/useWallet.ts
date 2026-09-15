import { useCallback, useEffect, useState } from "react";
import { supabase } from "./supabase";

async function readBalance(): Promise<number | null> {
  // RLS limits the `wallets` table to the caller's own row, which is why no
  // user_id filter is needed here.
  const { data, error } = await supabase.from("wallets").select("balance_usd").maybeSingle();
  if (error) {
    console.error("useWallet: could not load balance", error);
    return null;
  }
  // No row yet just means this account has never topped up — that's $0, not
  // an error state.
  return data ? Number(data.balance_usd) : 0;
}

// The balance is shown in several places at once now (the header chip, the
// balance card, the billing section), so the read lives in one hook instead
// of each component rolling its own query.
export function useWallet() {
  const [balance, setBalance] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    void (async () => {
      const value = await readBalance();
      if (!active) return;
      setBalance(value);
      setLoading(false);
    })();
    return () => {
      active = false;
    };
  }, []);

  const refresh = useCallback(async () => {
    const value = await readBalance();
    setBalance(value);
    setLoading(false);
  }, []);

  return { balance, loading, refresh };
}
