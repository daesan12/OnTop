/** Draft changes renew a 3s idle window. Heartbeats are bounded and stop on blur/send/unmount. */
export class TypingReporter {
  private active=false
  private idle:ReturnType<typeof setTimeout>|undefined
  private heartbeat:ReturnType<typeof setInterval>|undefined
  constructor(private send:(typing:boolean)=>unknown){}
  changed(hasText:boolean) {
    if(!hasText){this.stop();return}
    clearTimeout(this.idle)
    if(!this.active){
      this.active=true;this.emit(true)
      this.heartbeat=setInterval(()=>this.emit(true),2000)
    }
    this.idle=setTimeout(()=>this.stop(),3000)
  }
  stop() {
    clearTimeout(this.idle);clearInterval(this.heartbeat)
    this.idle=this.heartbeat=undefined
    if(this.active){this.active=false;this.emit(false)}
  }
  private emit(typing:boolean){
    try{void Promise.resolve(this.send(typing)).catch(()=>{})}catch{/* Presence failure must not block chat. */}
  }
}
