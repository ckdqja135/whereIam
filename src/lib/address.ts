// 좌표 → 주소 (카카오 Geocoder, SDK 를 libraries=services 로 불러와야 한다).
// 도로명 주소가 있으면 도로명, 없으면(산·농지 등) 지번 주소를 돌려준다.
export interface AddressResult {
  road: string | null;
  jibun: string | null;
}

export function getAddress(lat: number, lng: number): Promise<AddressResult | null> {
  return new Promise((resolve) => {
    if (!window.kakao?.maps?.services) return resolve(null);
    const geocoder = new kakao.maps.services.Geocoder();
    geocoder.coord2Address(lng, lat, (result, status) => {
      if (status !== kakao.maps.services.Status.OK || !result[0]) return resolve(null);
      resolve({
        road: result[0].road_address?.address_name ?? null,
        jibun: result[0].address?.address_name ?? null,
      });
    });
  });
}

export function formatAddress(a: AddressResult | null | undefined): string | null {
  if (!a) return null;
  return a.road ?? a.jibun;
}
