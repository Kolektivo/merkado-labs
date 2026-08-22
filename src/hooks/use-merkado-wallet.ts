"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { EIP1193Provider } from "viem";

declare global {
  interface Window {
    ethereum?: EIP1193Provider;
  }
}

export type MerkadoWallet = {
  /** The injected EIP-1193 provider (window.ethereum), null on the server or when no wallet is installed. */
  provider: EIP1193Provider | null;
  /** Connected account, or null when disconnected. */
  address: `0x${string}` | null;
  /** Active chain id as reported by the wallet, or null when disconnected. */
  chainId: number | null;
  isConnected: boolean;
  connecting: boolean;
  connect: () => Promise<void>;
  disconnect: () => void;
};

const NO_WALLET_MESSAGE =
  "No injected wallet was found. Install a browser wallet (such as MetaMask or Rabby) and try again.";

function parseHexChainId(value: unknown): number | null {
  if (typeof value !== "string") return null;
  if (!/^0x[0-9a-f]+$/i.test(value)) return null;
  const parsed = Number.parseInt(value, 16);
  return Number.isSafeInteger(parsed) ? parsed : null;
}

function getUserSafeError(error: unknown): Error {
  if (error && typeof error === "object") {
    const code = (error as { code?: unknown }).code;
    if (code === 4001) {
      return new Error("Connection was rejected in your wallet.");
    }
  }
  if (error instanceof Error) return error;
  return new Error("The wallet could not be connected. Try again.");
}

export function useMerkadoWallet(): MerkadoWallet {
  const [provider, setProvider] = useState<EIP1193Provider | null>(() => {
    if (typeof window === "undefined") return null;
    return window.ethereum ?? null;
  });
  const [address, setAddress] = useState<`0x${string}` | null>(null);
  const [chainId, setChainId] = useState<number | null>(null);
  const [connecting, setConnecting] = useState(false);
  const providerRef = useRef<EIP1193Provider | null>(null);

  const applyAccount = useCallback((accounts: unknown) => {
    const first = Array.isArray(accounts) ? (accounts[0] as string | undefined) : undefined;
    setAddress(first ? (first as `0x${string}`) : null);
  }, []);

  const syncChainId = useCallback(async (target: EIP1193Provider) => {
    try {
      const value = await target.request({ method: "eth_chainId" });
      setChainId(parseHexChainId(value));
    } catch {
      setChainId(null);
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const ethereum = window.ethereum;
    if (!ethereum) return;

    providerRef.current = ethereum;

    const handleAccountsChanged = (accounts: string[]) => {
      applyAccount(accounts);
    };
    const handleChainChanged = (hexChainId: string) => {
      setChainId(parseHexChainId(hexChainId));
    };
    const handleDisconnect = () => {
      setAddress(null);
      setChainId(null);
    };

    ethereum.on("accountsChanged", handleAccountsChanged);
    ethereum.on("chainChanged", handleChainChanged);
    ethereum.on("disconnect", handleDisconnect);

    // Restore an already-connected session without prompting the user.
    ethereum
      .request({ method: "eth_accounts" })
      .then((accounts) => {
        applyAccount(accounts);
        return syncChainId(ethereum);
      })
      .catch(() => {
        setAddress(null);
        setChainId(null);
      });

    return () => {
      ethereum.removeListener("accountsChanged", handleAccountsChanged);
      ethereum.removeListener("chainChanged", handleChainChanged);
      ethereum.removeListener("disconnect", handleDisconnect);
      providerRef.current = null;
    };
  }, [applyAccount, syncChainId]);

  const connect = useCallback(async () => {
    if (typeof window === "undefined") {
      throw new Error(NO_WALLET_MESSAGE);
    }
    const ethereum = window.ethereum ?? providerRef.current;
    if (!ethereum) {
      throw new Error(NO_WALLET_MESSAGE);
    }
    if (connecting) return;
    setConnecting(true);
    try {
      const accounts = (await ethereum.request({
        method: "eth_requestAccounts",
      })) as string[];
      applyAccount(accounts);
      providerRef.current = ethereum;
      setProvider(ethereum);
      await syncChainId(ethereum);
    } catch (error) {
      throw getUserSafeError(error);
    } finally {
      setConnecting(false);
    }
  }, [applyAccount, connecting, syncChainId]);

  const disconnect = useCallback(() => {
    setAddress(null);
    setChainId(null);
  }, []);

  return {
    provider,
    address,
    chainId,
    isConnected: Boolean(provider && address),
    connecting,
    connect,
    disconnect,
  };
}