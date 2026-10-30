/** Serialise rebuilds; a failed rebuild does not poison the next saved edit. */
export function generationQueue<T>(task:()=>Promise<T>) {
  let tail:Promise<unknown>=Promise.resolve()
  return ()=>{
    const next=tail.then(task,task)
    tail=next.catch(()=>undefined)
    return next
  }
}
