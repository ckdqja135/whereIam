"use client";

import { useEffect, useState } from "react";
import { loadKakaoSDK } from "./kakao-loader";

export function useKakaoSdk() {
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadKakaoSDK()
      .then(() => setReady(true))
      .catch((err: Error) => setError(err.message));
  }, []);

  return { ready, error };
}
