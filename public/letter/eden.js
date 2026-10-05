(() => {
  "use strict";

  /*
   * MYSTICAL EDEN — FINAL TRANSITION + TWO-MINUTE POSTLUDE
   * -----------------------------------------------------
   * The last 15 seconds of the first song become a continuous
   * camera move into Eden. After the first song ends, Eden stays
   * alive for a 2-minute postlude. A future second-song URL can be
   * supplied through #edenPostludeAudio data-src without changing
   * the transition logic.
   */

  const audio = document.getElementById("audio");
  const cover = document.getElementById("coverVideo");
  if (!audio) return;

  const overlay = document.createElement("canvas");
  overlay.id = "edenPortal";
  overlay.setAttribute("aria-hidden", "true");
  document.body.appendChild(overlay);

  const ctx = overlay.getContext("2d", { alpha: true });
  ctx.imageSmoothingEnabled = false;

  const PW = 192, PH = 144;
  const EDEN_TRANSITION = 15;
  const POSTLUDE_DURATION = 120;
  const FALLBACK_AUDIO_DURATION = 139;
  const POSTLUDE_SONG = "audio/AUD-20221231-WA0000.mp3";
  const REDUCED = matchMedia("(prefers-reduced-motion: reduce)").matches;

  /*
   * Leave this blank for now. When the second song is provided,
   * put its relative path/URL in data-src on #edenPostludeAudio.
   */
  const postludeAudio = document.createElement("audio");
  postludeAudio.id = "edenPostludeAudio";
  postludeAudio.preload = "metadata";
  postludeAudio.loop = true;
  postludeAudio.setAttribute("aria-hidden", "true");
  postludeAudio.dataset.src = POSTLUDE_SONG;
  document.body.appendChild(postludeAudio);

  let postludeStartedAt = 0;
  let postludeActive = false;
  let transitionActive = false;

  function getFullTime() {
    return Number.isFinite(audio.duration) && audio.duration > 0
      ? audio.duration
      : FALLBACK_AUDIO_DURATION;
  }

  function getStartTime() {
    return Math.max(0, getFullTime() - EDEN_TRANSITION);
  }

  let w = 0, h = 0, dpr = 1;
  let coverShot = null;
  let last = performance.now();
  let t = 0;

  const world = document.createElement("canvas");
  world.width = PW;
  world.height = PH;
  const wx = world.getContext("2d");
  wx.imageSmoothingEnabled = false;

  const sky = document.createElement("canvas");
  sky.width = PW;
  sky.height = PH;
  const sx = sky.getContext("2d");
  sx.imageSmoothingEnabled = false;

  let seed = 918273;
  const rnd = () => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  };
  const clamp = (v,a,b) => Math.max(a, Math.min(b,v));
  const px = (g,x,y,c,w=1,h=1) => {
    g.fillStyle = c;
    g.fillRect(Math.round(x), Math.round(y), Math.max(1,Math.round(w)), Math.max(1,Math.round(h)));
  };

  const stars = Array.from({length:105}, () => ({
    x:rnd()*PW, y:rnd()*88, s:rnd()<.78?1:2, p:rnd()*Math.PI*2
  }));
  const motes = Array.from({length:75}, () => ({
    x:8+rnd()*176, y:62+rnd()*75, p:rnd()*Math.PI*2, s:.4+rnd()*1.2
  }));
  const wisps = Array.from({length:14}, () => ({
    x:74+rnd()*112, y:76+rnd()*55, p:rnd()*Math.PI*2
  }));

  function buildSky() {
    const bands = ["#0d1530","#121d3b","#192445","#242a50","#30305a","#3c3260","#483465","#56386a"];
    for(let y=0;y<PH;y++){
      const i=Math.min(bands.length-1,Math.floor(y/(PH/bands.length)));
      px(sx,0,y,bands[i],PW,1);
    }

    const MX=55, MY=39;
    for(let r=22;r>=1;r--){
      const c = r>17?"#6f7398":r>12?"#bcbfd0":r>6?"#e7e7d0":"#fff4d1";
      sx.beginPath();
      sx.fillStyle=c;
      sx.arc(MX,MY,r,0,Math.PI*2);
      sx.fill();
    }

    // constellation
    const constellation=[[16,18],[27,11],[39,20],[50,13],[61,19],[73,10]];
    sx.strokeStyle="#8e9ab2";
    sx.globalAlpha=.32;
    sx.lineWidth=1;
    sx.beginPath();
    constellation.forEach(([x,y],i)=>i?sx.lineTo(x,y):sx.moveTo(x,y));
    sx.stroke();
    sx.globalAlpha=1;
    constellation.forEach(([x,y])=>px(sx,x,y,"#fff4d1",1,1));

    for(const s of stars) px(sx,s.x,s.y,"#f5efd5",s.s,s.s);

    const ridges=[
      {base:109,amp:20,col:"#1a1f3d",step:7},
      {base:114,amp:16,col:"#12182f",step:10},
      {base:120,amp:12,col:"#0d1327",step:8}
    ];
    for(const r of ridges){
      sx.fillStyle=r.col;
      sx.beginPath();
      sx.moveTo(0,r.base);
      for(let x=0;x<=PW;x+=r.step){
        const y=r.base-r.amp*(.25+.75*Math.abs(Math.sin(x*.055+r.amp)));
        sx.lineTo(x,y);
      }
      sx.lineTo(PW,PH); sx.lineTo(0,PH); sx.closePath(); sx.fill();
    }
  }

  function buildWorld() {
    wx.clearRect(0,0,PW,PH);

    // moonlit water
    for(let y=108;y<PH;y++){
      const q=Math.floor((y-108)/6)%2;
      px(wx,0,y,q?"#0f1b35":"#142443",PW,1);
    }

    for(let y=93;y<139;y+=3){
      const width=Math.max(1,Math.floor(14*(1-Math.abs(y-113)/31)));
      px(wx,55-width/2,y,"#b8b79c",width,1);
      if(y%6===0) px(wx,55-width/3,y+1,"#6f7590",Math.max(1,width/2),1);
    }

    // enchanted shore / cliff
    wx.fillStyle="#10152c";
    wx.beginPath();
    wx.moveTo(105,108);
    wx.lineTo(192,100);
    wx.lineTo(192,144);
    wx.lineTo(105,144);
    wx.closePath();
    wx.fill();

    // magical stream
    for(let y=104;y<134;y++){
      const center=143+Math.sin(y*.28)*5;
      const width=2+(y-104)*.15;
      px(wx,center-width,y,"#7184a7",Math.ceil(width*2),1);
    }

    // plants
    for(let i=0;i<65;i++){
      const x=108+rnd()*78, y=104+rnd()*38;
      const c=i%3===0?"#526b62":i%3===1?"#3f5c55":"#334b4b";
      px(wx,x,y,c,1,4+rnd()*5);
      px(wx,x-2,y+2,c,2,2);
      px(wx,x+1,y+1,c,2,2);
    }

    // mythic tree
    px(wx,158,55,"#332821",8,69);
    px(wx,155,63,"#483127",4,48);
    px(wx,162,48,"#2a211e",5,61);
    for(let i=0;i<11;i++){
      const bx=155+rnd()*25, by=52+rnd()*31;
      px(wx,bx,by,"#352522",1+rnd()*4,12+rnd()*12);
    }

    const canopy=[
      [151,51,15],[164,45,18],[176,55,16],[145,63,13],
      [169,66,18],[184,66,12],[158,39,12]
    ];
    for(const [x,y,r] of canopy){
      wx.fillStyle="#182b32";
      wx.beginPath(); wx.arc(x,y,r,0,Math.PI*2); wx.fill();
      wx.fillStyle="#203a3b";
      wx.beginPath(); wx.arc(x-2,y-2,r*.65,0,Math.PI*2); wx.fill();
    }

    for(const [x,y] of [[150,55],[172,47],[181,61],[162,67]]) px(wx,x,y,"#d9b878",2,2);

    // little altar stones
    for(const [x,y] of [[118,122],[128,117],[137,126],[176,115],[187,125]]) {
      px(wx,x,y,"#566070",3,2);
      px(wx,x+1,y-1,"#71788a",2,1);
    }
  }

  buildSky();
  buildWorld();

  function resize(){
    dpr=Math.min(devicePixelRatio||1,2);
    w=innerWidth; h=innerHeight;
    overlay.width=Math.floor(w*dpr);
    overlay.height=Math.floor(h*dpr);
    overlay.style.width=w+"px";
    overlay.style.height=h+"px";
    ctx.setTransform(dpr,0,0,dpr,0,0);
  }
  addEventListener("resize",resize,{passive:true});
  resize();

  function ease(x){ return x<.5 ? 4*x*x*x : 1-Math.pow(-2*x+2,3)/2; }
  function smoothstep(x){ x=clamp(x,0,1); return x*x*(3-2*x); }

  function grabCover(){
    if(coverShot || !cover || cover.readyState<2) return;
    const c=document.createElement("canvas");
    c.width=cover.videoWidth||512;
    c.height=cover.videoHeight||512;
    const q=c.getContext("2d");
    q.drawImage(cover,0,0,c.width,c.height);
    coverShot=c;
  }

  function drawCover(progress){
    if(!coverShot) grabCover();
    if(!coverShot){
      ctx.fillStyle="#090817";
      ctx.fillRect(0,0,w,h);
      return;
    }

    const p=clamp(progress,0,1);
    // Gentle push first; the camera accelerates only near the hand-off.
    const camera=ease(p);
    const scale=1+camera*2.65;
    const dw=w*scale, dh=h*scale;
    const focalX=.5, focalY=.47;
    const dx=w*focalX-dw*focalX;
    const dy=h*focalY-dh*focalY;

    ctx.save();
    ctx.imageSmoothingEnabled=false;
    ctx.globalAlpha=1;
    ctx.drawImage(coverShot,dx,dy,dw,dh);

    // Soft atmospheric veil, not a hard flash.
    const veil=smoothstep(clamp((p-.52)/.48,0,1));
    ctx.globalAlpha=veil*.18;
    ctx.fillStyle="#d9ce91";
    ctx.fillRect(0,0,w,h);

    // Fine pixel drift.
    if(p>.35){
      const q=smoothstep((p-.35)/.65);
      ctx.globalCompositeOperation="screen";
      for(let i=0;i<110;i++){
        const a=i*12.9898;
        const r=(q*q)*(Math.max(w,h)*.08+(i%19)*7);
        const x=w*.5+Math.cos(a)*r;
        const y=h*.46+Math.sin(a*1.21)*r*.58;
        ctx.globalAlpha=.015+.075*q;
        ctx.fillStyle=i%3===0?"#e8d9a8":i%3===1?"#8e9ab2":"#f4ead0";
        const s=1+((i*7)%4)*q;
        ctx.fillRect(Math.round(x),Math.round(y),Math.max(1,Math.round(s)),Math.max(1,Math.round(s)));
      }
    }
    ctx.restore();
  }

  function drawEden(alpha,zoom,postludeTime){
    const scale=Math.max(w/PW,h/PH)*zoom;
    const dw=PW*scale, dh=PH*scale;
    const dx=(w-dw)/2, dy=(h-dh)/2;

    ctx.save();
    ctx.globalAlpha=alpha;
    ctx.imageSmoothingEnabled=false;
    ctx.drawImage(sky,dx,dy,dw,dh);

    const time=postludeTime;
    // living stars + slow moon atmosphere
    for(const s of stars){
      const a=.32+.52*Math.sin(time*.7+s.p);
      ctx.globalAlpha=alpha*a;
      ctx.fillStyle="#fff4d1";
      const x=dx+s.x*scale, y=dy+s.y*scale;
      const sz=Math.max(1,Math.ceil(s.s*scale*.13));
      ctx.fillRect(Math.round(x),Math.round(y),sz,sz);
    }

    ctx.globalAlpha=alpha;
    ctx.drawImage(world,dx,dy,dw,dh);

    // Runes climb toward the tree, pulsing slowly.
    const runePts=[[159,96],[156,88],[162,80],[166,72],[158,64],[151,58]];
    for(let i=0;i<runePts.length;i++){
      const [rx,ry]=runePts[i];
      const pulse=.5+.5*Math.sin(time*.9+i*.8);
      ctx.globalAlpha=alpha*(.22+.42*pulse);
      ctx.fillStyle="#d7c88e";
      const xx=dx+rx*scale, yy=dy+ry*scale;
      ctx.fillRect(Math.round(xx),Math.round(yy),Math.max(1,Math.ceil(scale*.5)),Math.max(1,Math.ceil(scale*.5)));
    }

    // Water shimmer.
    for(let i=0;i<18;i++){
      const yy=111+((i*7+Math.floor(time*2))%27);
      const xx=30+((i*31+Math.floor(time*9))%95);
      ctx.globalAlpha=alpha*(.06+.06*Math.sin(time+i));
      ctx.fillStyle="#a8b4c5";
      ctx.fillRect(Math.round(dx+xx*scale),Math.round(dy+yy*scale),Math.max(1,Math.ceil(scale*.8)),1);
    }

    for(const m of motes){
      const xx=dx+(m.x+Math.sin(time*.32+m.p)*2.5)*scale;
      const yy=dy+(m.y+Math.sin(time*.52+m.p)*2.5)*scale;
      ctx.globalAlpha=alpha*(.10+.28*(.5+.5*Math.sin(time*1.2+m.p)));
      ctx.fillStyle="#d9ce91";
      const s=Math.max(1,Math.ceil(m.s*scale*.18));
      ctx.fillRect(Math.round(xx),Math.round(yy),s,s);
    }

    for(const q of wisps){
      const xx=dx+(q.x+Math.sin(time*.22+q.p)*6)*scale;
      const yy=dy+(q.y+Math.cos(time*.3+q.p)*4)*scale;
      ctx.globalAlpha=alpha*.22;
      ctx.fillStyle="#8fa3b4";
      ctx.fillRect(Math.round(xx),Math.round(yy),Math.max(1,Math.ceil(scale*.35)),Math.max(1,Math.ceil(scale*.35)));
    }

    // Gentle vignette makes the world feel like a place, not a fullscreen overlay.
    ctx.globalAlpha=alpha;
    const v=ctx.createRadialGradient(w*.5,h*.43,Math.min(w,h)*.16,w*.5,h*.43,Math.max(w,h)*.82);
    v.addColorStop(0,"rgba(0,0,0,0)");
    v.addColorStop(1,"rgba(0,0,0,.66)");
    ctx.fillStyle=v;
    ctx.fillRect(0,0,w,h);
    ctx.restore();
  }

  function drawTransition(progress){
    ctx.clearRect(0,0,w,h);
    const p=clamp(progress,0,1);

    if(p<.56){
      drawCover(p/.56);
    } else {
      const q=smoothstep((p-.56)/.44);
      // Keep a ghost of the artwork while Eden emerges from the same pixels.
      drawCover(.56 + .44*(1-q));
      drawEden(q,1+.10*q,t);
      const veil=smoothstep(clamp((p-.72)/.28,0,1));
      if(veil){
        ctx.globalAlpha=veil*.12;
        ctx.fillStyle="#fff4d1";
        ctx.fillRect(0,0,w,h);
        ctx.globalAlpha=1;
      }
    }
  }

  function drawPostlude(){
    ctx.clearRect(0,0,w,h);
    const elapsed=Math.max(0,(performance.now()-postludeStartedAt)/1000);
    const breathe=REDUCED?1:1+Math.sin(elapsed*.12)*.018;
    drawEden(1,breathe,elapsed);

    // Dawn-like breathing haze across the two-minute letter.
    if(!REDUCED){
      const pulse=.5+.5*Math.sin(elapsed*.22);
      const g=ctx.createRadialGradient(w*.50,h*.36,0,w*.50,h*.36,Math.max(w,h)*.55);
      g.addColorStop(0,"rgba(217,206,145,"+(0.025+0.025*pulse)+")");
      g.addColorStop(1,"rgba(0,0,0,0)");
      ctx.fillStyle=g;
      ctx.fillRect(0,0,w,h);
    }
  }

  function setActive(on){
    document.body.classList.toggle("edenPortalActive",on);
  }

  function stopPostlude(){
    postludeActive=false;
    postludeStartedAt=0;
    try { postludeAudio.pause(); } catch {}
    try { postludeAudio.currentTime=0; } catch {}
  }

  async function startPostlude(){
    if(postludeActive) return;
    postludeActive=true;
    postludeStartedAt=performance.now();
    setActive(true);

    const src=postludeAudio.dataset.src.trim();
    if(src && !postludeAudio.src) postludeAudio.src=src;

    if(postludeAudio.src){
      try { await postludeAudio.play(); }
      catch(error){ console.warn("[EDEN] Postlude audio blocked:",error); }
    }
  }

  function render(now){
    last=now;
    const current=Number(audio.currentTime)||0;
    const full=getFullTime();
    const start=getStartTime();

    if(postludeActive){
      const elapsed=(now-postludeStartedAt)/1000;
      if(elapsed>=POSTLUDE_DURATION){
        stopPostlude();
        setActive(false);
        ctx.clearRect(0,0,w,h);
      } else {
        drawPostlude();
      }
    } else if(current>=start && current<full && !audio.ended){
      transitionActive=true;
      setActive(true);
      t=current-start;
      drawTransition(clamp(t/EDEN_TRANSITION,0,1));
    } else {
      transitionActive=false;
      setActive(false);
      ctx.clearRect(0,0,w,h);
      if(current<start) coverShot=null;
    }

    requestAnimationFrame(render);
  }

  audio.addEventListener("play",grabCover,{passive:true});
  audio.addEventListener("loadeddata",grabCover,{passive:true});
  audio.addEventListener("seeked",() => {
    if(postludeActive) stopPostlude();
    coverShot=null;
    if(audio.currentTime>=getStartTime() && !audio.ended) grabCover();
  });

  audio.addEventListener("ended",() => {
    // The first letter/song is finished: enter the two-minute Eden room.
    startPostlude();
  });

  requestAnimationFrame(render);

  // Expose a tiny hook for the next song/letter without coupling it to script.js.
  window.ECLIPSE_EDEN = {
    setPostludeSong(src){
      postludeAudio.dataset.src=String(src||"").trim();
      postludeAudio.removeAttribute("src");
      if(postludeAudio.dataset.src) postludeAudio.src=postludeAudio.dataset.src;
    },
    stopPostlude
  };
})();