import { useState } from 'react'
import { SceneLayer } from './scene/SceneLayer'
import { TableOverlay } from './ui/TableOverlay'

export default function App() {
  const [sceneClicks, setSceneClicks] = useState(0)
  const [uiClicks, setUiClicks] = useState(0)

  return (
    <main className="table-view">
      <SceneLayer onDemoObjectClick={() => setSceneClicks((count) => count + 1)} />
      <TableOverlay
        sceneClicks={sceneClicks}
        uiClicks={uiClicks}
        onDemoButtonClick={() => setUiClicks((count) => count + 1)}
      />
    </main>
  )
}
