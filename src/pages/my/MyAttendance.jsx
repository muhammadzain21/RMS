import { CalendarCheck } from 'lucide-react'
import { useMyWork, StatCard, Panel, Chip, Empty, inRange } from './myWorkShared.jsx'

export default function MyAttendance() {
  const { data, from, to } = useMyWork()
  const att = inRange(data?.attendance, from, to)
  const present = att.filter(r => r.status === 'Present').length
  const late = att.filter(r => r.status === 'Late').length
  const absent = att.filter(r => r.status === 'Absent').length
  const leave = att.filter(r => r.status === 'Leave').length

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-extrabold text-[var(--color-text-primary)]">Attendance</h2>
        <p className="text-sm font-semibold text-[var(--color-text-muted)]">Your daily presence · {from} → {to}</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard title="Present" value={present} icon={CalendarCheck} iconColor="bg-emerald-500" />
        <StatCard title="Late" value={late} icon={CalendarCheck} iconColor="bg-amber-500" />
        <StatCard title="Absent" value={absent} icon={CalendarCheck} iconColor="bg-rose-500" />
        <StatCard title="Leave" value={leave} icon={CalendarCheck} iconColor="bg-blue-500" />
      </div>

      <Panel title="Attendance register">
        <div className="overflow-x-auto">
          <table className="tbl">
            <thead>
              <tr>
                <th>Date</th>
                <th>Status</th>
                <th>Check In</th>
                <th>Check Out</th>
                <th className="text-right">Late (min)</th>
              </tr>
            </thead>
            <tbody>
              {att.length === 0 && (
                <tr><td colSpan={5}><Empty text="No attendance records for this date range" /></td></tr>
              )}
              {att.map((r, i) => (
                <tr key={i}>
                  <td className="font-semibold">{r.date}</td>
                  <td>
                    <Chip color={r.status === 'Present' ? 'green' : r.status === 'Late' ? 'amber' : r.status === 'Leave' ? 'blue' : 'red'}>
                      {r.status || '-'}
                    </Chip>
                  </td>
                  <td className="font-medium">{r.checkIn || '-'}</td>
                  <td className="font-medium">{r.checkOut || '-'}</td>
                  <td className="text-right font-semibold">{r.lateMinutes ?? '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
    </div>
  )
}
