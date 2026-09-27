import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { getContactChannel, setContactChannel } from "@/lib/messaging.functions";
import { toE164 } from "@/lib/phone";

const OPTIONS = [
  ["email", "Email"],
  ["sms", "Text"],
  ["both", "Both"],
  ["in_app", "In-app only"],
] as const;

/** Chooses where out-of-app notifications go. In-app notifications are always on. */
export function ContactChannelSettings({ audience }: { audience: "driver" | "provider" }) {
  const qc = useQueryClient();
  const load = useServerFn(getContactChannel);
  const save = useServerFn(setContactChannel);
  const key = ["contact-channel", audience];
  const { data } = useQuery({ queryKey: key, queryFn: () => load({ data: { audience } }) });
  const [channel, setChannel] = useState("email");
  const [phone, setPhone] = useState("");
  const [consent, setConsent] = useState(false);
  useEffect(() => {
    if (data?.available) {
      setChannel(data.channel);
      setPhone(data.phone);
      setConsent(data.consented);
    }
  }, [data]);
  const mut = useMutation({
    mutationFn: () => save({ data: { audience, channel: channel as "email", phone, consent } }),
    onSuccess: () => {
      toast.success("Notification settings saved");
      qc.invalidateQueries({ queryKey: key });
    },
    onError: (e) => toast.error((e as Error).message),
  });
  if (data && !data.available) return null;
  const texts = channel === "sms" || channel === "both";
  const phoneBad = texts && phone.trim() !== "" && !toE164(phone);

  return (
    <div className="space-y-4 rounded-2xl border border-border/70 bg-card p-5">
      <div>
        <p className="text-sm font-medium text-foreground">How should we reach you?</p>
        <p className="mt-1 text-xs text-muted-foreground">In-app notifications are always on.</p>
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {OPTIONS.map(([v, label]) => (
          <button
            key={v}
            type="button"
            disabled={!data}
            onClick={() => setChannel(v)}
            className={`rounded-full border px-3 py-2 text-sm transition ${channel === v ? "border-primary bg-primary text-primary-foreground" : "border-border bg-background text-foreground"}`}
          >
            {label}
          </button>
        ))}
      </div>
      {texts && (
        <div className="space-y-3">
          <Input type="tel" inputMode="tel" autoComplete="tel" placeholder="(555) 123-4567" value={phone} onChange={(e) => setPhone(e.target.value)} className="h-11" />
          {phoneBad && <p className="text-sm text-destructive">Enter a valid mobile number.</p>}
          <label className="flex items-start gap-3 text-sm leading-relaxed text-muted-foreground">
            <input type="checkbox" className="mt-1 h-4 w-4 accent-[var(--primary)]" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
            <span>I agree to receive text messages from Repara about service requests, messages and quotes. Message and data rates may apply. Reply STOP to opt out.</span>
          </label>
        </div>
      )}
      <Button onClick={() => mut.mutate()} disabled={!data || mut.isPending || phoneBad || (texts && (!consent || !phone.trim()))}>
        {mut.isPending ? "Saving…" : "Save"}
      </Button>
    </div>
  );
}
