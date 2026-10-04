"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";
import type { Avatar } from "@/lib/avatar";
import { createAvatarModel, AvatarModel } from "@/lib/avatar-model";

interface AvatarViewerProps {
  avatar: Avatar;
  className?: string;
}

// 대기 애니메이션 중인 3D SD 캐릭터. 드래그하면 돌려볼 수 있다.
export default function AvatarViewer({ avatar, className }: AvatarViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<{ scene: THREE.Scene; turntable: THREE.Group } | null>(null);
  const modelRef = useRef<AvatarModel | null>(null);

  // 렌더러/씬 생성 (한 번)
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    } catch {
      return; // WebGL 미지원 환경: 캐릭터 없이 진행
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    container.appendChild(renderer.domElement);
    renderer.domElement.style.touchAction = "pan-y";

    const scene = new THREE.Scene();
    scene.add(new THREE.HemisphereLight("#ffffff", "#b7a6d6", 1.6));
    const sun = new THREE.DirectionalLight("#ffffff", 1.8);
    sun.position.set(2, 4, 3);
    scene.add(sun);

    const camera = new THREE.PerspectiveCamera(28, 1, 0.1, 50);
    camera.position.set(0, 1.3, 5.6);
    camera.lookAt(0, 1.18, 0);

    const turntable = new THREE.Group();
    turntable.rotation.y = 0.35;
    scene.add(turntable);
    sceneRef.current = { scene, turntable };

    const resize = () => {
      const { clientWidth: w, clientHeight: h } = container;
      if (w === 0 || h === 0) return;
      renderer.setSize(w, h, false);
      renderer.domElement.style.width = "100%";
      renderer.domElement.style.height = "100%";
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(container);

    // 드래그 회전 (놓으면 천천히 정면 쪽으로 돌아온다)
    let dragging = false;
    let lastX = 0;
    let velocity = 0;
    const onDown = (e: PointerEvent) => {
      dragging = true;
      lastX = e.clientX;
      renderer.domElement.setPointerCapture(e.pointerId);
    };
    const onMove = (e: PointerEvent) => {
      if (!dragging) return;
      const dx = e.clientX - lastX;
      lastX = e.clientX;
      velocity = dx * 0.012;
      turntable.rotation.y += velocity;
    };
    const onUp = () => {
      dragging = false;
    };
    renderer.domElement.addEventListener("pointerdown", onDown);
    renderer.domElement.addEventListener("pointermove", onMove);
    renderer.domElement.addEventListener("pointerup", onUp);
    renderer.domElement.addEventListener("pointercancel", onUp);

    const clock = new THREE.Clock();
    let frame = 0;
    const loop = () => {
      frame = requestAnimationFrame(loop);
      const t = clock.getElapsedTime();
      if (!dragging) {
        velocity *= 0.92;
        turntable.rotation.y += velocity;
        // 가장 가까운 "정면 + 살짝 비스듬" 각도로 복귀
        const rest = 0.35 + Math.round((turntable.rotation.y - 0.35) / (Math.PI * 2)) * Math.PI * 2;
        if (Math.abs(velocity) < 0.002) turntable.rotation.y += (rest - turntable.rotation.y) * 0.04;
      }
      modelRef.current?.update(t);
      renderer.render(scene, camera);
    };
    loop();

    return () => {
      cancelAnimationFrame(frame);
      ro.disconnect();
      modelRef.current?.dispose();
      modelRef.current = null;
      sceneRef.current = null;
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, []);

  // 아바타가 바뀌면 모델 교체 + 폴짝
  useEffect(() => {
    const ctx = sceneRef.current;
    if (!ctx) return;
    const prev = modelRef.current;
    const next = createAvatarModel(avatar);
    if (prev) {
      ctx.turntable.remove(prev.group);
      prev.dispose();
      next.hop();
    }
    ctx.turntable.add(next.group);
    modelRef.current = next;
  }, [avatar]);

  return <div ref={containerRef} className={`cursor-grab active:cursor-grabbing ${className ?? ""}`} />;
}
