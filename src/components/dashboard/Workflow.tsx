// The work as it flows (like Jobber's home screen): each stage's main number,
// and underneath what's waiting there - every number opens that list. Then
// this week at a glance: the jobs on the go, and money invoiced but not paid.
import Link from "next/link";
import type { WorkflowData } from "@/lib/dashboard/workflow";
import { Card, SectionHeading, money } from "./parts";

function Stage({
  title,
  href,
  value,
  valueLabel,
  lines,
}: {
  title: string;
  href: string;
  value: number;
  valueLabel: string;
  lines: { label: string; value: number }[];
}) {
  return (
    <Link href={href} className="group block">
      <Card className="h-full p-4 transition group-hover:border-[#9DB6D9]">
        <p className="text-sm font-semibold text-[#1F4E8C]">{title}</p>
        <p className="mt-1 text-3xl font-bold text-[#16202E]">{value}</p>
        <p className="text-xs font-semibold text-[#5B6472]">{valueLabel}</p>
        <ul className="mt-3 space-y-1 border-t border-[#EFEDE7] pt-2 text-sm text-[#3F4753]">
          {lines.map((l) => (
            <li key={l.label} className="flex justify-between gap-2">
              <span>{l.label}</span>
              <span className={l.value > 0 ? "font-semibold text-[#16202E]" : "text-[#8A919C]"}>{l.value}</span>
            </li>
          ))}
        </ul>
      </Card>
    </Link>
  );
}

export function WorkflowSection({ w }: { w: WorkflowData }) {
  return (
    <section aria-label="Workflow" className="flex flex-col gap-3">
      <SectionHeading title="Workflow" />
      <div className="grid grid-cols-2 gap-2.5 md:gap-4 lg:grid-cols-5">
        <Stage
          title="Requests"
          href="/requests"
          value={w.requests.new}
          valueLabel="New - not contacted yet"
          lines={[{ label: "Contacted", value: w.requests.contacted }]}
        />
        <Stage
          title="Site measures"
          href="/site-measures"
          value={w.measures.readyToCost}
          valueLabel="Finished - ready to cost"
          lines={[{ label: "Being measured", value: w.measures.beingMeasured }]}
        />
        <Stage
          title="Costings"
          href="/costing"
          value={w.costings.toCheck}
          valueLabel="Draft to be checked"
          lines={[{ label: "Drafts", value: w.costings.draft }]}
        />
        <Stage
          title="Proposals"
          href="/costing/proposals"
          value={w.proposals.notOpened + w.proposals.opened}
          valueLabel="Waiting on the customer"
          lines={[
            { label: "Not opened yet", value: w.proposals.notOpened },
            { label: "Opened, not accepted", value: w.proposals.opened },
            { label: "Accepted this month", value: w.proposals.acceptedThisMonth },
          ]}
        />
        <Stage
          title="Jobs"
          href="/production"
          value={w.jobs.readyToInvoice}
          valueLabel="Completed - ready to invoice"
          lines={[
            { label: "To be scheduled", value: w.jobs.toSchedule },
            { label: "Scheduled", value: w.jobs.scheduled },
            { label: "In progress", value: w.jobs.inProgress },
          ]}
        />
      </div>
    </section>
  );
}

export function ThisWeekSection({ w }: { w: WorkflowData }) {
  const shown = w.onTheGo.slice(0, 8);
  return (
    <section aria-label="This week" className="grid gap-4 lg:grid-cols-[2fr_1fr]">
      <div className="flex flex-col gap-3">
        <SectionHeading title="On the go" count={undefined} href="/production" linkLabel="Production board" />
        <Card>
          {shown.length === 0 ? (
            <p className="px-4 py-6 text-sm text-[#5B6472]">No jobs scheduled or in progress.</p>
          ) : (
            <ul className="divide-y divide-[#EFEDE7]">
              {shown.map((j) => (
                <li key={j.id}>
                  <Link href={`/jobs/${j.id}`} className="flex items-center justify-between gap-3 px-4 py-2.5 hover:bg-[#F8FAFD]">
                    <span className="min-w-0">
                      <span className="font-semibold text-[#16202E]">
                        {j.jobNumber ? `${j.jobNumber} · ` : ""}
                        {j.name}
                      </span>
                      {j.client && <span className="block truncate text-sm text-[#5B6472]">{j.client}</span>}
                    </span>
                    <span
                      className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                        j.status === "in_progress" ? "bg-[#E3ECF8] text-[#163A69]" : "bg-[#ECEAE3] text-[#3F4753]"
                      }`}
                    >
                      {j.status === "in_progress" ? "In progress" : "Scheduled"}
                    </span>
                  </Link>
                </li>
              ))}
              {w.onTheGo.length > shown.length && (
                <li className="px-4 py-2 text-sm text-[#5B6472]">
                  and {w.onTheGo.length - shown.length} more on the Production board
                </li>
              )}
            </ul>
          )}
        </Card>
      </div>
      <div className="flex flex-col gap-3">
        <SectionHeading title="Owed to you" />
        <Link href="/production" className="group block">
          <Card className="p-4 transition group-hover:border-[#9DB6D9]">
            <p className="text-3xl font-bold text-[#16202E]">{money(w.owed.value)}</p>
            <p className="mt-1 text-sm text-[#5B6472]">
              {w.owed.count} job{w.owed.count === 1 ? "" : "s"} invoiced, not yet paid
            </p>
            <p className="mt-2 text-xs text-[#8A919C]">At each job&apos;s quoted price + GST. Mark them Paid on the Production board.</p>
          </Card>
        </Link>
      </div>
    </section>
  );
}
