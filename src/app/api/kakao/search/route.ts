import { NextRequest, NextResponse } from "next/server";

const KAKAO_REST_API_KEY = process.env.KAKAO_REST_API_KEY;

export interface SearchResult {
  place_name: string;
  address_name: string;
  x: string; // longitude
  y: string; // latitude
}

export async function POST(request: NextRequest) {
  if (!KAKAO_REST_API_KEY) {
    return NextResponse.json(
      { error: "서버에 KAKAO_REST_API_KEY가 설정되지 않았습니다." },
      { status: 500 }
    );
  }

  const body = await request.json();
  const query = body.query as string;

  if (!query || query.trim().length === 0) {
    return NextResponse.json(
      { error: "검색어를 입력해주세요." },
      { status: 400 }
    );
  }

  try {
    // 1차: 키워드 검색
    const keywordRes = await fetch(
      `https://dapi.kakao.com/v2/local/search/keyword.json?query=${encodeURIComponent(query)}&size=5`,
      {
        headers: { Authorization: `KakaoAK ${KAKAO_REST_API_KEY}` },
      }
    );

    if (keywordRes.ok) {
      const keywordData = await keywordRes.json();
      if (keywordData.documents && keywordData.documents.length > 0) {
        const results: SearchResult[] = keywordData.documents.map(
          (doc: { place_name: string; address_name: string; x: string; y: string }) => ({
            place_name: doc.place_name,
            address_name: doc.address_name,
            x: doc.x,
            y: doc.y,
          })
        );
        return NextResponse.json({ results });
      }
    }

    // 2차: 주소 검색 (키워드로 결과가 없을 때)
    const addressRes = await fetch(
      `https://dapi.kakao.com/v2/local/search/address.json?query=${encodeURIComponent(query)}&size=5`,
      {
        headers: { Authorization: `KakaoAK ${KAKAO_REST_API_KEY}` },
      }
    );

    if (addressRes.ok) {
      const addressData = await addressRes.json();
      if (addressData.documents && addressData.documents.length > 0) {
        const results: SearchResult[] = addressData.documents.map(
          (doc: { address_name: string; x: string; y: string }) => ({
            place_name: doc.address_name,
            address_name: doc.address_name,
            x: doc.x,
            y: doc.y,
          })
        );
        return NextResponse.json({ results });
      }
    }

    return NextResponse.json({ results: [] });
  } catch (error) {
    console.error("카카오 검색 API 오류:", error);
    return NextResponse.json(
      { error: "검색 중 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}
