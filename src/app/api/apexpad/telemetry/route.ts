import { NextResponse } from 'next/server';
import { getEngine, PROJECT_SLUG } from '@/server/apexpad/engine';

export async function GET() {
  try {
    const engine = await getEngine();
    const telemetry = await engine.modelAdapter.getDashboardTelemetry(PROJECT_SLUG);
    return NextResponse.json(telemetry);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
