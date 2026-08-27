"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  useAppKitAccount,
  useAppKitNetwork,
  useAppKitProvider,
  useDisconnect,
} from "@reown/appkit/react";
import type { EIP1193Provider } from "viem";

import { isReownConfigured, openReownModal } from "@/lib/pay/reown-config";

export type MerkadoWallet = {
  /** The active EIP-1193 provider (Reown wallet or window.ethereum). */
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
  "No wallet was found. Connect one from the wallet modal, or install a browser wallet (such as MetaMask or Rabby).";

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

function useInjectedWallet(): Omit<
  MerkadoWallet,
  "provider" | "address" | "chainId" | "isConnected"
> & {
  provider: EIP1193Provider | null;
  address: `0x${string}` | null;
  chainId: number | null;
  isConnected: boolean;
} {
  const [provider, setProvider] = useState<EIP1193Provider | null>(() => {
    if (typeof window === "undefined") return null;
    return (window as unknown as { ethereum?: EIP1193Provider }).ethereum ?? null;
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
    const ethereum = (window as unknown as { ethereum?: EIP1193Provider }).ethereum;
    if (!ethereum) return;
    providerRef.current = ethereum;
    const onAccounts = (accounts: string[]) => applyAccount(accounts);
    const onChain = (hexChainId: string) => setChainId(parseHexChainId(hexChainId));
    const onDisconnect = () => {
      setAddress(null);
      setChainId(null);
    };
    ethereum.on("accountsChanged", onAccounts);
    ethereum.on("chainChanged", onChain);
    ethereum.on("disconnect", onDisconnect);
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
      ethereum.removeListener("accountsChanged", onAccounts);
      ethereum.removeListener("chainChanged", onChain);
      ethereum.removeListener("disconnect", onDisconnect);
      providerRef.current = null;
    };
  }, [applyAccount, syncChainId]);

  const connect = useCallback(async () => {
    if (typeof window === "undefined") throw new Error(NO_WALLET_MESSAGE);
    const ethereum =
      (window as unknown as { ethereum?: EIP1193Provider }).ethereum ??
      providerRef.current;
    if (!ethereum) throw new Error(NO_WALLET_MESSAGE);
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

/**
 * Wallet boundary. When Reown AppKit is configured it drives connection through
 * the Reown modal; otherwise it falls back to the injected EIP-1193 path.
 * `connect` opens the modal (never blocks), `disconnect` disconnects.
 */
export function useMerkadoWallet(): MerkadoWallet {
  const reownEnabled = isReownConfigured();
  const injected = useInjectedWallet();
  const { address: reownAddress, isConnected: reownConnected } = useAppKitAccount();
  const { chainId: reownChain } = useAppKitNetwork();
  const { walletProvider } = useAppKitProvider("eip155");
  const { disconnect: reownDisconnect } = useDisconnect();
  const [connecting, setConnecting] = useState(false);

  if (!reownEnabled) {
    return {
      provider: injected.provider,
      address: injected.address,
      chainId: injected.chainId,
      isConnected: injected.isConnected,
      connecting: injected.connecting,
      connect: injected.connect,
      disconnect: injected.disconnect,
    };
  }

  return {
    provider: (walletProvider as unknown as EIP1193Provider | undefined) ?? null,
    address: reownConnected ? (reownAddress as `0x${string}` | null) : null,
    chainId: typeof reownChain === "number" ? reownChain : null,
    isConnected: reownConnected,
    connecting,
    connect: async () => {
      setConnecting(true);
      try {
        openReownModal();
      } finally {
        setConnecting(false);
      }
    },
    disconnect: () => {
      reownDisconnect();
    },
  };
}
