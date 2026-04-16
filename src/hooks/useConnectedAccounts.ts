/**
 * Shared cache for connected social accounts.
 * Avoids N redundant connect-social calls when N ActionCards mount simultaneously.
 */
import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { ConnectedAccount } from "@/components/profile/SocialConnections";

// Module-level singleton cache
let cachedAccounts: ConnectedAccount[] | null = null;
let fetchPromise: Promise<ConnectedAccount[]> | null = null;
let lastFetchTime = 0;
const CACHE_TTL = 60_000; // 1 minute

async function fetchAccounts(): Promise<ConnectedAccount[]> {
  try {
    const { data } = await supabase.functions.invoke("connect-social", {
      body: { action: "list" },
    });
    const list = data?.connections || data?.accounts || [];
    const connected = Array.isArray(list)
      ? list.filter((a: any) => a.connected || a.status === "connected")
      : [];
    return connected.map((a: any) => ({
      platform: a.platform,
      connected: true,
      account_name: a.account_name || a.username || null,
      pfm_account_id: a.pfm_account_id || a.id || null,
    }));
  } catch {
    return [];
  }
}

function getAccounts(): Promise<ConnectedAccount[]> {
  const now = Date.now();
  if (cachedAccounts && now - lastFetchTime < CACHE_TTL) {
    return Promise.resolve(cachedAccounts);
  }
  if (!fetchPromise) {
    fetchPromise = fetchAccounts().then((accounts) => {
      cachedAccounts = accounts;
      lastFetchTime = Date.now();
      fetchPromise = null;
      return accounts;
    });
  }
  return fetchPromise;
}

export function invalidateConnectedAccounts() {
  cachedAccounts = null;
  lastFetchTime = 0;
}

export function useConnectedAccounts(skip = false) {
  const [accounts, setAccounts] = useState<ConnectedAccount[]>(cachedAccounts || []);
  const [loading, setLoading] = useState(!cachedAccounts);

  useEffect(() => {
    if (skip) return;
    let cancelled = false;
    getAccounts().then((result) => {
      if (!cancelled) {
        setAccounts(result);
        setLoading(false);
      }
    });
    return () => { cancelled = true; };
  }, [skip]);

  return { accounts, loading };
}
