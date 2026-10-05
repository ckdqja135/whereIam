import type { ChallengeLocation, Guess } from "./api-types";
import type { DistanceResult } from "./haversine";
import type { AddressResult } from "./address";

export interface RoundResult {
  answer: ChallengeLocation;
  guess: Guess;
  distance: DistanceResult | null;
  score: number;
  // 정답 위치 주소 (제출 후 비동기로 채워진다)
  address?: AddressResult | null;
}
