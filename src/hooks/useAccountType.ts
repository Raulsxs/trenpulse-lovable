import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

export type AccountType = 'white_glove' | 'self_serve';

type State = {
  accountType: AccountType | null;
  loading: boolean;
  isAuthenticated: boolean;
};

// Reads account_type from JWT (app_metadata) populated by the public.sync_account_type_to_jwt trigger.
// Default 'white_glove' when missing — preserva UI atual em qualquer ambiguidade.
export function useAccountType(): State {
  const [state, setState] = useState<State>({
    accountType: null,
    loading: true,
    isAuthenticated: false,
  });

  useEffect(() => {
    let mounted = true;

    const resolve = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!mounted) return;

      if (!session?.user) {
        setState({ accountType: null, loading: false, isAuthenticated: false });
        return;
      }

      const fromJwt = session.user.app_metadata?.account_type as AccountType | undefined;
      setState({
        accountType: fromJwt ?? 'white_glove',
        loading: false,
        isAuthenticated: true,
      });
    };

    resolve();

    const { data: sub } = supabase.auth.onAuthStateChange(() => {
      resolve();
    });

    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  return state;
}
