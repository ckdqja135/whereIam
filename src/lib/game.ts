import type { ChallengeLocation, Guess } from "./api-types";
import type { DistanceResult } from "./haversine";

export interface RoundResult {
  answer: ChallengeLocation;
  guess: Guess;
  distance: DistanceResult | null;
  score: number;
}
