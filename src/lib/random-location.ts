// 대한민국 바운딩 박스 (제주도 포함, 울릉도/독도 제외)
const KOREA_BOUNDS = {
  minLat: 33.1,
  maxLat: 38.6,
  minLng: 125.0,
  maxLng: 129.6,
};

const MAX_RETRY = 15;
const SEARCH_RADIUS = 500; // 파노라마 검색 반경 (m)

export interface RandomLocation {
  lat: number;
  lng: number;
  panoId: number;
}

function randomCoord(): { lat: number; lng: number } {
  const lat =
    KOREA_BOUNDS.minLat +
    Math.random() * (KOREA_BOUNDS.maxLat - KOREA_BOUNDS.minLat);
  const lng =
    KOREA_BOUNDS.minLng +
    Math.random() * (KOREA_BOUNDS.maxLng - KOREA_BOUNDS.minLng);
  return { lat, lng };
}

function findNearestPano(
  client: kakao.maps.RoadviewClient,
  lat: number,
  lng: number
): Promise<number | null> {
  return new Promise((resolve) => {
    const position = new kakao.maps.LatLng(lat, lng);
    client.getNearestPanoId(position, SEARCH_RADIUS, (panoId) => {
      resolve(panoId);
    });
  });
}

export async function getRandomRoadviewLocation(): Promise<RandomLocation> {
  const client = new kakao.maps.RoadviewClient();

  for (let attempt = 0; attempt < MAX_RETRY; attempt++) {
    const { lat, lng } = randomCoord();
    const panoId = await findNearestPano(client, lat, lng);

    if (panoId !== null && panoId > 0) {
      return { lat, lng, panoId };
    }
  }

  // 최종 폴백: 서울시청 근처 (로드뷰가 거의 확실히 있는 위치)
  const fallbackLat = 37.5665;
  const fallbackLng = 126.978;
  const panoId = await findNearestPano(client, fallbackLat, fallbackLng);

  return {
    lat: fallbackLat,
    lng: fallbackLng,
    panoId: panoId ?? 1,
  };
}
