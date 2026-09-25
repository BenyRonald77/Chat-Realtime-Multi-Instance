"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

type Me = { id: string; name: string; email: string };

export function useAuthGuard() {
  const router = useRouter();
  const [me, setMe] = useState<Me | null>(null);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    fetch("/api/auth/me")
      .then((res) => res.json())
      .then((data: { user: Me | null }) => {
        if (!data.user) {
          router.replace("/login");
          return;
        }
        setMe(data.user);
      })
      .finally(() => setChecking(false));
  }, [router]);

  return { me, checking };
}
