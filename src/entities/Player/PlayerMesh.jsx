// Placeholder kapsulgeometri – byttes ut med karakter-modell senere
export default function PlayerMesh() {
  return (
    <group>
      <mesh castShadow position={[0, 0, 0]}>
        <capsuleGeometry args={[0.3, 1.0, 3, 6]} />
        <meshStandardMaterial color="#888888" />
      </mesh>
      {/* Blob-skygge på bakken */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.78, 0]}>
        <circleGeometry args={[0.45, 16]} />
        <meshBasicMaterial color="#000000" transparent opacity={0.35} depthWrite={false} />
      </mesh>
    </group>
  )
}
