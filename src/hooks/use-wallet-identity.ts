"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Hex } from "viem";

import { useMerkadoWallet } from "@/hooks/use-merkado-wallet";
import { ensureBaseSepolia } from "@/lib/pay/wallet-adapter";
import {
  getWalletSessionAction,
  requestWalletChallengeAction,
  signOutWalletAction,
  verifyWalletChallengeAction,
} from "@/lib/wallet/actions";
import type { WalletIdentity } from "@/lib/wallet/identity";

type IdentityState = {
  identity: WalletIdentity | null;
  loading: boolean;
  signing: boolean;
  error: string | null;
};

function isUnsupportedMethod(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const value = error as { code?: unknown; message?: unknown };
  return value.code === -32601 || (typeof value.message === "string" && /method not found|unsupported/i.test(value.message));
}

async function signChallenge(
  provider: NonNullable<ReturnType<typeof useMerkadoWallet>["provider"]>,
  address: `0x${string}`,
  message: string,
): Promise<Hex> {
  const request = provider.request as unknown as (args: {
    method: string;
    params?: unknown[];
  }) => Promise<unknown>;
  try {
    return (await request({ method: "personal_sign", params: [message, address] })) as Hex;
  } catch (error) {
    if (!isUnsupportedMethod(error)) throw error;
    return (await request({ method: "eth_sign", params: [address, message] })) as Hex;
  }
}

export function useWalletIdentity(): IdentityState & {
  wallet: ReturnType<typeof useMerkadoWallet>;
  signIn: () => Promise<void>;
  signOut: () => Promise<void>;
} {
  const wallet = useMerkadoWallet();
  const [state, setState] = useState<IdentityState>({ identity: null, loading: true, signing: false, error: null });
  const invalidating = useRef(false);
  const hasObservedWallet = useRef(false);

  useEffect(() => {
    let active = true;
    void getWalletSessionAction().then((result) => {
      if (!active) return;
      setState((current) => ({ ...current, identity: result.ok ? result.data : null, loading: false, error: result.ok ? null : result.error }));
    });
    return () => {
      active = false;
    };
  }, []);

  const signOut = useCallback(async () => {
    await signOutWalletAction();
    setState({ identity: null, loading: false, signing: false, error: null });
  }, []);

  useEffect(() => {
    const identity = state.identity;
    if (!identity || invalidating.current) return;
    if (wallet.isConnected) hasObservedWallet.current = true;
    if (!hasObservedWallet.current) return;
    const changed = !wallet.isConnected || wallet.address?.toLowerCase() !== identity.address.toLowerCase() || wallet.chainId !== identity.chainId;
    if (!changed) return;
    invalidating.current = true;
    void signOut().finally(() => {
      invalidating.current = false;
    });
  }, [state.identity, wallet.isConnected, wallet.address, wallet.chainId, signOut]);

  const signIn = useCallback(async () => {
    setState((current) => ({ ...current, signing: true, error: null }));
    try {
      if (!wallet.isConnected) {
        await wallet.connect();
        setState((current) => ({ ...current, signing: false }));
        return;
      }
      if (!wallet.address || !wallet.provider) throw new Error("Connect a wallet first, then try again.");
      await ensureBaseSepolia(wallet, true);
      const challenge = await requestWalletChallengeAction(wallet.address);
      if (!challenge.ok) throw new Error(challenge.error);
      const signature = await signChallenge(wallet.provider, wallet.address, challenge.data.message);
      const verified = await verifyWalletChallengeAction({ address: wallet.address, nonce: challenge.data.nonce, signature });
      if (!verified.ok) throw new Error(verified.error);
      setState({ identity: verified.data, loading: false, signing: false, error: null });
    } catch (error) {
      setState((current) => ({ ...current, signing: false, error: error instanceof Error ? error.message : "Wallet identity could not be completed." }));
    }
  }, [wallet]);

  return { ...state, wallet, signIn, signOut };
}
