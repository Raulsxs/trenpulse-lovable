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

/**
 * Devolve as contas E se a consulta FALHOU. A distinção importa: "você não tem contas" e "não
 * consegui verificar agora" levam a UIs opostas — a primeira manda conectar, a segunda manda esperar.
 * Antes, um soluço da API do PFM (que acontece: reproduzido em teste) virava lista vazia silenciosa,
 * e o usuário ia reconectar tudo à toa.
 */
async function fetchAccounts(): Promise<{ accounts: ConnectedAccount[]; failed: boolean }> {
  try {
    const { data, error } = await supabase.functions.invoke("connect-social", {
      body: { action: "list" },
    });
    // A edge function sinaliza indisponibilidade com error:"pfm_unavailable" (e não com lista vazia).
    if (error || data?.error === "pfm_unavailable") return { accounts: [], failed: true };
    const list = data?.connections || data?.accounts || [];
    const connected = Array.isArray(list)
      ? list.filter((a: any) => a.connected || a.status === "connected")
      : [];
    return {
      accounts: connected.map((a: any) => ({
        platform: a.platform,
        connected: true,
        account_name: a.account_name || a.username || null,
        pfm_account_id: a.pfm_account_id || a.id || null,
        expired: a.expired === true,
        expires_at: a.expires_at || null,
      })),
      failed: false,
    };
  } catch {
    return { accounts: [], failed: true };
  }
}

function getAccounts(): Promise<ConnectedAccount[]> {
  const now = Date.now();
  if (cachedAccounts && now - lastFetchTime < CACHE_TTL) {
    return Promise.resolve(cachedAccounts);
  }
  if (!fetchPromise) {
    fetchPromise = fetchAccounts().then(({ accounts, failed }) => {
      // NÃO cacheia resultado de falha: senão um soluço de rede congelava "nenhuma conta conectada"
      // por 1 minuto inteiro, mesmo depois da API já ter voltado. Em caso de falha, a próxima
      // montagem tenta de novo.
      if (!failed) {
        cachedAccounts = accounts;
        lastFetchTime = Date.now();
      }
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
