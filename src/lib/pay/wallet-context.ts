"use client";

import { createContext } from "react";

import type { MerkadoWallet } from "@/hooks/use-merkado-wallet";

export const MerkadoWalletContext = createContext<MerkadoWallet | null>(null);