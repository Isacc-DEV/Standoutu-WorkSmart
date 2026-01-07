'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function AdminReportsRedirect() {
  const router = useRouter();

  useEffect(() => {
    router.replace('/reports');
  }, [router]);

  return null;
}
