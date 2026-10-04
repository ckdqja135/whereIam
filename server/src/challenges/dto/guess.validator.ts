import { registerDecorator, ValidationOptions } from 'class-validator';

// Guess 는 { lat, lng } 또는 null 이라 class-validator 의 ValidateNested 로는 null 을 허용할 수 없어
// 배열 전체를 직접 검사하는 데코레이터를 둔다.
function isValidGuess(value: unknown): boolean {
  if (value === null) return true;
  if (typeof value !== 'object' || Array.isArray(value)) return false;
  const keys = Object.keys(value);
  if (keys.length !== 2 || !keys.includes('lat') || !keys.includes('lng')) return false;
  const { lat, lng } = value as { lat: unknown; lng: unknown };
  return (
    typeof lat === 'number' &&
    typeof lng === 'number' &&
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    lat >= -90 &&
    lat <= 90 &&
    lng >= -180 &&
    lng <= 180
  );
}

export function IsGuessArray(options?: ValidationOptions) {
  return (object: object, propertyName: string) => {
    registerDecorator({
      name: 'isGuessArray',
      target: object.constructor,
      propertyName,
      options: {
        message: `${propertyName} 의 각 항목은 null 또는 { lat(-90~90), lng(-180~180) } 이어야 합니다`,
        ...options,
      },
      validator: {
        validate: (value: unknown) => Array.isArray(value) && value.every(isValidGuess),
      },
    });
  };
}
