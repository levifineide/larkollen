import { useRef, useMemo, useState } from 'react'
import { useFrame } from '@react-three/fiber'
import { useGLTF } from '@react-three/drei'
import { RigidBody, CuboidCollider } from '@react-three/rapier'
import * as THREE from 'three'
import { usePlayerStore } from '../stores/usePlayerStore'
import { useVehicleStore, activeVehicleBodyRef } from '../stores/useVehicleStore'

/**
 * Bygningskomponent med LOD-system og destruksjon.
 * Vegg-materialer bruker prosedyrell GLSL shader for realistiske fasader.
 * Tak-materialer bruker canvas-baserte teksturer for takstein.
 */

// ─── Placeholder-bygninger for fallback ──────────────────────────────
const PLACEHOLDER_BUILDINGS = [
  { x: 20, z: -15, w: 12, d: 8, h: 7, color: '#c4b8a8' },
  { x: -25, z: 10, w: 10, d: 10, h: 6.4, color: '#b8a898' },
  { x: 45, z: -30, w: 15, d: 10, h: 9.6, color: '#a89888' },
  { x: -40, z: -25, w: 8, d: 12, h: 6.4, color: '#c4b8a8' },
  { x: 10, z: 35, w: 14, d: 8, h: 6.4, color: '#b8a898' },
  { x: 80, z: -10, w: 10, d: 8, h: 6.4, color: '#c4b8a8' },
  { x: 120, z: -20, w: 12, d: 10, h: 6.4, color: '#b8a898' },
  { x: -80, z: 5, w: 8, d: 10, h: 6.4, color: '#c4b8a8' },
  { x: -120, z: 15, w: 14, d: 8, h: 6.4, color: '#a89888' },
  { x: 30, z: -65, w: 20, d: 15, h: 4.8, color: '#d0c8c0' },
  { x: 35, z: -55, w: 8, d: 12, h: 3.2, color: '#888' },
  { x: -60, z: -80, w: 10, d: 8, h: 6.4, color: '#c4b8a8' },
  { x: -30, z: -100, w: 8, d: 10, h: 6.4, color: '#b8a898' },
  { x: 20, z: -110, w: 12, d: 8, h: 6.4, color: '#c4b8a8' },
  { x: 60, z: -90, w: 10, d: 10, h: 6.4, color: '#b8a898' },
  { x: 100, z: -100, w: 8, d: 12, h: 6.4, color: '#a89888' },
  { x: -150, z: -30, w: 10, d: 8, h: 6.4, color: '#c4b8a8' },
  { x: -180, z: -50, w: 12, d: 10, h: 6.4, color: '#b8a898' },
  { x: -200, z: 10, w: 8, d: 8, h: 6.4, color: '#c4b8a8' },
  ...Array.from({ length: 10 }, (_, i) => {
    const angle = (i / 10) * Math.PI * 2
    const r = 150 + (i % 3) * 80
    return {
      x: Math.cos(angle) * r + (Math.sin(i * 7.3) * 30),
      z: Math.sin(angle) * r + (Math.cos(i * 5.7) * 30),
      w: 8 + (i % 3) * 3, d: 7 + (i % 4) * 2, h: 3.2 + (i % 3) * 3.2,
      color: ['#c4b8a8', '#b8a898', '#a89888', '#d4c8b8'][(i % 4)],
    }
  }),
]
const DESTRUCTIBLE_INDICES = new Set([0, 1, 2, 3, 5, 9, 11, 15])
const LOD_SIMPLIFIED = 300
const _lodTempVec = new THREE.Vector3()

// ─── GLSL: Prosedyrell fasade-shader ─────────────────────────────────
// UV-konvensjon fra build-map.mjs:
//   U: akkumulert langs bygningens omkrets, 1 enhet = 3 meter
//   V: vertikal, 0 = bakkenivå, 1 enhet = 3 meter ≈ 1 etasje

const FACADE_GLSL = /* glsl */ `
// ── Hash-funksjoner for pseudo-tilfeldig variasjon ──
float hash11(float p) {
  p = fract(p * 0.1031);
  p *= p + 33.33;
  p *= p + p;
  return fract(p);
}
float hash21(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973));
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

// ── Smoothstep-basert avrundet rektangel ──
float roundedRect(vec2 uv, vec2 center, vec2 halfSize, float radius) {
  vec2 d = abs(uv - center) - halfSize + radius;
  return 1.0 - smoothstep(0.0, 0.008, length(max(d, 0.0)) - radius);
}

// ── Skarpt rektangel ──
float sharpRect(vec2 uv, vec2 lo, vec2 hi) {
  vec2 s = step(lo, uv) * step(uv, hi);
  return s.x * s.y;
}

// ── Horisontal trekledning ──
vec3 woodCladding(vec2 uv, vec3 baseColor, vec3 grooveColor, float boardsPerUnit) {
  float boardPhase = fract(uv.y * boardsPerUnit);
  // Mellomrom mellom bord
  float groove = smoothstep(0.0, 0.02, boardPhase) * smoothstep(0.0, 0.02, 1.0 - boardPhase);
  vec3 col = mix(grooveColor, baseColor, groove);
  // Subtil variasjon per bord
  float boardId = floor(uv.y * boardsPerUnit);
  float boardVariation = hash11(boardId) * 0.06 - 0.03;
  col += boardVariation;
  return col;
}

// ── Murstein-mønster ──
vec3 brickPattern(vec2 uv, vec3 baseColor, vec3 mortarColor) {
  float brickH = 0.08;
  float brickW = 0.22;
  float row = floor(uv.y / brickH);
  float offset = mod(row, 2.0) * brickW * 0.5;
  vec2 brickUV = vec2(fract((uv.x + offset) / brickW), fract(uv.y / brickH));
  // Fuger (mortar)
  float mortar = 1.0 - step(0.04, brickUV.x) * step(brickUV.x, 0.96)
                     * step(0.06, brickUV.y) * step(brickUV.y, 0.94);
  // Variasjon per murstein
  vec2 brickId = vec2(floor((uv.x + offset) / brickW), row);
  float brickHash = hash21(brickId);
  vec3 brickCol = baseColor + (brickHash - 0.5) * 0.06;
  return mix(brickCol, mortarColor, mortar);
}

// ── Hovedfunksjon: prosedyrell fasade ──
vec3 proceduralFacade(
  vec2 uv, vec3 worldPos,
  vec3 wallColor, vec3 grooveColor,
  vec3 frameColor, vec3 glassColor, vec3 doorColor,
  float hasCladding, float windowScale, float doorChance
) {
  // Etasje (1 UV-enhet vertikal ≈ 3m ≈ 1 etasje)
  float floorLevel = floor(uv.y);
  float floorV = fract(uv.y);       // 0-1 innenfor etasjen
  float bayU = fract(uv.x);         // 0-1 innenfor 3m seksjon
  float bayId = floor(uv.x);

  bool isGroundFloor = floorLevel < 0.5;

  // ── Vegg-base ──
  vec3 col;
  if (hasCladding > 0.5) {
    col = woodCladding(uv, wallColor, grooveColor, 10.0);
  } else {
    col = brickPattern(uv, wallColor, grooveColor);
  }

  // ── Grunnmur (nederste 8% av 1. etasje) ──
  if (isGroundFloor && floorV < 0.08) {
    col = mix(col, vec3(0.45, 0.44, 0.42), 0.8);
    // Stein-textur
    float stoneRow = floor(floorV * 80.0);
    float stoneOffset = mod(stoneRow, 2.0) * 0.15;
    float stoneU = fract(uv.x * 3.0 + stoneOffset);
    float stoneEdge = step(0.03, stoneU) * step(stoneU, 0.97);
    float stoneV = fract(floorV * 80.0 / 3.0);
    stoneEdge *= step(0.06, stoneV) * step(stoneV, 0.94);
    col = mix(col * 0.85, col, stoneEdge);
    return col; // Ingen vinduer i grunnmuren
  }

  // ── Per-bay hash (unik per vegg-seksjon + etasje + bygning) ──
  vec2 cellId = vec2(bayId, floorLevel);
  // Bruk world-pos for å gi unik variasjon per bygning
  cellId += floor(worldPos.xz * 0.037);
  float cellHash = hash21(cellId);
  float cellHash2 = hash21(cellId + 73.1);
  float cellHash3 = hash21(cellId + 157.3);

  // ── Bestem om dette bay-et har vindu, dør, eller er blankt ──
  bool hasDoor = false;
  bool hasWindow = true;
  float winLeft, winRight, winBottom, winTop;

  if (isGroundFloor) {
    // Bakkeplan: noen bay har dør, noen har vindu, noen er blanke
    if (cellHash < doorChance) {
      hasDoor = true;
      // Dør – smalere eller bredere basert på hash
      float doorWidth = mix(0.28, 0.40, cellHash2);
      float doorCenter = 0.5 + (cellHash3 - 0.5) * 0.1;
      winLeft = doorCenter - doorWidth * 0.5;
      winRight = doorCenter + doorWidth * 0.5;
      winBottom = 0.08;
      winTop = 0.78 + cellHash2 * 0.08;
    } else if (cellHash < doorChance + 0.15) {
      hasWindow = false; // Blank vegg-seksjon
    } else {
      // Vindu på bakkeplan – litt høyere plassert
      float winWidth = mix(0.30, 0.50, cellHash2) * windowScale;
      winLeft = 0.5 - winWidth * 0.5;
      winRight = 0.5 + winWidth * 0.5;
      winBottom = 0.30 + cellHash3 * 0.06;
      winTop = 0.78 + cellHash2 * 0.06;
    }
  } else {
    // Øvre etasjer
    if (cellHash < 0.12) {
      hasWindow = false; // Noen seksjoner har ikke vindu
    } else {
      float winWidth = mix(0.28, 0.48, cellHash2) * windowScale;
      float winHeight = mix(0.45, 0.60, cellHash3);
      winLeft = 0.5 - winWidth * 0.5;
      winRight = 0.5 + winWidth * 0.5;
      winBottom = 0.20 + cellHash3 * 0.05;
      winTop = winBottom + winHeight;
      winTop = min(winTop, 0.88);
    }
  }

  if (!hasWindow) return col;

  // ── Vinduskarm / dørkarm ──
  float frameWidth = 0.025;
  float inFrame = sharpRect(vec2(bayU, floorV),
    vec2(winLeft - frameWidth, winBottom - frameWidth),
    vec2(winRight + frameWidth, winTop + frameWidth));

  float inOpening = sharpRect(vec2(bayU, floorV),
    vec2(winLeft, winBottom),
    vec2(winRight, winTop));

  if (inFrame > 0.5 && inOpening < 0.5) {
    // Karm (ramme)
    col = frameColor;
    return col;
  }

  if (inOpening < 0.5) {
    // ── Vindusgesims (under vinduet) ──
    float sillHeight = 0.025;
    float sillExtend = 0.015;
    float inSill = sharpRect(vec2(bayU, floorV),
      vec2(winLeft - sillExtend, winBottom - frameWidth - sillHeight),
      vec2(winRight + sillExtend, winBottom - frameWidth));
    if (inSill > 0.5) {
      col = frameColor * 0.95;
    }
    return col;
  }

  // ── Vi er inne i vindu/dør-åpningen ──
  if (hasDoor) {
    // Dør
    vec2 doorUV = vec2(
      (bayU - winLeft) / (winRight - winLeft),
      (floorV - winBottom) / (winTop - winBottom)
    );

    vec3 dCol = doorColor;
    // Dør-paneler (to felter)
    float panelGap = abs(doorUV.y - 0.45);
    float panelVGap = abs(doorUV.x - 0.5);
    float panelBorder = min(doorUV.x, min(1.0 - doorUV.x, min(doorUV.y, 1.0 - doorUV.y)));
    if (panelBorder < 0.08 || panelGap < 0.015) {
      dCol *= 0.82; // Panel-kanter
    }

    // Dørhåndtak
    float handleDist = length(vec2(doorUV.x - 0.82, doorUV.y - 0.48) * vec2(1.0, 3.0));
    if (handleDist < 0.08) {
      dCol = vec3(0.78, 0.68, 0.32); // Messing
    }

    // Dørvindu (øverste del)
    if (doorUV.y > 0.55 && doorUV.x > 0.15 && doorUV.x < 0.85) {
      float dwFrame = 0.04;
      bool inDoorWindowFrame =
        doorUV.x < 0.15 + dwFrame || doorUV.x > 0.85 - dwFrame ||
        doorUV.y < 0.55 + dwFrame || doorUV.y > 0.97 - dwFrame;
      if (inDoorWindowFrame) {
        dCol = frameColor * 0.9;
      } else {
        // Glass i dør
        dCol = glassColor * 0.9 + vec3(0.05, 0.03, 0.0); // Litt varmere
        // Sprosse
        if (abs(doorUV.x - 0.5) < 0.015) dCol = frameColor * 0.9;
      }
    }

    col = dCol;
  } else {
    // ── Vindusglass ──
    vec2 winUV = vec2(
      (bayU - winLeft) / (winRight - winLeft),
      (floorV - winBottom) / (winTop - winBottom)
    );

    vec3 gCol = glassColor;

    // ── Sprosser (kryss i vinduet) ──
    // Norsk stil: 2x2 eller 2x3 ruter
    float numH = cellHash2 > 0.5 ? 2.0 : 1.0; // Horisontale sprosser
    float numV = 1.0; // Vertikal sprosse (alltid midt)

    bool onSprosse = false;
    // Vertikal midt-sprosse
    if (abs(winUV.x - 0.5) < 0.02) onSprosse = true;
    // Horisontale sprosser
    for (float i = 1.0; i <= 2.0; i++) {
      if (i <= numH) {
        float splitY = i / (numH + 1.0);
        if (abs(winUV.y - splitY) < 0.025) onSprosse = true;
      }
    }

    if (onSprosse) {
      col = frameColor;
      return col;
    }

    // ── Glass-variasjon per vindu ──
    // Noen vinduer har gardiner, noen har varmt lys, noen er mørke
    float glassVariant = cellHash3;
    if (glassVariant < 0.25) {
      // Varmt innelys (kveld-stemning)
      gCol = mix(gCol, vec3(0.55, 0.40, 0.15), 0.6);
    } else if (glassVariant < 0.45) {
      // Gardin (lys farge, delvis gjennomsiktig)
      float curtainEdge = smoothstep(0.1, 0.3, winUV.x) * smoothstep(0.1, 0.3, 1.0 - winUV.x);
      vec3 curtainColor = vec3(0.85, 0.82, 0.75) + (cellHash2 - 0.5) * vec3(0.1, 0.05, 0.0);
      gCol = mix(curtainColor, gCol, curtainEdge * 0.3);
    } else if (glassVariant < 0.55) {
      // Halvveis åpen gardin
      float leftCurtain = smoothstep(0.0, 0.25, winUV.x);
      float rightCurtain = smoothstep(0.0, 0.25, 1.0 - winUV.x);
      vec3 curtainColor = vec3(0.75, 0.25, 0.20); // Rød gardin
      gCol = mix(curtainColor, gCol, leftCurtain * rightCurtain);
    }

    // ── Glass-refleksjon (øvre venstre hjørne) ──
    float reflDist = length((winUV - vec2(0.2, 0.8)) * vec2(1.0, 0.7));
    gCol += smoothstep(0.35, 0.0, reflDist) * 0.12;

    // ── Himmel-refleksjon (svak blålig gradient nedover) ──
    gCol += vec3(0.02, 0.04, 0.08) * (1.0 - winUV.y);

    col = gCol;
  }

  return col;
}
`

// ── Parametere per vegg-type ─────────────────────────────────────────
const WALL_PARAMS = {
  buildings_walls_white: {
    wallColor: [0.94, 0.92, 0.90],    // Hvit kledning
    grooveColor: [0.86, 0.84, 0.82],  // Fuge mellom bord
    frameColor: [0.96, 0.94, 0.92],   // Hvit vindusramme
    glassColor: [0.12, 0.18, 0.30],   // Mørkt glass
    doorColor: [0.35, 0.25, 0.18],    // Brun dør
    hasCladding: 1.0,
    windowScale: 1.0,
    doorChance: 0.22,
    roughness: 0.82,
  },
  buildings_walls_red: {
    wallColor: [0.62, 0.18, 0.12],    // Rød kledning (falurød)
    grooveColor: [0.50, 0.12, 0.08],
    frameColor: [0.95, 0.93, 0.88],   // Hvit ramme
    glassColor: [0.10, 0.15, 0.25],
    doorColor: [0.30, 0.22, 0.15],
    hasCladding: 1.0,
    windowScale: 0.85,                // Litt mindre vinduer (låve-stil)
    doorChance: 0.30,                 // Flere dører (låve)
    roughness: 0.88,
  },
  buildings_walls_yellow: {
    wallColor: [0.90, 0.82, 0.45],    // Gul kledning
    grooveColor: [0.80, 0.72, 0.35],
    frameColor: [0.96, 0.94, 0.92],
    glassColor: [0.12, 0.18, 0.30],
    doorColor: [0.32, 0.24, 0.16],
    hasCladding: 1.0,
    windowScale: 1.0,
    doorChance: 0.20,
    roughness: 0.82,
  },
  buildings_walls_grey: {
    wallColor: [0.68, 0.65, 0.62],    // Grå mur/betong
    grooveColor: [0.60, 0.58, 0.55],  // Fugemørtel
    frameColor: [0.88, 0.86, 0.84],
    glassColor: [0.10, 0.16, 0.28],
    doorColor: [0.40, 0.38, 0.35],    // Grå dør
    hasCladding: 0.0,                 // Murstein, ikke kledning
    windowScale: 1.15,                // Litt større vinduer
    doorChance: 0.25,
    roughness: 0.78,
  },
  buildings_walls_darkwood: {
    wallColor: [0.28, 0.20, 0.14],    // Mørkt tre (sjøbod)
    grooveColor: [0.20, 0.14, 0.10],
    frameColor: [0.75, 0.70, 0.62],   // Litt mørkere rammer
    glassColor: [0.08, 0.12, 0.22],
    doorColor: [0.22, 0.16, 0.10],
    hasCladding: 1.0,
    windowScale: 0.72,                // Små vinduer (sjøbod-stil)
    doorChance: 0.35,                 // Mange dører (sjøbod/verksted)
    roughness: 0.92,
  },
}

// 1x1 hvit dummy-tekstur for å aktivere UV-varyings i MeshStandardMaterial
const _dummyTex = (() => {
  const data = new Uint8Array([255, 255, 255, 255])
  const tex = new THREE.DataTexture(data, 1, 1, THREE.RGBAFormat)
  tex.needsUpdate = true
  return tex
})()

/** Opprett fasade-materiale med prosedyrell GLSL shader */
function createFacadeMaterial(wallType) {
  const p = WALL_PARAMS[wallType]
  if (!p) return null

  const mat = new THREE.MeshStandardMaterial({
    map: _dummyTex, // Aktiverer vUv og map_fragment i shaderen
    roughness: p.roughness,
    metalness: 0.0,
    side: THREE.DoubleSide,
  })

  mat.onBeforeCompile = (shader) => {
    // Uniforms
    shader.uniforms.u_wallColor = { value: new THREE.Vector3(...p.wallColor) }
    shader.uniforms.u_grooveColor = { value: new THREE.Vector3(...p.grooveColor) }
    shader.uniforms.u_frameColor = { value: new THREE.Vector3(...p.frameColor) }
    shader.uniforms.u_glassColor = { value: new THREE.Vector3(...p.glassColor) }
    shader.uniforms.u_doorColor = { value: new THREE.Vector3(...p.doorColor) }
    shader.uniforms.u_hasCladding = { value: p.hasCladding }
    shader.uniforms.u_windowScale = { value: p.windowScale }
    shader.uniforms.u_doorChance = { value: p.doorChance }

    // ── Vertex shader: legg til world-pos varying ──
    shader.vertexShader = shader.vertexShader.replace(
      '#include <common>',
      `#include <common>
       varying vec3 vWorldPos;`
    )
    shader.vertexShader = shader.vertexShader.replace(
      '#include <worldpos_vertex>',
      `#include <worldpos_vertex>
       #if defined( USE_ENVMAP ) || defined( DISTANCE ) || defined( USE_SHADOWMAP ) || defined( USE_TRANSMISSION )
         vWorldPos = worldPosition.xyz;
       #else
         vWorldPos = (modelMatrix * vec4(transformed, 1.0)).xyz;
       #endif`
    )

    // ── Fragment shader: deklarasjoner ──
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <common>',
      `#include <common>
       varying vec3 vWorldPos;
       uniform vec3 u_wallColor;
       uniform vec3 u_grooveColor;
       uniform vec3 u_frameColor;
       uniform vec3 u_glassColor;
       uniform vec3 u_doorColor;
       uniform float u_hasCladding;
       uniform float u_windowScale;
       uniform float u_doorChance;
       ${FACADE_GLSL}`
    )

    // ── Fragment shader: erstatt tekstur-sampling med prosedyrell fasade ──
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <map_fragment>',
      `// Prosedyrell fasade erstatter tekstur-sampling
       {
         vec3 facadeColor = proceduralFacade(
           vMapUv, vWorldPos,
           u_wallColor, u_grooveColor,
           u_frameColor, u_glassColor, u_doorColor,
           u_hasCladding, u_windowScale, u_doorChance
         );
         // sRGB → lineær (fasade-farger er definert i sRGB)
         facadeColor = pow(facadeColor, vec3(2.2));
         diffuseColor = vec4(facadeColor, 1.0);
       }`
    )
  }

  // Unik cache-nøkkel per vegg-type
  mat.customProgramCacheKey = () => `facade_${wallType}`

  return mat
}

// ─── Tak-teksturer (canvas-basert, takstein tiler naturlig) ──────────
function createProceduralTexture(width, height, drawFn) {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  drawFn(ctx, width, height)
  const tex = new THREE.CanvasTexture(canvas)
  tex.wrapS = THREE.RepeatWrapping
  tex.wrapT = THREE.RepeatWrapping
  tex.colorSpace = THREE.SRGBColorSpace
  tex.needsUpdate = true
  return tex
}

function createRoofTextures() {
  // Takstein – mørk
  const roofDarkTex = createProceduralTexture(256, 256, (ctx, w, h) => {
    ctx.fillStyle = '#505058'
    ctx.fillRect(0, 0, w, h)
    const tileH = h / 12
    const tileW = w / 6
    ctx.lineWidth = 1
    for (let row = 0; row < 12; row++) {
      const offsetX = row % 2 === 0 ? 0 : tileW / 2
      for (let col = -1; col < 7; col++) {
        const x = offsetX + col * tileW
        const y = row * tileH
        const l = 30 + Math.random() * 8
        ctx.fillStyle = `hsl(230, 6%, ${l}%)`
        ctx.fillRect(x + 1, y + 1, tileW - 2, tileH - 2)
        ctx.strokeStyle = `hsl(230, 6%, ${l - 8}%)`
        ctx.strokeRect(x, y, tileW, tileH)
      }
    }
  })

  // Takstein – rød
  const roofRedTex = createProceduralTexture(256, 256, (ctx, w, h) => {
    ctx.fillStyle = '#903830'
    ctx.fillRect(0, 0, w, h)
    const tileH = h / 12
    const tileW = w / 6
    ctx.lineWidth = 1
    for (let row = 0; row < 12; row++) {
      const offsetX = row % 2 === 0 ? 0 : tileW / 2
      for (let col = -1; col < 7; col++) {
        const x = offsetX + col * tileW
        const y = row * tileH
        const hue = 5 + Math.random() * 10
        const l = 32 + Math.random() * 10
        ctx.fillStyle = `hsl(${hue}, 55%, ${l}%)`
        ctx.fillRect(x + 1, y + 1, tileW - 2, tileH - 2)
        ctx.strokeStyle = `hsl(${hue}, 50%, ${l - 8}%)`
        ctx.strokeRect(x, y, tileW, tileH)
      }
    }
  })

  return { roofDarkTex, roofRedTex }
}

// ─── GLBBuildings-komponent ──────────────────────────────────────────
const WALL_MESH_NAMES = [
  'buildings_walls_white',
  'buildings_walls_red',
  'buildings_walls_yellow',
  'buildings_walls_grey',
  'buildings_walls_darkwood',
]
const ROOF_MESH_MAP = {
  buildings_roof_dark: 'roofDarkTex',
  buildings_roof_red: 'roofRedTex',
}

function GLBBuildings() {
  const { nodes } = useGLTF('/map/buildings.glb')
  const sceneRef = useRef()
  const playerPos = useRef(new THREE.Vector3())
  const frameSkip = useRef(0)

  // Lag materialer og tak-teksturer én gang
  const { wallMaterials, roofTextures } = useMemo(() => {
    const wm = {}
    for (const name of WALL_MESH_NAMES) {
      wm[name] = createFacadeMaterial(name)
    }
    return { wallMaterials: wm, roofTextures: createRoofTextures() }
  }, [])

  useFrame(() => {
    frameSkip.current++
    if (frameSkip.current % 3 !== 0) return
    const pos = usePlayerStore.getState().position
    if (pos) playerPos.current.set(pos[0], pos[1], pos[2])
    if (!sceneRef.current) return
    sceneRef.current.traverse(child => {
      if (!child.isMesh) return
      const dist = playerPos.current.distanceTo(child.getWorldPosition(_lodTempVec))
      child.visible = dist <= LOD_SIMPLIFIED
    })
  })

  return (
    <group ref={sceneRef}>
      {/* Vegg-meshes med prosedyrell shader */}
      {WALL_MESH_NAMES.map(meshName => {
        const node = nodes[meshName]
        const mat = wallMaterials[meshName]
        if (!node?.geometry || !mat) return null
        return (
          <mesh key={meshName} geometry={node.geometry} material={mat} castShadow />
        )
      })}
      {/* Tak-meshes med canvas-teksturer */}
      {Object.entries(ROOF_MESH_MAP).map(([meshName, texKey]) => {
        const node = nodes[meshName]
        if (!node?.geometry) return null
        const tex = roofTextures[texKey]
        return (
          <mesh key={meshName} geometry={node.geometry} castShadow>
            <meshStandardMaterial
              map={tex}
              roughness={0.75}
              metalness={0.0}
              side={THREE.DoubleSide}
            />
          </mesh>
        )
      })}
    </group>
  )
}

// ─── Placeholder & destruksjon (uendret) ─────────────────────────────
function generateFragments(building) {
  const { w, d, h } = building
  const count = 6
  const cols = 3
  const rows = 2
  const fragW = w / cols
  const fragD = d / rows
  const frags = []
  for (let i = 0; i < count; i++) {
    const col = i % cols
    const row = Math.floor(i / cols)
    const isTop = row > 0
    const fragH = isTop ? h * 0.4 : h * 0.6
    frags.push({
      x: building.x + (col - 1) * fragW,
      y: isTop ? building.h * 0.6 : building.h * 0.3,
      z: building.z + (row - 0.5) * fragD,
      w: fragW * 0.9, d: fragD * 0.9,
      h: fragH * (0.7 + Math.random() * 0.3),
    })
  }
  return frags
}

function PlaceholderBuildings() {
  const groupRef = useRef()
  const playerPos = useRef(new THREE.Vector3())
  const frameSkip = useRef(0)
  const [destroyedSet, setDestroyedSet] = useState(new Set())
  const [fragmentsList, setFragmentsList] = useState([])
  const fragmentTimeRef = useRef(new Map())

  useFrame((_, delta) => {
    frameSkip.current++
    if (frameSkip.current % 10 === 0) {
      const pos = usePlayerStore.getState().position
      if (pos) playerPos.current.set(pos[0], pos[1], pos[2])
      if (groupRef.current) {
        const children = groupRef.current.children
        for (let i = 0; i < children.length; i++) {
          const child = children[i]
          const dist = playerPos.current.distanceTo(child.position)
          child.visible = dist <= LOD_SIMPLIFIED
        }
      }
    }
    if (frameSkip.current % 5 === 0) {
      const activeId = useVehicleStore.getState().activeId
      if (!activeId) return
      const vBody = activeVehicleBodyRef.current
      if (!vBody) return
      const vPos = vBody.translation()
      const vVel = vBody.linvel()
      const vSpeed = Math.sqrt(vVel.x * vVel.x + vVel.z * vVel.z)
      if (vSpeed < 8) return
      for (const idx of DESTRUCTIBLE_INDICES) {
        if (destroyedSet.has(idx)) continue
        const b = PLACEHOLDER_BUILDINGS[idx]
        if (!b) continue
        const dx = vPos.x - b.x
        const dz = vPos.z - b.z
        const dist = Math.sqrt(dx * dx + dz * dz)
        const reach = Math.max(b.w, b.d) * 0.7
        if (dist < reach) {
          const frags = generateFragments(b)
          setDestroyedSet(prev => new Set([...prev, idx]))
          setFragmentsList(prev => [...prev, ...frags.map(f => ({ ...f, id: `${idx}-${Math.random()}` }))])
          window.__screenShake = 0.5
          if (groupRef.current?.children[idx]) groupRef.current.children[idx].visible = false
          break
        }
      }
    }
    for (const [id, time] of fragmentTimeRef.current) {
      fragmentTimeRef.current.set(id, time + delta)
    }
  })

  return (
    <>
      <RigidBody type="fixed" colliders={false}>
        {PLACEHOLDER_BUILDINGS.map((b, i) => (
          <CuboidCollider key={i} args={[b.w / 2, b.h / 2, b.d / 2]} position={[b.x, b.h / 2, b.z]} />
        ))}
      </RigidBody>
      <group ref={groupRef}>
        {PLACEHOLDER_BUILDINGS.map((b, i) => (
          <mesh key={i} receiveShadow castShadow position={[b.x, b.h / 2, b.z]} visible={!destroyedSet.has(i)}>
            <boxGeometry args={[b.w, b.h, b.d]} />
            <meshStandardMaterial color={b.color} roughness={0.88} metalness={0.02} />
          </mesh>
        ))}
      </group>
      {fragmentsList.map(frag => (
        <RigidBody key={frag.id} type="dynamic" position={[frag.x, frag.y, frag.z]}
          linearDamping={0.5} angularDamping={0.5} colliders={false}>
          <CuboidCollider args={[frag.w / 2, frag.h / 2, frag.d / 2]} density={2} />
          <mesh castShadow receiveShadow>
            <boxGeometry args={[frag.w, frag.h, frag.d]} />
            <meshStandardMaterial color="#a89888" roughness={0.9} />
          </mesh>
        </RigidBody>
      ))}
    </>
  )
}

export default function Buildings({ useGLB: shouldUseGLB = false }) {
  if (shouldUseGLB) return <GLBBuildings />
  return <PlaceholderBuildings />
}
