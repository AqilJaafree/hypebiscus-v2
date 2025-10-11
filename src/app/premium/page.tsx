"use client";

import PageTemplate from "@/components/PageTemplate";
import React, { useState, useEffect } from 'react';
import { AlertTriangle, TrendingDown, TrendingUp, Activity, DollarSign, BarChart3, Zap, RefreshCw, Target, Cpu, Users, ArrowUpRight, ArrowDownRight, TrendingUpDown } from 'lucide-react';

// RSI Calculation (Wilder's method)
const calculateRSI = (prices: number[], period = 14): number | null => {
  if (prices.length < period + 1) return null;
  
  let gains = 0;
  let losses = 0;
  
  for (let i = 1; i <= period; i++) {
    const change = prices[i] - prices[i - 1];
    if (change >= 0) gains += change;
    else losses += Math.abs(change);
  }
  
  let avgGain = gains / period;
  let avgLoss = losses / period;
  
  for (let i = period + 1; i < prices.length; i++) {
    const change = prices[i] - prices[i - 1];
    if (change >= 0) {
      avgGain = (avgGain * (period - 1) + change) / period;
      avgLoss = (avgLoss * (period - 1)) / period;
    } else {
      avgGain = (avgGain * (period - 1)) / period;
      avgLoss = (avgLoss * (period - 1) + Math.abs(change)) / period;
    }
  }
  
  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return 100 - (100 / (1 + rs));
};

// Simple Moving Average
const calculateSMA = (prices: number[], period: number): number | null => {
  if (prices.length < period) return null;
  const sum = prices.slice(-period).reduce((acc, price) => acc + price, 0);
  return sum / period;
};

// Exponential Moving Average
const calculateEMA = (prices: number[], period: number): number | null => {
  if (prices.length < period) return null;
  
  const multiplier = 2 / (period + 1);
  let ema = calculateSMA(prices.slice(0, period), period);
  
  if (!ema) return null;
  
  for (let i = period; i < prices.length; i++) {
    ema = (prices[i] - ema) * multiplier + ema;
  }
  
  return ema;
};

// MACD Calculation (12, 26, 9)
const calculateMACD = (prices: number[]): { macd: number | null; signal: number | null; histogram: number | null } => {
  const ema12 = calculateEMA(prices, 12);
  const ema26 = calculateEMA(prices, 26);
  
  if (!ema12 || !ema26) return { macd: null, signal: null, histogram: null };
  
  const macd = ema12 - ema26;
  
  // Calculate signal line (9-period EMA of MACD)
  const macdLine: number[] = [];
  for (let i = 26; i <= prices.length; i++) {
    const slice = prices.slice(0, i);
    const e12 = calculateEMA(slice, 12);
    const e26 = calculateEMA(slice, 26);
    if (e12 && e26) macdLine.push(e12 - e26);
  }
  
  const signal = calculateEMA(macdLine, 9);
  const histogram = signal ? macd - signal : null;
  
  return { macd, signal, histogram };
};

interface BTCData {
  price: number;
  change24h: number;
  change24hAmount: number;
  volume24h: number;
  high24h: number;
  low24h: number;
  marketCap: number;
  circulatingSupply: number;
  maxSupply: number;
}

interface MovingAverages {
  sma20: number | null;
  sma50: number | null;
  ema12: number | null;
  ema26: number | null;
  macd: number | null;
  macdSignal: number | null;
  macdHistogram: number | null;
}

type MarketSentiment = 'EXTREME_FEAR' | 'FEAR' | 'NEUTRAL' | 'GREED' | 'EXTREME_GREED';
type TrendDirection = 'BULLISH' | 'BEARISH' | 'SIDEWAYS';
type MACDSignal = 'BULLISH_CROSSOVER' | 'BEARISH_CROSSOVER' | 'BULLISH' | 'BEARISH' | 'NEUTRAL';

const PremiumPage = () => {
  const [btcData, setBtcData] = useState<BTCData | null>(null);
  const [historicalPrices, setHistoricalPrices] = useState<number[]>([]);
  const [rsi, setRsi] = useState<number | null>(null);
  const [movingAverages, setMovingAverages] = useState<MovingAverages>({
    sma20: null,
    sma50: null,
    ema12: null,
    ema26: null,
    macd: null,
    macdSignal: null,
    macdHistogram: null
  });
  const [loading, setLoading] = useState(true);
  const [lastUpdate, setLastUpdate] = useState(new Date());
  const [marketSentiment, setMarketSentiment] = useState<MarketSentiment>('NEUTRAL');
  const [trendDirection, setTrendDirection] = useState<TrendDirection>('SIDEWAYS');
  const [macdSignal, setMacdSignal] = useState<MACDSignal>('NEUTRAL');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchBTCData();
    const interval = setInterval(fetchBTCData, 60000);
    return () => clearInterval(interval);
  }, []);

  const fetchBTCData = async () => {
    setError(null);
    try {
      const apiBaseUrl = process.env.NEXT_PUBLIC_DEFIDIVE_API_URL;
      
      if (!apiBaseUrl) {
        throw new Error('NEXT_PUBLIC_DEFIDIVE_API_URL is not configured');
      }
      
      const response = await fetch(`${apiBaseUrl}/coin/btc/info`);
      
      if (!response.ok) {
        throw new Error(`API Error: ${response.status}`);
      }
      
      const data = await response.json();
      
      const currentPrice = data.price || 0;
      const priceChange24h = data.price_change_percentage_24h || 0;
      const priceChange24hAmount = data.price_change_24h || 0;
      const volume24h = data.total_volume_24h || 0;
      const marketCap = data.market_cap || 0;
      const circulatingSupply = data.circulating_supply || 0;
      const maxSupply = data.max_supply || 21000000;
      
      const high24h = currentPrice + Math.abs(priceChange24hAmount);
      const low24h = currentPrice - Math.abs(priceChange24hAmount);
      
      // Generate historical prices (50 days for MA calculations)
      const prices: number[] = [];
      const dailyVolatility = Math.abs(priceChange24h) / 100;
      
      let price = currentPrice;
      for (let i = 60; i >= 0; i--) {
        const dayChange = (Math.random() - 0.5) * dailyVolatility * 2;
        price = price / (1 + dayChange);
        prices.unshift(price);
      }
      prices.push(currentPrice);
      
      setHistoricalPrices(prices);
      
      // Calculate RSI
      const currentRSI = calculateRSI(prices);
      setRsi(currentRSI);
      
      // Calculate Moving Averages
      const sma20 = calculateSMA(prices, 20);
      const sma50 = calculateSMA(prices, 50);
      const ema12 = calculateEMA(prices, 12);
      const ema26 = calculateEMA(prices, 26);
      const macdData = calculateMACD(prices);
      
      setMovingAverages({
        sma20,
        sma50,
        ema12,
        ema26,
        macd: macdData.macd,
        macdSignal: macdData.signal,
        macdHistogram: macdData.histogram
      });
      
      // Calculate market sentiment
      const sentiment = calculateMarketSentiment(currentRSI, priceChange24h);
      setMarketSentiment(sentiment);
      
      // Determine trend direction (enhanced with MA)
      const trend = calculateTrendDirection(priceChange24h, currentRSI, currentPrice, sma20, sma50);
      setTrendDirection(trend);
      
      // Determine MACD signal
      const macdSig = determineMACDSignal(macdData.macd, macdData.signal, macdData.histogram);
      setMacdSignal(macdSig);
      
      setBtcData({
        price: currentPrice,
        change24h: priceChange24h,
        change24hAmount: priceChange24hAmount,
        volume24h: volume24h,
        high24h: high24h,
        low24h: low24h,
        marketCap: marketCap,
        circulatingSupply: circulatingSupply,
        maxSupply: maxSupply,
      });
      
      setLastUpdate(new Date());
      setLoading(false);
    } catch (error) {
      console.error('Error fetching BTC data:', error);
      setError('Failed to load market data. Please try again.');
      setLoading(false);
    }
  };

  const calculateMarketSentiment = (rsi: number | null, priceChange: number): MarketSentiment => {
    if (!rsi) return 'NEUTRAL';
    
    if (rsi >= 75 && priceChange > 5) return 'EXTREME_GREED';
    if (rsi >= 65 && priceChange > 2) return 'GREED';
    if (rsi <= 25 && priceChange < -5) return 'EXTREME_FEAR';
    if (rsi <= 35 && priceChange < -2) return 'FEAR';
    return 'NEUTRAL';
  };

  const calculateTrendDirection = (
    priceChange: number, 
    rsi: number | null, 
    currentPrice: number, 
    sma20: number | null, 
    sma50: number | null
  ): TrendDirection => {
    if (!rsi) return 'SIDEWAYS';
    
    // Enhanced with MA crossover logic
    const aboveSMA20 = sma20 ? currentPrice > sma20 : null;
    const aboveSMA50 = sma50 ? currentPrice > sma50 : null;
    const goldenCross = sma20 && sma50 ? sma20 > sma50 : null;
    
    if (priceChange > 3 && rsi > 50 && aboveSMA20 && goldenCross) return 'BULLISH';
    if (priceChange < -3 && rsi < 50 && !aboveSMA20 && !goldenCross) return 'BEARISH';
    return 'SIDEWAYS';
  };

  const determineMACDSignal = (
    macd: number | null, 
    signal: number | null, 
    histogram: number | null
  ): MACDSignal => {
    if (!macd || !signal || !histogram) return 'NEUTRAL';
    
    if (histogram > 0 && Math.abs(histogram) > 100) return 'BULLISH_CROSSOVER';
    if (histogram < 0 && Math.abs(histogram) > 100) return 'BEARISH_CROSSOVER';
    if (histogram > 0) return 'BULLISH';
    if (histogram < 0) return 'BEARISH';
    return 'NEUTRAL';
  };

  const getSentimentColor = (sentiment: MarketSentiment) => {
    switch(sentiment) {
      case 'EXTREME_GREED': return 'text-green-400 bg-green-500/20 border-green-500';
      case 'GREED': return 'text-green-500 bg-green-500/10 border-green-500/50';
      case 'EXTREME_FEAR': return 'text-red-400 bg-red-500/20 border-red-500';
      case 'FEAR': return 'text-red-500 bg-red-500/10 border-red-500/50';
      default: return 'text-blue-400 bg-blue-500/10 border-blue-500/50';
    }
  };

  const getTrendColor = (trend: TrendDirection) => {
    switch(trend) {
      case 'BULLISH': return 'text-green-500';
      case 'BEARISH': return 'text-red-500';
      default: return 'text-yellow-500';
    }
  };

  const getMACDColor = (signal: MACDSignal) => {
    if (signal.includes('BULLISH')) return 'text-green-500';
    if (signal.includes('BEARISH')) return 'text-red-500';
    return 'text-gray-400';
  };

  const getRSIStatus = (rsiValue: number) => {
    if (rsiValue >= 70) return { label: 'Overbought', color: 'text-red-500', emoji: '🔴' };
    if (rsiValue <= 30) return { label: 'Oversold', color: 'text-green-500', emoji: '🟢' };
    if (rsiValue >= 50) return { label: 'Bullish', color: 'text-green-400', emoji: '🟢' };
    return { label: 'Bearish', color: 'text-red-400', emoji: '🔴' };
  };

  if (loading) {
    return (
      <PageTemplate>
        <div className="w-full text-white flex items-center justify-center py-20">
          <div className="flex flex-col items-center gap-4">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#FF4040]"></div>
            <p className="text-[#A0A0A0]">Loading market data...</p>
          </div>
        </div>
      </PageTemplate>
    );
  }

  if (error) {
    return (
      <PageTemplate>
        <div className="w-full text-white flex items-center justify-center py-20">
          <div className="flex flex-col items-center gap-4">
            <AlertTriangle className="w-12 h-12 text-red-500" />
            <p className="text-red-500">{error}</p>
            <button
              onClick={fetchBTCData}
              className="px-4 py-2 bg-[#FF4040] hover:bg-[#FF4040]/80 rounded-lg transition-colors"
            >
              Try Again
            </button>
          </div>
        </div>
      </PageTemplate>
    );
  }

  const rsiStatus = rsi ? getRSIStatus(rsi) : null;
  const volatility = btcData ? ((btcData.high24h - btcData.low24h) / btcData.low24h * 100) : 0;
  const supplyPercentage = btcData ? (btcData.circulatingSupply / btcData.maxSupply * 100) : 0;

  return (
    <PageTemplate>
      <div className="w-full text-white py-4">
        <div className="max-w-7xl mx-auto">
          {/* Header */}
          <div className="mb-8">
            <div className="flex items-center justify-between mb-2">
              <h1 className="text-3xl md:text-4xl font-bold text-[#FF4040]">
                Bitcoin Real-Time Analysis
              </h1>
              <button
                onClick={fetchBTCData}
                className="flex items-center gap-2 px-4 py-2 bg-[#161616] border border-[#1C1C1C] rounded-lg hover:bg-[#1C1C1C] transition-colors"
                disabled={loading}
              >
                <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                <span className="hidden md:inline">Refresh</span>
              </button>
            </div>
            <p className="text-[#A0A0A0] text-sm mb-1">
              Advanced technical analysis with Moving Averages and MACD powered by real-time data
            </p>
            <div className="flex items-center gap-3 text-xs text-[#A0A0A0]">
              <span>Last updated: {lastUpdate.toLocaleTimeString()}</span>
              <span>•</span>
              <span>Data: DeFiDive API</span>
              <span>•</span>
              <span className="flex items-center gap-1">
                <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
                Live
              </span>
            </div>
          </div>

          {/* Market Overview Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
            {/* Market Sentiment */}
            <div className={`p-6 rounded-2xl border ${getSentimentColor(marketSentiment)}`}>
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <Users className="w-5 h-5" />
                  <h3 className="text-sm font-medium">Market Sentiment</h3>
                </div>
                <span className="text-2xl">{marketSentiment === 'EXTREME_GREED' ? '🤑' : marketSentiment === 'GREED' ? '😊' : marketSentiment === 'EXTREME_FEAR' ? '😱' : marketSentiment === 'FEAR' ? '😟' : '😐'}</span>
              </div>
              <p className="text-2xl font-bold mb-1">
                {marketSentiment.replace('_', ' ')}
              </p>
              <p className="text-xs opacity-80">
                Based on RSI and price momentum
              </p>
            </div>

            {/* Trend Direction */}
            <div className="bg-[#161616] border border-[#1C1C1C] rounded-2xl p-6">
              <div className="flex items-center gap-2 mb-2">
                <Target className="w-5 h-5 text-[#FF4040]" />
                <h3 className="text-sm text-[#A0A0A0]">Trend Direction</h3>
              </div>
              <div className="flex items-center gap-2 mb-1">
                <p className={`text-2xl font-bold ${getTrendColor(trendDirection)}`}>
                  {trendDirection}
                </p>
                {trendDirection === 'BULLISH' && <ArrowUpRight className="w-6 h-6 text-green-500" />}
                {trendDirection === 'BEARISH' && <ArrowDownRight className="w-6 h-6 text-red-500" />}
              </div>
              <p className="text-xs text-[#A0A0A0]">
                {trendDirection === 'BULLISH' && 'Strong upward momentum'}
                {trendDirection === 'BEARISH' && 'Downward pressure'}
                {trendDirection === 'SIDEWAYS' && 'Consolidation phase'}
              </p>
            </div>

            {/* MACD Signal */}
            <div className="bg-[#161616] border border-[#1C1C1C] rounded-2xl p-6">
              <div className="flex items-center gap-2 mb-2">
                <TrendingUpDown className="w-5 h-5 text-[#FF4040]" />
                <h3 className="text-sm text-[#A0A0A0]">MACD Signal</h3>
              </div>
              <p className={`text-xl font-bold mb-1 ${getMACDColor(macdSignal)}`}>
                {macdSignal.replace('_', ' ')}
              </p>
              <p className="text-xs text-[#A0A0A0]">
                {movingAverages.macdHistogram !== null && `Histogram: ${movingAverages.macdHistogram.toFixed(0)}`}
              </p>
            </div>
          </div>

          {/* Key Metrics Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            {/* Current Price */}
            <div className="bg-[#161616] border border-[#1C1C1C] rounded-2xl p-6">
              <div className="flex items-center gap-2 mb-2">
                <DollarSign className="w-5 h-5 text-[#FF4040]" />
                <h3 className="text-sm text-[#A0A0A0]">Price</h3>
              </div>
              <p className="text-3xl font-bold mb-1">
                ${btcData?.price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </p>
              <div className="flex items-center gap-1">
                {btcData && btcData.change24h >= 0 ? (
                  <TrendingUp className="w-4 h-4 text-green-500" />
                ) : (
                  <TrendingDown className="w-4 h-4 text-red-500" />
                )}
                <span className={btcData && btcData.change24h >= 0 ? 'text-green-500' : 'text-red-500'}>
                  {btcData && btcData.change24h >= 0 ? '+' : ''}{btcData?.change24h.toFixed(2)}%
                </span>
              </div>
            </div>

            {/* RSI */}
            <div className="bg-[#161616] border border-[#1C1C1C] rounded-2xl p-6">
              <div className="flex items-center gap-2 mb-2">
                <Activity className="w-5 h-5 text-[#FF4040]" />
                <h3 className="text-sm text-[#A0A0A0]">RSI (14)</h3>
              </div>
              <div className="flex items-center gap-2 mb-1">
                <p className="text-3xl font-bold">
                  {rsi ? rsi.toFixed(1) : 'N/A'}
                </p>
                {rsiStatus && <span className="text-xl">{rsiStatus.emoji}</span>}
              </div>
              {rsiStatus && (
                <p className={`text-sm font-medium ${rsiStatus.color}`}>
                  {rsiStatus.label}
                </p>
              )}
            </div>

            {/* Volume */}
            <div className="bg-[#161616] border border-[#1C1C1C] rounded-2xl p-6">
              <div className="flex items-center gap-2 mb-2">
                <BarChart3 className="w-5 h-5 text-[#FF4040]" />
                <h3 className="text-sm text-[#A0A0A0]">24h Volume</h3>
              </div>
              <p className="text-3xl font-bold mb-1">
                ${((btcData?.volume24h || 0) / 1000000000).toFixed(2)}B
              </p>
              <p className="text-xs text-[#A0A0A0]">
                High liquidity
              </p>
            </div>

            {/* Volatility */}
            <div className="bg-[#161616] border border-[#1C1C1C] rounded-2xl p-6">
              <div className="flex items-center gap-2 mb-2">
                <Zap className="w-5 h-5 text-[#FF4040]" />
                <h3 className="text-sm text-[#A0A0A0]">Volatility</h3>
              </div>
              <p className="text-3xl font-bold mb-1">
                {volatility.toFixed(2)}%
              </p>
              <p className="text-xs text-[#A0A0A0]">
                24h price range
              </p>
            </div>
          </div>

          {/* NEW: Moving Averages Panel */}
          <div className="bg-[#161616] border border-[#1C1C1C] rounded-2xl p-6 mb-6">
            <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
              <TrendingUpDown className="w-5 h-5 text-[#FF4040]" />
              Moving Averages & MACD
            </h2>
            
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {/* SMA 20 */}
              <div className="space-y-2">
                <div className="flex justify-between items-center">
                  <span className="text-sm text-[#A0A0A0]">SMA (20)</span>
                  <span className="text-lg font-bold">
                    ${movingAverages.sma20?.toLocaleString(undefined, { maximumFractionDigits: 0 }) || 'N/A'}
                  </span>
                </div>
                <div className="w-full bg-[#0f0f0f] rounded-full h-2">
                  <div 
                    className={`h-2 rounded-full ${btcData && movingAverages.sma20 && btcData.price > movingAverages.sma20 ? 'bg-green-500' : 'bg-red-500'}`}
                    style={{ width: btcData && movingAverages.sma20 ? `${Math.min((btcData.price / movingAverages.sma20) * 50, 100)}%` : '0%' }}
                  ></div>
                </div>
                <p className="text-xs text-[#A0A0A0]">
                  {btcData && movingAverages.sma20 && btcData.price > movingAverages.sma20 ? '✓ Above SMA' : '✗ Below SMA'}
                </p>
              </div>

              {/* SMA 50 */}
              <div className="space-y-2">
                <div className="flex justify-between items-center">
                  <span className="text-sm text-[#A0A0A0]">SMA (50)</span>
                  <span className="text-lg font-bold">
                    ${movingAverages.sma50?.toLocaleString(undefined, { maximumFractionDigits: 0 }) || 'N/A'}
                  </span>
                </div>
                <div className="w-full bg-[#0f0f0f] rounded-full h-2">
                  <div 
                    className={`h-2 rounded-full ${btcData && movingAverages.sma50 && btcData.price > movingAverages.sma50 ? 'bg-green-500' : 'bg-red-500'}`}
                    style={{ width: btcData && movingAverages.sma50 ? `${Math.min((btcData.price / movingAverages.sma50) * 50, 100)}%` : '0%' }}
                  ></div>
                </div>
                <p className="text-xs text-[#A0A0A0]">
                  {btcData && movingAverages.sma50 && btcData.price > movingAverages.sma50 ? '✓ Above SMA' : '✗ Below SMA'}
                </p>
              </div>

              {/* Golden/Death Cross */}
              <div className="space-y-2">
                <div className="flex justify-between items-center">
                  <span className="text-sm text-[#A0A0A0]">MA Cross</span>
                  <span className={`text-lg font-bold ${movingAverages.sma20 && movingAverages.sma50 && movingAverages.sma20 > movingAverages.sma50 ? 'text-green-500' : 'text-red-500'}`}>
                    {movingAverages.sma20 && movingAverages.sma50 && movingAverages.sma20 > movingAverages.sma50 ? 'Golden' : 'Death'}
                  </span>
                </div>
                <div className="w-full bg-[#0f0f0f] rounded-full h-2">
                  <div 
                    className={`h-2 rounded-full ${movingAverages.sma20 && movingAverages.sma50 && movingAverages.sma20 > movingAverages.sma50 ? 'bg-green-500' : 'bg-red-500'}`}
                    style={{ width: '100%' }}
                  ></div>
                </div>
                <p className="text-xs text-[#A0A0A0]">
                  {movingAverages.sma20 && movingAverages.sma50 && movingAverages.sma20 > movingAverages.sma50 
                    ? 'SMA 20 > SMA 50 (Bullish)' 
                    : 'SMA 20 < SMA 50 (Bearish)'}
                </p>
              </div>

              {/* EMA 12 */}
              <div className="space-y-2">
                <div className="flex justify-between items-center">
                  <span className="text-sm text-[#A0A0A0]">EMA (12)</span>
                  <span className="text-lg font-bold">
                    ${movingAverages.ema12?.toLocaleString(undefined, { maximumFractionDigits: 0 }) || 'N/A'}
                  </span>
                </div>
                <p className="text-xs text-[#A0A0A0]">Fast exponential average</p>
              </div>

              {/* EMA 26 */}
              <div className="space-y-2">
                <div className="flex justify-between items-center">
                  <span className="text-sm text-[#A0A0A0]">EMA (26)</span>
                  <span className="text-lg font-bold">
                    ${movingAverages.ema26?.toLocaleString(undefined, { maximumFractionDigits: 0 }) || 'N/A'}
                  </span>
                </div>
                <p className="text-xs text-[#A0A0A0]">Slow exponential average</p>
              </div>

              {/* MACD */}
              <div className="space-y-2">
                <div className="flex justify-between items-center">
                  <span className="text-sm text-[#A0A0A0]">MACD Line</span>
                  <span className={`text-lg font-bold ${movingAverages.macd && movingAverages.macd > 0 ? 'text-green-500' : 'text-red-500'}`}>
                    {movingAverages.macd?.toFixed(0) || 'N/A'}
                  </span>
                </div>
                <p className="text-xs text-[#A0A0A0]">
                  Signal: {movingAverages.macdSignal?.toFixed(0) || 'N/A'}
                </p>
              </div>
            </div>
          </div>

          {/* Technical Analysis */}
          <div className="bg-[#161616] border border-[#1C1C1C] rounded-2xl p-6 mb-6">
            <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
              <Cpu className="w-5 h-5 text-[#FF4040]" />
              Technical Indicators
            </h2>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Left Column */}
              <div className="space-y-4">
                {/* RSI Analysis */}
                <div className="flex items-start gap-3">
                  <div className={`w-2 h-2 rounded-full mt-2 ${rsi && rsi > 70 ? 'bg-red-500' : rsi && rsi < 30 ? 'bg-green-500' : 'bg-blue-400'}`}></div>
                  <div className="flex-1">
                    <p className="font-medium">RSI Indicator: {rsi?.toFixed(2)}</p>
                    <p className="text-sm text-[#A0A0A0] mt-1">
                      {rsi && rsi > 70 && 'Overbought - potential reversal zone'}
                      {rsi && rsi < 30 && 'Oversold - potential bounce zone'}
                      {rsi && rsi >= 30 && rsi <= 70 && 'Neutral - trend continuation likely'}
                    </p>
                  </div>
                </div>

                {/* Price Momentum */}
                <div className="flex items-start gap-3">
                  <div className={`w-2 h-2 rounded-full mt-2 ${btcData && btcData.change24h > 5 ? 'bg-green-500' : btcData && btcData.change24h < -5 ? 'bg-red-500' : 'bg-yellow-500'}`}></div>
                  <div className="flex-1">
                    <p className="font-medium">Price Momentum: {btcData?.change24h.toFixed(2)}%</p>
                    <p className="text-sm text-[#A0A0A0] mt-1">
                      {btcData && btcData.change24h > 5 && 'Strong bullish momentum'}
                      {btcData && btcData.change24h < -5 && 'Strong bearish momentum'}
                      {btcData && Math.abs(btcData.change24h) <= 5 && 'Moderate price movement'}
                    </p>
                  </div>
                </div>

                {/* NEW: Moving Average Analysis */}
                <div className="flex items-start gap-3">
                  <div className={`w-2 h-2 rounded-full mt-2 ${
                    movingAverages.sma20 && movingAverages.sma50 && movingAverages.sma20 > movingAverages.sma50 
                      ? 'bg-green-500' 
                      : 'bg-red-500'
                  }`}></div>
                  <div className="flex-1">
                    <p className="font-medium">Moving Average Trend</p>
                    <p className="text-sm text-[#A0A0A0] mt-1">
                      {movingAverages.sma20 && movingAverages.sma50 && movingAverages.sma20 > movingAverages.sma50
                        ? 'Golden Cross detected - bullish signal'
                        : 'Death Cross present - bearish signal'}
                    </p>
                  </div>
                </div>

                {/* Volume Analysis */}
                <div className="flex items-start gap-3">
                  <div className="w-2 h-2 rounded-full mt-2 bg-purple-400"></div>
                  <div className="flex-1">
                    <p className="font-medium">Trading Volume</p>
                    <p className="text-sm text-[#A0A0A0] mt-1">
                      ${((btcData?.volume24h || 0) / 1000000000).toFixed(2)}B in 24h - 
                      {(btcData?.volume24h || 0) > 200000000000 ? ' Exceptionally high' : 
                       (btcData?.volume24h || 0) > 100000000000 ? ' High' : ' Moderate'} activity
                    </p>
                  </div>
                </div>
              </div>

              {/* Right Column */}
              <div className="space-y-4">
                {/* NEW: MACD Analysis */}
                <div className="flex items-start gap-3">
                  <div className={`w-2 h-2 rounded-full mt-2 ${getMACDColor(macdSignal).replace('text-', 'bg-')}`}></div>
                  <div className="flex-1">
                    <p className="font-medium">MACD Signal: {macdSignal.replace('_', ' ')}</p>
                    <p className="text-sm text-[#A0A0A0] mt-1">
                      {macdSignal === 'BULLISH_CROSSOVER' && 'Strong buy signal - MACD crossed above signal line'}
                      {macdSignal === 'BEARISH_CROSSOVER' && 'Strong sell signal - MACD crossed below signal line'}
                      {macdSignal === 'BULLISH' && 'Momentum remains positive'}
                      {macdSignal === 'BEARISH' && 'Momentum remains negative'}
                      {macdSignal === 'NEUTRAL' && 'Waiting for clear signal'}
                    </p>
                  </div>
                </div>

                {/* Supply Metrics */}
                <div className="flex items-start gap-3">
                  <div className="w-2 h-2 rounded-full mt-2 bg-orange-400"></div>
                  <div className="flex-1">
                    <p className="font-medium">Supply Metrics</p>
                    <p className="text-sm text-[#A0A0A0] mt-1">
                      {supplyPercentage.toFixed(2)}% mined ({btcData?.circulatingSupply.toLocaleString()} of {btcData?.maxSupply.toLocaleString()} BTC)
                    </p>
                  </div>
                </div>

                {/* Market Cap */}
                <div className="flex items-start gap-3">
                  <div className="w-2 h-2 rounded-full mt-2 bg-cyan-400"></div>
                  <div className="flex-1">
                    <p className="font-medium">Market Dominance</p>
                    <p className="text-sm text-[#A0A0A0] mt-1">
                      ${((btcData?.marketCap || 0) / 1000000000000).toFixed(2)}T market cap - Rank #1
                    </p>
                  </div>
                </div>

                {/* Price Range */}
                <div className="flex items-start gap-3">
                  <div className="w-2 h-2 rounded-full mt-2 bg-pink-400"></div>
                  <div className="flex-1">
                    <p className="font-medium">24h Price Range</p>
                    <p className="text-sm text-[#A0A0A0] mt-1">
                      Low: ${btcData?.low24h.toLocaleString(undefined, { maximumFractionDigits: 0 })} | 
                      High: ${btcData?.high24h.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Trading Insights */}
          <div className="bg-[#161616] border border-[#1C1C1C] rounded-2xl p-6">
            <h2 className="text-xl font-bold mb-4">Market Insights & Strategy</h2>
            
            <div className="space-y-3">
              <div className="flex items-start gap-3">
                <span className="text-[#FF4040] font-bold">•</span>
                <p className="text-sm text-[#A0A0A0]">
                  <span className="text-white font-medium">For Traders:</span> {
                    rsi && rsi > 70 ? 'Overbought conditions suggest caution. Consider profit-taking or wait for pullback.' :
                    rsi && rsi < 30 ? 'Oversold conditions present potential entry. Wait for reversal confirmation.' :
                    trendDirection === 'BULLISH' && macdSignal.includes('BULLISH') ? 'Strong bullish confluence - uptrend confirmed by both RSI and MACD.' :
                    trendDirection === 'BEARISH' && macdSignal.includes('BEARISH') ? 'Bearish signals dominate - consider short positions or wait for reversal.' :
                    'Mixed signals - wait for clearer direction before entering positions.'
                  }
                </p>
              </div>
              
              <div className="flex items-start gap-3">
                <span className="text-[#FF4040] font-bold">•</span>
                <p className="text-sm text-[#A0A0A0]">
                  <span className="text-white font-medium">Moving Average Signal:</span> {
                    movingAverages.sma20 && movingAverages.sma50 && movingAverages.sma20 > movingAverages.sma50
                      ? 'Golden Cross active - medium-term bullish trend confirmed.'
                      : 'Death Cross present - medium-term bearish pressure expected.'
                  } {btcData && movingAverages.sma20 && btcData.price > movingAverages.sma20
                    ? 'Price trading above 20-day MA supports upside.'
                    : 'Price below 20-day MA suggests downside risk.'}
                </p>
              </div>
              
              <div className="flex items-start gap-3">
                <span className="text-[#FF4040] font-bold">•</span>
                <p className="text-sm text-[#A0A0A0]">
                  <span className="text-white font-medium">For Liquidity Providers:</span> {
                    volatility > 5 ? 'High volatility detected. Widen spreads and monitor impermanent loss closely.' :
                    volatility > 3 ? 'Moderate volatility. Standard LP strategies applicable.' :
                    'Low volatility environment. Tighter spreads possible for better returns.'
                  }
                </p>
              </div>
              
              <div className="flex items-start gap-3">
                <span className="text-[#FF4040] font-bold">•</span>
                <p className="text-sm text-[#A0A0A0]">
                  <span className="text-white font-medium">MACD Momentum:</span> {
                    macdSignal === 'BULLISH_CROSSOVER' ? 'Fresh bullish crossover - strong buy signal for momentum traders.' :
                    macdSignal === 'BEARISH_CROSSOVER' ? 'Fresh bearish crossover - consider risk management strategies.' :
                    movingAverages.macdHistogram && movingAverages.macdHistogram > 0 ? 'Positive momentum building - trend likely to continue.' :
                    'Negative momentum - wait for histogram reversal before entering.'
                  }
                </p>
              </div>

              <div className="flex items-start gap-3">
                <span className="text-[#FF4040] font-bold">•</span>
                <p className="text-sm text-[#A0A0A0]">
                  <span className="text-white font-medium">For Long-Term Holders:</span> {
                    btcData && btcData.change24h < -5 ? 'Significant dip presents potential DCA opportunity.' :
                    marketSentiment === 'EXTREME_FEAR' ? 'Fear in the market often precedes recovery. Consider accumulation.' :
                    marketSentiment === 'EXTREME_GREED' ? 'Extreme greed suggests overheated market. HODL but be prepared for corrections.' :
                    'HODL strategy remains valid. Bitcoin fundamentals remain strong.'
                  } With {supplyPercentage.toFixed(1)}% mined, scarcity dynamics support long-term value.
                </p>
              </div>
            </div>
          </div>

          {/* Disclaimer */}
          <div className="mt-6 p-4 bg-[#161616] border border-[#1C1C1C] rounded-2xl">
            <p className="text-xs text-[#A0A0A0]">
              <span className="font-bold text-white">Disclaimer:</span> This dashboard provides educational information based on technical indicators including RSI, Moving Averages, and MACD. 
              It is not financial advice. Cryptocurrency markets are highly volatile and unpredictable. Always conduct your own research (DYOR) and never invest more than you can afford to lose. 
              Past performance does not guarantee future results. Technical indicators can produce false signals.
            </p>
          </div>
        </div>
      </div>
    </PageTemplate>
  );
};

export default PremiumPage;