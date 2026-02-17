/* eslint-disable @typescript-eslint/no-namespace */

declare namespace kakao.maps {
  class LatLng {
    constructor(lat: number, lng: number);
    getLat(): number;
    getLng(): number;
  }

  class LatLngBounds {
    constructor(sw: LatLng, ne: LatLng);
    extend(latlng: LatLng): void;
  }

  class Map {
    constructor(container: HTMLElement, options: MapOptions);
    setCenter(latlng: LatLng): void;
    setLevel(level: number): void;
    setBounds(bounds: LatLngBounds, paddingTop?: number, paddingRight?: number, paddingBottom?: number, paddingLeft?: number): void;
    relayout(): void;
  }

  interface MapOptions {
    center: LatLng;
    level?: number;
  }

  class Marker {
    constructor(options: MarkerOptions);
    setMap(map: Map | null): void;
    setPosition(position: LatLng): void;
  }

  interface MarkerOptions {
    position: LatLng;
    map?: Map;
    image?: MarkerImage;
  }

  class MarkerImage {
    constructor(
      src: string,
      size: Size,
      options?: { offset?: Point }
    );
  }

  class Size {
    constructor(width: number, height: number);
  }

  class Point {
    constructor(x: number, y: number);
  }

  class Polyline {
    constructor(options: PolylineOptions);
    setMap(map: Map | null): void;
  }

  interface PolylineOptions {
    path: LatLng[];
    strokeWeight?: number;
    strokeColor?: string;
    strokeOpacity?: number;
    strokeStyle?: string;
    map?: Map;
  }

  class InfoWindow {
    constructor(options: InfoWindowOptions);
    open(map: Map, marker?: Marker): void;
    close(): void;
  }

  interface InfoWindowOptions {
    content: string;
    position?: LatLng;
    removable?: boolean;
  }

  class CustomOverlay {
    constructor(options: CustomOverlayOptions);
    setMap(map: Map | null): void;
  }

  interface CustomOverlayOptions {
    position: LatLng;
    content: string | HTMLElement;
    map?: Map;
    yAnchor?: number;
    xAnchor?: number;
  }

  class Roadview {
    constructor(container: HTMLElement, options?: RoadviewOptions);
    setPanoId(panoId: number, position: LatLng): void;
    setViewpoint(viewpoint: RoadviewViewpoint): void;
    getPosition(): LatLng;
  }

  interface RoadviewOptions {
    panoId?: number;
    panoX?: number;
    panoY?: number;
    pan?: number;
    tilt?: number;
    zoom?: number;
  }

  class RoadviewViewpoint {
    constructor();
    pan: number;
    tilt: number;
    zoom: number;
  }

  class RoadviewClient {
    constructor();
    getNearestPanoId(
      position: LatLng,
      radius: number,
      callback: (panoId: number | null) => void
    ): void;
  }

  function load(callback: () => void): void;

  namespace event {
    function addListener(
      target: Map | Marker | Roadview,
      type: string,
      callback: (...args: unknown[]) => void
    ): void;
    function removeListener(
      target: Map | Marker | Roadview,
      type: string,
      callback: (...args: unknown[]) => void
    ): void;
  }
}

interface Window {
  kakao: {
    maps: typeof kakao.maps;
  };
}
