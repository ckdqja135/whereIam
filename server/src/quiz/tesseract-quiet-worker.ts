// tesseract(OCR) 작업 스레드 진입점. 엔진이 사진마다 찍는 내부 메시지
// ("Estimating resolution as …", "Detected N diacritics", "Error in boxClipToRectangle" 등, 오류 아님)가 PM2 로그를 덮지 않도록
// 이 스레드의 콘솔 출력을 버린다. 인식 결과와 실제 오류는 스레드 메시지로 메인 서버에 전달되므로 잃는 것은 없다.
/* eslint-disable @typescript-eslint/no-require-imports */
const silent = () => {};
console.log = silent;
console.info = silent;
console.warn = silent;
console.error = silent;
console.debug = silent;
require('tesseract.js/src/worker-script/node/index.js');
