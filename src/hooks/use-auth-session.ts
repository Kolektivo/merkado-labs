"use client";

import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

import { createClient } from "@/lib/supabase/browser-client";

export function useAuthSession(initialAuthenticated: boolean): boolean {
  const pathname = usePathname();
  const [isAuthenticated, setIsAuthenticated] = useState(initialAuthenticated);

  if (initialAuthenticated && !isAuthenticated) {
    setIsAuthenticated(true);
  }

  useEffect(() => {
    const supabase = createClient();
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_OUT") {
        setIsAuthenticated(false);
        return;
      }

      if (event === "INITIAL_SESSION") {
        if (session?.user) {
          setIsAuthenticated(true);
        }
        return;
      }

      setIsAuthenticated(Boolean(session?.user));
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    const supabase = createClient();

    void supabase.auth.getSession().then(({ data: { session } }) => {
      if (cancelled) {
        return;
      }

      if (session?.user) {
        setIsAuthenticated(true);
        return;
      }

      if (!initialAuthenticated) {
        setIsAuthenticated(false);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [pathname, initialAuthenticated]);

  return isAuthenticated;
}