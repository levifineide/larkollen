import { EffectComposer, Bloom, Vignette } from '@react-three/postprocessing'
import { BlendFunction } from 'postprocessing'

/**
 * PostProcessing – Cinematisk etterbehandling.
 * Bloom + Vignette. AO utelatt (krever n8ao-pakke).
 */
export default function PostProcessing() {
  return (
    <EffectComposer multisampling={0} disableNormalPass>
      <Bloom
        mipmapBlur
        luminanceThreshold={0.8}
        luminanceSmoothing={0.3}
        intensity={0.4}
      />

      <Vignette
        offset={0.3}
        darkness={0.6}
        blendFunction={BlendFunction.NORMAL}
      />
    </EffectComposer>
  )
}
