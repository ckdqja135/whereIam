import * as THREE from "three";
import {
  Avatar,
  HAIR_COLORS,
  OUTFIT_COLORS,
  PANTS_COLORS,
  SKIN_COLORS,
} from "./avatar";

// 귀여운 SD(2등신) 캐릭터를 three.js 기본 도형으로 조립한다.
// 외부 모델 파일 없이 동작하며, 나중에 GLB 모델로 교체해도 AvatarModel 인터페이스만 맞추면 된다.

export interface AvatarModel {
  group: THREE.Group;
  update: (t: number) => void;
  hop: () => void;
  dispose: () => void;
}

const HEAD_Y = 1.42;
const HEAD_R = 0.55;
const OUTLINE_COLOR = "#2b2233";
const FACE_COLOR = "#2b2233";

let gradientMap: THREE.DataTexture | null = null;

// 툰 셰이딩용 3단계 그라디언트
function getGradientMap(): THREE.DataTexture {
  if (!gradientMap) {
    gradientMap = new THREE.DataTexture(new Uint8Array([110, 190, 255]), 3, 1, THREE.RedFormat);
    gradientMap.minFilter = THREE.NearestFilter;
    gradientMap.magFilter = THREE.NearestFilter;
    gradientMap.needsUpdate = true;
  }
  return gradientMap;
}

export function createAvatarModel(avatar: Avatar): AvatarModel {
  const disposables: { dispose: () => void }[] = [];

  const toon = (color: string, side: THREE.Side = THREE.FrontSide) => {
    const m = new THREE.MeshToonMaterial({ color, gradientMap: getGradientMap(), side });
    disposables.push(m);
    return m;
  };
  const basic = (color: string, opts: THREE.MeshBasicMaterialParameters = {}) => {
    const m = new THREE.MeshBasicMaterial({ color, ...opts });
    disposables.push(m);
    return m;
  };
  const geo = <G extends THREE.BufferGeometry>(g: G): G => {
    disposables.push(g);
    return g;
  };

  const outlineMat = basic(OUTLINE_COLOR, { side: THREE.BackSide });
  // 뒷면을 살짝 키워 그리는 방식(inverted hull)의 만화풍 외곽선
  const withOutline = (mesh: THREE.Mesh, scale = 1.06) => {
    const outline = new THREE.Mesh(mesh.geometry, outlineMat);
    outline.scale.setScalar(scale);
    mesh.add(outline);
    return mesh;
  };

  const skin = SKIN_COLORS[avatar.skin];
  const hairColor = HAIR_COLORS[avatar.hairColor];
  const outfit = OUTFIT_COLORS[avatar.outfitColor];
  const pants = PANTS_COLORS[avatar.pantsColor];

  const root = new THREE.Group(); // 점프/스쿼시용
  const group = new THREE.Group();
  group.add(root);

  // ---------- 몸 ----------
  const body = new THREE.Group();
  root.add(body);

  const torso = withOutline(
    new THREE.Mesh(geo(new THREE.CapsuleGeometry(0.3, 0.22, 8, 20)), toon(outfit)),
    1.07
  );
  torso.position.y = 0.66;
  torso.scale.set(1, 1, 0.85);
  body.add(torso);

  const legGeo = geo(new THREE.CapsuleGeometry(0.11, 0.14, 6, 12));
  const shoeGeo = geo(new THREE.SphereGeometry(0.13, 16, 12));
  const shoeMat = toon("#3b3340");
  for (const side of [-1, 1]) {
    const leg = withOutline(new THREE.Mesh(legGeo, toon(pants)), 1.1);
    leg.position.set(side * 0.14, 0.3, 0);
    body.add(leg);
    const shoe = withOutline(new THREE.Mesh(shoeGeo, shoeMat), 1.08);
    shoe.position.set(side * 0.14, 0.12, 0.04);
    shoe.scale.set(1, 0.65, 1.3);
    body.add(shoe);
  }

  // 팔: 어깨를 축으로 흔들리도록 피벗 그룹 사용
  const armGeo = geo(new THREE.CapsuleGeometry(0.085, 0.2, 6, 12));
  const handGeo = geo(new THREE.SphereGeometry(0.1, 16, 12));
  const arms: THREE.Group[] = [];
  for (const side of [-1, 1]) {
    const pivot = new THREE.Group();
    pivot.position.set(side * 0.3, 0.86, 0);
    const arm = withOutline(new THREE.Mesh(armGeo, toon(outfit)), 1.1);
    arm.position.y = -0.17;
    pivot.add(arm);
    const hand = withOutline(new THREE.Mesh(handGeo, toon(skin)), 1.08);
    hand.position.y = -0.36;
    pivot.add(hand);
    pivot.userData.side = side;
    body.add(pivot);
    arms.push(pivot);
  }

  // ---------- 머리 ----------
  const head = new THREE.Group();
  head.position.y = HEAD_Y;
  root.add(head);

  const headMesh = withOutline(
    new THREE.Mesh(geo(new THREE.SphereGeometry(HEAD_R, 40, 28)), toon(skin)),
    1.035
  );
  headMesh.scale.set(1.08, 0.96, 1);
  head.add(headMesh);

  // 머리 표면 위의 점(x, y는 머리 중심 기준)에 붙이고 바깥을 향하게 한다
  const onFace = (obj: THREE.Object3D, x: number, y: number, inset = 0.01) => {
    const sx = x / 1.08;
    const sy = y / 0.96;
    const z = Math.sqrt(Math.max(HEAD_R * HEAD_R - sx * sx - sy * sy, 0)) - inset;
    obj.position.set(x, y, z);
    // 아직 부모가 없으므로 head 로컬 좌표 기준으로 바깥(법선) 방향을 바라본다
    obj.lookAt(x * 2, y * 2, z * 2);
    head.add(obj);
    return obj;
  };

  // 눈
  const eyes: THREE.Object3D[] = [];
  const faceMat = basic(FACE_COLOR);
  const highlightMat = basic("#ffffff");
  for (const side of [-1, 1]) {
    const eye = new THREE.Group();
    switch (avatar.eyes) {
      case 0: // 동글
      case 1: { // 반짝
        const big = avatar.eyes === 1;
        const pupil = new THREE.Mesh(geo(new THREE.SphereGeometry(big ? 0.085 : 0.065, 20, 16)), faceMat);
        pupil.scale.set(1, 1.3, 0.35);
        eye.add(pupil);
        const hl = new THREE.Mesh(geo(new THREE.SphereGeometry(big ? 0.03 : 0.022, 12, 8)), highlightMat);
        hl.position.set(0.025, 0.04, 0.03);
        eye.add(hl);
        if (big) {
          const hl2 = new THREE.Mesh(geo(new THREE.SphereGeometry(0.014, 10, 8)), highlightMat);
          hl2.position.set(-0.025, -0.035, 0.03);
          eye.add(hl2);
        }
        eye.userData.blink = true;
        break;
      }
      case 2: { // 웃는 눈 (^ ^)
        const arc = new THREE.Mesh(geo(new THREE.TorusGeometry(0.06, 0.018, 8, 20, Math.PI)), faceMat);
        eye.add(arc);
        break;
      }
      default: { // 졸린 눈 (- -)
        const line = new THREE.Mesh(geo(new THREE.CapsuleGeometry(0.016, 0.1, 4, 8)), faceMat);
        line.rotation.z = Math.PI / 2;
        eye.add(line);
      }
    }
    onFace(eye, side * 0.2, -0.04);
    eyes.push(eye);
  }

  // 볼터치
  const blushMat = basic("#ff8fa3", { transparent: true, opacity: 0.55 });
  const blushGeo = geo(new THREE.CircleGeometry(0.07, 20));
  for (const side of [-1, 1]) {
    const blush = new THREE.Mesh(blushGeo, blushMat);
    blush.scale.set(1, 0.6, 1);
    onFace(blush, side * 0.33, -0.15, -0.004);
  }

  // 입 (작은 미소)
  const mouth = new THREE.Mesh(geo(new THREE.TorusGeometry(0.045, 0.014, 8, 16, Math.PI)), faceMat);
  mouth.rotation.z = Math.PI;
  const mouthHolder = new THREE.Group();
  mouthHolder.add(mouth);
  onFace(mouthHolder, 0, -0.17);

  // ---------- 머리카락 ----------
  const hairMat = toon(hairColor);
  const hairDouble = toon(hairColor, THREE.DoubleSide);
  const hasHat = avatar.hat !== 0;

  // 정수리 캡: 앞쪽은 이마가 보이도록 뒤로 기울인다
  const cap = withOutline(
    new THREE.Mesh(
      geo(new THREE.SphereGeometry(HEAD_R + 0.04, 40, 20, 0, Math.PI * 2, 0, Math.PI * 0.52)),
      hairDouble
    ),
    1.03
  );
  cap.scale.set(1.08, 0.98, 1.02);
  cap.rotation.x = -0.42;
  head.add(cap);

  // 앞머리
  const bangGeo = geo(new THREE.SphereGeometry(0.16, 16, 12));
  for (const [x, y, s] of [[-0.24, 0.3, 1], [0, 0.34, 1.15], [0.24, 0.3, 1]] as const) {
    const bang = new THREE.Mesh(bangGeo, hairMat);
    bang.scale.set(s * 1.1, s * 0.75, 0.6);
    onFace(bang, x, y, 0.07);
  }

  // 옆/뒷머리 껍질 (얼굴 앞쪽만 비워둔다)
  const shell = (thetaEnd: number) => {
    const faceGap = 0.85;
    const m = withOutline(
      new THREE.Mesh(
        geo(
          new THREE.SphereGeometry(
            HEAD_R + 0.06,
            40,
            20,
            Math.PI / 2 + faceGap,
            Math.PI * 2 - faceGap * 2,
            Math.PI * 0.3,
            thetaEnd - Math.PI * 0.3
          )
        ),
        hairDouble
      ),
      1.03
    );
    m.scale.set(1.08, 1, 1.02);
    head.add(m);
    return m;
  };

  switch (avatar.hairStyle) {
    case 1: // 단발
      shell(Math.PI * 0.72);
      break;
    case 2: // 삐죽머리
      if (!hasHat) {
        const spikeGeo = geo(new THREE.ConeGeometry(0.13, 0.32, 10));
        const spikes: [number, number][] = [[0, 0.1], [0.55, -0.25], [-0.55, -0.25], [0.35, 0.45], [-0.35, 0.45], [0, -0.55]];
        for (const [rz, rx] of spikes) {
          const spike = withOutline(new THREE.Mesh(spikeGeo, hairMat), 1.08);
          const dir = new THREE.Vector3(0, 1, 0).applyEuler(new THREE.Euler(rx, 0, rz));
          spike.position.copy(dir.clone().multiplyScalar(HEAD_R + 0.08));
          spike.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
          head.add(spike);
        }
      }
      break;
    case 3: { // 포니테일
      const tail = withOutline(new THREE.Mesh(geo(new THREE.CapsuleGeometry(0.13, 0.3, 8, 16)), hairMat), 1.08);
      tail.position.set(0, -0.05, -0.62);
      tail.rotation.x = 0.35;
      head.add(tail);
      const tie = new THREE.Mesh(geo(new THREE.TorusGeometry(0.1, 0.035, 8, 16)), toon(outfit));
      tie.position.set(0, 0.18, -0.55);
      tie.rotation.x = Math.PI / 2 + 0.6;
      head.add(tie);
      break;
    }
    case 4: // 똥머리
      if (!hasHat) {
        const bun = withOutline(new THREE.Mesh(geo(new THREE.SphereGeometry(0.2, 20, 16)), hairMat), 1.06);
        bun.position.set(0, 0.6, -0.12);
        head.add(bun);
      }
      break;
    case 5: { // 긴머리
      shell(Math.PI * 0.78);
      const back = withOutline(new THREE.Mesh(geo(new THREE.CapsuleGeometry(0.34, 0.35, 8, 20)), hairMat), 1.04);
      back.position.set(0, -0.42, -0.24);
      back.scale.set(1.25, 1, 0.55);
      head.add(back);
      break;
    }
    default: // 숏컷: 캡만
      break;
  }

  // ---------- 모자 ----------
  const addPompom = (y: number, color: string) => {
    const p = withOutline(new THREE.Mesh(geo(new THREE.SphereGeometry(0.1, 16, 12)), toon(color)), 1.08);
    p.position.y = y;
    return p;
  };

  switch (avatar.hat) {
    case 1: { // 비니
      const hat = new THREE.Group();
      const dome = withOutline(
        new THREE.Mesh(geo(new THREE.SphereGeometry(HEAD_R + 0.09, 32, 16, 0, Math.PI * 2, 0, Math.PI * 0.42)), toon(outfit, THREE.DoubleSide)),
        1.03
      );
      dome.scale.set(1.08, 1.05, 1.04);
      hat.add(dome);
      const band = withOutline(new THREE.Mesh(geo(new THREE.TorusGeometry(0.5, 0.07, 10, 32)), toon("#ffffff")), 1.05);
      band.rotation.x = Math.PI / 2;
      band.position.y = 0.16;
      band.scale.set(1.12, 1.06, 1);
      hat.add(band);
      hat.add(addPompom(HEAD_R + 0.15, "#ffffff"));
      hat.rotation.x = -0.25;
      head.add(hat);
      break;
    }
    case 2: { // 야구모자
      const hat = new THREE.Group();
      const crown = withOutline(
        new THREE.Mesh(geo(new THREE.SphereGeometry(HEAD_R + 0.08, 32, 16, 0, Math.PI * 2, 0, Math.PI * 0.4)), toon(outfit, THREE.DoubleSide)),
        1.03
      );
      crown.scale.set(1.08, 1, 1.04);
      hat.add(crown);
      const brim = withOutline(new THREE.Mesh(geo(new THREE.CylinderGeometry(0.3, 0.3, 0.035, 24)), toon(outfit)), 1.06);
      brim.scale.set(1.1, 1, 0.75);
      brim.position.set(0, 0.2, 0.52);
      brim.rotation.x = 0.12;
      hat.add(brim);
      hat.add(addPompom(HEAD_R + 0.06, outfit));
      hat.rotation.x = -0.3;
      head.add(hat);
      break;
    }
    case 3: { // 고깔모자
      const hat = new THREE.Group();
      const cone = withOutline(new THREE.Mesh(geo(new THREE.ConeGeometry(0.26, 0.55, 24)), toon(outfit)), 1.05);
      cone.position.y = 0.27;
      hat.add(cone);
      hat.add(addPompom(0.58, "#FFD43B"));
      hat.position.set(0.1, HEAD_R - 0.02, -0.02);
      hat.rotation.z = -0.25;
      head.add(hat);
      break;
    }
    case 4: { // 왕관
      const hat = new THREE.Group();
      const gold = toon("#FFC93C", THREE.DoubleSide);
      const ring = withOutline(new THREE.Mesh(geo(new THREE.CylinderGeometry(0.26, 0.24, 0.14, 24, 1, true)), gold), 1.06);
      hat.add(ring);
      const spikeGeo = geo(new THREE.ConeGeometry(0.06, 0.15, 8));
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2;
        const spike = withOutline(new THREE.Mesh(spikeGeo, gold), 1.1);
        spike.position.set(Math.sin(a) * 0.24, 0.13, Math.cos(a) * 0.24);
        hat.add(spike);
      }
      const gem = new THREE.Mesh(geo(new THREE.SphereGeometry(0.04, 10, 8)), toon("#FF6B6B"));
      gem.position.set(0, 0, 0.255);
      hat.add(gem);
      hat.position.set(0, HEAD_R - 0.02, -0.05);
      hat.rotation.x = -0.15;
      head.add(hat);
      break;
    }
  }

  // ---------- 그림자 ----------
  const shadow = new THREE.Mesh(
    geo(new THREE.CircleGeometry(0.42, 32)),
    basic("#000000", { transparent: true, opacity: 0.18, depthWrite: false })
  );
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = 0.005;
  group.add(shadow);

  // ---------- 애니메이션 ----------
  let hopStart = -1;
  let lastT = 0;
  const blinkOffset = Math.random() * 3;

  const update = (t: number) => {
    lastT = t;
    // 숨쉬기 + 살짝 흔들흔들
    const breath = Math.sin(t * 2.2);
    body.scale.set(1 + breath * 0.012, 1 - breath * 0.012, 1);
    head.position.y = HEAD_Y + breath * 0.015;
    head.rotation.z = Math.sin(t * 1.1) * 0.06;
    head.rotation.x = Math.sin(t * 0.7) * 0.03;
    for (const arm of arms) {
      const side = arm.userData.side as number;
      arm.rotation.z = side * (0.28 + Math.sin(t * 2.2 + 0.4) * 0.06);
    }

    // 눈 깜빡임
    const blinkPhase = (t + blinkOffset) % 3.6;
    const blink = blinkPhase < 0.12 ? 0.15 : 1;
    for (const eye of eyes) if (eye.userData.blink) eye.scale.y = blink;

    // 섞기 했을 때 폴짝
    if (hopStart >= 0) {
      const p = (t - hopStart) / 0.45;
      if (p >= 1) {
        hopStart = -1;
        root.position.y = 0;
        root.scale.set(1, 1, 1);
      } else {
        root.position.y = Math.sin(p * Math.PI) * 0.35;
        const squash = p < 0.15 ? 1 - p * 1.2 : 1;
        root.scale.set(2 - squash, squash, 2 - squash);
      }
    }
  };

  const hop = () => {
    hopStart = lastT;
  };

  const dispose = () => {
    for (const d of disposables) d.dispose();
  };

  update(0);
  return { group, update, hop, dispose };
}
