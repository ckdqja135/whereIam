let loadPromise: Promise<void> | null = null;

export function loadKakaoSDK(): Promise<void> {
  if (loadPromise) return loadPromise;

  loadPromise = new Promise((resolve, reject) => {
    if (typeof window === "undefined") {
      reject(new Error("카카오 SDK는 브라우저에서만 사용할 수 있습니다."));
      return;
    }

    // 이미 로드 완료된 경우
    if (window.kakao?.maps?.LatLng) {
      resolve();
      return;
    }

    // 이미 스크립트 태그가 있지만 maps.load()가 필요한 경우
    if (window.kakao?.maps) {
      window.kakao.maps.load(() => resolve());
      return;
    }

    const script = document.createElement("script");
    script.src = `//dapi.kakao.com/v2/maps/sdk.js?appkey=${process.env.NEXT_PUBLIC_KAKAO_MAP_KEY}&autoload=false`;
    script.async = true;

    script.onload = () => {
      if (window.kakao?.maps) {
        window.kakao.maps.load(() => resolve());
      } else {
        reject(new Error("카카오 SDK 로딩 실패"));
      }
    };

    script.onerror = () => {
      loadPromise = null;
      reject(new Error("카카오 SDK 스크립트를 불러올 수 없습니다."));
    };

    document.head.appendChild(script);
  });

  return loadPromise;
}
