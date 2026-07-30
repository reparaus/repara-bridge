import { BadgeCheck, User } from "lucide-react";

/**
 * Reusable technician profile. Repara has one technician today; the shape
 * supports "Meet Our Technicians" later without a rewrite.
 */
export interface Technician {
  name: string;
  role: string;
  bio: string;
  /** Professional photo URL. Leave undefined to render the photo placeholder. */
  photoUrl?: string;
  credentials: { value: string; label: string }[];
}

export function TechnicianProfile({ technician }: { technician: Technician }) {
  return (
    <div className="grid gap-6 sm:gap-8 lg:grid-cols-[16rem_minmax(0,1fr)] lg:items-start">
      <div className="mx-auto w-full max-w-[16rem] overflow-hidden rounded-2xl border border-border bg-background/60 hairline-top">
        {technician.photoUrl ? (
          <img
            src={technician.photoUrl}
            alt={`${technician.name}, ${technician.role}`}
            width={512}
            height={640}
            loading="lazy"
            decoding="async"
            className="aspect-[4/5] size-full object-cover"
          />
        ) : (
          <div className="flex aspect-[4/5] flex-col items-center justify-center gap-2 text-muted-foreground">
            <User className="size-8" aria-hidden />
            <span className="text-[11px] tracking-[0.16em] uppercase">{technician.name}</span>
          </div>
        )}
      </div>

      <div className="min-w-0">
        <h3 className="font-display text-2xl font-extrabold sm:text-3xl">{technician.name}</h3>
        <p className="mt-2 text-sm tracking-[0.14em] text-chrome uppercase">{technician.role}</p>
        <p className="mt-4 max-w-xl text-sm leading-relaxed text-muted-foreground">
          {technician.bio}
        </p>

        <ul className="mt-6 grid gap-3 sm:grid-cols-3">
          {technician.credentials.map((c) => (
            <li
              key={c.label}
              className="flex items-center gap-3 rounded-xl border border-border bg-background/60 px-4 py-3 hairline-top"
            >
              <BadgeCheck className="size-4 shrink-0 text-chrome" aria-hidden />
              <span className="min-w-0 leading-tight">
                <span className="block text-sm font-semibold">{c.value}</span>
                <span className="block text-[11px] tracking-[0.14em] text-muted-foreground uppercase">
                  {c.label}
                </span>
              </span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
