"use client";

import React, { useEffect, useState } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { TrendingUp, TrendingDown, Wallet as WalletIcon } from 'lucide-react';

interface PnLData {
  totalPnlUsd: string;
  totalPositions: number;
  activePositions: number;
  avgPositionSize: string;
}

export default function PnLStats() {
  const { publicKey, connected } = useWallet();
  const [pnlData, setPnlData] = useState<PnLData | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!connected || !publicKey) {
      setPnlData(null);
      return;
    }

    const fetchPnL = async () => {
      setLoading(true);
      try {
        const response = await fetch(`/api/pnl?publicKey=${publicKey.toString()}`);
        const data = await response.json();
        setPnlData(data);
      } catch (error) {
        console.error('Error fetching PnL:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchPnL();
  }, [publicKey, connected]);

  if (!connected) {
    return (
      <div className="bg-[#0f0f0f] border border-[#1C1C1C] rounded-2xl p-6">
        <div className="flex items-center gap-2 mb-4">
          <WalletIcon className="w-5 h-5 text-[#FF4040]" />
          <h3 className="text-lg font-semibold">Your P&L</h3>
        </div>
        <p className="text-sm text-[#A0A0A0]">Connect wallet to view your performance</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="bg-[#0f0f0f] border border-[#1C1C1C] rounded-2xl p-6">
        <div className="flex items-center gap-2 mb-4">
          <WalletIcon className="w-5 h-5 text-[#FF4040]" />
          <h3 className="text-lg font-semibold">Your P&L</h3>
        </div>
        <p className="text-sm text-[#A0A0A0]">Loading...</p>
      </div>
    );
  }

  if (!pnlData) return null;

  const totalPnl = parseFloat(pnlData.totalPnlUsd);
  const isPositive = totalPnl >= 0;

  return (
    <div className="bg-[#0f0f0f] border border-[#1C1C1C] rounded-2xl p-6">
      <div className="flex items-center gap-2 mb-4">
        <WalletIcon className="w-5 h-5 text-[#FF4040]" />
        <h3 className="text-lg font-semibold">Your P&L</h3>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div>
          <p className="text-sm text-[#A0A0A0] mb-2">Total P&L</p>
          <div className={`flex items-center gap-2 ${isPositive ? 'text-green-500' : 'text-red-500'}`}>
            {isPositive ? <TrendingUp className="w-5 h-5" /> : <TrendingDown className="w-5 h-5" />}
            <span className="text-2xl font-bold">
              ${Math.abs(totalPnl).toFixed(2)}
            </span>
          </div>
        </div>

        <div>
          <p className="text-sm text-[#A0A0A0] mb-2">Active Positions</p>
          <p className="text-2xl font-bold">{pnlData.activePositions}</p>
        </div>

        <div>
          <p className="text-sm text-[#A0A0A0] mb-2">Total Positions</p>
          <p className="text-2xl font-bold">{pnlData.totalPositions}</p>
        </div>
      </div>
    </div>
  );
}