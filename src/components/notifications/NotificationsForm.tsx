"use client";

// The Notifications page: tick which emails you get, pick an option where
// there is one (like PaintScout's), then Save. Below, the alerts that show
// inside the Hub, which are always on.
import { useState } from "react";
import { BellRing, Mail } from "lucide-react";
import { saveNotificationPrefsAction } from "@/app/notifications/actions";
import { GROUP_ORDER, type HubAlert, type ScopeOption } from "@/lib/notifications/catalog";
import { BLUE, RED, Card } from "@/components/dashboard/parts";

export type NotificationChoice = {
  key: string;
  group: string;
  label: string;
  description: string;
  options: ScopeOption[];
  enabled: boolean;
  scope: string | null;
  fixedAddress: string | null;
};

const byGroup = <T extends { group: string }>(items: T[]) =>
  GROUP_ORDER.map((g) => ({ group: g, items: items.filter((i) => i.group === g) })).filter((g) => g.items.length > 0);

export function NotificationsForm({
  choices: initial,
  alerts,
  email,
}: {
  choices: NotificationChoice[];
  alerts: HubAlert[];
  email: string | null;
}) {
  const [choices, setChoices] = useState(initial);
  // What was last saved, to tell whether there are changes.
  const [baseline, setBaseline] = useState(initial);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const dirty = choices.some((c, i) => c.enabled !== baseline[i].enabled || c.scope !== baseline[i].scope);

  const set = (key: string, patch: Partial<NotificationChoice>) => {
    setSaved(false);
    setChoices((cs) => cs.map((c) => (c.key === key ? { ...c, ...patch } : c)));
  };

  async function save() {
    setSaving(true);
    setError(null);
    const result = await saveNotificationPrefsAction(choices.map((c) => ({ key: c.key, enabled: c.enabled, scope: c.scope })));
    setSaving(false);
    if (result.error) return setError(result.error);
    setBaseline(choices);
    setSaved(true);
  }

  if (choices.length === 0 && alerts.length === 0) {
    return (
      <Card className="p-5 text-sm text-[#5B6472]">There are no notifications for your role.</Card>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {choices.length > 0 && (
        <section aria-label="Emails" className="flex flex-col gap-4">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 className="flex items-center gap-2 text-lg font-bold text-[#16202E]">
                <Mail className="h-5 w-5" /> Emails
              </h2>
              <p className="text-sm text-[#5B6472]">
                Sent to {email ? <span className="font-medium text-[#16202E]">{email}</span> : "your email address"}.
              </p>
            </div>
            <div className="flex items-center gap-3">
              {saved && !dirty && <span className="text-sm font-medium text-[#1F4E8C]">Saved</span>}
              {error && (
                <span className="text-sm font-semibold" style={{ color: RED }}>
                  {error}
                </span>
              )}
              <button
                type="button"
                onClick={save}
                disabled={saving || !dirty}
                className="rounded-lg px-4 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50"
                style={{ background: BLUE }}
              >
                {saving ? "Saving…" : "Save changes"}
              </button>
            </div>
          </div>

          {byGroup(choices).map(({ group, items }) => (
            <Card key={group} className="overflow-hidden">
              <h3 className="border-b border-[#EFEDE7] bg-[#F5F4F0] px-4 py-2.5 text-sm font-semibold text-[#16202E]">
                {group}
              </h3>
              <ul className="divide-y divide-[#EFEDE7]">
                {items.map((c) => (
                  <li key={c.key} className="px-4 py-3.5">
                    <label className="flex cursor-pointer items-start gap-3">
                      <input
                        type="checkbox"
                        checked={c.enabled}
                        onChange={(e) => set(c.key, { enabled: e.target.checked })}
                        className="mt-0.5 h-4 w-4 accent-[#1F4E8C]"
                      />
                      <span>
                        <span className="block font-medium text-[#16202E]">{c.label}</span>
                        <span className="block text-sm text-[#5B6472]">{c.description}</span>
                        {c.fixedAddress && (
                          <span className="block text-xs text-[#8A919C]">
                            Always goes to {c.fixedAddress} as well. Tick to get a copy yourself.
                          </span>
                        )}
                      </span>
                    </label>
                    {c.options.length > 0 && (
                      <div
                        role="radiogroup"
                        aria-label={`${c.label}: which`}
                        className={`ml-7 mt-2 flex flex-wrap gap-x-5 gap-y-1.5 ${c.enabled ? "" : "opacity-50"}`}
                      >
                        {c.options.map((o) => (
                          <label key={o.value} className="flex cursor-pointer items-center gap-2 text-sm text-[#16202E]">
                            <input
                              type="radio"
                              name={`${c.key}-scope`}
                              checked={c.scope === o.value}
                              disabled={!c.enabled}
                              onChange={() => set(c.key, { scope: o.value })}
                              className="h-4 w-4 accent-[#1F4E8C]"
                            />
                            {o.label}
                          </label>
                        ))}
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            </Card>
          ))}
        </section>
      )}

      {alerts.length > 0 && (
        <section aria-label="In the Hub" className="flex flex-col gap-4">
          <div>
            <h2 className="flex items-center gap-2 text-lg font-bold text-[#16202E]">
              <BellRing className="h-5 w-5" /> In the Hub
            </h2>
            <p className="text-sm text-[#5B6472]">
              These show as red counts and banners where the work gets done. They&apos;re always on.
            </p>
          </div>
          {byGroup(alerts).map(({ group, items }) => (
            <Card key={group} className="overflow-hidden">
              <h3 className="border-b border-[#EFEDE7] bg-[#F5F4F0] px-4 py-2.5 text-sm font-semibold text-[#16202E]">
                {group}
              </h3>
              <ul className="divide-y divide-[#EFEDE7]">
                {items.map((a) => (
                  <li key={a.label} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5 px-4 py-3">
                    <span className="font-medium text-[#16202E]">{a.label}</span>
                    <span className="text-sm text-[#5B6472]">{a.where}</span>
                  </li>
                ))}
              </ul>
            </Card>
          ))}
        </section>
      )}
    </div>
  );
}
