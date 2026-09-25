import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { ChevronRight, Loader2, Plus } from "lucide-react";
import { toast } from "sonner";

import { CardSkeletons, LoadError } from "@/components/garage/GarageSkeletons";
import { Button } from "@/components/ui/button";
import { PRESETS, type Preset } from "@/lib/build-catalog";
import { createBuild, listBuilds, type BuildSummary } from "@/lib/builds.functions";

export function buildCounts(build: BuildSummary) {
  const by = (s: string) => build.modifications.filter((m) => m.status === s).length;
  return { planned: by("planned"), requested: by("requested"), quoted: by("quoted"), installed: by("installed") + by("verified") };
}

export function buildProgressLine(build: BuildSummary) {
  const c = buildCounts(build);
  const parts = [
    c.planned ? `${c.planned} planned` : null,
    c.requested ? `${c.requested} quote requested` : null,
    c.quoted ? `${c.quoted} quoted` : null,
    c.installed ? `${c.installed} installed` : null,
  ].filter(Boolean);
  return parts.length ? parts.join(" · ") : "No modifications yet";
}

export function useBuilds(vehicleId: string) {
  const load = useServerFn(listBuilds);
  return useQuery({ queryKey: ["builds", vehicleId], queryFn: () => load({ data: { vehicleId } }) });
}

export function BuildsPanel({ vehicleId }: { vehicleId: string }) {
  const { data, isLoading, isError, refetch } = useBuilds(vehicleId);
  const create = useServerFn(createBuild);
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const mutation = useMutation({
    mutationFn: (preset: Preset) =>
      create({ data: { vehicleId, preset, name: PRESETS.find((p) => p.key === preset)?.label ?? "Custom" } }),
    onSuccess: async (row) => {
      await queryClient.invalidateQueries({ queryKey: ["builds", vehicleId] });
      void navigate({ to: "/garage/build/$buildId", params: { buildId: row.id } });
    },
    onError: (e) => toast.error((e as Error).message),
  });

  if (isLoading) return <CardSkeletons rows={2} />;
  if (isError) return <LoadError message="Couldn't load your builds right now." onRetry={() => void refetch()} />;

  const builds = data?.builds ?? [];

  return (
    <div className="space-y-6">
      <p className="text-sm text-muted-foreground">
        A build is a plan for your car. Nothing here changes your vehicle until the work is actually done.
      </p>

      {builds.length > 0 && (
        <div className="space-y-3">
          {builds.map((build) => (
            <Link
              key={build.id}
              to="/garage/build/$buildId"
              params={{ buildId: build.id }}
              className="flex items-center justify-between gap-3 rounded-2xl border border-border/60 bg-card p-4 transition-colors hover:border-border"
            >
              <span className="min-w-0">
                <span className="flex items-center gap-2">
                  <span className="truncate text-base font-semibold text-foreground">{build.name}</span>
                  {build.isActive && (
                    <span className="rounded-full bg-primary/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-primary">
                      Active
                    </span>
                  )}
                </span>
                <span className="mt-0.5 block text-sm text-muted-foreground">{buildProgressLine(build)}</span>
              </span>
              <ChevronRight className="h-5 w-5 shrink-0 text-muted-foreground" aria-hidden />
            </Link>
          ))}
        </div>
      )}

      <div>
        <p className="mb-2 text-sm font-medium text-foreground">{builds.length ? "Create another build" : "Start a build"}</p>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
          {PRESETS.map((preset) => (
            <Button
              key={preset.key}
              variant="outline"
              className="h-11"
              disabled={mutation.isPending}
              onClick={() => mutation.mutate(preset.key)}
            >
              {mutation.isPending && mutation.variables === preset.key ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              ) : (
                <Plus className="h-4 w-4" aria-hidden />
              )}
              {preset.label}
            </Button>
          ))}
        </div>
      </div>
    </div>
  );
}
