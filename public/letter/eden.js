(() => {
  "use strict";

  /*
   * MYSTICAL EDEN
   * -------------
   * The final 15 seconds of the letter become a portal into the pixel world.
   * Audio time is the only clock; seeking/replaying stays deterministic.
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
  const EDEN_DURATION = 15;
  const FALLBACK_AUDIO_DURATION = 139;
  const REDUCED = matchMedia("(prefers-reduced-motion: reduce)").matches;

  function getFullTime() {
    return Number.isFinite(audio.duration) && audio.duration > 0
      ? audio.duration
      : FALLBACK_AUDIO_DURATION;
  }

  function getStartTime() {
    return Math.max(0, getFullTime() - EDEN_DURATION);
  }

  let w = 0, h = 0, dpr = 1;
  let coverShot = null;
  let started = false;
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
    x:rnd()*PW, y:rnd()*86, s:rnd()<.75?1:2, p:rnd()*6.28
  }));
  const motes = Array.from({length:75}, () => ({
    x:rnd()*PW, y:70+rnd()*67, p:rnd()*6.28, s:.4+rnd()*1.2
  }));
  const wisps = Array.from({length:14}, () => ({
    x:75+rnd()*115, y:76+rnd()*55, p:rnd()*6.28
  }));

  function buildSky() {
    const bands = ["#111b38","#172348","#202954","#2d315c","#393361","#453565","#503766","#5c3b68"];
    for(let y=0;y<PH;y++){
      const i=Math.min(bands.length-1,Math.floor(y/(PH/bands.length)));
      px(sx,0,y,bands[i],PW,1);
    }

    const MX=55, MY=39;
    for(let r=20;r>=1;r--){
      const c = r>15?"#fff4d1":r>10?"#e7e7d0":r>5?"#bcbfd0":"#777da4";
      sx.beginPath(); sx.fillStyle=c; sx.arc(MX,MY,r,0,Math.PI*2); sx.fill();
    }

    for(const s of stars) px(sx,s.x,s.y,"#f5efd5",s.s,s.s);

    // distant mountain silhouettes
    const ridges = [
      {base:109, amp:19, col:"#1b2040", step:8},
      {base:113, amp:15, col:"#151a34", step:11},
      {base:119, amp:12, col:"#10152b", step:9}
    ];
    for(const r of ridges){
      sx.fillStyle=r.col;
      sx.beginPath(); sx.moveTo(0,r.base);
      for(let x=0;x<=PW;x+=r.step){
        const y=r.base-r.amp*(.25+.75*Math.abs(Math.sin(x*.055+r.amp)));
        sx.lineTo(x,y);
      }
      sx.lineTo(PW,PH); sx.lineTo(0,PH); sx.closePath(); sx.fill();
    }
  }

  function buildWorld() {
    wx.clearRect(0,0,PW,PH);

    // water
    for(let y=108;y<PH;y++){
      const q = Math.floor((y-108)/7)%2;
      px(wx,0,y,q?"#111d38":"#142443",PW,1);
    }

    // moon reflection
    for(let y=93;y<137;y+=3){
      const width = Math.max(1, Math.floor(13*(1-Math.abs(y-113)/30)));
      px(wx,55-width/2,y,"#b8b79c",width,1);
      if(y%6===0) px(wx,55-width/3,y+1,"#6f7590",Math.max(1,width/2),1);
    }

    // enchanted shore
    wx.fillStyle="#11162d";
    wx.beginPath();
    wx.moveTo(105,108);
    wx.lineTo(192,101);
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

    // mythic tree trunk
    px(wx,158,55,"#332821",8,69);
    px(wx,155,63,"#483127",4,48);
    px(wx,162,48,"#2a211e",5,61);
    for(let i=0;i<11;i++){
      const bx=155+rnd()*25, by=52+rnd()*31;
      px(wx,bx,by,"#352522",1+rnd()*4,12+rnd()*12);
    }

    // canopy
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

    // fruit
    for(const [x,y] of [[150,55],[172,47],[181,61],[162,67]]){
      wx.fillStyle="#d9b878";
      wx.fillRect(x,y,2,2);
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

  function grabCover(){
    if(coverShot || !cover || cover.readyState < 2) return;
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

    const focalX=.5, focalY=.48;
    const scale=1+progress*3.8;
    const dw=w*scale, dh=h*scale;
    const dx=w*focalX-dw*focalX;
    const dy=h*focalY-dh*focalY;

    ctx.save();
    ctx.imageSmoothingEnabled=false;
    ctx.globalAlpha=1-progress*.18;
    ctx.drawImage(coverShot,dx,dy,dw,dh);

    // pixel grid becomes visible as the portal deepens
    if(progress>.22){
      const a=(progress-.22)/.78;
      ctx.globalAlpha=.10*a;
      ctx.fillStyle="#fff";
      const step=Math.max(3,Math.floor(3+progress*9));
      for(let x=0;x<w;x+=step) ctx.fillRect(x,0,1,h);
      for(let y=0;y<h;y+=step) ctx.fillRect(0,y,w,1);
    }
    ctx.restore();
  }

  function drawEden(alpha,zoom){
    const scale=Math.max(w/PW,h/PH)*zoom;
    const dw=PW*scale, dh=PH*scale;
    const dx=(w-dw)/2, dy=(h-dh)/2;

    ctx.save();
    ctx.globalAlpha=alpha;
    ctx.imageSmoothingEnabled=false;
    ctx.drawImage(sky,dx,dy,dw,dh);

    // living sky
    const time=t;
    for(const s of stars){
      const a=.35+.45*Math.sin(time*1.4+s.p);
      ctx.globalAlpha=alpha*a;
      ctx.fillStyle="#fff4d1";
      const x=dx+s.x*scale, y=dy+s.y*scale;
      ctx.fillRect(Math.round(x),Math.round(y),Math.max(1,Math.ceil(s.s*scale*.12)),Math.max(1,Math.ceil(s.s*scale*.12)));
    }

    ctx.globalAlpha=alpha;
    ctx.drawImage(world,dx,dy,dw,dh);

    // animated runes
    const runePts=[[159,96],[156,88],[162,80],[166,72],[158,64],[151,58]];
    for(let i=0;i<runePts.length;i++){
      const [rx,ry]=runePts[i];
      const pulse=.45+.55*Math.sin(time*2+i);
      ctx.globalAlpha=alpha*(.28+.42*pulse);
      ctx.fillStyle="#d7c88e";
      const xx=dx+rx*scale, yy=dy+ry*scale;
      ctx.fillRect(Math.round(xx),Math.round(yy),Math.max(1,Math.ceil(scale*.45)),Math.max(1,Math.ceil(scale*.45)));
    }

    // foreground motes / wisps
    for(const m of motes){
      const xx=dx+(m.x+Math.sin(time*.55+m.p)*2)*scale;
      const yy=dy+(m.y+Math.sin(time*.8+m.p)*2)*scale;
      ctx.globalAlpha=alpha*(.12+.28*(.5+.5*Math.sin(time*1.6+m.p)));
      ctx.fillStyle="#d9ce91";
      const s=Math.max(1,Math.ceil(m.s*scale*.18));
      ctx.fillRect(Math.round(xx),Math.round(yy),s,s);
    }
    for(const q of wisps){
      const xx=dx+(q.x+Math.sin(time*.4+q.p)*5)*scale;
      const yy=dy+(q.y+Math.cos(time*.55+q.p)*4)*scale;
      ctx.globalAlpha=alpha*.22;
      ctx.fillStyle="#8fa3b4";
      ctx.fillRect(Math.round(xx),Math.round(yy),Math.max(1,Math.ceil(scale*.35)),Math.max(1,Math.ceil(scale*.35)));
    }

    // subtle vignette
    ctx.globalAlpha=alpha;
    const v=ctx.createRadialGradient(w*.5,h*.45,Math.min(w,h)*.12,w*.5,h*.45,Math.max(w,h)*.78);
    v.addColorStop(0,"rgba(0,0,0,0)");
    v.addColorStop(1,"rgba(0,0,0,.62)");
    ctx.fillStyle=v;
    ctx.fillRect(0,0,w,h);
    ctx.restore();
  }

  function drawPortal(progress){
    ctx.clearRect(0,0,w,h);

    if(progress<.48){
      drawCover(progress/.48);
      const p=clamp(progress/.48,0,1);
      // Album pixels peel outward from the focal point.
      ctx.save();
      ctx.globalCompositeOperation="screen";
      const count=Math.floor(30+p*170);
      for(let i=0;i<count;i++){
        const a=i*12.9898;
        const r=(p*p)*(Math.max(w,h)*.18+(i%17)*8);
        const x=w*.5+Math.cos(a)*r;
        const y=h*.46+Math.sin(a*1.17)*r*.62;
        const s=1+((i*7)%6)*p;
        ctx.globalAlpha=(.03+.13*p)*(1-Math.min(1,r/(Math.max(w,h)*.85)));
        ctx.fillStyle=i%3===0?"#d9ce91":i%3===1?"#8796b5":"#f1e7c6";
        ctx.fillRect(Math.round(x),Math.round(y),Math.max(1,Math.round(s)),Math.max(1,Math.round(s)));
      }
      ctx.restore();
    } else {
      const p=(progress-.48)/.52;
      const coverFade=1-ease(clamp(p/.42,0,1));
      if(coverFade>0) drawCover(.48+.52*(1-coverFade));
      drawEden(ease(clamp(p/.82,0,1)),1+.38*ease(p));

      // white-gold portal flash, brief and pixelated
      if(p>.68 && p<.82){
        const flash=1-Math.abs((p-.75)/.07);
        ctx.fillStyle="rgba(255,244,209,"+Math.max(0,flash*.16)+")";
        ctx.fillRect(0,0,w,h);
      }
    }
  }

  function setActive(on){
    if(on===started) return;
    started=on;
    document.body.classList.toggle("edenPortalActive",on);
  }

  function render(now){
    const dt=Math.min(64,now-last); last=now;
    const current=Number(audio.currentTime)||0;
    const full=getFullTime();
    const start=getStartTime();

    if(current>=start && current<full){
      setActive(true);
      t=current-start;
      drawPortal(clamp(t/(full-start),0,1));
    } else {
      // Never leave the Eden canvas parked over the page after the song ends
      // or when the user seeks away from the final 15 seconds.
      setActive(false);
      ctx.clearRect(0,0,w,h);
      if(current<start) coverShot=null;
    }

    requestAnimationFrame(render);
  }

  audio.addEventListener("play",grabCover,{passive:true});
  audio.addEventListener("loadeddata",grabCover,{passive:true});
  audio.addEventListener("seeked",() => {
    coverShot=null;
    if(audio.currentTime>=getStartTime() && !audio.ended) grabCover();
  });

  requestAnimationFrame(render);
})();