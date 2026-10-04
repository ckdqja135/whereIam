// 캐릭터 얼굴 핀 (CustomOverlay content, yAnchor: 1 로 사용)
export function avatarPinHtml(pinSrc: string): string {
  return `<div style="display:flex;flex-direction:column;align-items:center;pointer-events:none;filter:drop-shadow(0 2px 3px rgba(0,0,0,.45));">
  <img src="${pinSrc}" width="44" height="44" style="display:block;border-radius:50%;" alt="" />
  <div style="width:0;height:0;border-left:7px solid transparent;border-right:7px solid transparent;border-top:9px solid #fff;margin-top:-3px;"></div>
</div>`;
}

// 정답 위치 빨간 핀. label이 있으면 핀 안에 표시 (결과 화면의 라운드 번호)
export function answerPinSrc(label?: string): string {
  const inner = label
    ? `<text x="14" y="18.5" text-anchor="middle" font-size="12" font-weight="bold" font-family="Arial" fill="#C0392B">${label}</text>`
    : "";
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="28" height="40" viewBox="0 0 28 40"><path d="M14 0C6.27 0 0 6.27 0 14c0 10.5 14 26 14 26s14-15.5 14-26C28 6.27 21.73 0 14 0z" fill="#E74C3C" stroke="#C0392B" stroke-width="1"/><circle cx="14" cy="14" r="${label ? 8 : 6}" fill="white"/>${inner}</svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

export function createAnswerMarker(
  map: kakao.maps.Map,
  position: kakao.maps.LatLng,
  label?: string
): kakao.maps.Marker {
  const image = new kakao.maps.MarkerImage(answerPinSrc(label), new kakao.maps.Size(28, 40), {
    offset: new kakao.maps.Point(14, 40),
  });
  return new kakao.maps.Marker({ position, map, image });
}
