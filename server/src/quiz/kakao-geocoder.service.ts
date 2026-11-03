import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

// 카카오 로컬 API 기본 주소. 테스트에서만 KAKAO_API_BASE 로 가짜 서버 주소를 넣는다
const DEFAULT_KAKAO_API_BASE = 'https://dapi.kakao.com';
// 요청 하나의 최대 대기 시간
export const KAKAO_TIMEOUT_MS = 4000;

// 퀴즈 정답 지역. r1: 시·도, r2: 시·군·구 (구가 있는 시는 "성남시 분당구" → "성남시". 세종처럼 없으면 '')
export interface QuizRegion {
  r1: string;
  r2: string;
}

interface RegionDocument {
  region_type?: string; // B: 법정동, H: 행정동
  region_1depth_name?: string;
  region_2depth_name?: string;
}

// 지하철역 검색 결과 한 건 (카카오 장소 검색 SW8). 같은 역도 노선마다 따로 온다 ("강남역 2호선", "강남역 신분당선")
export interface KakaoStationPlace {
  id: string;
  placeName: string; // "강남역 2호선"
  category: string; // "교통,수송 > 지하철,전철 > 수도권2호선"
  address: string; // "서울 강남구 역삼동 858"
  lat: number;
  lng: number;
}

// 검색 사각형 (경도·위도)
export interface LngLatRect {
  minLng: number;
  minLat: number;
  maxLng: number;
  maxLat: number;
}

export interface KakaoStationPage {
  places: KakaoStationPlace[];
  totalCount: number; // 이 사각형 안의 전체 개수 (한 사각형에서 받을 수 있는 건 최대 45개)
  isEnd: boolean;
}

interface PlaceDocument {
  id?: string;
  place_name?: string;
  category_name?: string;
  category_group_code?: string;
  address_name?: string;
  x?: string;
  y?: string;
}

// 카카오 REST API 로 좌표 → 행정구역 (coord2regioncode), 사각형 안의 지하철역 검색 (category SW8).
// 브라우저용 JavaScript 키가 아니라 서버 전용 REST API 키(KAKAO_REST_API_KEY)가 필요하다.
@Injectable()
export class KakaoGeocoderService {
  private readonly logger = new Logger(KakaoGeocoderService.name);
  private readonly apiKey: string;
  private readonly baseUrl: string;

  constructor(config: ConfigService) {
    this.apiKey = config.get<string>('KAKAO_REST_API_KEY')?.trim() ?? '';
    this.baseUrl = (config.get<string>('KAKAO_API_BASE')?.trim() || DEFAULT_KAKAO_API_BASE).replace(/\/+$/, '');
    if (!this.apiKey) {
      this.logger.warn(
        'KAKAO_REST_API_KEY 가 비어 있어 퀴즈 문제 풀에 로드뷰를 보탤 수 없고 (POST /quiz/pool 은 503) 지하철역 목록도 모을 수 없습니다. ' +
          'Kakao Developers > 앱 키 > REST API 키를 .env 에 넣어 주세요.',
      );
    }
  }

  // 키가 있어야 문제 풀에 보탤 수 있다
  get enabled(): boolean {
    return this.apiKey !== '';
  }

  // 지역을 알 수 없으면(바다·북한 등 결과 없음, 오류, 시간 초과) null
  async regionOf(lat: number, lng: number, timeoutMs = KAKAO_TIMEOUT_MS): Promise<QuizRegion | null> {
    if (!this.enabled) return null;
    const url = `${this.baseUrl}/v2/local/geo/coord2regioncode.json?x=${encodeURIComponent(lng)}&y=${encodeURIComponent(lat)}`;
    try {
      const res = await fetch(url, {
        headers: { Authorization: `KakaoAK ${this.apiKey}` },
        signal: AbortSignal.timeout(Math.max(1, Math.min(KAKAO_TIMEOUT_MS, timeoutMs))),
      });
      if (!res.ok) {
        // 401/403 은 대개 키 문제 (JavaScript 키를 넣었거나 카카오맵 사용 설정이 꺼져 있음)
        this.logger.warn(`카카오 coord2regioncode 실패: HTTP ${res.status}`);
        return null;
      }
      const body = (await res.json()) as { documents?: RegionDocument[] };
      const docs = Array.isArray(body?.documents) ? body.documents : [];
      // 행정동(H) 기준 이름을 우선, 없으면 첫 번째
      const doc = docs.find((d) => d?.region_type === 'H') ?? docs[0];
      const r1 = typeof doc?.region_1depth_name === 'string' ? doc.region_1depth_name.trim() : '';
      if (!r1) return null;
      // "성남시 분당구" 처럼 구가 붙은 시는 시까지만 쓴다
      const r2 = typeof doc?.region_2depth_name === 'string' ? (doc.region_2depth_name.trim().split(/\s+/)[0] ?? '') : '';
      return { r1, r2 };
    } catch (err) {
      const name = err instanceof Error ? err.name : '';
      this.logger.warn(`카카오 coord2regioncode 요청 오류: ${name === 'TimeoutError' ? '시간 초과' : String(err)}`);
      return null;
    }
  }

  // 사각형 안의 지하철역 한 쪽 (15개씩, page 1~3). 오류·시간 초과면 null
  async searchStations(rect: LngLatRect, page: number): Promise<KakaoStationPage | null> {
    if (!this.enabled) return null;
    const params = new URLSearchParams({
      category_group_code: 'SW8',
      rect: `${rect.minLng},${rect.minLat},${rect.maxLng},${rect.maxLat}`,
      page: String(page),
      size: '15',
    });
    try {
      const res = await fetch(`${this.baseUrl}/v2/local/search/category.json?${params}`, {
        headers: { Authorization: `KakaoAK ${this.apiKey}` },
        signal: AbortSignal.timeout(KAKAO_TIMEOUT_MS),
      });
      if (!res.ok) {
        this.logger.warn(`카카오 지하철역 검색 실패: HTTP ${res.status}`);
        return null;
      }
      const body = (await res.json()) as {
        documents?: PlaceDocument[];
        meta?: { total_count?: number; is_end?: boolean };
      };
      const docs = Array.isArray(body?.documents) ? body.documents : [];
      const places: KakaoStationPlace[] = [];
      for (const d of docs) {
        const lat = Number(d?.y);
        const lng = Number(d?.x);
        if (typeof d?.id !== 'string' || typeof d.place_name !== 'string' || !Number.isFinite(lat) || !Number.isFinite(lng)) {
          continue;
        }
        places.push({
          id: d.id,
          placeName: d.place_name.trim(),
          category: typeof d.category_name === 'string' ? d.category_name : '',
          address: typeof d.address_name === 'string' ? d.address_name : '',
          lat,
          lng,
        });
      }
      const totalCount = Number(body?.meta?.total_count);
      return {
        places,
        totalCount: Number.isFinite(totalCount) ? totalCount : places.length,
        isEnd: body?.meta?.is_end !== false,
      };
    } catch (err) {
      const name = err instanceof Error ? err.name : '';
      this.logger.warn(`카카오 지하철역 검색 요청 오류: ${name === 'TimeoutError' ? '시간 초과' : String(err)}`);
      return null;
    }
  }
}
