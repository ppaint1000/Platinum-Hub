import { requireAdmin } from '@/lib/timesheets/authGuards'
import { groupPayHoursBySiteAndStaff } from '@/lib/timesheets/reportGroups'

export default async function HoursByJobPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}) {
  await requireAdmin()

  const sp = await searchParams
  const from = typeof sp.from === 'string' ? sp.from : ''
  const to = typeof sp.to === 'string' ? sp.to : ''

  const jobs = await groupPayHoursBySiteAndStaff({ from, to })
  const grandTotal = jobs.reduce((sum, j) => sum + j.totalHours, 0)

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Hours by Job</h1>
        <p className="text-sm text-black/60">
          Paid hours per staff member per job, rounded to the nearest half hour (clock-in rounds
          up, clock-out rounds down).
        </p>
      </div>

      <form className="flex flex-wrap items-end gap-3 rounded-lg border border-black/10 p-4">
        <div className="space-y-1">
          <label htmlFor="from" className="text-sm font-medium">
            From
          </label>
          <input
            id="from"
            name="from"
            type="date"
            defaultValue={from}
            className="rounded-md border border-black/20 px-3 py-2"
          />
        </div>
        <div className="space-y-1">
          <label htmlFor="to" className="text-sm font-medium">
            To
          </label>
          <input
            id="to"
            name="to"
            type="date"
            defaultValue={to}
            className="rounded-md border border-black/20 px-3 py-2"
          />
        </div>
        <button type="submit" className="rounded-md border border-black/20 px-4 py-2 text-sm">
          Filter
        </button>
      </form>

      <p className="text-sm text-black/60">
        {jobs.length} job{jobs.length === 1 ? '' : 's'} · {grandTotal.toFixed(2)} total hours
      </p>

      <div className="space-y-4">
        {jobs.map((job) => (
          <div key={job.siteName} className="overflow-hidden rounded-lg border border-black/10">
            <div className="flex items-center justify-between bg-black/5 px-4 py-2">
              <h2 className="font-medium">{job.siteName}</h2>
              <p className="text-sm text-black/60">{job.totalHours.toFixed(2)} hours</p>
            </div>
            <table className="w-full text-left text-sm">
              <thead className="border-b border-black/10">
                <tr>
                  <th className="p-3">Staff</th>
                  <th className="p-3">Hours</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-black/10">
                {job.staff.map((s) => (
                  <tr key={s.userName}>
                    <td className="p-3">{s.userName}</td>
                    <td className="p-3">{s.hours.toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}

        {jobs.length === 0 && (
          <p className="rounded-lg border border-black/10 p-6 text-center text-black/60">
            No completed shifts match these filters.
          </p>
        )}
      </div>
    </div>
  )
}
