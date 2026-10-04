import * as THREE from "three";
import { Avatar, avatarKey, OUTFIT_COLORS } from "./avatar";
import { createAvatarModel } from "./avatar-model";

// 지도 마커/순위표용 캐릭터 얼굴 핀 이미지(dataURL).
// GeoGuessr처럼 지도 위에서는 3D 대신 미리 렌더링한 이미지를 쓴다.
// WebGL 컨텍스트 수를 아끼기 위해 오프스크린 렌더러 하나를 재사용하고 결과를 캐시한다.

const SIZE = 160;
const cache = new Map<string, string>();
let renderer: THREE.WebGLRenderer | null = null;
let rendererFailed = false;

function getRenderer(): THREE.WebGLRenderer | null {
  if (renderer || rendererFailed) return renderer;
  try {
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
    renderer.setSize(SIZE, SIZE, false);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
  } catch {
    rendererFailed = true;
  }
  return renderer;
}

function renderHead(avatar: Avatar): HTMLCanvasElement | null {
  const r = getRenderer();
  if (!r) return null;

  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight("#ffffff", "#b7a6d6", 1.6));
  const sun = new THREE.DirectionalLight("#ffffff", 1.8);
  sun.position.set(2, 4, 3);
  scene.add(sun);

  const model = createAvatarModel(avatar);
  model.group.rotation.y = 0.2;
  scene.add(model.group);

  const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 20);
  camera.position.set(0, 1.55, 3.4);
  camera.lookAt(0, 1.38, 0);

  r.setClearColor(0x000000, 0);
  r.render(scene, camera);
  model.dispose();
  return r.domElement;
}

export function getAvatarPin(avatar: Avatar): string {
  if (typeof document === "undefined") return "";
  const key = avatarKey(avatar);
  const cached = cache.get(key);
  if (cached) return cached;

  const canvas = document.createElement("canvas");
  canvas.width = SIZE;
  canvas.height = SIZE;
  const ctx = canvas.getContext("2d");
  if (!ctx) return "";

  const c = SIZE / 2;
  const radius = SIZE / 2 - 8;

  // 원형 배경 + 흰 테두리
  ctx.beginPath();
  ctx.arc(c, c, radius, 0, Math.PI * 2);
  ctx.fillStyle = OUTFIT_COLORS[avatar.outfitColor];
  ctx.fill();

  const head = renderHead(avatar);
  if (head) {
    ctx.save();
    ctx.beginPath();
    ctx.arc(c, c, radius, 0, Math.PI * 2);
    ctx.clip();
    ctx.drawImage(head, 0, 0, SIZE, SIZE);
    ctx.restore();
  }

  ctx.beginPath();
  ctx.arc(c, c, radius, 0, Math.PI * 2);
  ctx.lineWidth = 8;
  ctx.strokeStyle = "#ffffff";
  ctx.stroke();

  const url = canvas.toDataURL("image/png");
  cache.set(key, url);
  return url;
}
