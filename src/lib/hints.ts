import { getAddress } from "./address";

// 아이템 힌트 계산. 모두 카카오 SDK(libraries=services)를 사용하며, 실패하면 null 을 돌려준다.
// 실패한 힌트는 아이템을 소모하지 않는다.

export const RADIUS_HINT_METERS = 50_000;

// 카카오 주소의 시/도 약칭을 정식 명칭으로 (그 외 이름은 그대로 쓴다)
const REGION_FULL_NAMES: Record<string, string> = {
  서울: "서울특별시",
  부산: "부산광역시",
  대구: "대구광역시",
  인천: "인천광역시",
  광주: "광주광역시",
  대전: "대전광역시",
  울산: "울산광역시",
  세종: "세종특별자치시",
  경기: "경기도",
  강원: "강원특별자치도",
  충북: "충청북도",
  충남: "충청남도",
  전북: "전북특별자치도",
  전남: "전라남도",
  경북: "경상북도",
  경남: "경상남도",
  제주: "제주특별자치도",
};

// 시/도 이름 (예: "충청남도", "서울특별시")
export async function getRegionHint(lat: number, lng: number): Promise<string | null> {
  const address = await getAddress(lat, lng);
  const name = address?.jibun ?? address?.road;
  if (!name) return null;
  const region = name.split(" ")[0];
  return REGION_FULL_NAMES[region] ?? region;
}

// 정답이 반드시 안에 들어가도록, 정답에서 반경의 0~60% 만큼 무작위로 떨어진 곳을 원의 중심으로 잡는다
export function makeRadiusHint(lat: number, lng: number): { lat: number; lng: number; radius: number } {
  const distance = Math.random() * RADIUS_HINT_METERS * 0.6;
  const bearing = Math.random() * Math.PI * 2;
  const dLat = (distance * Math.cos(bearing)) / 111_320;
  const dLng = (distance * Math.sin(bearing)) / (111_320 * Math.cos((lat * Math.PI) / 180));
  return { lat: lat + dLat, lng: lng + dLng, radius: RADIUS_HINT_METERS };
}

// 정답 근처(3km 이내)의 가장 가까운 장소 하나. 학교 → 지하철역 → 공공기관 → 관광명소 → 병원 순으로 찾는다.
const NEARBY_CATEGORIES: { code: string; label: string }[] = [
  { code: "SC4", label: "학교" },
  { code: "SW8", label: "지하철역" },
  { code: "PO3", label: "공공기관" },
  { code: "AT4", label: "관광명소" },
  { code: "HP8", label: "병원" },
];

function searchCategory(code: string, lat: number, lng: number): Promise<{ name: string; distance: number } | null> {
  return new Promise((resolve) => {
    const places = new kakao.maps.services.Places();
    places.categorySearch(
      code,
      (data, status) => {
        if (status !== kakao.maps.services.Status.OK || !data[0]) return resolve(null);
        resolve({ name: data[0].place_name, distance: Number(data[0].distance) || 0 });
      },
      { location: new kakao.maps.LatLng(lat, lng), radius: 3000, sort: kakao.maps.services.SortBy.DISTANCE }
    );
  });
}

export async function getNearbyHint(lat: number, lng: number): Promise<string | null> {
  if (!window.kakao?.maps?.services) return null;
  for (const { code, label } of NEARBY_CATEGORIES) {
    const found = await searchCategory(code, lat, lng);
    if (found) {
      const km = found.distance >= 1000 ? `${(found.distance / 1000).toFixed(1)}km` : `${Math.round(found.distance / 100) * 100 || 100}m`;
      return `${found.name} (${label}, 약 ${km} 거리)`;
    }
  }
  return null;
}
