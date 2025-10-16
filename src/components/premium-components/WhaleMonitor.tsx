// src/components/premium-components/WhaleMonitor.tsx
"use client";

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Connection, PublicKey, ParsedTransactionWithMeta } from '@solana/web3.js';
import { Waves, TrendingUp, TrendingDown, ExternalLink, Clock } from 'lucide-react';

// CORRECTED BTC token mints (from your actual project)
const BTC_TOKEN_MINTS = {
  'wBTC': '3NZ9JMVBmGAqocybic2c7LQCJScmgsAZ6vQqTDzcqmJh',  // Correct wBTC
  'zBTC': 'zBTCug3er3tLyffELcvDNrKkCymbPWysGcWihESYfLg',  // Correct zBTC (your fix)
  'cbBTC': 'cbbtcf3aa214zXHbiAZQwf4122FBYbraNdFqgw4iMij', // Correct cbBTC
};

// DEX Program IDs
const DEX_PROGRAMS = {
  JUPITER_V6: 'JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4',
  JUPITER_V4: 'JUP4Fb2cqiRUcaTHdrPC8h2gNsA2ETXiPDD33WcGuJB',
  RAYDIUM_V4: '675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8',
  RAYDIUM_CLMM: 'CAMMCzo5YL8w4VFF8KVHrK22GGUsp5VTaW7grrKgrWqK',
  ORCA_WHIRLPOOL: 'whirLbMiicVdio4qvUfM5KAg6Ct8VwpYzGff3uctyCc',
  ORCA_WHIRLPOOLS: '9W959DqEETiGZocYWCQPaJ6sBmUzgfxXfqGeTEdp3aQP',
  METEORA_DLMM: 'LBUZKhRxPF3XUpBCjp4YzTKgLccjZhTSDM9YuVaPwxo',
};

// Lower threshold for testing
const WHALE_THRESHOLD = 500; // $500 to catch more activity

interface WhaleTransaction {
  signature: string;
  timestamp: number;
  token: string;
  amount: number;
  usdValue: number;
  from: string;
  to: string;
  type: 'buy' | 'sell' | 'transfer';
  dex?: string;
  confidence?: string;
}

interface WhaleMonitorProps {
  btcPrice: number;
}

const WhaleMonitor: React.FC<WhaleMonitorProps> = ({ btcPrice }) => {
  const [transactions, setTransactions] = useState<WhaleTransaction[]>([]);
  const [isMonitoring, setIsMonitoring] = useState(true);
  const [lastCheck, setLastCheck] = useState<Date>(new Date());
  const [debugInfo, setDebugInfo] = useState<string>('Starting...');
  const connectionRef = useRef<Connection | null>(null);
  const signaturesSeen = useRef<Set<string>>(new Set());
  const [persistentTransactions, setPersistentTransactions] = useState<WhaleTransaction[]>([]); // Keep transactions longer

  // Initialize connection
  useEffect(() => {
    const rpcUrl = process.env.NEXT_PUBLIC_SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com';
    connectionRef.current = new Connection(rpcUrl, 'confirmed');
    console.log('🔗 Connection initialized with CORRECTED token addresses');
    console.log('📋 Monitoring tokens:', BTC_TOKEN_MINTS);
  }, []);

  // Enhanced DEX detection
  const detectDEX = useCallback((tx: ParsedTransactionWithMeta): { dex: string; confidence: string } => {
    const instructions = tx.transaction.message.instructions;
    
    for (const ix of instructions) {
      const programId = ix.programId.toString();
      
      if (programId === DEX_PROGRAMS.JUPITER_V6 || programId === DEX_PROGRAMS.JUPITER_V4) {
        return { dex: 'Jupiter', confidence: 'HIGH' };
      }
      if (programId === DEX_PROGRAMS.RAYDIUM_V4) {
        return { dex: 'Raydium V4', confidence: 'HIGH' };
      }
      if (programId === DEX_PROGRAMS.RAYDIUM_CLMM) {
        return { dex: 'Raydium CLMM', confidence: 'HIGH' };
      }
      if (programId === DEX_PROGRAMS.ORCA_WHIRLPOOL || programId === DEX_PROGRAMS.ORCA_WHIRLPOOLS) {
        return { dex: 'Orca', confidence: 'HIGH' };
      }
      if (programId === DEX_PROGRAMS.METEORA_DLMM) {
        return { dex: 'Meteora', confidence: 'HIGH' };
      }
    }
    
    return { dex: 'Unknown', confidence: 'LOW' };
  }, []);

  // Parse transaction
  const parseTransaction = useCallback((
    tx: ParsedTransactionWithMeta,
    signature: string,
    tokenSymbol: string
  ): WhaleTransaction | null => {
    if (!tx || !tx.meta || !tx.blockTime) return null;

    try {
      const preBalances = tx.meta.preTokenBalances || [];
      const postBalances = tx.meta.postTokenBalances || [];

      for (let i = 0; i < postBalances.length; i++) {
        const preBalance = preBalances.find(pb => pb.accountIndex === postBalances[i].accountIndex);
        if (!preBalance) continue;

        const preAmount = preBalance.uiTokenAmount.uiAmount || 0;
        const postAmount = postBalances[i].uiTokenAmount.uiAmount || 0;
        const diff = Math.abs(postAmount - preAmount);

        if (diff === 0) continue;

        const usdValue = diff * btcPrice;
        if (usdValue < WHALE_THRESHOLD) continue;

        const accountKeys = tx.transaction.message.accountKeys;
        const fromAddress = accountKeys[0]?.pubkey.toString() || 'Unknown';
        const toAddress = postBalances[i].owner || 'Unknown';

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

  // Monitor ALL token accounts with rate limiting
  const monitorAllTokens = useCallback(async () => {
    if (!connectionRef.current) return;

    try {
      setDebugInfo('Checking BTC tokens (rate limited)...');
      console.log('🔍 Checking all BTC token accounts with rate limits...');

      const allTransactions: WhaleTransaction[] = [];

      // Monitor each BTC token account sequentially with delays
      for (const [symbol, mint] of Object.entries(BTC_TOKEN_MINTS)) {
        try {
          console.log(`📊 Checking ${symbol} (${mint})`);
          
          const signatures = await connectionRef.current.getSignaturesForAddress(
            new PublicKey(mint),
            { limit: 3 } // Reduced to 3 for rate limits
          );

          const newSignatures = signatures.filter(sig => !signaturesSeen.current.has(sig.signature));
          
          if (newSignatures.length > 0) {
            console.log(`🆕 Found ${newSignatures.length} new ${symbol} transactions`);
            
            // Mark as seen
            newSignatures.forEach(sig => signaturesSeen.current.add(sig.signature));

            // Process transactions one by one with delays
            for (let i = 0; i < newSignatures.length; i++) {
              try {
                const tx = await connectionRef.current!.getParsedTransaction(newSignatures[i].signature, {
                  maxSupportedTransactionVersion: 0,
                });

                if (tx) {
                  const { dex, confidence } = detectDEX(tx);
                  const whaleTx = parseTransaction(tx, newSignatures[i].signature, symbol);
                  
                  if (whaleTx) {
                    whaleTx.dex = dex;
                    whaleTx.confidence = confidence;
                    allTransactions.push(whaleTx);
                    console.log(`🐋 ${symbol} whale: $${whaleTx.usdValue.toFixed(0)} on ${dex}`);
                  }
                }

                // Add delay between transaction fetches
                if (i < newSignatures.length - 1) {
                  await new Promise(resolve => setTimeout(resolve, 200)); // 200ms delay
                }
              } catch (error) {
                console.warn(`Failed to fetch transaction:`, error);
              }
            }
          }

          // Add delay between different tokens
          const tokenEntries = Object.entries(BTC_TOKEN_MINTS);
          const currentIndex = tokenEntries.findIndex(([s]) => s === symbol);
          if (currentIndex < tokenEntries.length - 1) {
            await new Promise(resolve => setTimeout(resolve, 500)); // 500ms delay between tokens
          }
          
        } catch (error) {
          console.error(`Error monitoring ${symbol}:`, error);
        }
      }

      if (allTransactions.length > 0) {
        console.log(`🎉 Total whales found: ${allTransactions.length}`);
        setDebugInfo(`Found ${allTransactions.length} whale transactions!`);
        
        // Add new transactions to persistent list instead of replacing
        setPersistentTransactions(prev => {
          const combined = [...allTransactions, ...prev];
          // Keep transactions for 30 seconds
          const thirtySecondsAgo = Date.now() - (30 * 1000);
          const filtered = combined.filter(tx => tx.timestamp > thirtySecondsAgo);
          return filtered.slice(0, 7); // Still limit to 7 max
        });
        
        // Update display transactions
        setTransactions(allTransactions.slice(0, 7));
      } else {
        setDebugInfo('No new whale activity detected');
        // Don't clear transactions - keep showing persistent ones
      }

    } catch (error) {
      console.error('Error in monitoring:', error);
      setDebugInfo(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }, [parseTransaction, detectDEX]);

  // Main monitoring loop with slower interval
  useEffect(() => {
    if (!isMonitoring) return;

    console.log('🚀 Starting rate-limited whale monitoring');
    monitorAllTokens(); // Run immediately

    const interval = setInterval(async () => {
      setLastCheck(new Date());
      await monitorAllTokens();
    }, 15000); // Check every 15 seconds (slower for rate limits)

    return () => clearInterval(interval);
  }, [isMonitoring, monitorAllTokens]);

  // Use persistent transactions for display (they last longer)
  const displayTransactions = persistentTransactions.length > 0 ? persistentTransactions : transactions;

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
            <p className="text-xs text-[#A0A0A0]">Large BTC transactions on Solana • Rate limited for RPC</p>
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
          <span>Live monitoring • Last check: {formatTime(lastCheck.getTime())} • 15s intervals</span>
        </div>
      )}

      {/* Debug Info */}
      {isMonitoring && (
        <div className="mb-4 p-2 bg-[#1a1a1a] rounded text-xs text-green-400 font-mono">
          {debugInfo}
        </div>
      )}

      {/* Token Info */}
      <div className="mb-4 p-3 bg-[#161616] rounded-lg">
        <p className="text-xs text-[#A0A0A0]">
          ✅ Rate Limited: Checking <span className="text-[#FF4040] font-semibold">${(WHALE_THRESHOLD / 1000).toFixed(0)}K+</span> trades every 15s • Keep for 30s
          <br />
          <span className="text-green-400 font-mono text-[10px]">
            wBTC: 3NZ9... • zBTC: zBTC... • cbBTC: cbbt...
          </span>
        </p>
      </div>

      {/* Transaction List */}
      <div className="space-y-3">
        {displayTransactions.length === 0 ? (
          <div className="text-center py-8 text-[#A0A0A0]">
            {isMonitoring ? (
              <>
                <Waves className="w-12 h-12 mx-auto mb-3 opacity-50" />
                <p className="text-sm">Monitoring with rate limits...</p>
                <p className="text-xs mt-1">Checking every 15 seconds for whale activity</p>
                <p className="text-xs mt-2 text-green-400">Check console for debug logs</p>
              </>
            ) : (
              <>
                <p className="text-sm">Click "Start Monitoring" to track whale transactions</p>
              </>
            )}
          </div>
        ) : (
          displayTransactions.map((tx) => (
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
                      {tx.dex && (
                        <>
                          <span className="text-xs text-[#A0A0A0]">•</span>
                          <span className={`text-xs font-medium ${
                            tx.dex === 'Jupiter' ? 'text-[#FF4040]' :
                            tx.dex.includes('Raydium') ? 'text-purple-400' :
                            tx.dex === 'Orca' ? 'text-blue-400' :
                            tx.dex === 'Meteora' ? 'text-green-400' :
                            'text-gray-400'
                          }`}>{tx.dex}</span>
                        </>
                      )}
                      {tx.confidence && (
                        <>
                          <span className="text-xs text-[#A0A0A0]">•</span>
                          <span className={`text-xs font-medium px-1.5 py-0.5 rounded ${
                            tx.confidence === 'HIGH' ? 'bg-green-500/20 text-green-400' : 'bg-yellow-500/20 text-yellow-400'
                          }`}>
                            {tx.confidence}
                          </span>
                        </>
                      )}
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

      {/* Persistent Notice */}
      {displayTransactions.length > 0 && (
        <div className="mt-4 p-3 bg-blue-500/10 border border-blue-500/20 rounded-lg">
          <p className="text-xs text-blue-400">
            <span className="font-bold">⏰ Persistent:</span> Transactions stay visible for 30 seconds. Rate limited every 15s.
          </p>
        </div>
      )}
    </div>
  );
};

export default WhaleMonitor;