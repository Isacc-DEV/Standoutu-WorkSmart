'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { clearAuth } from '../lib/auth';
import { useAuth } from '../lib/useAuth';

function getInitials(name?: string | null) {
  if (!name) return 'DM';
  return name
    .split(' ')
    .map((part) => part.trim()[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase();
}

function NavItem({
  href,
  label,
  active,
}: {
  href: string;
  label: string;
  active: boolean;
}) {
  return (
    <Link
      href={href}
      className={`rounded-full px-3 py-2 text-sm transition ${
        active ? 'bg-white/10 text-white' : 'text-slate-200 hover:text-white'
      }`}
    >
      {label}
    </Link>
  );
}
export default function TopNav() {
  const pathname = usePathname();
  const router = useRouter();
  const { user } = useAuth();

  const signOut = () => {
    clearAuth();
    router.push('/auth');
  };

  const isAdmin = user?.role === 'ADMIN';
  const isManager = user?.role === 'MANAGER' || isAdmin;
  const avatarUrl = user?.avatarUrl?.trim();
  const hasAvatar = Boolean(avatarUrl) && avatarUrl?.toLowerCase() !== 'nope';
  const initials = getInitials(user?.name);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const handleClick = (event: MouseEvent) => {
      if (!menuRef.current) return;
      if (!menuRef.current.contains(event.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => {
      document.removeEventListener('mousedown', handleClick);
    };
  }, []);

  return (
    <header className="w-full border-b border-white/5 bg-[#0b1020] backdrop-blur">
      <div className="mx-auto flex w-full max-w-screen-2xl items-center justify-between px-4 py-3 text-sm">
        <div className="text-lg font-semibold text-white">
          <Link href="/">SmartWork</Link>
        </div>
        <nav className="flex items-center gap-2">
          <NavItem href="/" label="Home" active={pathname === '/'} />
          <NavItem href="/workspace" label="Workspace" active={pathname.startsWith('/workspace')} />
          <NavItem href="/community" label="Community" active={pathname.startsWith('/community')} />
          <NavItem href="/calendar" label="Calendar" active={pathname.startsWith('/calendar')} />
          <NavItem href="/reports" label="Reports" active={pathname.startsWith('/reports')} />
          <NavItem href="/about" label="About" active={pathname.startsWith('/about')} />
          <NavItem href="/career" label="Career" active={pathname.startsWith('/career')} />
          {isManager && (
            <NavItem
              href="/manager/profiles"
              label="Manager"
              active={pathname.startsWith('/manager')}
            />
          )}
          {isAdmin && (
            <NavItem href="/admin/users" label="Admin" active={pathname.startsWith('/admin')} />
          )}
        </nav>
        <div className="flex items-center gap-3">
          {user ? (
            <div className="relative" ref={menuRef}>
              <button
                type="button"
                onClick={() => setMenuOpen((prev) => !prev)}
                className="flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-xs text-white transition hover:bg-white/20"
              >
                <span className="flex h-6 w-6 items-center justify-center overflow-hidden rounded-full bg-white/15 text-[9px] font-semibold text-white">
                  {hasAvatar ? (
                    <img src={avatarUrl} alt={`${user.name} avatar`} className="h-full w-full object-cover" />
                  ) : (
                    initials
                  )}
                </span>
                <span>
                  {user.name} - {user.role.toLowerCase()}
                </span>
                <span className="text-[10px] text-slate-300">v</span>
              </button>
              {menuOpen && (
                <div className="absolute right-0 mt-2 w-40 rounded-xl border border-slate-200 bg-white p-1 text-xs text-slate-700 shadow-lg">
                  <Link
                    href="/profile"
                    className="block rounded-lg px-3 py-2 transition hover:bg-slate-100"
                  >
                    Profile
                  </Link>
                  <button
                    type="button"
                    onClick={signOut}
                    className="w-full rounded-lg px-3 py-2 text-left transition hover:bg-slate-100"
                  >
                    Log out
                  </button>
                </div>
              )}
            </div>
          ) : (
            <Link
              href="/auth"
              className="rounded-full bg-[#4ade80] px-4 py-2 text-xs font-semibold text-[#0b1224] shadow-[0_10px_30px_-18px_rgba(74,222,128,0.8)] hover:brightness-110"
            >
              Sign in
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}

