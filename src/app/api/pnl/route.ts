import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

// Define the Position type based on Prisma schema
interface Position {
  id: string;
  poolAddress: string;
  zbtcAmount: {
    toString(): string;
  };
  entryPrice: {
    toString(): string;
  };
  pnlUsd: {
    toString(): string;
  } | null;
  pnlPercent: {
    toString(): string;
  } | null;
  createdAt: Date;
  isActive: boolean;
}

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const publicKey = searchParams.get('publicKey');

    if (!publicKey) {
      return NextResponse.json({ error: 'Public key required' }, { status: 400 });
    }

    const wallet = await prisma.wallet.findUnique({
      where: { publicKey },
      include: {
        user: {
          include: {
            stats: true,
            positions: {
              where: { isActive: true },
              orderBy: { createdAt: 'desc' }
            }
          }
        }
      }
    });

    if (!wallet) {
      return NextResponse.json({ 
        totalPnlUsd: '0',
        totalPositions: 0,
        activePositions: 0,
        positions: []
      });
    }

    const stats = wallet.user.stats;
    const positions = wallet.user.positions as Position[];

    return NextResponse.json({
      totalPnlUsd: stats?.totalPnlUsd?.toString() || '0',
      totalPositions: stats?.totalPositions || 0,
      activePositions: stats?.activePositions || 0,
      avgPositionSize: stats?.avgPositionSize?.toString() || '0',
      positions: positions.map((p) => ({
        id: p.id,
        poolAddress: p.poolAddress,
        zbtcAmount: p.zbtcAmount.toString(),
        entryPrice: p.entryPrice.toString(),
        pnlUsd: p.pnlUsd?.toString() || '0',
        pnlPercent: p.pnlPercent?.toString() || '0',
        createdAt: p.createdAt.toISOString()
      }))
    });
  } catch (error) {
    console.error('Error fetching PnL data:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}