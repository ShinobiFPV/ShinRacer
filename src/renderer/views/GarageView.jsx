import { useState } from 'react'
import { C, Card, Tag, Btn, SectionHead } from '../components/primitives'
import { useStore } from '../store/AppStore'

export default function GarageView({ onLoad, onDeploy }) {
  const { profiles, saveProfiles, showToast } = useStore()
  const [confirm, setConfirm] = useState(null)

  const deletePreset = async (id) => {
    await saveProfiles(profiles.filter(p => p.id !== id))
    setConfirm(null)
    showToast('Preset deleted')
  }

  if (profiles.length === 0) {
    return (
      <div style={{ display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center',
        height:'100%', gap:12, color: C.muted }}>
        <div style={{ fontSize:48 }}>🚗</div>
        <div style={{ fontFamily:C.head, fontSize:22, color:C.white }}>Garage is empty</div>
        <div style={{ fontSize:14 }}>Save server configs from the Build tab to store them here</div>
      </div>
    )
  }

  return (
    <div style={{ padding:24, overflow:'auto', height:'100%' }}>
      <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
        {profiles.map(p => (
          <Card key={p.id} style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
            <div style={{ flex:1 }}>
              <div style={{ fontFamily:C.head, fontWeight:700, fontSize:18, marginBottom:3 }}>{p.name}</div>
              <div style={{ fontSize:12, color:C.muted, marginBottom:8 }}>
                {p.trackId || 'no track'}{p.layoutId ? ` / ${p.layoutId}` : ''}
                {' · '}{p.cars?.length || 0} cars
                {' · '}{p.maxClients} slots
                {' · '}{p.weather}
                {' · '}{p.time}
              </div>
              <div style={{ display:'flex', flexWrap:'wrap', gap:4 }}>
                {p.cars?.slice(0,5).map(c => <Tag key={c} color={C.muted} size="xs">{c}</Tag>)}
                {p.cars?.length > 5 && <Tag color={C.muted} size="xs">+{p.cars.length-5} more</Tag>}
                {p.password && <Tag color={C.yellow} size="xs">🔒 Password</Tag>}
                {!p.allowances?.tc    && <Tag color={C.red}  size="xs">No TC</Tag>}
                {!p.allowances?.abs   && <Tag color={C.red}  size="xs">No ABS</Tag>}
                {p.allowances?.tyreBlankets && <Tag color={C.green} size="xs">Blankets</Tag>}
              </div>
            </div>
            <div style={{ display:'flex', gap:8, marginLeft:20, flexShrink:0, alignItems:'center' }}>
              {confirm === p.id ? (
                <>
                  <span style={{ fontSize:12, color:C.red }}>Delete?</span>
                  <Btn size="sm" variant="danger" onClick={() => deletePreset(p.id)}>Yes</Btn>
                  <Btn size="sm" variant="ghost" onClick={() => setConfirm(null)}>Cancel</Btn>
                </>
              ) : (
                <>
                  <Btn size="sm" variant="ghost" onClick={() => setConfirm(p.id)}>Delete</Btn>
                  <Btn size="sm" variant="subtle" onClick={() => onLoad(p)}>Edit</Btn>
                  <Btn size="sm" onClick={() => onDeploy(p)}>▶ Launch</Btn>
                </>
              )}
            </div>
          </Card>
        ))}
      </div>
    </div>
  )
}
