import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

import { Switch } from "@/components/ui/switch";
import { getNotificationPreferences, setNotificationPreference } from "@/lib/messaging.functions";

/**
 * Per-event email switches, stored as `email.<event>` keys so SMS can be added
 * later as `sms.<event>` without changing the model. Default is on.
 */
export function EmailPreferences({ items }: { items: [event: string, label: string][] }) {
  const qc = useQueryClient();
  const load = useServerFn(getNotificationPreferences);
  const save = useServerFn(setNotificationPreference);
  const { data } = useQuery({ queryKey: ["notification-prefs"], queryFn: () => load({}) });
  const mut = useMutation({
    mutationFn: (v: { key: string; enabled: boolean }) => save({ data: v }),
    onSuccess: (r) => qc.setQueryData(["notification-prefs"], r),
    onError: (e) => toast.error((e as Error).message),
  });
  const prefs = data?.preferences ?? {};
  return (
    <div className="divide-y divide-border/60 rounded-2xl border border-border/70 bg-card px-5">
      {items.map(([event, label]) => {
        const key = `email.${event}`;
        return (
          <div key={key} className="flex items-center justify-between py-4">
            <span className="text-sm text-foreground">{label}</span>
            <Switch
              checked={prefs[key] !== false}
              disabled={!data || mut.isPending}
              onCheckedChange={(enabled) => mut.mutate({ key, enabled })}
            />
          </div>
        );
      })}
    </div>
  );
}
