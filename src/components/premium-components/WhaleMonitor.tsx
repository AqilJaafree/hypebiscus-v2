// src/components/premium-components/WhaleMonitor.tsx
"use client";

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Connection, PublicKey, ParsedTransactionWithMeta } from '@solana/web3.js';
import { Waves, TrendingUp, TrendingDown, ExternalLink, Clock } from 'lucide-react';

// BTC token mints on Solana
const BTC_TOKEN_MINTS = {
  'wBTC': 'qfnqNqs3nCAHjnyCgLRDbBtq4p2MtHZxw8YjSyYhPoL',  // Wrapped BTC (Wormhole)
  'zBTC': 'BXTnp1JARk4wfyvnYDQpZ3BbD5jDLwgGfxiNmUXSXW5v',  // Zeus BTC
  'cbBTC': 'cbBTCZ67WVoNHUjRCBhLfq1RzaFDqcjb9QdFP6xwTz8',  // Coinbase BTC
};

// Minimum transaction size to track (in USD)
const WHALE_THRESHOLD = 100;

interface WhaleTransaction {
  signature: string;
  timestamp: number;
  token: string;
  amount: number;
  usdValue: number;
  from: string;
  to: string;
  type: 'buy' | 'sell' | 'transfer';
}

interface WhaleMonitorProps {
  btcPrice: number; // Current BTC price in USD
}

const WhaleMonitor: React.FC<WhaleMonitorProps> = ({ btcPrice }) => {
  const [transactions, setTransactions] = useState<WhaleTransaction[]>([]);
  const [isMonitoring, setIsMonitoring] = useState(true); // Auto-start monitoring
  const [lastCheck, setLastCheck] = useState<Date>(new Date());
  const connectionRef = useRef<Connection | null>(null);
  const signaturesSeen = useRef<Set<string>>(new Set());

  // Initialize connection
  useEffect(() => {
    const rpcUrl = process.env.NEXT_PUBLIC_SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com';
    connectionRef.current = new Connection(rpcUrl, 'confirmed');
  }, []);

  // Parse transaction to extract whale activity
  const parseTransaction = useCallback((
    tx: ParsedTransactionWithMeta,
    signature: string,
    tokenSymbol: string
  ): WhaleTransaction | null => {
    if (!tx || !tx.meta || !tx.blockTime) return null;

    try {
      // Extract pre and post token balances
      const preBalances = tx.meta.preTokenBalances || [];
      const postBalances = tx.meta.postTokenBalances || [];

      // Find BTC token transfers
      for (let i = 0; i < postBalances.length; i++) {
        const preBalance = preBalances.find(pb => pb.accountIndex === postBalances[i].accountIndex);
        if (!preBalance) continue;

        const preAmount = preBalance.uiTokenAmount.uiAmount || 0;
        const postAmount = postBalances[i].uiTokenAmount.uiAmount || 0;
        const diff = Math.abs(postAmount - preAmount);

        if (diff === 0) continue;

        const usdValue = diff * btcPrice;

        // Only track whale-sized transactions
        if (usdValue < WHALE_THRESHOLD) continue;

        // Get accounts involved
        const accountKeys = tx.transaction.message.accountKeys;
        const fromAddress = accountKeys[0]?.pubkey.toString() || 'Unknown';
        const toAddress = postBalances[i].owner || 'Unknown';

        // Determine transaction type
        let type: 'buy' | 'sell' | 'transfer' = 'transfer';
        if (postAmount > preAmount) type = 'buy';
        else if (postAmount < preAmount) type = 'sell';

        return {
          signature,
          timestamp: tx.blockTime * 1000,
          token: tokenSymbol,
          amount: diff,
          usdValue,
          from: fromAddress.slice(0, 4) + '...' + fromAddress.slice(-4),
          to: toAddress.slice(0, 4) + '...' + toAddress.slice(-4),
          type,
        };
      }
    } catch (error) {
      console.error('Error parsing transaction:', error);
    }

    return null;
  }, [btcPrice]);

  // Monitor transactions for a specific token
  const monitorToken = useCallback(async (tokenSymbol: string, mintAddress: string) => {
    if (!connectionRef.current) return;

    try {
      const pubkey = new PublicKey(mintAddress);
      
      // Get recent signatures
      const signatures = await connectionRef.current.getSignaturesForAddress(pubkey, {
        limit: 10,
      });

      // Filter out already seen signatures
      const newSignatures = signatures.filter(sig => !signaturesSeen.current.has(sig.signature));

      if (newSignatures.length === 0) return;

      // Mark signatures as seen
      newSignatures.forEach(sig => signaturesSeen.current.add(sig.signature));

      // Get transaction details
      const txPromises = newSignatures.map(sig =>
        connectionRef.current!.getParsedTransaction(sig.signature, {
          maxSupportedTransactionVersion: 0,
        })
      );

      const txs = await Promise.all(txPromises);

      // Parse transactions
      const whaleTransactions: WhaleTransaction[] = [];
      txs.forEach((tx, idx) => {
        if (!tx) return;
        const whaleTx = parseTransaction(tx, newSignatures[idx].signature, tokenSymbol);
        if (whaleTx) whaleTransactions.push(whaleTx);
      });

      if (whaleTransactions.length > 0) {
        setTransactions(prev => [...whaleTransactions, ...prev].slice(0, 20)); // Keep last 20
      }
    } catch (error) {
      console.error(`Error monitoring ${tokenSymbol}:`, error);
    }
  }, [parseTransaction]);

  // Main monitoring loop
  useEffect(() => {
    if (!isMonitoring) return;

    const interval = setInterval(async () => {
      setLastCheck(new Date());
      
      // Monitor all BTC tokens
      await Promise.all(
        Object.entries(BTC_TOKEN_MINTS).map(([symbol, mint]) =>
          monitorToken(symbol, mint)
        )
      );
    }, 10000); // Check every 10 seconds

    return () => clearInterval(interval);
  }, [isMonitoring, monitorToken]);

  const formatTime = (timestamp: number) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const minutes = Math.floor(diff / 60000);
    
    if (minutes < 1) return 'Just now';
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    return `${Math.floor(hours / 24)}d ago`;
  };

  const formatAmount = (amount: number) => {
    return amount.toFixed(4);
  };

  const formatUSD = (value: number) => {
    if (value >= 1000000) return `$${(value / 1000000).toFixed(2)}M`;
    if (value >= 1000) return `$${(value / 1000).toFixed(0)}K`;
    return `$${value.toFixed(0)}`;
  };

  return (
    <div className="bg-[#0f0f0f] border border-[#1C1C1C] rounded-2xl p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Waves className="w-6 h-6 text-[#FF4040]" />
          <div>
            <h3 className="text-lg font-semibold">Whale Activity</h3>
            <p className="text-xs text-[#A0A0A0]">Large BTC transactions on Solana</p>
          </div>
        </div>
        <button
          onClick={() => setIsMonitoring(!isMonitoring)}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            isMonitoring
              ? 'bg-red-500/20 text-red-500 hover:bg-red-500/30'
              : 'bg-[#FF4040]/20 text-[#FF4040] hover:bg-[#FF4040]/30'
          }`}
        >
          {isMonitoring ? 'Stop Monitoring' : 'Start Monitoring'}
        </button>
      </div>

      {/* Status */}
      {isMonitoring && (
        <div className="flex items-center gap-2 mb-4 text-xs text-[#A0A0A0]">
          <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
          <span>Live monitoring • Last check: {formatTime(lastCheck.getTime())}</span>
        </div>
      )}

      {/* Threshold Info */}
      <div className="mb-4 p-3 bg-[#161616] rounded-lg">
        <p className="text-xs text-[#A0A0A0]">
          Tracking transactions over <span className="text-[#FF4040] font-semibold">${(WHALE_THRESHOLD / 1000).toFixed(0)}K</span> across wBTC, zBTC, and cbBTC
        </p>
      </div>

      {/* Transaction List */}
      <div className="space-y-3">
        {transactions.length === 0 ? (
          <div className="text-center py-8 text-[#A0A0A0]">
            {isMonitoring ? (
              <>
                <Waves className="w-12 h-12 mx-auto mb-3 opacity-50" />
                <p className="text-sm">Monitoring for whale activity...</p>
                <p className="text-xs mt-1">Large transactions will appear here</p>
              </>
            ) : (
              <>
                <p className="text-sm">Click "Start Monitoring" to track whale transactions</p>
              </>
            )}
          </div>
        ) : (
          transactions.map((tx) => (
            <div
              key={tx.signature}
              className="p-4 bg-[#161616] rounded-xl border border-[#1C1C1C] hover:border-[#FF4040]/30 transition-colors"
            >
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-3">
                  <div
                    className={`w-10 h-10 rounded-full flex items-center justify-center ${
                      tx.type === 'buy'
                        ? 'bg-green-500/20'
                        : tx.type === 'sell'
                        ? 'bg-red-500/20'
                        : 'bg-blue-500/20'
                    }`}
                  >
                    {tx.type === 'buy' ? (
                      <TrendingUp className="w-5 h-5 text-green-500" />
                    ) : tx.type === 'sell' ? (
                      <TrendingDown className="w-5 h-5 text-red-500" />
                    ) : (
                      <Waves className="w-5 h-5 text-blue-500" />
                    )}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span
                        className={`text-sm font-semibold ${
                          tx.type === 'buy'
                            ? 'text-green-500'
                            : tx.type === 'sell'
                            ? 'text-red-500'
                            : 'text-blue-500'
                        }`}
                      >
                        {tx.type.toUpperCase()}
                      </span>
                      <span className="text-xs text-[#A0A0A0]">•</span>
                      <span className="text-xs text-[#A0A0A0]">{tx.token}</span>
                    </div>
                    <div className="flex items-center gap-2 mt-1">
                      <Clock className="w-3 h-3 text-[#A0A0A0]" />
                      <span className="text-xs text-[#A0A0A0]">{formatTime(tx.timestamp)}</span>
                    </div>
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-lg font-bold text-white">
                    {formatUSD(tx.usdValue)}
                  </div>
                  <div className="text-xs text-[#A0A0A0]">
                    {formatAmount(tx.amount)} BTC
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-2">
                  <span className="text-[#A0A0A0]">From:</span>
                  <code className="text-[#FF4040] font-mono">{tx.from}</code>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[#A0A0A0]">To:</span>
                  <code className="text-[#FF4040] font-mono">{tx.to}</code>
                </div>
              </div>

              <a
                href={`https://solscan.io/tx/${tx.signature}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-center gap-2 mt-3 pt-3 border-t border-[#1C1C1C] text-xs text-[#A0A0A0] hover:text-[#FF4040] transition-colors"
              >
                View on Solscan
                <ExternalLink className="w-3 h-3" />
              </a>
            </div>
          ))
        )}
      </div>

      {/* Disclaimer */}
      {transactions.length > 0 && (
        <div className="mt-4 p-3 bg-[#161616] rounded-lg">
          <p className="text-xs text-[#A0A0A0]">
            <span className="font-bold text-white">Note:</span> Whale transactions may indicate market sentiment shifts. Always DYOR before making trading decisions.
          </p>
        </div>
      )}
    </div>
  );
};

export default WhaleMonitor;