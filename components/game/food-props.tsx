"use client"

/** Small portions on a hand-sized wooden tray; dimensions are in world tiles. */
export function MeatTray() {
  return <group name="small-meat-tray">
    <mesh position={[0,-.021,0]}><boxGeometry args={[.14,.012,.095]}/><meshLambertMaterial color="#8c7350"/></mesh>
    {[-1,1].map(side=><group key={side} position={[side*.029,0,side*.012]} rotation={[0,side*.35,0]}>
      <mesh scale={[.034,.023,.032]}><sphereGeometry args={[1,7,4]}/><meshLambertMaterial color="#995d50"/></mesh>
      <mesh position={[0,.016,.008]} scale={[.023,.007,.019]}><sphereGeometry args={[1,6,3]}/><meshLambertMaterial color="#d1ac87"/></mesh>
    </group>)}
  </group>
}

/** A stave bucket with two dark hoops, a wooden handle and visible milk. */
export function MilkBucket({filled=true}:{filled?:boolean}) {
  return <group name="milk-bucket">
    <mesh><cylinderGeometry args={[.051,.039,.09,9,1,true]}/><meshLambertMaterial color="#9e8258" side={2}/></mesh>
    {[-.032,.029].map(y=><mesh key={y} position={[0,y,0]} rotation={[Math.PI/2,0,0]}><torusGeometry args={[y>0?.05:.042,.004,3,9]}/><meshLambertMaterial color="#514e3f"/></mesh>)}
    <mesh position={[0,.028,0]} rotation={[-Math.PI/2,0,0]}><circleGeometry args={[.046,9]}/><meshLambertMaterial color={filled?"#e1d9b6":"#66533a"}/></mesh>
    {[-1,1].map(side=><mesh key={side} position={[side*.047,.061,0]}><boxGeometry args={[.008,.053,.009]}/><meshLambertMaterial color="#75603e"/></mesh>)}
    <mesh position={[0,.09,0]}><boxGeometry args={[.1,.01,.012]}/><meshLambertMaterial color="#75603e"/></mesh>
  </group>
}
