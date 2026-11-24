import DailyStockView from '@features/inventory/components/DailyStockView.jsx'

/**
 * Route page: enter physical counts and freeze daily inventory snapshot.
 * UI lives in DailyStockView (inventory feature — not sales).
 */
export default function PhysicalStock() {
  return <DailyStockView embedded={false} />
}
