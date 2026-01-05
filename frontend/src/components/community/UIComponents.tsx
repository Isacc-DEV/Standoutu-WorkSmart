type SectionHeaderProps = {
  title: string;
  count?: number;
};

export function SectionHeader({ title, count }: SectionHeaderProps) {
  return (
    <div className="flex items-center gap-3">
      <div className="text-[11px] uppercase tracking-[0.22em] text-slate-500">{title}</div>
      <span className="h-px flex-1 bg-[var(--community-line)]" />
      {typeof count === 'number' ? (
        <span className="rounded-full bg-[var(--community-soft)] px-2 py-0.5 text-[10px] text-slate-600">
          {count}
        </span>
      ) : null}
    </div>
  );
}

type InfoRowProps = {
  label: string;
  value: string;
};

export function InfoRow({ label, value }: InfoRowProps) {
  return (
    <div>
      <div className="text-[11px] uppercase tracking-[0.18em] text-slate-500">{label}</div>
      <div className="text-sm text-slate-900">{value}</div>
    </div>
  );
}

type AvatarBubbleProps = {
  name: string;
  active: boolean;
  avatarUrl?: string | null;
};

export function AvatarBubble({ name, active, avatarUrl }: AvatarBubbleProps) {
  const initials = name
    .split(' ')
    .map((part) => part.trim()[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase();
  const cleanedAvatar = avatarUrl?.trim();
  const hasAvatar = Boolean(cleanedAvatar) && cleanedAvatar?.toLowerCase() !== 'nope';
  return (
    <span
      className={`flex h-7 w-7 items-center justify-center overflow-hidden rounded-full text-[10px] font-semibold ${
        hasAvatar
          ? 'bg-slate-900/10'
          : active
            ? 'bg-[var(--community-accent)] text-[var(--community-ink)]'
            : 'bg-slate-900 text-white'
      }`}
    >
      {hasAvatar ? (
        <img src={cleanedAvatar} alt={`${name} avatar`} className="h-full w-full object-cover" />
      ) : (
        initials || 'DM'
      )}
    </span>
  );
}
