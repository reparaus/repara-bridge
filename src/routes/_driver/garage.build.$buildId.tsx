import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Check, ChevronDown, Copy, Loader2, Pencil, Sparkles, Trash2, X } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { GarageShell, SectionTitle } from "@/components/garage/GarageShell";
import { CardSkeletons, LoadError, VehicleHeroSkeleton } from "@/components/garage/GarageSkeletons";
import { VehicleVisual } from "@/components/garage/VehicleVisual";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { BUILD_CATEGORIES, buildItem, MOD_STATUS_LABEL, serviceRequirements, suggestBuildItems } from "@/lib/build-catalog";
import {
  addModification,
  createBuild,
  getBuild,
  updateBuild,
  updateModification,
} from "@/lib/builds.functions";
import { requestServiceKeyFor, serviceCategoryLabel } from "@/lib/service-network";
import { isServiceKey } from "@/lib/services";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_driver/garage/build/$buildId")({
  head: () => ({
    meta: [
      { title: "Build — Repara" },
      { name: "description", content: "Plan modifications for your car and request real quotes from service providers." },
      { property: "og:title", content: "Build — Repara" },
      { property: "og:description", content: "Plan your build, then get actual pricing." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: BuildPage,
});

const COMPAT_LABEL: Record<string, string> = {
  compatible: "Compatible",
  potentially_compatible: "Potentially compatible",
  requires_verification: "Requires verification",
  not_confirmed: "Fitment not confirmed",
};

function BuildPage() {
  const { buildId } = Route.useParams();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const load = useServerFn(getBuild);
  const add = useServerFn(addModification);
  const update = useServerFn(updateModification);
  const saveBuild = useServerFn(updateBuild);
  const create = useServerFn(createBuild);

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["build", buildId],
    queryFn: () => load({ data: { buildId } }),
  });

  const [openCat, setOpenCat] = useState<string | null>(null);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [idea, setIdea] = useState("");
  const [suggested, setSuggested] = useState<string[] | null>(null);

  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey: ["build", buildId] });
    if (data) await queryClient.invalidateQueries({ queryKey: ["builds", data.build.vehicleId] });
  };

  const addMut = useMutation({
    mutationFn: (v: { category: string; item: string; source?: "owner" | "suggestion" }) =>
      add({ data: { buildId, category: v.category, item: v.item, source: v.source ?? "owner" } }),
    onSuccess: refresh,
    onError: (e) => toast.error((e as Error).message),
  });
  const removeMut = useMutation({
    mutationFn: (id: string) => update({ data: { id, remove: true } }),
    onSuccess: refresh,
    onError: (e) => toast.error((e as Error).message),
  });
  const buildMut = useMutation({
    mutationFn: (patch: { name?: string; makeActive?: boolean; archive?: boolean }) => saveBuild({ data: { buildId, ...patch } }),
    onSuccess: async (_r, patch) => {
      await refresh();
      if (patch.archive && data) void navigate({ to: "/garage/vehicle/$id", params: { id: data.build.vehicleId } });
      setRenaming(null);
    },
    onError: (e) => toast.error((e as Error).message),
  });
  const dupMut = useMutation({
    mutationFn: () =>
      create({
        data: { vehicleId: data!.build.vehicleId, preset: "custom", name: `${data!.build.name} copy`.slice(0, 60), duplicateOf: buildId },
      }),
    onSuccess: async (row) => {
      await refresh();
      void navigate({ to: "/garage/build/$buildId", params: { buildId: row.id } });
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const selected = useMemo(() => new Set(data?.build.modifications.map((m) => m.item) ?? []), [data]);

  if (isError && !data) {
    return (
      <GarageShell>
        <LoadError message="Couldn't load this build right now." onRetry={() => void refetch()} />
      </GarageShell>
    );
  }
  if (isLoading || !data) {
    return (
      <GarageShell>
        <VehicleHeroSkeleton />
        <CardSkeletons rows={3} className="mt-6" />
      </GarageShell>
    );
  }

  const { build, vehicle } = data;
  const open = build.modifications.filter((m) => m.status === "planned");
  const requirements = serviceRequirements(open.map((m) => m.item));
  const vehicleLabel = vehicle ? [vehicle.year, vehicle.make, vehicle.model, vehicle.trim].filter(Boolean).join(" ") : "";
  const firstRequirement = requirements[0];
  const rawService = requestServiceKeyFor(firstRequirement ?? null);
  const requestService = isServiceKey(rawService) ? rawService : undefined;

  const grouped = BUILD_CATEGORIES.map((c) => ({ ...c, mods: build.modifications.filter((m) => m.category === c.key) })).filter(
    (c) => c.mods.length,
  );

  return (
    <GarageShell>
      <Link to="/garage/vehicle/$id" params={{ id: build.vehicleId }} className="text-sm text-muted-foreground hover:text-foreground">
        ← {vehicleLabel || "My car"}
      </Link>

      <div className="mt-3 flex items-start justify-between gap-3">
        {renaming !== null ? (
          <form
            className="flex flex-1 gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (renaming.trim()) buildMut.mutate({ name: renaming.trim() });
            }}
          >
            <Input value={renaming} onChange={(e) => setRenaming(e.target.value)} maxLength={60} className="h-11" autoFocus />
            <Button type="submit" size="icon" className="h-11 w-11" disabled={buildMut.isPending} aria-label="Save name">
              {buildMut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
            </Button>
            <Button type="button" size="icon" variant="ghost" className="h-11 w-11" onClick={() => setRenaming(null)} aria-label="Cancel">
              <X className="h-4 w-4" />
            </Button>
          </form>
        ) : (
          <div>
            <h1 className="text-2xl font-semibold text-foreground">{build.name}</h1>
            <p className="mt-0.5 text-sm text-muted-foreground">{build.isActive ? "Active build" : "Saved build"}</p>
          </div>
        )}
        {renaming === null && (
          <Button size="icon" variant="ghost" aria-label="Rename build" onClick={() => setRenaming(build.name)}>
            <Pencil className="h-4 w-4" />
          </Button>
        )}
      </div>

      {data.builds.length > 1 && (
        <div className="mt-4 flex gap-2 overflow-x-auto pb-1">
          {data.builds.map((b) => (
            <Link
              key={b.id}
              to="/garage/build/$buildId"
              params={{ buildId: b.id }}
              className={cn(
                "shrink-0 rounded-full border px-3.5 py-1.5 text-sm",
                b.id === build.id ? "border-primary bg-primary/10 text-foreground" : "border-border/60 text-muted-foreground",
              )}
            >
              {b.name}
            </Link>
          ))}
        </div>
      )}

      <div className="mt-5 overflow-hidden rounded-3xl border border-border/60 bg-card">
        <VehicleVisual size="hero" year={vehicle?.year} make={vehicle?.make} model={vehicle?.model} trim={vehicle?.trim} className="rounded-b-none" />
        <p className="px-5 py-3 text-xs text-muted-foreground">
          Generic illustration — not your exact car. Build visuals will appear here as matched vehicle imagery becomes available.
        </p>
      </div>

      {/* Driver's own words → generic modification types from the catalog. */}
      <section className="mt-8">
        <SectionTitle>What do you want to do to your car?</SectionTitle>
        <form
          className="space-y-2"
          onSubmit={(e) => {
            e.preventDefault();
            setSuggested(suggestBuildItems(idea));
          }}
        >
          <Textarea
            value={idea}
            onChange={(e) => setIdea(e.target.value)}
            placeholder="e.g. I want it lower with bigger wheels and a louder exhaust"
            rows={2}
            maxLength={500}
          />
          <Button type="submit" variant="outline" className="h-11 w-full" disabled={!idea.trim()}>
            <Sparkles className="h-4 w-4" aria-hidden /> Suggest modifications
          </Button>
        </form>
        {suggested && (
          <div className="mt-3 rounded-2xl border border-border/60 bg-card p-4">
            {suggested.length ? (
              <>
                <p className="text-xs text-muted-foreground">Suggestions based on your words — generic types, not specific products.</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {suggested.map((key) => {
                    const item = buildItem(key)!;
                    const has = selected.has(key);
                    return (
                      <Button
                        key={key}
                        size="sm"
                        variant={has ? "secondary" : "outline"}
                        disabled={has || addMut.isPending}
                        onClick={() => addMut.mutate({ category: item.category, item: key, source: "suggestion" })}
                      >
                        {has ? <Check className="h-3.5 w-3.5" /> : null}
                        {item.label}
                      </Button>
                    );
                  })}
                </div>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">No matching modification types. Pick from the list below.</p>
            )}
          </div>
        )}
      </section>

      <section className="mt-8">
        <SectionTitle>Modify</SectionTitle>
        <div className="divide-y divide-border/60 overflow-hidden rounded-2xl border border-border/60 bg-card">
          {BUILD_CATEGORIES.map((cat) => {
            const isOpen = openCat === cat.key;
            const count = cat.items.filter((i) => selected.has(i.key)).length;
            return (
              <div key={cat.key}>
                <button
                  type="button"
                  className="flex min-h-[52px] w-full items-center justify-between px-4 text-left"
                  onClick={() => setOpenCat(isOpen ? null : cat.key)}
                  aria-expanded={isOpen}
                >
                  <span className="text-sm font-medium text-foreground">{cat.label}</span>
                  <span className="flex items-center gap-2 text-xs text-muted-foreground">
                    {count ? `${count} selected` : null}
                    <ChevronDown className={cn("h-4 w-4 transition-transform", isOpen && "rotate-180")} aria-hidden />
                  </span>
                </button>
                {isOpen && (
                  <div className="flex flex-wrap gap-2 px-4 pb-4 animate-in fade-in duration-200">
                    {cat.items.map((item) => {
                      const mod = build.modifications.find((m) => m.item === item.key);
                      const locked = mod && mod.status !== "planned";
                      const pending =
                        (addMut.isPending && addMut.variables?.item === item.key) ||
                        (removeMut.isPending && removeMut.variables === mod?.id);
                      return (
                        <Button
                          key={item.key}
                          size="sm"
                          variant={mod ? "default" : "outline"}
                          disabled={Boolean(locked) || pending}
                          onClick={() =>
                            mod ? removeMut.mutate(mod.id) : addMut.mutate({ category: cat.key, item: item.key })
                          }
                        >
                          {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : mod ? <Check className="h-3.5 w-3.5" /> : null}
                          {item.label}
                        </Button>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </section>

      <section className="mt-8">
        <SectionTitle>Build summary</SectionTitle>
        {grouped.length === 0 ? (
          <p className="rounded-2xl border border-border/60 bg-card p-5 text-sm text-muted-foreground">
            No modifications yet. Choose from the list above.
          </p>
        ) : (
          <div className="space-y-4">
            {grouped.map((cat) => (
              <div key={cat.key} className="rounded-2xl border border-border/60 bg-card p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{cat.label}</p>
                <ul className="mt-2 space-y-2">
                  {cat.mods.map((m) => (
                    <li key={m.id} className="flex items-start justify-between gap-3">
                      <span className="min-w-0">
                        <span className="block text-sm font-medium text-foreground">
                          {m.label}
                          {m.source === "suggestion" ? <span className="ml-2 text-[10px] uppercase text-muted-foreground">Suggested</span> : null}
                        </span>
                        <span className="block text-xs text-muted-foreground">{COMPAT_LABEL[m.compatibility]}</span>
                      </span>
                      <span className="shrink-0 rounded-full bg-secondary px-2.5 py-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                        {MOD_STATUS_LABEL[m.status] ?? m.status}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="mt-8">
        <SectionTitle>Repara estimate</SectionTitle>
        <div className="rounded-2xl border border-border/60 bg-card p-5">
          {build.estimate ? (
            <>
              <p className="text-xl font-semibold text-foreground">
                ${build.estimate.totalLow.toLocaleString()}–${build.estimate.totalHigh.toLocaleString()}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">Estimated range — final pricing comes from the service provider.</p>
            </>
          ) : (
            <>
              <p className="text-sm font-medium text-foreground">Price estimate unavailable</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Repara doesn't have reliable pricing for this project yet. Request actual quotes to get real prices from providers.
              </p>
            </>
          )}
        </div>
      </section>

      <section className="mt-8">
        {open.length > 0 ? (
          <>
            <p className="mb-2 text-sm text-muted-foreground">
              Send your project to relevant service providers and receive real pricing
              {requirements.length ? ` · ${requirements.map((r) => serviceCategoryLabel(r, "en")).join(", ")}` : ""}.
            </p>
            <Button asChild className="h-12 w-full text-base">
              <Link
                to="/quote"
                search={{
                  ...(requestService ? { service: requestService } : {}),
                  v: build.vehicleId,
                  b: build.id,
                  ...(firstRequirement ? { cat: firstRequirement } : {}),
                }}
              >
                Request Actual Quotes
              </Link>
            </Button>
          </>
        ) : build.modifications.some((m) => ["requested", "quoted", "approved"].includes(m.status)) ? (
          <p className="rounded-2xl border border-border/60 bg-card p-5 text-sm text-muted-foreground">
            Quotes requested. You'll be notified when a provider responds.
            {build.modifications.find((m) => m.serviceRequestId)?.serviceRequestId ? (
              <Link
                to="/garage/request/$id"
                params={{ id: build.modifications.find((m) => m.serviceRequestId)!.serviceRequestId! }}
                className="mt-2 block text-primary"
              >
                View request and quotes →
              </Link>
            ) : null}
          </p>
        ) : null}
      </section>

      <div className="mt-8 grid grid-cols-1 gap-2 sm:grid-cols-3">
        {!build.isActive && (
          <Button variant="outline" className="h-11" disabled={buildMut.isPending} onClick={() => buildMut.mutate({ makeActive: true })}>
            Set as active
          </Button>
        )}
        <Button variant="outline" className="h-11" disabled={dupMut.isPending} onClick={() => dupMut.mutate()}>
          {dupMut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Copy className="h-4 w-4" />} Duplicate
        </Button>
        <Button
          variant="ghost"
          className="h-11 text-muted-foreground"
          disabled={buildMut.isPending}
          onClick={() => {
            if (window.confirm("Archive this build? Its planned modifications will be hidden.")) buildMut.mutate({ archive: true });
          }}
        >
          <Trash2 className="h-4 w-4" /> Archive
        </Button>
      </div>
    </GarageShell>
  );
}
